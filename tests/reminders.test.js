const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeReminderPrefs, buildReminderSummary } = require('../src/reminders');

test('normalizeReminderPrefs keeps only enabled reminder windows', () => {
  const result = normalizeReminderPrefs([
    { days_before: 1, enabled: 1 },
    { days_before: 3, enabled: 0 },
    { days_before: 7, enabled: 1 }
  ]);

  assert.deepEqual(result, { 1: true, 7: true });
});

test('buildReminderSummary gathers due-soon tasks by selected reminder windows', () => {
  const tasks = [
    { id: 1, title: 'Tugas 1', deadline: '2026-10-27T09:00:00' },
    { id: 2, title: 'Tugas 2', deadline: '2026-10-30T09:00:00' },
    { id: 3, title: 'Tugas 3', deadline: '2026-11-02T09:00:00' },
    { id: 4, title: 'Tugas 4', deadline: '2026-11-09T09:00:00' }
  ];

  const summary = buildReminderSummary(tasks, { 1: true, 3: true, 7: true }, '2026-10-24T12:00:00');

  assert.equal(summary.total, 3);
  assert.deepEqual(summary.byDay, {
    1: [{ id: 1, title: 'Tugas 1', daysLeft: 3 }],
    3: [{ id: 2, title: 'Tugas 2', daysLeft: 6 }],
    7: [{ id: 3, title: 'Tugas 3', daysLeft: 9 }]
  });
  assert.deepEqual(summary.next, { id: 4, title: 'Tugas 4', daysLeft: 16 });
});
