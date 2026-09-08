import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Diya } from './ui/Ornaments';

/**
 * Route guard.
 *
 * `adminOnly` / `adminOrSales` / `staffOnly` are the original coarse flags and
 * behave exactly as before. `allowRoles` is the explicit form: pass the exact
 * roles permitted on the route. Prefer it for anything beyond "admins only" —
 * it keeps the route and the navigation menu describing the same rule instead
 * of drifting apart.
 */
const ProtectedRoute = ({
  children,
  adminOnly = false,
  adminOrSales = false,
  staffOnly = false,
  allowRoles = null,
}) => {
  const { user, isAdmin, isSales, isStaff, userRole, loading, roleError, refreshRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center"
      >
        <Diya className="h-10 w-16" />
        <div className="space-y-2">
          <p className="card-title" style={{ color: 'var(--text-strong)' }}>
            Checking your access
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            One moment please.
          </p>
        </div>
        <span
          aria-hidden="true"
          className="h-1 w-40 overflow-hidden rounded-full"
          style={{ background: 'var(--surface-sunken)' }}
        >
          <span className="skeleton block h-full w-full" />
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (roleError && !userRole) {
    return (
      <div
        role="status"
        className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center"
      >
        <Diya className="h-10 w-16" />
        <div className="space-y-2">
          <p className="card-title" style={{ color: 'var(--text-strong)' }}>
            Could not verify your access
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            We had trouble reaching the server. Your access could not be confirmed.
          </p>
        </div>
        <button type="button" onClick={refreshRole} className="btn-primary">
          Try again
        </button>
      </div>
    );
  }

  if (allowRoles && !allowRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (adminOrSales && !isAdmin && !isSales) {
    return <Navigate to="/" replace />;
  }

  if (staffOnly && !isAdmin && !isSales && !isStaff) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
