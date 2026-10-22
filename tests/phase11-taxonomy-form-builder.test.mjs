import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'tsx/esm';

const { validateReportingFormFields } = await import('../src/services/api/reportingFormApi.ts');
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const api = read('src/services/api/reportingFormApi.ts');
const builder = read('src/components/categories/ReportingFormBuilderDrawer.tsx');
const detail = read('src/components/categories/CategoryDetailDrawer.tsx');
const config = read('src/components/categories/CategoryConfigurationModal.tsx');
const publicRpc = read('test-only/phase02_missing_functions_part3.sql');
const adminRpc = read('test-only/phase02_missing_functions_part2.sql');
const newsRpc = read('test-only/current_contract_baseline.sql');

const core = [
  { fieldKey: 'title', fieldType: 'text', storageMode: 'core_column', storageKey: 'title', labelEn: 'Title', labelBn: 'শিরোনাম',
    required: true, active: true, sortOrder: 10, options: [], validation: { maxLength: 100 }, config: {} },
  { fieldKey: 'description', fieldType: 'textarea', storageMode: 'core_column', storageKey: 'description', labelEn: 'Description', labelBn: 'বর্ণনা',
    required: true, active: true, sortOrder: 20, options: [], validation: { maxLength: 2000 }, config: {} },
];

test('preserves required core fields and bilingual labels', () => {
  assert.equal(validateReportingFormFields(core), null);
  assert.match(validateReportingFormFields(core.slice(0, 1)), /Description/);
  assert.match(validateReportingFormFields(core.map((f) => f.fieldKey === 'title' ? { ...f, required: false } : f)), /active and text-compatible/);
  assert.match(validateReportingFormFields(core.map((f) => f.fieldKey === 'description' ? { ...f, labelBn: '' } : f)), /Both language labels/);
  assert.match(validateReportingFormFields(core.map((f) => f.fieldKey === 'title' ? { ...f, validation: { maxLength: 150 } } : f)), /100/);
});

test('validates bilingual choice lists and rejects colliding dynamic keys', () => {
  const select = { fieldKey: 'witness_type', fieldType: 'select', storageMode: 'custom_json', storageKey: 'witness_type',
    labelEn: 'Witness', labelBn: 'সাক্ষী', required: false, active: true, sortOrder: 30, config: {}, validation: {}, options: [] };
  assert.match(validateReportingFormFields([...core, select]), /bilingual choice/);
  const valid = { ...select, options: [{ value: 'other', labelEn: 'Other', labelBn: 'অন্যান্য' }] };
  assert.equal(validateReportingFormFields([...core, valid]), null);
  assert.match(validateReportingFormFields([...core, valid, valid]), /Duplicate/);
  assert.match(validateReportingFormFields([...core, { ...valid, options: [{ value: 'x', labelEn: 'X', labelBn: '' }] }]), /distinct values/);
});

test('UI exposes explicit form draft/save, review and publish, and deliberate category publication', () => {
  assert.match(api, /admin_get_reporting_form/);
  assert.match(api, /admin_save_reporting_form_draft/);
  assert.match(api, /admin_publish_reporting_form/);
  assert.match(builder, /form-draft-save/);
  assert.match(builder, /form-publish-confirm/);
  assert.match(builder, /subcategoryActive/);
  assert.match(builder, /isProtectedField/);
  assert.match(detail, /taxonomy-form-open/);
  assert.match(detail, /taxonomy-publish-confirm/);
  assert.match(detail, /taxonomy-config-open/);
  assert.match(config, /taxonomy-config-save/);
  assert.match(read('src/services/api/categoryApi.ts'), /admin_update_taxonomy_configuration/);
  assert.match(detail, /categories\.manage/);
  assert.match(adminRpc, /Publish a reporting form before publishing this subcategory/);
});

test('Public form publication and News Intake taxonomy share active published SQL gates', () => {
  assert.match(publicRpc, /public\.get_public_reporting_configuration\(\)/);
  assert.match(publicRpc, /rfs\.status='published'/);
  assert.match(publicRpc, /sc\.active=true and sc\.config_status='published'/);
  assert.match(newsRpc, /public\.admin_get_news_intake_taxonomy\(\)/);
  assert.match(newsRpc, /sc\.active=true and sc\.config_status='published'/);
});
