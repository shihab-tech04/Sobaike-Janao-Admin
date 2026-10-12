/**
 * Role Management API Service Layer
 * Interacts exclusively with Supabase RPCs:
 * - admin_list_roles
 * - admin_get_permission_catalogue
 * - admin_get_role_detail
 * - admin_create_role
 * - admin_update_role
 * - admin_replace_role_permissions
 * Strictly authoritative: no direct table mutations, no mock fallbacks in unconfigured production.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  RoleListItem,
  RoleRpcRow,
  PermissionCatalogueItem,
  CreateRoleInput,
  CreateRoleResult,
  RoleDetail,
  RoleUpdateInput,
  ReplaceRolePermissionsInput,
  ReplaceRolePermissionsResult,
  RoleApiError,
} from '@/types/Role';
import { generateRoleSlug } from '@/utils/roleUtils';

/**
 * Asserts whether role management is configured.
 * - When Supabase credentials are configured: proceeds with authoritative Supabase RPCs.
 * - When Supabase credentials are unconfigured: immediately throws RoleApiError with code 'CONFIG_ERROR'.
 */
function assertRoleApiConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new RoleApiError(
      'Supabase role management is not configured in this environment.',
      'CONFIG_ERROR'
    );
  }
}

export class RoleApi {
  /**
   * List administrative roles via the secure `admin_list_roles` database RPC.
   */
  async listRoles(): Promise<RoleListItem[]> {
    assertRoleApiConfigured();

      const { data, error } = await supabase.rpc('admin_list_roles');
  if (error) {
    throw new RoleApiError(error.message, error.code, error.details, error.hint);
  }
  const rows = (data || []) as unknown as RoleRpcRow[];
  return rows.map((item) => ({
    id: String(item.id),
    name_en: String(item.name_en || ''),
    name_bn: item.name_bn ? String(item.name_bn) : null,
    description: item.description ? String(item.description) : null,
    active: Boolean(item.active),
    is_system: Boolean(item.is_system),
    permission_count: Number(item.permission_count || 0),
    assigned_user_count: Number(item.assigned_user_count || 0),
    created_at: String(item.created_at || ''),
    updated_at: item.updated_at ? String(item.updated_at) : null,
  }));
  }

  /**
   * Fetch the canonical 15 permissions catalogue via the secure `admin_get_permission_catalogue` database RPC.
   */
  async getPermissionCatalogue(): Promise<PermissionCatalogueItem[]> {
    assertRoleApiConfigured();

      const { data, error } = await supabase.rpc('admin_get_permission_catalogue');
  if (error) {
    throw new RoleApiError(error.message, error.code, error.details, error.hint);
  }
  const rows = (data || []) as unknown as PermissionCatalogueItem[];
  return rows.map((p) => ({
    id: String(p.id),
    module: String(p.module),
    action: String(p.action),
    name_en: String(p.name_en || ''),
    name_bn: p.name_bn ? String(p.name_bn) : null,
    description: p.description ? String(p.description) : null,
    created_at: String(p.created_at || ''),
  }));
  }

  /**
   * Fetch full role detail by ID via `admin_get_role_detail`.
   */
  async getRoleDetail(roleId: string): Promise<RoleDetail> {
    const cleanId = roleId ? roleId.trim() : '';
    if (!cleanId) {
      throw new RoleApiError('Role ID cannot be empty.', '22000');
    }

    assertRoleApiConfigured();

      const { data, error } = await supabase.rpc('admin_get_role_detail', {
    p_role_id: cleanId,
  });

  if (error) {
    throw new RoleApiError(error.message, error.code, error.details, error.hint);
  }

  if (!data) {
    throw new RoleApiError(`Role not found with ID: ${cleanId}`, 'P0002');
  }

  const item = data as unknown as RoleDetail;
  return {
    id: String(item.id),
    name_en: String(item.name_en || ''),
    name_bn: item.name_bn ? String(item.name_bn) : null,
    description: item.description ? String(item.description) : null,
    active: Boolean(item.active),
    is_system: Boolean(item.is_system),
    permission_ids: Array.isArray(item.permission_ids) ? item.permission_ids.map(String) : [],
    permission_count: Number(item.permission_count || 0),
    assigned_user_count: Number(item.assigned_user_count || 0),
    created_at: String(item.created_at || ''),
    updated_at: item.updated_at ? String(item.updated_at) : null,
  };
  }

