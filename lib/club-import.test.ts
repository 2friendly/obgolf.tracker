import test from 'node:test';
import assert from 'node:assert/strict';
import { clubMetricSchema, importSourceSchema, parseClubImport } from './club-import.ts';
const defaults = { club: '7-iron', distanceUnit: 'm' as const, speedUnit: 'mph' as const, sampleType: 'Single shot' as const };

test('CSV preserves individual shots, mixed clubs, header units and quoted fields', () => {
  const result = parseClubImport({ ...defaults, format: 'csv', text: 'Club,Carry (yd),Club Speed (km/h),Ball Speed,Smash Factor,Launch Angle,Spin Rate,Notes\nDriver,240,160,145,1.45,12,2500,"solid, centre"\n7-iron,160,125,112,1.4,18,6500,good' });
  assert.equal(result.readings.length, 2);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.readings[0].club, 'Driver');
  assert.equal(result.readings[0].sampleType, 'Single shot');
  assert.ok(Math.abs(result.readings[0].carry! - 219.456) < .01);
  assert.ok(Math.abs(result.readings[0].clubSpeed! - 99.419) < .01);
  assert.equal(result.readings[1].spin, 6500);
});
test('JSON shots use selected units and retain explicit sample classification', () => {
  const result = parseClubImport({ ...defaults, distanceUnit: 'yd', format: 'json', text: '{"shots":[{"carry":150,"ballSpeed":110},{"carry":155,"sampleType":"Average"}]}' });
  assert.equal(result.readings.length, 2);
  assert.ok(result.readings[0].carry! < 150);
  assert.equal(result.readings[0].total, undefined);
  assert.equal(result.readings[1].sampleType, 'Average');
});
test('summary rows stay separate from individual observations', () => {
  const result = parseClubImport({ ...defaults, format: 'csv', text: 'Shot,Carry,Spin Rate\n1,180,6000\n2,175,6300\nAverage,177.5,6150' });
  assert.deepEqual(result.readings.map(row => row.sampleType), ['Single shot', 'Single shot', 'Average']);
});
test('TXT and OCR label/value cards recognise next-line values without inventing metrics', () => {
  const result = parseClubImport({ ...defaults, format: 'image', text: 'SESSION RESULTS\nCarry\n180\nClub Speed: 90 mph\nBall Speed 126\nSmash Factor\n1.40\nSpin Rate: 6200\nLaunch Angle: 18°' });
  assert.equal(result.readings.length, 1);
  assert.equal(result.readings[0].carry, 180);
  assert.equal(result.readings[0].smash, 1.4);
  assert.equal(result.readings[0].launch, 18);
  assert.equal(result.readings[0].total, undefined);
});
test('OCR tables preserve rows and reject misaligned columns', () => {
  const result = parseClubImport({ ...defaults, format: 'image', text: 'Simulator results\nCarry  Ball Speed  Spin Rate\n180  126  6000\n175  120  6300' });
  assert.equal(result.readings.length, 2);
  assert.equal(result.readings[1].ballSpeed, 120);
  assert.throws(() => parseClubImport({ ...defaults, format: 'image', text: 'Carry  Ball Speed\n180  126  6000' }), /columns/);
});
test('OCR collapsed-space tables are aligned deterministically', () => {
  const result = parseClubImport({ ...defaults, format: 'image', text: 'SESSION RESULTS\nCarry Ball Speed Spin Rate\n180 126 6000\n175 120 6300' });
  assert.equal(result.readings.length, 2);
  assert.equal(result.readings[1].carry, 175);
  assert.equal(result.readings[1].spin, 6300);
});
test('uncertain OCR, invalid values and empty rows are flagged, never guessed', () => {
  const result = parseClubImport({ ...defaults, format: 'csv', text: 'Carry,Club Speed,Spin Rate\n180,9O,99999\nna,na,na' });
  assert.equal(result.readings.length, 1);
  assert.equal(result.readings[0].clubSpeed, undefined);
  assert.equal(result.readings[0].spin, undefined);
  assert.equal(result.warnings.length, 3);
});
test('malformed JSON/CSV, oversized batches and unrecognised layouts fail clearly', () => {
  assert.throws(() => parseClubImport({ ...defaults, format: 'json', text: '{oops' }));
  assert.throws(() => parseClubImport({ ...defaults, format: 'csv', text: 'Carry,Spin\n180,6000,7' }), /columns/);
  assert.throws(() => parseClubImport({ ...defaults, format: 'csv', text: 'Carry\n' + Array(501).fill('180').join('\n') }), /500/);
  assert.throws(() => parseClubImport({ ...defaults, format: 'txt', text: 'unknown layout with no measurements' }), /No measurements/);
});
test('shared persistence schemas retain import provenance and original / reviewed source', () => {
  const reading = clubMetricSchema.parse({ id: 'shot', club: 'Driver', sampleType: 'Single shot', carry: 220, importId: 'source', sourceRow: 2 });
  assert.equal(reading.importId, 'source'); assert.equal(reading.sourceRow, 2);
  const source = { id: 'source', fileName: 'photo.png', format: 'image', rawText: 'Carry 22O', reviewedText: 'Carry 220', distanceUnit: 'm', speedUnit: 'mph', importedAt: new Date().toISOString(), ocrConfidence: 70 };
  assert.deepEqual(importSourceSchema.parse(source), source);
  assert.equal(clubMetricSchema.safeParse({ ...reading, carry: 700 }).success, false);
});
