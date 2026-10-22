import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('publisher wait does not abandon a previously detected Pages run', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/deploy.yml', import.meta.url),
    'utf8'
  );
  assert.ok(
    workflow.includes('elif [ "$legacy_found" = "0" ] && [ "$attempt" -ge 6 ]; then'),
    'Once legacy_found=1, a transient missing-list result must not exit the wait'
  );
  assert.ok(
    workflow.includes('if [ "$legacy_found" = "1" ] && [ "$legacy_status" != "completed" ]; then'),
    'A found but unfinished legacy run must block custom deployment'
  );
});