  /**
   * Atomically create a new administrative role with validated permission IDs.
   * Separate English and Bengali role naming:
   * - English name is required and drives the technical ASCII slug (id).
   * - Bengali name is optional and stored separately (never affects the slug, never auto-translated).
   */
  async createRole(input: CreateRoleInput): Promise<CreateRoleResult> {
    const cleanNameEn = (input.name_en || '').trim();
    if (!cleanNameEn) {
      throw new RoleApiError('English role name is required and cannot be blank.', '22000');
    }

    const technicalSlug = generateRoleSlug(cleanNameEn);
    if (!technicalSlug) {
      throw new RoleApiError(
        'English role name must contain valid alphanumeric characters to create a technical role ID.',
        '22000'
      );
    }

    const cleanNameBn =
      input.name_bn && typeof input.name_bn === 'string' && input.name_bn.trim().length > 0
        ? input.name_bn.trim()
        : null;

    assertRoleApiConfigured();

      // First attempt the forward Phase 2C RPC signature (p_name_en, p_name_bn)
  const primaryParams = {
    p_name_en: cleanNameEn,
    p_name_bn: cleanNameBn,
    p_active: input.active,
    p_permission_ids: input.permission_ids,
    p_description: input.description && input.description.trim() ? input.description.trim() : null,
  };

  let rpcResult = await supabase.rpc('admin_create_role', primaryParams);

  if (rpcResult.error) {
    if (
      rpcResult.error.code === 'PGRST202' ||
      rpcResult.error.message?.includes('p_name_en') ||
      rpcResult.error.message?.includes('schema cache')
    ) {
      throw new RoleApiError(
        'Role creation is temporarily unavailable because the required bilingual role update has not been applied. Please apply migration 20260903000001.',
        'COMPATIBILITY_ERROR',
        rpcResult.error.details,
        'Apply migration 20260903000001 to enable safe role creation with separate bilingual naming.'
      );
    }
    throw new RoleApiError(rpcResult.error.message, rpcResult.error.code, rpcResult.error.details, rpcResult.error.hint);
  }

  return rpcResult.data as unknown as CreateRoleResult;
  }

  /**
   * Atomically update role metadata and optionally replace its permission set.
   * Separate English and Bengali role naming:
   * - Preserves immutable technical role ID.
   * - Preserves Bengali name unless explicitly updated.
   * - Preserves omitted descriptions.
   */
  async updateRole(input: RoleUpdateInput): Promise<RoleDetail> {
    const cleanId = input.id ? input.id.trim() : '';
    const cleanNameEn = (input.name_en || '').trim();

    if (!cleanId) {
      throw new RoleApiError('Role ID cannot be empty.', '22000');
    }
    if (!cleanNameEn) {
      throw new RoleApiError('Role name is required and cannot be blank.', '22000');
    }

    assertRoleApiConfigured();

    // Determine description update semantics:
    // - If input.description was omitted (undefined): preserve existing description
    // - If input.description is a non-empty string: update to trimmed string
    // - If input.description is null or empty string '': update to null (explicitly clear)
    const hasDescriptionUpdate =
      Object.prototype.hasOwnProperty.call(input, 'description') &&
      input.description !== undefined;

    let cleanDesc: string | null = null;
    if (hasDescriptionUpdate) {
      cleanDesc =
        typeof input.description === 'string' && input.description.trim().length > 0
          ? input.description.trim()
          : null;
    }

    // Determine Bengali name update semantics:
    // - If input.name_bn was omitted (undefined): preserve existing name_bn
    // - If input.name_bn is a non-empty string: update to trimmed string
    // - If input.name_bn is null or empty string '': update to null (explicitly clear)
    const hasNameBnUpdate =
      Object.prototype.hasOwnProperty.call(input, 'name_bn') &&
      input.name_bn !== undefined;

    let cleanNameBn: string | null = null;
    if (hasNameBnUpdate) {
      cleanNameBn =
        typeof input.name_bn === 'string' && input.name_bn.trim().length > 0
          ? input.name_bn.trim()
          : null;
    }

      const primaryParams: Record<string, unknown> = {
    p_role_id: cleanId,
    p_name_en: cleanNameEn,
    p_name_bn: cleanNameBn,
    p_active: input.active,
    p_permission_ids: input.permission_ids !== undefined ? input.permission_ids : null,
    p_description: cleanDesc,
    p_update_description: hasDescriptionUpdate,
    p_update_name_bn: hasNameBnUpdate,
  };

  const { data, error } = await supabase.rpc('admin_update_role', primaryParams);

  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.message?.includes('p_update_description') ||
      error.message?.includes('p_update_name_bn') ||
      error.message?.includes('p_name_en') ||
      error.message?.includes('schema cache')
    ) {
      throw new RoleApiError(
        'Role updates are temporarily unavailable because the required bilingual role update has not been applied. Please apply migration 20260903000001.',
        'COMPATIBILITY_ERROR',
        error.details,
        'Apply migration 20260903000001 to enable safe role updates with separate bilingual naming.'
      );
    }
    throw new RoleApiError(error.message, error.code, error.details, error.hint);
  }

  return data as unknown as RoleDetail;
  }

  /**
   * Dedicated atomic replacement of a role's permission set via `admin_replace_role_permissions`.
   */
  async replaceRolePermissions(input: ReplaceRolePermissionsInput): Promise<ReplaceRolePermissionsResult> {
    const cleanId = input.role_id ? input.role_id.trim() : '';
    if (!cleanId) {
      throw new RoleApiError('Role ID cannot be empty.', '22000');
    }

    assertRoleApiConfigured();

      const { data, error } = await supabase.rpc('admin_replace_role_permissions', {
    p_role_id: cleanId,
    p_permission_ids: input.permission_ids,
  });

  if (error) {
    throw new RoleApiError(error.message, error.code, error.details, error.hint);
  }

  return data as unknown as ReplaceRolePermissionsResult;
  }
}

export const roleApi = new RoleApi();
export default roleApi;

