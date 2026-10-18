import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (slug) => readFileSync(
  new URL(`../supabase/functions/${slug}/index.ts`, import.meta.url), 'utf8',
);

test('Admin create/delete Edge source retains live origin allowlist and fail-closed auth', () => {
  for (const slug of ['admin-create-user', 'admin-delete-user']) {
    const text = source(slug);
    assert.match(text, /const ALLOWED_ORIGINS = new Set/);
    assert.match(text, /ALLOWED_ORIGINS\.has\(origin\)/);
    assert.doesNotMatch(text, /"Access-Control-Allow-Origin"\s*:\s*"\*"/);
    assert.match(text, /get\("Authorization"\)/);
    assert.match(text, /"has_permission"/);
    assert.match(text, /"admin_users\.manage"/);
  }
});

test('Admin user creation keeps stronger hosted password reputation gate', () => {
  const text = source('admin-create-user');
  assert.match(text, /cleanPassword\.length < 12/);
  assert.match(text, /api\.pwnedpasswords\.com\/range\/\$\{prefix\}/);
  assert.match(text, /"COMPROMISED_PASSWORD"/);
  assert.match(text, /"PASSWORD_REPUTATION_UNAVAILABLE"/);
  assert.match(text, /AbortSignal\.timeout\(5000\)/);
});
