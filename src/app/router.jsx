import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import { RequireAuth, RequireRole, RoleRedirect } from './guards';
import { BootLoader } from './BootLoader';

const Landing = lazy(() => import('../pages/Landing'));
const Login = lazy(() => import('../pages/Login'));
const Signup = lazy(() => import('../pages/Signup'));
const NotFound = lazy(() => import('../pages/NotFound'));

const StudentDashboard = lazy(() => import('../pages/student/StudentDashboard'));
const ActiveQueues = lazy(() => import('../pages/student/ActiveQueues'));
const MyQueues = lazy(() => import('../pages/student/MyQueues'));
const Prebook = lazy(() => import('../pages/student/Prebook'));
const QueueStatus = lazy(() => import('../pages/student/QueueStatus'));
const Help = lazy(() => import('../pages/student/Help'));
const Settings = lazy(() => import('../pages/student/Settings'));

const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const ManageQueues = lazy(() => import('../pages/admin/ManageQueues'));
const QueueConsole = lazy(() => import('../pages/admin/QueueConsole'));
const ManageUsers = lazy(() => import('../pages/admin/ManageUsers'));
const PrebookAdmin = lazy(() => import('../pages/admin/PrebookAdmin'));
const Analytics = lazy(() => import('../pages/admin/Analytics'));
const Sustainability = lazy(() => import('../pages/admin/Sustainability'));
const AiHealth = lazy(() => import('../pages/admin/AiHealth'));
const AuditLog = lazy(() => import('../pages/admin/AuditLog'));

const wrap = (el) => <Suspense fallback={<BootLoader />}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: '/', element: wrap(<Landing />) },
  { path: '/login', element: wrap(<Login />) },
  { path: '/signup', element: wrap(<Signup />) },
  {
    path: '/app',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <RoleRedirect /> },
          { path: 'dashboard', element: wrap(<StudentDashboard />) },
          { path: 'queues', element: wrap(<ActiveQueues />) },
          { path: 'my-queues', element: wrap(<MyQueues />) },
          { path: 'prebook', element: wrap(<Prebook />) },
          { path: 'status', element: wrap(<QueueStatus />) },
          { path: 'help', element: wrap(<Help />) },
          { path: 'settings', element: wrap(<Settings />) },
          {
            path: 'admin',
            element: <RequireRole minRole="admin" />,
            children: [
              { index: true, element: wrap(<AdminDashboard />) },
              { path: 'queues', element: wrap(<ManageQueues />) },
              { path: 'queues/:queueId', element: wrap(<QueueConsole />) },
              { path: 'users', element: wrap(<ManageUsers />) },
              { path: 'my-queues', element: wrap(<MyQueues />) },
              { path: 'prebooking', element: wrap(<PrebookAdmin />) },
              { path: 'analytics', element: wrap(<Analytics />) },
              { path: 'sustainability', element: wrap(<Sustainability />) },
              { path: 'ai-health', element: wrap(<AiHealth />) },
              { path: 'audit', element: wrap(<AuditLog />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: wrap(<NotFound />) },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
