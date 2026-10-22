import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const permissionSource = source('src/services/auth/permissionService.ts');
const backendSql = source('test-only/current_contract_baseline.sql');
const authContext = source('src/context/AuthContext.tsx');
const routes = source('src/routes/AppRoutes.tsx');
const mfaPage = source('src/pages/Login/MfaPage.tsx');
const header = source('src/components/layout/Header.tsx');

test('frontend MFA permission gate matches the immutable production-derived SQL contract', () => {
  const sqlMatch = backendSql.match(/v_requires_aal2 := p_permission_id = any\(array\[([\s\S]*?)\]::text\[\]\)/);
  const uiMatch = permissionSource.match(/export const AAL2_PERMISSIONS = new Set<string>\(\[([\s\S]*?)\]\)/);
  assert.ok(sqlMatch, 'missing authoritative has_permission AAL2 requirement');
  assert.ok(uiMatch, 'missing frontend AAL2 requirement');
  const ids = (value) => [...value.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(uiMatch[1]), ids(sqlMatch[1]));
  assert.match(backendSql, /and coalesce\(auth\.jwt\(\)->>'aal','aal1'\) <> 'aal2'/);
});

test('protected role routes require backend membership and verified AAL2', () => {
  assert.match(routes, /!session \|\| !user \|\| !isAdmin/);
  assert.match(routes, /permissions\.includes\(requiredPermission\) && requiresAal2\(requiredPermission\) && assuranceLevel !== 'aal2'/);
  assert.match(routes, /to="\/security\/mfa"/);
  assert.match(routes, /permissions\.some\(requiresAal2\)/);
  assert.match(header, /needsMfa &&/);
  assert.match(header, /navigate\('\/security\/mfa'\)/);
  assert.match(authContext, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(authContext, /permissions\.includes\(permissionId\) && \(!requiresAal2\(permissionId\) \|\| assuranceLevel === 'aal2'\)/);
  assert.match(authContext, /await checkAdminStatus\(newSession\.user\.id\)/);
});

test('TOTP verification is live Supabase step-up, not hardcoded or stored locally', () => {
  assert.match(mfaPage, /supabase\.auth\.mfa\.listFactors\(\)/);
  assert.match(mfaPage, /supabase\.auth\.mfa\.enroll\(\{ factorType: 'totp' \}\)/);
  assert.match(mfaPage, /supabase\.auth\.mfa\.challengeAndVerify\(\{ factorId, code \}\)/);
  assert.match(mfaPage, /if \(level !== 'aal2'\) throw/);
  assert.match(mfaPage, /await refreshPermissions\(\)/);
  assert.match(mfaPage, /!\/\^\\d\{6\}\$\/\.test\(code\)/);
  assert.doesNotMatch(mfaPage, /localStorage|sessionStorage|mock-dev-token|test-otp/);
});

test('database contract protects privileged identity and active session revocation', () => {
  assert.match(backendSql, /CREATE OR REPLACE FUNCTION private\.is_current_auth_session_valid\(\)/);
  assert.match(backendSql, /from auth\.sessions s/);
  assert.match(backendSql, /s\.id = v_session_id/);
  assert.match(backendSql, /Super Administrator account cannot be deleted/);
  assert.match(backendSql, /Super Administrator account cannot be demoted/);
  assert.match(backendSql, /Super Administrator account cannot be deactivated/);
});
