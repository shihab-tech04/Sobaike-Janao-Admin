import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/Notifications/NotificationsPage.tsx', import.meta.url), 'utf8');

test('notification filter switching invalidates prior list requests before changing visible filter', () => {
  assert.match(page, /const listRequestIdRef = useRef\(0\)/);
  const listStart = page.indexOf('const loadNotifications = useCallback(');
  const switchStart = page.indexOf('const switchFilter = (filter: NotificationFilterType)');
  assert.ok(listStart >= 0 && switchStart > listStart);
  const loader = page.slice(listStart, switchStart);
  assert.match(loader, /const requestId = \+\+listRequestIdRef\.current/);
  assert.match(loader, /if \(!isMountedRef\.current \|\| requestId !== listRequestIdRef\.current\) return;\s*setNotifications\(results\)/);
  assert.match(loader, /if \(isMountedRef\.current && requestId === listRequestIdRef\.current\) \{\s*setIsLoading\(false\)/);
  const switching = page.slice(switchStart, page.indexOf('// Re-fetch when filter changes', switchStart));
  assert.match(switching, /listRequestIdRef\.current \+= 1;\s*setIsLoadingMore\(false\);\s*setActiveFilter\(filter\)/);
  assert.doesNotMatch(page, /onClick=\{\(\) => setActiveFilter\(/);
});

test('notification keyset pagination never appends a batch from a superseded filter', () => {
  const begin = page.indexOf('const handleLoadMore = async');
  const end = page.indexOf('// Mark a single notification as read', begin);
  assert.ok(begin >= 0 && end > begin);
  const section = page.slice(begin, end);
  assert.match(section, /const requestId = listRequestIdRef\.current/);
  assert.match(section, /before_created_at: lastItem\.created_at/);
  assert.match(section, /before_id: lastItem\.id/);
  assert.match(section, /if \(!isMountedRef\.current \|\| requestId !== listRequestIdRef\.current\) return;\s*if \(nextBatch\.length > 0\)/);
  assert.match(section, /const existingIds = new Set/);
  assert.match(section, /if \(isMountedRef\.current && requestId === listRequestIdRef\.current\) \{\s*setIsLoadingMore\(false\)/);
});
