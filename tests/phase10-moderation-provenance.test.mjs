import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'tsx/esm';

const { mapSupabaseRowToComplaint } = await import('../src/services/api/supabaseComplaintService.ts');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const service = read('src/services/api/supabaseComplaintService.ts');
const page = read('src/pages/Complaints/ComplaintsPage.tsx');
const table = read('src/components/complaints/ComplaintTable.tsx');
const mobile = read('src/components/complaints/MobileComplaintCardList.tsx');
const detail = read('src/pages/Complaints/ComplaintDetailPage.tsx');
const response = read('src/pages/Responses/ResponsesPage.tsx');
const sql = read('test-only/current_contract_baseline.sql');
const reporterRpc = read('test-only/phase02_missing_functions_part1.sql');

const row = {
  id: 'SYNTH-ONLY-01', title: 'Synthetic', title_en: 'Synthetic',
  description: 'Controlled test report', description_en: 'Controlled test report',
  created_at: '2026-10-19T00:00:00Z', status: 'submitted',
  segment_id: 'public_safety', subcategory_id: 'controlled',
  privacy_choice: 'anonymous', publication_preferences: null,
  reporter_name: 'PRIVATE_TEST_IDENTITY', reporter_contact: 'PRIVATE_TEST_CONTACT',
  reporter_latitude: 23.7, reporter_longitude: 90.4,
};
const mapRow = (origin_type) => mapSupabaseRowToComplaint({ ...row, origin_type }, new Map(), new Map());

test('Posted by is mapped from authoritative SQL origin_type only', () => {
  assert.equal(mapRow('citizen').postedBy, 'user');
  assert.equal(mapRow('sourced_report').postedBy, 'admin');
  assert.equal(mapRow('unknown').postedBy, null);
  assert.equal(mapRow(undefined).postedBy, null);
  assert.match(sql, /origin_type.*DEFAULT 'citizen'/);
  assert.match(sql, /'postOrigin', case when c\.origin_type='sourced_report' then 'admin' else 'user' end/);
});

test('ordinary complaint rows do not project private reporter device coordinates', () => {
  const item = mapRow('citizen');
  assert.equal(item.reporterDeviceLocation, undefined);
  assert.equal(item.isAnonymous, true);
  assert.match(detail, /isSuperAdmin && assuranceLevel === 'aal2'/);
  assert.match(detail, /loadReporterLocation: canViewReporterTelemetry/);
  assert.match(service, /options\?\.loadReporterLocation === true/);
  assert.match(reporterRpc, /Private reporter device telemetry is restricted to Super Administrators/);
});

test('Admin/User filter and sorting run in SQL before pagination', () => {
  assert.match(service, /filters\.postedBy === 'admin'\) query = query\.eq\('origin_type', 'sourced_report'\)/);
  assert.match(service, /filters\.postedBy === 'user'\) query = query\.eq\('origin_type', 'citizen'\)/);
  assert.match(service, /query\.order\(sortBy, \{ ascending \}\)\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/);
  assert.match(page, /visiblePages\(pagination\.currentPage, pagination\.totalPages\)/);
  assert.match(page, /\[6, 12, 24, 48\]/);
  assert.match(page, /requestId !== requestSerial\.current/);
});

test('desktop and mobile summaries expose safe origin labels and preserve detail actions', () => {
  assert.match(table, /Posted by/);
  assert.match(table, /setSelected\(c\)/);
  assert.match(table, /Detail & Moderation/);
  assert.match(mobile, /Posted by/);
  assert.match(mobile, /Full Detail & Actions/);
});

test('complaint and response moderation use permission-enforcing RPCs and confirmations', () => {
  for (const rpc of ['admin_publish_complaint', 'admin_unpublish_complaint', 'admin_reject_complaint']) {
    assert.match(service, new RegExp(`supabase\\.rpc\\('${rpc}'`));
  }
  assert.match(response, /hasPermission\('responses\.publish'\)/);
  assert.match(response, /hasPermission\('responses\.reject'\)/);
  assert.match(response, /handleConfirmModeration/);
  assert.match(response, /responseApi\.getResponseById\(responseId\)/);
});
