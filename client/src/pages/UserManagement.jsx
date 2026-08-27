import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Users, RefreshCw, TriangleAlert, LoaderCircle } from 'lucide-react';
import toast from '../utils/toast';
import { authFetch, readApiError } from '../utils/apiClient';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import { roleOptions, roleConfig, configFor } from '../components/admin/userRoles';
import UserRoleCard from '../components/admin/UserRoleCard';
import {
  RoleEditorModal,
  ConfirmActionModal,
  ResetLinkModal,
} from '../components/admin/UserAdminModals';

const UserManagement = () => {
  const [authUsers, setAuthUsers] = useState([]);
  const [storeUsers, setStoreUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [apiError, setApiError] = useState(null);
  const { user: currentUser } = useAuth();
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchUsersAndRoles();
    fetchAuthUsers();
  }, []);

  const fetchAuthUsers = async () => {
    setAuthLoading(true);
    try {
      const response = await authFetch('/api/admin/users');

      if (!response.ok) {
        setApiError(await readApiError(response, 'Could not load accounts.'));
        setAuthUsers([]);
        return;
      }

      const data = await response.json();

      if (data.setupRequired) {
        setApiError('Firebase Admin SDK not configured. Please add the service account key.');
        setAuthUsers([]);
      } else if (data.error) {
        setApiError(data.error);
        setAuthUsers([]);
      } else {
        setAuthUsers(data.users || []);
        setApiError(null);
      }
    } catch (error) {
      console.error('Error fetching auth users:', error);
      setApiError('Cannot connect to admin API');
      setAuthUsers([]);
    } finally {
      setAuthLoading(false);
    }
  };

  const fetchUsersAndRoles = async () => {
    try {
      const rolesSnapshot = await getDocs(collection(db, 'roles'));
      const rolesData = {};
      rolesSnapshot.docs.forEach(doc => {
        rolesData[doc.id] = doc.data().role || 'customer';
      });
      setRoles(rolesData);

      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().name || 'No name',
        email: doc.data().email || '',
        photoURL: '',
        creationTime: doc.data().createdAt?.toDate?.()?.toISOString() || '',
        providers: [],
        fromStore: true
      }));
      setStoreUsers(usersData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const mergedUsers = [];
  const seenUids = new Set();

  authUsers.forEach(authUser => {
    const role = roles[authUser.uid] || 'customer';
    mergedUsers.push({
      ...authUser,
      id: authUser.uid,
      name: authUser.displayName,
      email: authUser.email,
      role: role
    });
    seenUids.add(authUser.uid);
  });

  storeUsers.forEach(storeUser => {
    if (seenUids.has(storeUser.uid)) return;
    const role = roles[storeUser.uid] || 'customer';
    mergedUsers.push({
      ...storeUser,
      id: storeUser.uid,
      role: role
    });
    seenUids.add(storeUser.uid);
  });

  const startEditingRole = (user) => {
    setEditingUser(user);
    setNewRole(roles[user.uid] || 'customer');
  };

  const cancelEditing = () => {
    setEditingUser(null);
    setNewRole('');
  };

  const saveRole = async () => {
    if (!editingUser || !newRole) return;

    if (editingUser.uid === currentUser?.uid && newRole !== 'admin') {
      toast.error('You cannot remove your own admin privileges');
      return;
    }

    const loadingToast = toast.loading('Updating role...');

    try {
      const roleRef = doc(db, 'roles', editingUser.uid);
      const roleDoc = await getDoc(roleRef);

      if (roleDoc.exists()) {
        await updateDoc(roleRef, { role: newRole });
      } else {
        await setDoc(roleRef, { role: newRole });
      }

      setRoles(prev => ({ ...prev, [editingUser.uid]: newRole }));
      toast.success(`Role updated to ${newRole} successfully!`, { id: loadingToast });
      cancelEditing();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role', { id: loadingToast });
    }
  };

  const handleResetPassword = async (user) => {
    const loadingToast = toast.loading('Sending password reset email...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}/reset-password`, {
        method: 'POST'
      });

      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to send reset email'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        // The link is a bearer credential for that account, so the server mails
        // it to the account holder directly and never returns it here.
        setActionModal({ type: 'resetSuccess', user, email: data.email });
        toast.success('Password reset email sent', { id: loadingToast });
      } else {
        toast.error(data.error || 'Failed to send reset email', { id: loadingToast });
      }
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email', { id: loadingToast });
    }
  };

  const handleDisableUser = async (user, disable) => {
    const loadingToast = toast.loading(disable ? 'Disabling account...' : 'Enabling account...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled: disable })
      });

      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to update account'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        setAuthUsers(prev => prev.map(u =>
          u.uid === user.uid ? { ...u, disabled: disable } : u
        ));
        toast.success(disable ? 'Account disabled' : 'Account enabled', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to update account', { id: loadingToast });
      }
    } catch {
      toast.error('Failed to update account', { id: loadingToast });
    }
  };

  const handleDeleteUser = async (user) => {
    const loadingToast = toast.loading('Deleting user...');
    try {
      const response = await authFetch(`/api/admin/users/${user.uid}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        toast.error(await readApiError(response, 'Failed to delete user'), { id: loadingToast });
        return;
      }

      const data = await response.json();

      if (data.success) {
        setAuthUsers(prev => prev.filter(u => u.uid !== user.uid));
        toast.success('User deleted successfully', { id: loadingToast });
        setActionModal(null);
      } else {
        toast.error(data.error || 'Failed to delete user', { id: loadingToast });
      }
    } catch {
      toast.error('Failed to delete user', { id: loadingToast });
    }
  };

  const usersByRole = {
    admin: mergedUsers.filter(u => u.role === 'admin'),
    mod: mergedUsers.filter(u => u.role === 'mod'),
    sales: mergedUsers.filter(u => u.role === 'sales'),
    billing: mergedUsers.filter(u => u.role === 'billing'),
    packer: mergedUsers.filter(u => u.role === 'packer'),
    customer: mergedUsers.filter(u => u.role === 'customer')
  };

  const getDisplayedUsers = () => {
    let filtered = activeTab === 'all' ? mergedUsers : usersByRole[activeTab] || [];

    if (searchQuery.trim()) {
      filtered = filtered.filter(user =>
        (user.displayName?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.email?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (user.uid?.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return filtered;
  };

  const displayedUsers = getDisplayedUsers();
  const isLoading = loading || authLoading;
  const EmptyIcon = roleConfig[activeTab] ? roleConfig[activeTab].icon : Users;

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="shell flex flex-col items-center justify-center gap-3 py-24 text-center"
        >
          <LoaderCircle
            className="h-7 w-7 animate-spin"
            style={{ color: 'var(--ember-600)' }}
            aria-hidden="true"
          />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Loading users from Firebase Authentication...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-page)' }}>
      <motion.div initial="initial" animate="animate" variants={pageVariants(reduced)}>
        <div className="shell py-6 md:py-8">
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: 'var(--maroon-700)', minHeight: 44 }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Link>

          {/* ---- Header ---------------------------------------------------- */}
          <header
            className="mb-5 mt-2 flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <div className="min-w-0">
              <span className="label-caps">Access control</span>
              <h1 className="section-title mt-1">User Management</h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                {apiError ? (
                  <span style={{ color: 'var(--gold-600)' }}>{apiError}</span>
                ) : (
                  <span className="tabular">
                    {mergedUsers.length} users from Firebase Authentication
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => { fetchAuthUsers(); fetchUsersAndRoles(); }}
              className="btn-outline text-sm"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </header>

          {/* ---- Admin SDK setup notice ------------------------------------ */}
          {apiError && (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 10)}
              className="mb-5 p-4 md:p-5"
              style={{
                background: 'rgba(210, 166, 79, 0.10)',
                border: '1px solid rgba(210, 166, 79, 0.4)',
                borderRadius: 'var(--r-lg)',
              }}
            >
              <div className="flex items-start gap-3">
                <TriangleAlert
                  className="mt-0.5 h-5 w-5 shrink-0"
                  style={{ color: 'var(--gold-600)' }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                    Firebase Admin SDK Setup Required
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-body)' }}>
                    To access all Firebase Authentication users, you need to add your Firebase
                    service account key.
                  </p>

                  <div
                    className="mt-3 p-3"
                    style={{
                      background: 'var(--surface-card)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <p className="label-caps mb-2">How to get your service account key</p>
                    <ol
                      className="list-inside list-decimal space-y-1 text-sm"
                      style={{ color: 'var(--text-body)' }}
                    >
                      <li>Go to Firebase Console &gt; Project Settings &gt; Service Accounts</li>
                      <li>Click &quot;Generate new private key&quot;</li>
                      <li>Download the JSON file</li>
                      <li>Copy the entire JSON content</li>
                      <li>
                        Add it as a secret named{' '}
                        <code
                          className="rounded px-1.5 py-0.5 text-xs"
                          style={{ background: 'var(--surface-sunken)', color: 'var(--text-strong)' }}
                        >
                          FIREBASE_SERVICE_ACCOUNT_KEY
                        </code>
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- Role filter ------------------------------------------------ */}
          <section aria-label="Filter by role" className="mb-4">
            <p className="label-caps mb-2">Roles</p>
            <div className="scroll-x -mx-1 px-1 pb-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={activeTab === 'all'}
                  onClick={() => setActiveTab('all')}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--r-md)] border px-3 text-sm font-semibold transition-colors ${
                    activeTab === 'all'
                      ? 'bg-ink-900 text-white border-ink-900'
                      : 'bg-ink-100 text-ink-700 border-ink-200 hover:border-ink-300 dark:bg-ink-800 dark:text-ink-200 dark:border-ink-700'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  All Users
                  <span className="tabular text-xs font-bold opacity-75">{mergedUsers.length}</span>
                </button>

                {roleOptions.map(role => {
                  const config = configFor(role);
                  const RoleIcon = config.icon;
                  const isActive = activeTab === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setActiveTab(role)}
                      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--r-md)] border px-3 text-sm font-semibold transition-colors ${
                        isActive ? config.solid : config.idle
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      <RoleIcon className="h-4 w-4" aria-hidden="true" />
                      {config.label}
                      <span className="tabular text-xs font-bold opacity-75">
                        {(usersByRole[role] || []).length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ---- Search ------------------------------------------------------ */}
          <div className="mb-5 max-w-md">
            <label htmlFor="user-search" className="sr-only">
              Search by name, email, or UID
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: 'var(--text-subtle)' }}
                aria-hidden="true"
              />
              <input
                id="user-search"
                type="text"
                placeholder="Search by name, email, or UID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-premium pl-10 text-sm"
              />
            </div>
          </div>

          {/* ---- Register ---------------------------------------------------- */}
          <div
            className="mb-3 flex items-baseline justify-between gap-3 border-b pb-2"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
              {activeTab === 'all'
                ? 'All Users'
                : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}s`}
            </h2>
            <span className="tabular text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {displayedUsers.length} shown
            </span>
          </div>

          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {displayedUsers.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.001 : 0.28 }}
                  className="flex flex-col items-center gap-3 px-6 py-14 text-center"
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--r-lg)',
                  }}
                >
                  <EmptyIcon
                    className="h-8 w-8"
                    strokeWidth={1.6}
                    style={{ color: 'var(--text-subtle)' }}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
                    {searchQuery
                      ? 'No users found matching your search'
                      : apiError
                        ? 'Configure Firebase Admin SDK to see users'
                        : `No ${activeTab === 'all' ? 'users' : activeTab + 's'} found`}
                  </p>
                </motion.div>
              ) : (
                displayedUsers.map((user, index) => (
                  <UserRoleCard
                    key={user.uid}
                    user={user}
                    role={user.role}
                    onEditRole={() => startEditingRole(user)}
                    onResetPassword={() => handleResetPassword(user)}
                    onDisable={() => setActionModal({ type: 'disable', user })}
                    onEnable={() => handleDisableUser(user, false)}
                    onDelete={() => setActionModal({ type: 'delete', user })}
                    isCurrentUser={user.uid === currentUser?.uid}
                    index={index}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <RoleEditorModal
        user={editingUser}
        currentRole={editingUser ? (roles[editingUser.uid] || 'customer') : 'customer'}
        value={newRole || 'customer'}
        onChange={setNewRole}
        onCancel={cancelEditing}
        onSave={saveRole}
      />

      <ConfirmActionModal
        action={actionModal && actionModal.type !== 'resetSuccess' ? actionModal : null}
        onCancel={() => setActionModal(null)}
        onConfirm={() =>
          actionModal.type === 'delete'
            ? handleDeleteUser(actionModal.user)
            : handleDisableUser(actionModal.user, true)
        }
      />

      <ResetLinkModal
        action={actionModal && actionModal.type === 'resetSuccess' ? actionModal : null}
        onClose={() => setActionModal(null)}

      />
    </div>
  );
};

export default UserManagement;
