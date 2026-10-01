import test from 'node:test';
import assert from 'node:assert/strict';
import { clubMetricSchema } from './club-import.ts';
import { practiceSmash, shotDisplayValue, shotStoredValue, shotHasData, shotPresets, shotColumns, parseShotSettings, defaultShotSettings } from './practice-shots.ts';
import { defaultPreferences } from './preferences.ts';

test('smash derives from raw speeds and recalculates without mutating observations', () => {
  const shot = { clubSpeed: 90, ballSpeed: 126 };
  assert.equal(practiceSmash(shot), 1.4);
  assert.equal(practiceSmash({ ...shot, ballSpeed: 135 }), 1.5);
  assert.deepEqual(shot, { clubSpeed: 90, ballSpeed: 126 });
  assert.equal(practiceSmash({ ...shot, smash: 1.38 }), 1.38);
  assert.equal(practiceSmash({ ...shot, smash: 0 }), 0);
});
test('incomplete, zero-denominator and implausible smash stays absent', () => {
  for (const shot of [{ clubSpeed: 0, ballSpeed: 126 }, { ballSpeed: 126 }, { clubSpeed: 90 }, { clubSpeed: 1, ballSpeed: 126 }, { clubSpeed: 90, ballSpeed: NaN }]) assert.equal(practiceSmash(shot), undefined);
  assert.equal(practiceSmash({ clubSpeed: 90, ballSpeed: 0 }), 0);
});
test('optional shot entry normalizes units and preserves signed observations and precision', () => {
  const preferences = { ...defaultPreferences, distanceUnit: 'yd' as const, speedUnit: 'kmh' as const };
  const carry = shotStoredValue('carry', '160.25', preferences)!;
  const speed = shotStoredValue('clubSpeed', '144.5', preferences)!;
  assert.ok(Math.abs(shotDisplayValue('carry', carry, preferences)! - 160.25) < 1e-8);
  assert.ok(Math.abs(shotDisplayValue('clubSpeed', speed, preferences)! - 144.5) < 1e-8);
  assert.equal(shotStoredValue('carry', '', preferences), undefined);
  assert.equal(shotStoredValue('spin', '-151.79', preferences), -151.79);
  assert.equal(shotStoredValue('launch', '15.45', preferences), 15.45);
  assert.ok(shotStoredValue('offline', '-10', preferences)! < 0);
});
test('individual shots round-trip through persistence with optional metrics and import provenance', () => {
  const shots = [
    { id: 'a', club: '7-iron', sampleType: 'Single shot' as const, carry: 160.25 },
    { id: 'b', club: '7-iron', sampleType: 'Single shot' as const, clubSpeed: 90, ballSpeed: 126, importId: 'original-import', sourceRow: 7 },
  ];
  const saved = shots.map(shot => clubMetricSchema.parse(JSON.parse(JSON.stringify(shot))));
  assert.deepEqual(saved, shots);
  assert.equal(practiceSmash(saved[1]), 1.4);
  assert.equal(saved[0].ballSpeed, undefined);
  for (const sampleType of ['Average', 'Best'] as const) assert.deepEqual(clubMetricSchema.parse({ ...shots[0], sampleType }), { ...shots[0], sampleType });
});
test('blank entry rows differ from zero measurements and shot notes', () => {
  const empty = { id: 'blank', club: 'Driver', sampleType: 'Single shot' as const };
  assert.equal(shotHasData(empty), false);
  assert.equal(shotHasData({ ...empty, carry: 0 }), true);
  assert.equal(shotHasData({ ...empty, notes: 'fat strike' }), true);
});
test('Standard covers seven metrics and Advanced keeps all available rich observations', () => {
  assert.deepEqual(shotPresets.Standard, ['carry', 'total', 'clubSpeed', 'ballSpeed', 'smash', 'launch', 'spin']);
  for (const field of ['apex', 'offline', 'sideSpin', 'horizontalLaunch', 'distanceToPin', 'attackAngle', 'clubPath', 'faceAngle', 'faceToPath']) assert.ok(shotPresets.Advanced.includes(field as typeof shotPresets.Advanced[number]));
  const rich = { id: 'rich', club: 'Driver', sampleType: 'Single shot', apex: 32.54, offline: -10.25, attackAngle: -3.5, clubPath: 2.25, faceAngle: -1.5, faceToPath: -3.75, notes: 'heel strike', importId: 'kept-source', sourceRow: 8 };
  assert.deepEqual(clubMetricSchema.parse(JSON.parse(JSON.stringify(rich))), rich);
  assert.equal(shotHasData(clubMetricSchema.parse({ id: 'angle', club: '7-iron', sampleType: 'Single shot', attackAngle: -4 })), true);
});
test('device preferences round-trip, filter unknown columns and recover from corrupt storage', () => {
  const custom = { preset: 'Custom', custom: ['carry', 'attackAngle', 'notes'] };
  assert.deepEqual(parseShotSettings(JSON.stringify(custom)), custom);
  assert.deepEqual(shotColumns(parseShotSettings(JSON.stringify(custom))), custom.custom);
  assert.deepEqual(parseShotSettings('{oops'), defaultShotSettings);
  assert.deepEqual(parseShotSettings(null), defaultShotSettings);
  assert.deepEqual(parseShotSettings('{"preset":"Custom","custom":["attackAngle","unknown","attackAngle",null]}').custom, ['attackAngle']);
  assert.ok(parseShotSettings('{"preset":"Custom","custom":[]}').custom.length > 0);
  assert.deepEqual(shotColumns(parseShotSettings('{"preset":"Standard"}')), shotPresets.Standard);
});
