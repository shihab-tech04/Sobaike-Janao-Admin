import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../docs/phase17-34-journeys-24-gaps-evidence-20261024.md', import.meta.url);
const text = readFileSync(file, 'utf8');
const row = pattern => text.split(/\r?\n/).filter(s => pattern.test(s));
const journey = row(/^\| (?:P\d{2}|A\d{2}|X\d{2}) \|/);
const gaps = row(/^\| GAP-\d{2} \|/);
const cells = r => r.split('|').map(s => s.trim()).filter(Boolean);

test('recovered Phase17 original journey inventory is exact 11+16+7, individually traceable', () => {
  const ids = journey.map(r => cells(r)[0]);
  assert.equal(ids.length, 34);
  assert.equal(new Set(ids).size, 34);
  for (const [prefix, n] of [['P',11],['A',16],['X',7]]) {
    const expected = Array.from({length:n},(_,i)=>prefix+String(i+1).padStart(2,'0'));
    assert.deepEqual(ids.filter(x=>x.startsWith(prefix)), expected);
  }
  for (const r of journey) {
    const c = cells(r);
    assert.equal(c.length, 4);
    assert.ok(c[1].length > 10 && c[2].length > 24);
    assert.ok(['NOT CERTIFIED','FULL E2E PASS'].includes(c[3]));
    // Full E2E requires an individual recorded test report with real hosted
    // authenticated actions and validated recovery; ordinary isolated checks
    // and a generic CI/Pages link must never be treated as proof.
    if (c[3] === 'FULL E2E PASS') {
      assert.match(c[2], /HOSTED AUTHENTICATED E2E/);
      assert.match(c[2], /https:\/\/github\.com\/shihab-tech04\//);
      assert.match(c[2], /rollback|recovery/i);
    }
  }
});

test('all 24 historic gap IDs recovered, no missing or invented certification', () => {
  const rows = gaps.map(cells);
  assert.equal(rows.length, 24);
  assert.deepEqual(rows.map(c=>c[0]),
    Array.from({length:24},(_,i)=>'GAP-'+String(i+1).padStart(2,'0')));
  const valid = new Set(['PARTIAL','OPEN','CONFLICT','BLOCKED','VERIFIED DEFERRED','FIXED']);
  for (const c of rows) {
    assert.equal(c.length, 4);
    assert.ok(c[1].length > 8 && c[3].length > 20);
    assert.ok(valid.has(c[2]));
    if (c[2] === 'FIXED' || c[2] === 'VERIFIED DEFERRED') {
      assert.match(c[3], /https:\/\/|actions\/runs\/|PR #/i,
        'No closure or deferral without individual verifiable evidence');
    }
  }
});

test('held status and safety boundary stay explicit while unresolved', () => {
  const open = journey.filter(r=>cells(r)[3] !== 'FULL E2E PASS').length;
  const unresolved = gaps.filter(r=>!['FIXED','VERIFIED DEFERRED'].includes(cells(r)[2])).length;
  if (open || unresolved) {
    assert.match(text, /\*\*Release verdict: HOLD/);
    assert.match(text, /Phase 18 release gate/);
    assert.match(text, /Never circumvent host policy/);
    assert.match(text, /original .* must not be modified/);
  }
  assert.equal(journey.length, 34);
  assert.equal(gaps.length, 24);
  assert.match(text, /195 complaints, 169 published/);
  assert.match(text, /8 divisions \/ 64 districts \/ 601 upazilas/);
});
