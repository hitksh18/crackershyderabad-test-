import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  linkWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import toast from '../utils/toast';

const AuthContext = createContext();

/** Firebase auth codes are not sentences. Turn them into ones before toasting. */
const AUTH_TOAST_MESSAGES = {
  'auth/invalid-email': 'That email address does not look right. Check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact us to have it re-enabled.',
  'auth/user-not-found': 'No account exists for that email.',
  'auth/wrong-password': 'That password is incorrect. Try again or reset it.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-login-credentials': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Please wait a minute before trying again.',
  'auth/network-request-failed': 'We could not reach the server. Check your connection and try again.',
  'auth/email-already-in-use': 'Email already in use. Try logging in instead.',
  'auth/weak-password': 'Please choose a password with at least six characters.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Please use another option.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and retry.',
};

const friendlyAuthMessage = (error, fallback = 'We could not sign you in. Please try again.') =>
  AUTH_TOAST_MESSAGES[error?.code] || fallback;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSales, setIsSales] = useState(false);
  const [isBilling, setIsBilling] = useState(false);
  const [isPacker, setIsPacker] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [roleError, setRoleError] = useState(false);
  const [loading, setLoading] = useState(true);
  /*
   * Whether we know *who* is signed in, as opposed to what they are allowed to
   * do. `loading` covers both and only clears after the roles/{uid} read, which
   * is a network round trip nothing about identity depends on. Anything keyed
   * only on the account — the cart's storage key, for one — should wait on this
   * instead, or it inherits a Firestore read's latency and its failure modes.
   */
  const [authReady, setAuthReady] = useState(false);

  const fetchUserRole = useCallback(async (currentUser) => {
    if (!currentUser) {
      setUserRole(null);
      setRoleError(false);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      return;
    }

    try {
      const roleDoc = await getDoc(doc(db, 'roles', currentUser.uid));

      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        setRoleError(false);
        setUserRole(role);
        setIsAdmin(role === 'admin');
        setIsSales(role === 'sales');
        setIsBilling(role === 'billing');
        setIsPacker(role === 'packer');
        setIsMod(role === 'mod');
        setIsStaff(['admin', 'sales', 'billing', 'packer', 'mod'].includes(role));
        return role;
      } else {
        setRoleError(false);
        setUserRole('customer');
        setIsAdmin(false);
        setIsSales(false);
        setIsBilling(false);
        setIsPacker(false);
        setIsMod(false);
        setIsStaff(false);
        return 'customer';
      }
    } catch (error) {
      console.error('Error fetching role:', error);
      setRoleError(true);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      setIsBilling(false);
      setIsPacker(false);
      setIsMod(false);
      setIsStaff(false);
      return null;
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (user) {
      await fetchUserRole(user);
    }
  }, [user, fetchUserRole]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      // Identity is settled here. The role lookup below is a separate question
      // and must not hold back anything that only needed to know who this is.
      setAuthReady(true);

      if (currentUser) {
        await fetchUserRole(currentUser);
      } else {
        setUserRole(null);
        setIsAdmin(false);
        setIsSales(false);
        setIsBilling(false);
        setIsPacker(false);
        setIsMod(false);
        setIsStaff(false);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, [fetchUserRole]);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          name: result.user.displayName || '',
          email: result.user.email || '',
          phone: result.user.phoneNumber || '',
          createdAt: new Date(),
        });
      }
      
      const role = await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return { ...result, role };
    } catch (error) {
      console.error(error);
      toast.error(
        friendlyAuthMessage(error, 'Google sign-in did not complete. Please try again.')
      );
      throw error;
    }
  };

  /**
   * Link the signed-in account to a Google identity (Profile page).
   * This must be a link, not a sign-in: signInWithPopup would swap the
   * session to whatever Google account is chosen, silently replacing the
   * current user — a real risk for staff sessions.
   */
  const linkWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (!auth.currentUser) {
        toast.error('Please sign in first, then link Google.');
        return null;
      }
      await linkWithPopup(auth.currentUser, provider);
      await fetchUserRole(auth.currentUser);
      toast.success('Google account linked!');
      return auth.currentUser;
    } catch (error) {
      toast.error(
        friendlyAuthMessage(error, 'Could not link your Google account. Please try again.')
      );
      throw error;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      
      const role = await fetchUserRole(result.user);
      
      toast.success('Logged in successfully!');
      return { ...result, role };
    } catch (error) {
      console.error(error);
      toast.error(
        friendlyAuthMessage(error, 'We could not sign you in. Please check your details and try again.')
      );
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setUserRole(null);
      setIsAdmin(false);
      setIsSales(false);
      toast.success('Logged out successfully!');
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  };

  const value = {
    user,
    isAdmin,
    isSales,
    isBilling,
    isPacker,
    isMod,
    isStaff,
    userRole,
    roleError,
    loading,
    authReady,
    loginWithGoogle,
    linkWithGoogle,
    loginWithEmail,
    signOut,
    refreshRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
