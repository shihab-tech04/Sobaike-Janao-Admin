import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/pages/ActivityLog/ActivityLogPage.tsx', import.meta.url), 'utf8',
);
const component = source.slice(source.indexOf('export const ActivityLogPage:'));

test('audit view denial occurs after all component hooks to preserve hook order', () => {
  const deny = component.indexOf('return <AccessDenied requiredPermission="audit.view" />');
  assert.ok(deny >= 0, 'audit permission must fail closed');
  assert.match(component.slice(0, deny), /const canViewAudit = hasPermission\('audit\.view'\)/);
  for (const hook of ['useState(', 'useRef(', 'useCallback(', 'useEffect(']) {
    const at = component.lastIndexOf(hook);
    assert.ok(at >= 0 && at < deny, hook + ' must run before conditional deny');
  }
  assert.equal((component.match(/return <AccessDenied requiredPermission="audit.view"/g) || []).length, 1);
});

test('denied authorization starts no audit requests and discards old private records', () => {
  assert.match(component, /if \(!canViewAudit\) return;\s*const requestVersion/);
  assert.ok(component.indexOf('if (!canViewAudit) return;') < component.indexOf('await auditLogApi.getAuditLogs('));
  assert.match(component, /if \(requestVersion !== requestVersionRef\.current\) return;\s*setLogs\(response\.logs\)/);
  assert.match(component, /if \(!canViewAudit\) \{[\s\S]*?requestVersionRef\.current \+= 1;[\s\S]*?setLogs\(\[\]\);[\s\S]*?setTotalCount\(0\);[\s\S]*?setSelectedLog\(null\);[\s\S]*?setIsDrawerOpen\(false\);/);
  assert.match(component, /\[canViewAudit, loadLogs\]/);
});
