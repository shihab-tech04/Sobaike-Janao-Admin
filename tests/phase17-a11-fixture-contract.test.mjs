import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPhase17A11Fixture } from '../test-only/phase17-a11-map-fixture.mjs';
import { runPhase17A11 } from '../test-only/phase17-a11-map-monitoring-browser.mjs';

// These are source/fixture safety checks, NOT a claim of a passing real browser
// or hosted Admin acceptance. The isolated A11 runner must be wired and run.
test('A11 fixture is isolated and SQL write scope is confined to synthetic records', () => {
  const statements=[];
  const fixture=createPhase17A11Fixture({
    suffix:'deadbeef',
    roleId:'synthetic_moderator_deadbeef',
    sql: statement => {
      statements.push(statement);
      if(statement.startsWith('SELECT count(*)')) return '3';
      return '';
    },
  });
  assert.deepEqual(fixture.mapIds,[
    'SYNTH-A11-PUB-DEADBEEF',
    'SYNTH-A11-SUB-DEADBEEF',
    'SYNTH-A11-NOGEO-DEADBEEF',
  ]);
  fixture.grantMapPermission(true);
  fixture.seedMapReports();
  assert.equal(fixture.readMapRows(),3);
  fixture.removeMapReports();
  fixture.grantMapPermission(false);
  assert.equal(statements.filter(s=>s.startsWith('INSERT INTO public.complaints(')).length,3);
  assert.equal(statements.filter(s=>s.startsWith('DELETE FROM public.complaints')).length,1);
  assert.ok(statements.some(s=>s.includes('latitude,longitude')));
  assert.ok(statements.some(s=>s.includes('PRIVATE_SYNTHETIC_A11_CONTACT')));
  assert.ok(!statements.some(s=>/https:\/\/|auth\.users|DROP TABLE|TRUNCATE|UPDATE public\.complaints/i.test(s)));
  assert.ok(statements.at(-1).includes("'map.view'"));
});

test('A11 protected Map RPC retains active Admin, specific map.view and safe data contract', () => {
  const sql=readFileSync(new URL('../supabase/migrations/20260903000006_phase2e_map_status_and_navigation_correction.sql',import.meta.url),'utf8');
  assert.match(sql,/admin_get_map_dataset\(\)/);
  assert.match(sql,/public\.is_active_admin\(\)/);
  assert.match(sql,/public\.has_permission\('map\.view'\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.admin_get_map_dataset\(\) FROM anon/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.admin_get_map_dataset\(\) TO authenticated/);
  const page=readFileSync(new URL('../src/pages/Map/MapPage.tsx',import.meta.url),'utf8');
  for(const token of ['#map-search-input','<MapFilters','<MapContainer','<MapComplaintList','setRefreshError','onResetFilters']) {
    if(token==='#map-search-input')continue; // Input ID belongs to MapFilters.
    assert.ok(page.includes(token),'Missing A11 map page contract: '+token);
  }
  const filters=readFileSync(new URL('../src/components/map/MapFilters.tsx',import.meta.url),'utf8');
  assert.match(filters,/id="map-search-input"/);
  assert.match(filters,/id="map-status-select"/);
  assert.match(filters,/id="map-district-select"/);
});

test('A11 executable browser test is staged but requires explicit integration and runtime proof', () => {
  assert.equal(typeof runPhase17A11,'function');
  const browser=readFileSync(new URL('../test-only/phase17-a11-map-monitoring-browser.mjs',import.meta.url),'utf8');
  assert.match(browser,/PHASE17_A11_REAL_AAL2_MAP_RPC_SQL_AND_PRIVACY_PASS/);
  assert.match(browser,/PHASE17_A11_REFRESH_FAILURE_PRESERVES_LAST_VALID_DATA_PASS/);
  assert.match(browser,/PHASE17_A11_LOCAL_FIXTURE_CLEANUP_ROLE_REVOCATION_PASS/);
  assert.match(browser,/127\.0\.0\.1/);
  assert.ok(!browser.includes('https://admin.shobaikejanao.com'));
});
