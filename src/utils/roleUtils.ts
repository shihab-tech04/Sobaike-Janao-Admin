/**
 * Role Management Utilities
 *
 * Provides deterministic role slug generation matching PostgreSQL's
 * `public.generate_role_slug(p_name text)` function:
 * 1. Trim and lowercase
 * 2. Replace non-alphanumeric characters with hyphens
 * 3. Strip leading and trailing hyphens
 */

export function generateRoleSlug(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidRoleSlug(slug: string): boolean {
  if (!slug) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
