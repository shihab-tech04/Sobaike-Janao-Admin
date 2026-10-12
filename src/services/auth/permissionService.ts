import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { authService } from '@/services/auth/authService';

export const CANONICAL_PERMISSIONS = [
  'dashboard.view',
  'complaints.view',
  'complaints.evidence_view',
  'complaints.export',
  'complaints.publish',
  'complaints.unpublish',
  'complaints.reject',
  'categories.view',
  'location_activity.view',
  'map.view',
  'responses.view',
  'admin_users.view',
  'admin_users.manage',
  'roles.manage',
  'audit.view',
] as const;

export type CanonicalPermissionId = (typeof CANONICAL_PERMISSIONS)[number];

export interface UserAssignedRole {
  id: string;
  name_en: string;
  name_bn: string | null;
  description?: string | null;
  active: boolean;
  is_system?: boolean;
}

export interface UserPermissionProfile {
  role: UserAssignedRole | null;
  permissions: string[];
  isBootstrapMode: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}


/**
 * Service to resolve effective administrative role and permissions for an authenticated admin.
 * Follows strict database RBAC foundation:
 * 1. Queries backend RPC admin_get_my_authorization_context() directly using auth.uid()
 * 2. If assigned to an active role, returns role and effective permissions
 * 3. If no assignments exist anywhere in system, returns BOOTSTRAP MODE with 'roles.manage' only
 * 4. If system has assignments but user has none or role is inactive, user has 0 permissions
 * 5. Fails closed immediately if RPC fails or caller is unauthorized (NO client table fallbacks)
 */
export const permissionService = {
  /**
   * Resolves the effective authorization profile for the currently authenticated admin caller
   */
  async resolveCurrentUserAuthorization(): Promise<UserPermissionProfile> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase authorization service is not configured in this environment.');
    }

    const currentUser = await authService.getCurrentUser();
    if (!currentUser?.id) {
      throw new Error('No authenticated user found for authorization context resolution.');
    }

    // Authoritative check: Database runtime context RPC using auth.uid() exclusively
    const { data: contextData, error: rpcError } = await supabase.rpc(
      'admin_get_my_authorization_context'
    );

    if (rpcError) {
      console.error('Authorization context RPC failed:', rpcError.message || rpcError);
      throw new Error(`Authorization context RPC failed: ${rpcError.message || 'Unknown error'}`);
    }

    if (!contextData || typeof contextData !== 'object') {
      throw new Error('Invalid authorization context response received from server.');
    }

    const parsed = contextData as {
      is_admin?: boolean;
      is_super_admin?: boolean;
      is_bootstrap?: boolean;
      role?: UserAssignedRole | null;
      permission_ids?: string[];
    };

    const isAdmin = Boolean(parsed.is_admin);
    const isSuperAdmin = Boolean(parsed.is_super_admin);
    const isBootstrap = Boolean(parsed.is_bootstrap);
    const role = parsed.role || null;
    const permissions = Array.isArray(parsed.permission_ids) ? parsed.permission_ids : [];

    return {
      isAdmin,
      isSuperAdmin,
      isBootstrapMode: isBootstrap,
      role: role
        ? {
            id: String(role.id),
            name_en: String(role.name_en || ''),
            name_bn: role.name_bn ? String(role.name_bn) : null,
            description: role.description ? String(role.description) : null,
            active: Boolean(role.active),
            is_system: Boolean(role.is_system),
          }
        : null,
      permissions: isAdmin ? permissions : [],
    };
  },

  /**
   * Resolves the effective permission profile for the current user
   */
  async resolveUserPermissions(_userId?: string): Promise<UserPermissionProfile> {
    return this.resolveCurrentUserAuthorization();
  },
};

export default permissionService;
