import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [api, page, create, drawer, edit, news] = await Promise.all([
  readFile(new URL('../src/services/api/categoryApi.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/Categories/CategoriesPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/categories/CategoryCreateModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/categories/CategoryDetailDrawer.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/categories/CategoryEditModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/api/recoveryApi.ts', import.meta.url), 'utf8'),
]);

test('Admin taxonomy mutations call permission-enforcing RPCs, never direct tables', () => {
  for (const name of ['admin_get_taxonomy', 'admin_create_taxonomy_item', 'admin_update_taxonomy_item', 'admin_move_subcategory']) {
    assert.match(api, new RegExp(`\\.rpc\\('${name}'`));
  }
  assert.doesNotMatch(api, /\.from\('segments'\)|\.from\('subcategories'\)|\.from\('reporting_form_schemas'\)/);
  assert.match(api, /createTaxonomyItem\(input: TaxonomyCreateInput\)/);
  assert.match(api, /moveSubcategory\(input: TaxonomyMoveInput\)/);
});

test('Create is permission-gated, inactive draft by design, with explicit move deactivation', () => {
  assert.match(page, /hasPermission\('categories.manage'\)/);
  assert.match(page, /canManage && <CategoryCreateModal/);
  assert.match(create, /Create Inactive Draft/);
  assert.match(create, /parentSegmentId/);
  assert.match(drawer, /canManage = hasPermission\('categories.manage'\)/);
  assert.match(drawer, /Deactivate and Move/);
  assert.match(drawer, /Historical reports remain intact/);
  assert.match(edit, /taxonomy-active-switch/);
  assert.match(edit, /taxonomy-sort-order/);
  assert.match(edit, /taxonomy-name-bn/);
});

test('News Intake code remains independent of an unpublished taxonomy write', () => {
  assert.doesNotMatch(api, /news_intake|newsIntake/);
  assert.match(news, /admin_get_news_intake_taxonomy/);
  assert.doesNotMatch(news, /admin_create_taxonomy_item|admin_move_subcategory/);
});
