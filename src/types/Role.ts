export interface RoleRpcRow {
  id: string;
  name_en: string;
  name_bn: string | null;
  description: string | null;
  active: boolean;
  is_system: boolean;
  permission_count: number;
  assigned_user_count: number;
  created_at: string;
  updated_at: string | null;
}

export type RoleListItem = RoleRpcRow;

export interface PermissionCatalogueItem {
  id: string;
  module: string;
  action: string;
  name_en: string;
  name_bn: string | null;
  description: string | null;
  created_at: string;
}

export interface CreateRoleInput {
  name_en: string;
  name_bn?: string | null;
  active: boolean;
  permission_ids: string[];
  description?: string | null;
}

export interface CreateRoleResult {
  id: string;
  name_en: string;
  name_bn: string | null;
  description: string | null;
  active: boolean;
  is_system: boolean;
  permission_ids: string[];
  permission_count: number;
  created_at: string;
  updated_at: string;
}

export class RoleApiError extends Error {
  code?: string;
  details?: string;
  hint?: string;

  constructor(message: string, code?: string, details?: string, hint?: string) {
    super(message);
    this.name = 'RoleApiError';
    this.code = code;
    this.details = details;
    this.hint = hint;
  }

  get isPermissionDenied(): boolean {
    return (
      this.code === '42501' ||
      this.message.includes('42501') ||
      this.message.toLowerCase().includes('access denied') ||
      this.message.toLowerCase().includes('authorization required')
    );
  }

  get isNotFound(): boolean {
    return (
      this.code === 'P0002' ||
      this.message.toLowerCase().includes('not found')
    );
  }

  get isDuplicate(): boolean {
    return (
      this.code === '23505' ||
      this.message.toLowerCase().includes('already exists')
    );
  }

  get isSystemProtected(): boolean {
    return (
      this.message.toLowerCase().includes('system role') ||
      this.message.toLowerCase().includes('protected')
    );
  }

  get isLastManagerLockout(): boolean {
    return (
      this.code === '23514' ||
      this.message.toLowerCase().includes('leave no active administrators') ||
      this.message.toLowerCase().includes('last effective role manager') ||
      this.message.toLowerCase().includes('cannot remove roles.manage')
    );
  }

  get isValidationError(): boolean {
    return (
      this.code === '22000' ||
      this.message.toLowerCase().includes('invalid permission') ||
      this.message.toLowerCase().includes('cannot be blank') ||
      this.message.toLowerCase().includes('cannot be empty')
    );
  }

  get isConfigError(): boolean {
    return (
      (this.code === 'CONFIG_ERROR' ||
        this.message.toLowerCase().includes('not configured')) &&
      !this.isCompatibilityError
    );
  }

  get isCompatibilityError(): boolean {
    return (
      this.code === 'COMPATIBILITY_ERROR' ||
      this.message.toLowerCase().includes('missing migration') ||
      this.message.toLowerCase().includes('p_update_description') ||
      this.message.toLowerCase().includes('p_update_name_bn') ||
      this.message.toLowerCase().includes('p_name_en')
    );
  }
}

export interface RoleDetail {
  id: string;
  name_en: string;
  name_bn: string | null;
  description: string | null;
  active: boolean;
  is_system: boolean;
  permission_ids: string[];
  permission_count: number;
  assigned_user_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
  created_at?: string;
}

export interface RoleUpdateInput {
  id: string;
  name_en: string;
  name_bn?: string | null;
  active: boolean;
  permission_ids?: string[] | null;
  /**
   * Description update semantics:
   * - `undefined` (omitted): preserves existing description in database.
   * - `null` or `''`: explicitly clears description to `null`.
   * - non-empty `string`: updates description to trimmed string.
   */
  description?: string | null;
}

export type UpdateRoleInput = RoleUpdateInput;

export interface ReplaceRolePermissionsInput {
  role_id: string;
  permission_ids: string[];
}

export interface ReplaceRolePermissionsResult {
  role_id: string;
  permission_ids: string[];
  permission_count: number;
  updated_at: string;
}

export type RoleMutationResult = RoleDetail;

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
}


