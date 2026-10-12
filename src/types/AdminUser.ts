/**
 * Phase 2E: Admin User Management Types
 */

export interface AdminUserListItem {
  user_id: string;
  display_name: string | null;
  email: string;
  active: boolean;
  is_super_admin: boolean;
  role_id: string | null;
  role_name_en: string | null;
  role_name_bn: string | null;
  can_manage_target?: boolean;
  created_at: string;
}

export interface AdminUserDetail {
  user_id: string;
  display_name: string | null;
  email: string;
  active: boolean;
  is_super_admin: boolean;
  role: {
    id: string;
    name_en: string;
    name_bn: string | null;
    description: string | null;
    active: boolean;
    is_system?: boolean;
  } | null;
  effective_permissions: string[];
  can_manage_target?: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface AssignableRole {
  id: string;
  name_en: string;
  name_bn: string | null;
  description: string | null;
  active: boolean;
  is_system: boolean;
}

export interface UserFilterRole {
  id: string;
  name_en: string;
  name_bn: string | null;
  active?: boolean;
}

export interface CreateAdminUserInput {
  email: string;
  password: string;
  confirm_password?: string;
  display_name?: string | null;
  role_id: string;
  active?: boolean;
}

export interface UpdateAdminUserInput {
  user_id: string;
  display_name?: string | null;
  role_id: string;
  active: boolean;
}

export interface DeleteAdminUserResponse {
  success: boolean;
  user_id: string;
}

export interface AdminUsersListResponse {
  users: AdminUserListItem[];
  total_count: number;
  limit: number;
  offset: number;
}

export interface AdminUserQueryParams {
  search?: string;
  role_id?: string;
  status?: 'all' | 'active' | 'inactive';
  limit?: number;
  offset?: number;
}

export class AdminUserApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(message: string, code?: string, statusOrDetails?: number | unknown, details?: unknown) {
    super(message);
    this.name = 'AdminUserApiError';
    this.code = code;
    if (typeof statusOrDetails === 'number') {
      this.status = statusOrDetails;
      this.details = details;
    } else {
      this.status = undefined;
      this.details = statusOrDetails;
    }
  }
}
