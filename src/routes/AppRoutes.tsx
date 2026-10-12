import React, { Suspense } from 'react';
import {
  Route,
  Navigate,
  useLocation,
  Outlet,
  createHashRouter,
  createRoutesFromElements,
  RouterProvider,
} from 'react-router-dom';
import { AdminLayout } from '@/layouts';
import { LoadingState, AccessDenied } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_NAVIGATION_ITEMS, getFirstAccessibleRoute } from '@/routes/routes.config';
import {
  LoginPage,
  DashboardPage,
  ComplaintsPage,
  ComplaintDetailPage,
  ResponsesPage,
  CategoriesPage,
  MapPage,
  LocationActivityPage,
  RolesPage,
  CreateRolePage,
  RoleDetailPage,
  EditRolePage,
  UsersPage,
  CreateUserPage,
  UserDetailPage,
  EditUserPage,
  NotificationsPage,
  ActivityLogPage,
  NotFoundPage,
} from '@/pages';

/**
 * Protected Admin Route Wrapper
 * Strictly requires valid Supabase authenticated session and active admin_users membership.
 */
const ProtectedAdminRoute: React.FC = () => {
  const { session, user, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState fullHeight message="Verifying administrative session..." />;
  }

  if (!session || !user || !isAdmin) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
};

/**
 * Permission Guard Wrapper
 * Checks if current authenticated admin has the required permission.
 * If unauthorized, renders accessible AccessDenied component.
 */
interface PermissionGuardProps {
  requiredPermission: string;
  fallbackPath?: string;
  children: React.ReactNode;
}

const PermissionGuard: React.FC<PermissionGuardProps> = ({
  requiredPermission,
  fallbackPath,
  children,
}) => {
  const { hasPermission, permissionsLoading, permissionsError, isLoading, isBootstrapMode } = useAuth();

  if (isLoading || permissionsLoading) {
    return <LoadingState fullHeight message="Verifying permissions..." />;
  }

  const calculatedFallback = fallbackPath || getFirstAccessibleRoute(hasPermission, isBootstrapMode);

  if (permissionsError) {
    return (
      <AccessDenied
        requiredPermission={requiredPermission}
        fallbackPath={calculatedFallback}
        isErrorState={true}
      />
    );
  }

  if (!hasPermission(requiredPermission)) {
    return (
      <AccessDenied
        requiredPermission={requiredPermission}
        fallbackPath={calculatedFallback}
      />
    );
  }

  return <>{children}</>;
};

/**
 * Root Route Redirector
 * Directs user to the first accessible navigation item they have permission for.
 */
const RootRedirect: React.FC = () => {
  const { session, user, isAdmin, isLoading, permissionsLoading, hasPermission, isBootstrapMode } = useAuth();

  if (isLoading || permissionsLoading) {
    return <LoadingState fullHeight message="Verifying session..." />;
  }

  if (!session || !user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  const targetPath = getFirstAccessibleRoute(hasPermission, isBootstrapMode);
  return <Navigate to={targetPath} replace />;
};

/**
 * Public Authentication Route Wrapper
 * If an active authenticated admin visits /login, redirects to their accessible home.
 */
const PublicAuthRoute: React.FC = () => {
  const { session, user, isAdmin, isLoading, permissionsLoading, hasPermission, isBootstrapMode } = useAuth();
  const location = useLocation();

  if (isLoading || permissionsLoading) {
    return <LoadingState fullHeight message="Verifying session..." />;
  }

  if (session && user && isAdmin) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
    const target = from || getFirstAccessibleRoute(hasPermission, isBootstrapMode);
    return <Navigate to={target} replace />;
  }

  return <LoginPage />;
};

const routes = createRoutesFromElements(
  <>
    {/* Public Authentication Route */}
    <Route path="/login" element={<PublicAuthRoute />} />

    {/* Protected Admin Shell Routes */}
    <Route element={<ProtectedAdminRoute />}>
      <Route path="/" element={<RootRedirect />} />
      
      <Route
        path="/dashboard"
        element={
          <PermissionGuard requiredPermission="dashboard.view">
            <DashboardPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/complaints"
        element={
          <PermissionGuard requiredPermission="complaints.view">
            <ComplaintsPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/complaints/:id"
        element={
          <PermissionGuard requiredPermission="complaints.view">
            <ComplaintDetailPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/responses"
        element={
          <PermissionGuard requiredPermission="responses.view">
            <ResponsesPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/categories"
        element={
          <PermissionGuard requiredPermission="categories.view">
            <CategoriesPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/map"
        element={
          <PermissionGuard requiredPermission="map.view">
            <MapPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/location-activity"
        element={
          <PermissionGuard requiredPermission="location_activity.view">
            <LocationActivityPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/roles"
        element={
          <PermissionGuard requiredPermission="roles.manage">
            <RolesPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/roles/create"
        element={
          <PermissionGuard requiredPermission="roles.manage">
            <CreateRolePage />
          </PermissionGuard>
        }
      />
      <Route
        path="/roles/:roleId"
        element={
          <PermissionGuard requiredPermission="roles.manage">
            <RoleDetailPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/roles/:roleId/edit"
        element={
          <PermissionGuard requiredPermission="roles.manage">
            <EditRolePage />
          </PermissionGuard>
        }
      />
      <Route
        path="/users"
        element={
          <PermissionGuard requiredPermission="admin_users.view">
            <UsersPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/users/create"
        element={
          <PermissionGuard requiredPermission="admin_users.manage">
            <CreateUserPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/users/:userId"
        element={
          <PermissionGuard requiredPermission="admin_users.view">
            <UserDetailPage />
          </PermissionGuard>
        }
      />
      <Route
        path="/users/:userId/edit"
        element={
          <PermissionGuard requiredPermission="admin_users.manage">
            <EditUserPage />
          </PermissionGuard>
        }
      />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route
        path="/activity-log"
        element={
          <PermissionGuard requiredPermission="audit.view">
            <ActivityLogPage />
          </PermissionGuard>
        }
      />

      {/* Catch-all 404 Route */}
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </>
);

export const router = createHashRouter(routes);

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<LoadingState fullHeight message="Loading view..." />}>
      <RouterProvider router={router} />
    </Suspense>
  );
};

export default AppRoutes;
