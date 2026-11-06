import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ROLE_RANK } from '../utils/constants';
import { BootLoader } from './BootLoader';

/** Blocks anonymous access; remembers where the user was heading. */
export function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  const booted = useAuthStore((s) => s.booted);
  const loc = useLocation();
  if (!booted) return <BootLoader />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return <Outlet />;
}

/** Role gate for the admin area (admin & super-admin pass). */
export function RequireRole({ minRole = 'admin' }) {
  const user = useAuthStore((s) => s.user);
  const booted = useAuthStore((s) => s.booted);
  if (!booted) return <BootLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if ((ROLE_RANK[user.role] || 0) < ROLE_RANK[minRole]) return <Navigate to="/app/dashboard" replace />;
  return <Outlet />;
}

/** /app index → role-appropriate home. */
export function RoleRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={(ROLE_RANK[user.role] || 0) >= ROLE_RANK.admin ? '/app/admin' : '/app/dashboard'} replace />;
}

/** Logged-in users skip the auth pages. */
export function RedirectIfAuthed({ children }) {
  const user = useAuthStore((s) => s.user);
  const booted = useAuthStore((s) => s.booted);
  if (!booted) return <BootLoader />;
  if (user) {
    const dest = (ROLE_RANK[user.role] || 0) >= ROLE_RANK.admin ? '/app/admin' : '/app/dashboard';
    return <Navigate to={dest} replace />;
  }
  return children;
}
