import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const candidate = read('test-only/b4-evidence-storage-permission-candidate.sql');
const permission = read('src/services/auth/permissionService.ts');
const detail = read('src/pages/Complaints/ComplaintDetailPage.tsx');
const workflow = read('.github/workflows/recovery-test-only-backend.yml');

test('B4 proposed evidence Storage read aligns with actual evidence-view permission and AAL2', () => {
  assert.match(candidate, /ALTER POLICY "active admin evidence read"[\s\S]*?has_permission\('complaints\.evidence_view'\)/);
  assert.match(detail, /canViewEvidence = hasPermission\('complaints\.evidence_view'\)/);
  assert.match(permission, /export const AAL2_PERMISSIONS = new Set<string>\(\[[\s\S]*?'complaints\.evidence_view'/);
});

test('B4 privileged evidence writes require the existing AAL2 complaint-publish permission', () => {
  for (const operation of ['insert', 'update', 'delete']) {
    const start = candidate.indexOf('ALTER POLICY "active admin evidence ' + operation + '"');
    assert.ok(start >= 0, operation + ' Storage policy missing');
    const end = candidate.indexOf(';', start);
    assert.match(candidate.slice(start, end), /public\.has_permission\('complaints\.publish'\)/);
  }
  assert.match(permission, /'complaints\.publish'/);
});

test('B4 safety guard refuses hosted databases; citizen upload and published evidence policy are retained', () => {
  assert.match(candidate, /NEVER RUN AGAINST HOSTED OR PRODUCTION DATABASE/);
  assert.match(candidate, /current_setting\('recovery\.test_only'/);
  assert.match(candidate, /inet_server_addr\(\) IS DISTINCT FROM inet '127\.0\.0\.1'/);
  assert.doesNotMatch(candidate, /DROP POLICY|DELETE FROM storage|UPDATE storage/);
  assert.match(candidate, /public complaint evidence upload/);
  assert.match(candidate, /published complaint evidence read/);
  assert.match(workflow, /psql "\$RECOVERY_LOCAL_DB_URL"/);
  assert.match(workflow, /test-only\/b4-evidence-storage-permission-candidate\.sql/);
});
