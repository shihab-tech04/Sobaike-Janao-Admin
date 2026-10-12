/**
 * Admin User Management API Service Layer
 * Interacts with Supabase RPCs and Edge Functions:
 * - admin_get_users
 * - admin_get_user
 * - admin_get_assignable_roles
 * - admin_update_user
 * - Edge Function: admin-create-user
 * - Edge Function: admin-delete-user
 * Strictly authoritative: no direct table mutations, no frontend mock accounts.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  AdminUserListItem,
  AdminUserDetail,
  AssignableRole,
  UserFilterRole,
  CreateAdminUserInput,
  UpdateAdminUserInput,
  DeleteAdminUserResponse,
  AdminUsersListResponse,
  AdminUserQueryParams,
  AdminUserApiError,
} from '@/types/AdminUser';

function assertAdminUserApiConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new AdminUserApiError(
      'Supabase user management is not configured in this environment.',
      'CONFIG_ERROR'
    );
  }
}

async function extractFunctionError(
  error: unknown,
  fallbackMessage: string
): Promise<{ message: string; code?: string }> {
  let message = error instanceof Error ? error.message : fallbackMessage;
  let code: string | undefined;

  if (error && typeof error === 'object' && 'context' in error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string; code?: string }> } }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) message = body.error;
        if (body?.code) code = body.code;
      } catch {
        // Preserve the original provider error when the response body is not JSON.
      }
    }
  }

  return { message, code };
}

export const adminUserApi = {
  /**
   * Fetch paginated list of administrators
   */
  async getUsers(params: AdminUserQueryParams = {}): Promise<AdminUsersListResponse> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.rpc('admin_get_users', {
      p_search: params.search || null,
      p_role_id: params.role_id && params.role_id !== 'all' ? params.role_id : null,
      p_status: params.status && params.status !== 'all' ? params.status : null,
      p_limit: params.limit || 50,
      p_offset: params.offset || 0,
    });

    if (error) {
      console.error('admin_get_users RPC failed:', error);
      throw new AdminUserApiError(error.message, error.code, error.details);
    }

    const res = data as { users?: AdminUserListItem[]; total_count?: number; limit?: number; offset?: number };
    return {
      users: Array.isArray(res?.users) ? res.users : [],
      total_count: Number(res?.total_count || 0),
      limit: Number(res?.limit || 50),
      offset: Number(res?.offset || 0),
    };
  },

  /**
   * Fetch detailed information about a single administrator
   */
  async getUser(userId: string): Promise<AdminUserDetail> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.rpc('admin_get_user', {
      p_user_id: userId,
    });

    if (error) {
      console.error('admin_get_user RPC failed:', error);
      throw new AdminUserApiError(error.message, error.code, error.details);
    }

    return data as AdminUserDetail;
  },

  /**
   * Fetch active roles assignable to normal administrators
   * Requires admin_users.manage permission
   */
  async getAssignableRoles(): Promise<AssignableRole[]> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.rpc('admin_get_assignable_roles');

    if (error) {
      console.error('admin_get_assignable_roles RPC failed:', error);
      throw new AdminUserApiError(error.message, error.code, error.details);
    }

    return Array.isArray(data) ? data : [];
  },

  /**
   * Fetch roles for filter dropdown on User Management list
   * Requires admin_users.view permission (does not require admin_users.manage)
   */
  async getUserFilterRoles(): Promise<UserFilterRole[]> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.rpc('admin_get_user_filter_roles');

    if (error) {
      console.error('admin_get_user_filter_roles RPC failed:', error);
      throw new AdminUserApiError(error.message, error.code, error.details);
    }

    return Array.isArray(data) ? data : [];
  },

  /**
   * Create a login-ready administrative user via server-side Edge Function
   */
  async createUser(input: CreateAdminUserInput): Promise<{ success: boolean; user_id: string }> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        display_name: input.display_name?.trim() || null,
        role_id: input.role_id,
        active: input.active !== undefined ? input.active : true,
      },
    });

    if (error) {
      console.error('Edge Function admin-create-user failed:', error);
      const parsed = await extractFunctionError(error, 'Failed to create user.');
      throw new AdminUserApiError(parsed.message, parsed.code);
    }

    if (!data || !data.success) {
      throw new AdminUserApiError(data?.error || 'Failed to create user.', data?.code);
    }

    return { success: true, user_id: data.user_id };
  },

  /**
   * Update a normal administrator's display name, assigned role, and status atomically
   */
  async updateUser(input: UpdateAdminUserInput): Promise<{ success: boolean; user_id: string }> {
    assertAdminUserApiConfigured();

    const { error } = await supabase.rpc('admin_update_user', {
      p_user_id: input.user_id,
      p_display_name: input.display_name?.trim() || null,
      p_role_id: input.role_id,
      p_active: input.active,
    });

    if (error) {
      console.error('admin_update_user RPC failed:', error);
      throw new AdminUserApiError(error.message, error.code, error.details);
    }

    return { success: true, user_id: input.user_id };
  },

  /**
   * Permanently delete an administrative user.
   * The Edge Function verifies caller permissions, blocks self-deletion and
   * Super Admin deletion, cascades Auth/Directory records, and emits audit logs.
   */
  async deleteUser(userId: string): Promise<DeleteAdminUserResponse> {
    assertAdminUserApiConfigured();

    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: userId },
    });

    if (error) {
      console.error('Edge Function admin-delete-user failed:', error);
      const parsed = await extractFunctionError(error, 'Failed to delete administrator.');
      throw new AdminUserApiError(parsed.message, parsed.code);
    }

    if (!data || !data.success) {
      throw new AdminUserApiError(data?.error || 'Failed to delete administrator.', data?.code);
    }

    return { success: true, user_id: userId };
  },
};
