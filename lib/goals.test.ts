import test from 'node:test';
import assert from 'node:assert/strict';
import { goalSchema, goalTypes, goalValue, type GoalInput } from './goals.ts';

const base: GoalInput = {
  id: 'ec68d0c7-9a80-4d08-a81c-508567113dce', title: 'My goal', type: 'score',
  target_value: 90, starting_value: null, target_date: null, status: 'active',
  is_primary: false, club: null, unit: null,
};
test('all initial types preserve measurable targets, optional baseline and date', () => {
  for (const type of goalTypes) {
    const goal = { ...base, type, target_value: 80, starting_value: 95, target_date: '2028-02-29',
      ...(type === 'carry' ? { club: '7 iron', unit: 'yd' } : {}) };
    assert.deepEqual(goalSchema.parse(goal), goal);
  }
  assert.equal(goalSchema.parse(base).starting_value, null);
  assert.equal(goalSchema.parse({ ...base, type: 'penalties', target_value: 0, starting_value: 0 }).starting_value, 0);
});
test('invalid numeric values, dates and incomplete carry targets are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 1000001, '90', null]) {
    assert.equal(goalSchema.safeParse({ ...base, target_value: value }).success, false);
  }
  for (const target_date of ['2026-02-29', '2026-04-31', '2026-13-01', '', 'tomorrow', '0000-01-01']) {
    assert.equal(goalSchema.safeParse({ ...base, target_date }).success, false);
  }
  for (const patch of [{ club: null, unit: 'm' }, { club: ' ', unit: 'm' }, { club: 'Driver', unit: 'feet' }]) {
    assert.equal(goalSchema.safeParse({ ...base, type: 'carry', ...patch }).success, false);
  }
  assert.equal(goalSchema.safeParse({ ...base, type: 'tee_in_play', starting_value: 101 }).success, false);
  assert.equal(goalSchema.safeParse({ ...base, type: 'tee_in_play', target_value: 101 }).success, false);
  assert.equal(goalSchema.safeParse({ ...base, starting_value: -1 }).success, false);
});
test('primary designation is limited to active goals and custom values can be signed', () => {
  assert.equal(goalSchema.safeParse({ ...base, is_primary: true }).success, true);
  for (const status of ['completed', 'archived']) {
    assert.equal(goalSchema.safeParse({ ...base, status, is_primary: true }).success, false);
    assert.equal(goalSchema.safeParse({ ...base, status, is_primary: false }).success, true);
  }
  assert.equal(goalSchema.safeParse({ ...base, type: 'custom', target_value: -2, starting_value: -8 }).success, true);
});
test('ownership and timestamps cannot be supplied as writable fields', () => {
  const parsed = goalSchema.parse({ ...base, title: '  My goal  ', user_id: 'another-user', created_at: 'yesterday' });
  assert.equal(parsed.title, 'My goal');
  assert.equal('user_id' in parsed, false);
  assert.equal('created_at' in parsed, false);
});
test('target labels retain the units attached to each goal', () => {
  assert.equal(goalValue(base), '90 strokes');
  assert.equal(goalValue({ ...base, type: 'tee_in_play', target_value: 80 }), '80%');
  assert.equal(goalValue({ ...base, type: 'carry', target_value: 220, unit: 'yd' }), '220 yd');
  assert.equal(goalValue({ ...base, type: 'custom', unit: null }), '90');
  assert.equal(goalValue({ ...base, type: 'penalties' }, 0), '0 penalties / round');
});
