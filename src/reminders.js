const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeReminderPrefs(rows = []) {
  const prefs = {};

  for (const row of rows) {
    const daysBefore = Number(row.days_before || row.daysBefore);
    const enabled = Number(row.enabled ?? 0);

    if (!Number.isInteger(daysBefore) || daysBefore <= 0) continue;
    if (enabled === 1 || enabled === true || enabled === '1') prefs[daysBefore] = true;
  }

  return prefs;
}

function buildReminderSummary(tasks = [], enabledPrefs = {}, nowIso = new Date().toISOString()) {
  const now = new Date(nowIso);
  const enabledDays = Object.keys(enabledPrefs)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  const byDay = {};
  let total = 0;
  const maxWindow = enabledDays.length ? Math.max(...enabledDays) : 0;
  const summaryCutoff = maxWindow + 2;

  const available = tasks
    .map((task) => {
      if (!task || !task.deadline) return null;
      const due = new Date(task.deadline);
      if (Number.isNaN(due.getTime())) return null;
      const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
      return { ...task, daysLeft, due };
    })
    .filter(Boolean)
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  for (const task of available) {
    if (task.daysLeft < 0 || task.daysLeft > summaryCutoff) continue;

    const bucket = enabledDays.filter((day) => day < task.daysLeft).at(-1) ?? enabledDays[0];
    if (!bucket) continue;
    if (!byDay[bucket]) byDay[bucket] = [];

    byDay[bucket].push({ id: task.id, title: task.title, daysLeft: task.daysLeft });
    total++;
  }

  const ordered = {};
  for (const day of enabledDays) {
    ordered[day] = byDay[day] || [];
  }

  const next = available
    .filter((task) => task.daysLeft > summaryCutoff)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0] || null;

  return {
    total,
    byDay: ordered,
    next: next ? { id: next.id, title: next.title, daysLeft: next.daysLeft } : null,
    maxWindow,
  };
}

module.exports = {
  DAY_MS,
  normalizeReminderPrefs,
  buildReminderSummary,
};
