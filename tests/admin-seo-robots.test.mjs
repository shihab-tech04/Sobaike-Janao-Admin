import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Admin login shell is explicitly excluded from search indexing', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  const robotsTags = tags.filter(tag => /\bname=["']robots["']/i.test(tag));
  assert.equal(robotsTags.length, 1, 'Exactly one robots meta directive is required');

  const content = robotsTags[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
  assert.ok(content, 'The robots meta tag must have content');
  const directives = content.split(',').map(value => value.trim().toLowerCase());
  for (const required of ['noindex', 'nofollow', 'noarchive']) {
    assert.ok(directives.includes(required), 'Missing ' + required);
  }

  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\/src\/main\.tsx"/);
});
