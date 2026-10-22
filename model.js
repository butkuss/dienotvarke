'use strict';

// Data shapes, migration of older records, selectors and state transitions.
// Every view uses these, so the same task behaves identically everywhere.
const Model = (() => {

  const STATUSES = ['todo', 'in_progress', 'done'];
  const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
  const SCOPES = ['day', 'week', 'month', 'year'];
  // Stable ids so two devices migrating independently produce the same activities.
  const ACT_VEHICLES = 'act-vehicles';
  const ACT_GENERAL = 'act-general';

  const WEEKDAYS = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];
  const WD_SHORT = ['Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št', 'Sk'];
  const MONTHS = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
  const MONTHS_NOM = ['Sausis', 'Vasaris', 'Kovas', 'Balandis', 'Gegužė', 'Birželis', 'Liepa', 'Rugpjūtis', 'Rugsėjis', 'Spalis', 'Lapkritis', 'Gruodis'];

  // ---------- dates (calendar days as YYYY-MM-DD, never UTC timestamps) ----------

  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoDate(new Date());
  const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); };
  const weekStart = iso => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
  const monthStart = iso => { const d = parseISO(iso); return isoDate(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const monthEnd = iso => { const d = parseISO(iso); return isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const yearStart = iso => `${parseISO(iso).getFullYear()}-01-01`;
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const isValidISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseISO(s)) === s;
  const isValidTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const minutesOf = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const timeOfMinutes = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

  function weekNo(iso) {
    const d = parseISO(weekStart(iso));
    d.setDate(d.getDate() + 3);
    const first = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round((d - first) / 604800000 + ((first.getDay() + 6) % 7) / 7 - 3 / 7);
  }

  function anchorFor(scope, iso) {
    return scope === 'week' ? weekStart(iso) : scope === 'month' ? monthStart(iso) : scope === 'year' ? yearStart(iso) : iso;
  }

  function shortDate(iso) {
    if (!isValidISO(iso)) return '';
    const d = parseISO(iso);
    const s = `${MONTHS[d.getMonth()]} ${d.getDate()} d.`;
    return d.getFullYear() === new Date().getFullYear() ? s : `${d.getFullYear()} m. ${s}`;
  }

  function numDate(iso) { return isValidISO(iso) ? `${pad(parseISO(iso).getMonth() + 1)}-${pad(parseISO(iso).getDate())}` : ''; }

  function dayTitle(iso) {
    const wd = WEEKDAYS[parseISO(iso).getDay()];
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${shortDate(iso)}`;
  }

  function relDay(iso) {
    const t = todayISO();
    return { [t]: 'Šiandien', [addDays(t, 1)]: 'Rytoj', [addDays(t, -1)]: 'Vakar' }[iso] || '';
  }

  function stamp(ms) {
    const d = new Date(ms);
    return `${shortDate(isoDate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- migration ----------

  const emptyWaiting = () => ({ active: false, person: '', since: null, followUp: null, promised: null, answeredAt: null });

  function migrateTask(t) {
    const w = (t.waiting && typeof t.waiting === 'object') ? { ...emptyWaiting(), ...t.waiting } : emptyWaiting();
    let status = t.status;

    // Older versions used "doing" and kept waiting as a fourth status.
    if (status === 'doing' || status === 'progress') status = 'in_progress';
    if (status === 'waiting') {
      status = 'todo';
      w.active = true;
    }
    if (!STATUSES.includes(status)) status = 'todo';

    if (!w.person && t.waitingFor) w.person = t.waitingFor;
    if (!w.since && t.waitingSince) w.since = isoDate(new Date(t.waitingSince));
    if (w.active && !w.since) w.since = isValidISO(t.date) ? t.date : todayISO();

    const out = {
      id: t.id,
      title: typeof t.title === 'string' ? t.title : '',
      description: typeof t.description === 'string' ? t.description : (typeof t.note === 'string' ? t.note : ''),
      activityId: t.activityId || (t.carId ? ACT_VEHICLES : ACT_GENERAL),
      carId: t.carId || null,
      status,
      date: isValidISO(t.date) ? t.date : null,
      scope: SCOPES.includes(t.scope) ? t.scope : 'day',
      startTime: isValidTime(t.startTime) ? t.startTime : null,
      duration: Number.isFinite(t.duration) && t.duration > 0 ? t.duration : null,
      waiting: w,
      prevStatus: STATUSES.includes(t.prevStatus) && t.prevStatus !== 'done' ? t.prevStatus : null,
      sourceNoteId: t.sourceNoteId || null,
      createdAt: t.createdAt || Date.now(),
      updatedAt: t.updatedAt || t.createdAt || Date.now(),
      doneAt: t.doneAt || null,
    };
    if (t.deleted) out.deleted = true;
    if (out.startTime && !out.duration) out.duration = 30;
    if (!out.date) { out.scope = 'day'; out.startTime = null; out.duration = null; }
    return out;
  }

  function migrateNote(n) {
    const out = {
      id: n.id,
      activityId: n.activityId || (n.carId ? ACT_VEHICLES : ACT_GENERAL),
      carId: n.carId || null,
      text: typeof n.text === 'string' ? n.text : '',
      promisedBy: typeof n.promisedBy === 'string' ? n.promisedBy : '',
      promisedDate: isValidISO(n.promisedDate) ? n.promisedDate : null,
      linkedTaskId: n.linkedTaskId || null,
      remindOn: isValidISO(n.remindOn) ? n.remindOn : null,
      remindDone: !!n.remindDone,
      createdAt: n.createdAt || Date.now(),
      updatedAt: n.updatedAt || n.createdAt || Date.now(),
    };
    if (n.deleted) out.deleted = true;
    return out;
  }

  function migrateCar(c) {
    const out = {
      id: c.id,
      name: typeof c.name === 'string' ? c.name : '',
      activityId: c.activityId || ACT_VEHICLES,
      createdAt: c.createdAt || Date.now(),
      updatedAt: c.updatedAt || c.createdAt || Date.now(),
    };
    if (c.deleted) out.deleted = true;
    return out;
  }

  function migrateActivity(a) {
    const out = {
      id: a.id,
      name: typeof a.name === 'string' ? a.name : '',
      kind: a.kind === 'vehicles' ? 'vehicles' : 'general',
      createdAt: a.createdAt || Date.now(),
      updatedAt: a.updatedAt || a.createdAt || Date.now(),
    };
    if (a.deleted) out.deleted = true;
    return out;
  }

  function migrateEvent(e) {
    return {
      id: e.id,
      taskId: e.taskId || null,
      noteId: e.noteId || null,
      type: e.type || 'change',
      from: e.from ?? null,
      to: e.to ?? null,
      at: e.at || Date.now(),
      updatedAt: e.updatedAt || e.at || Date.now(),
    };
  }

  // Every device runs this on load and on every merge, so old and new clients agree.
  function normalize(raw) {
    const arr = x => (Array.isArray(x) ? x.filter(i => i && typeof i.id === 'string') : []);
    const activities = arr(raw?.activities).map(migrateActivity);
    const byId = new Set(activities.map(a => a.id));
    const base = Math.min(...[raw?.createdAt, Date.now()].filter(Number.isFinite));
    if (!byId.has(ACT_VEHICLES)) activities.push({ id: ACT_VEHICLES, name: 'Automobiliai', kind: 'vehicles', createdAt: base, updatedAt: base });
    if (!byId.has(ACT_GENERAL)) activities.push({ id: ACT_GENERAL, name: 'Bendra', kind: 'general', createdAt: base, updatedAt: base });
    return {
      version: 2,
      activities,
      cars: arr(raw?.cars).map(migrateCar),
      tasks: arr(raw?.tasks).map(migrateTask),
      notes: arr(raw?.notes).map(migrateNote),
      history: arr(raw?.history).map(migrateEvent),
    };
  }

  const LISTS = ['activities', 'cars', 'tasks', 'notes', 'history'];

  // Key order independent serialisation, so two devices compare records the same way.
  function canonJSON(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonJSON).join(',') + ']';
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonJSON(v[k])).join(',') + '}';
  }

  function mergeList(a, b) {
    const byId = new Map(a.map(x => [x.id, x]));
    for (const y of b) {
      const x = byId.get(y.id);
      if (!x) { byId.set(y.id, y); continue; }
      const ty = y.updatedAt || 0, tx = x.updatedAt || 0;
      // Newest wins; on an exact tie both devices must still pick the same record.
      if (ty > tx || (ty === tx && canonJSON(y) > canonJSON(x))) byId.set(y.id, y);
    }
    return [...byId.values()].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  }

  function merge(a, b) {
    const out = { version: 2 };
    for (const k of LISTS) out[k] = mergeList(a[k] || [], b[k] || []);
    return out;
  }

  // ---------- selectors ----------

  const live = list => list.filter(x => !x.deleted);
  const byName = (a, b) => a.name.localeCompare(b.name, 'lt');

  const activities = d => live(d.activities).sort((a, b) => (a.kind === 'vehicles' ? -1 : b.kind === 'vehicles' ? 1 : 0) || byName(a, b));
  const cars = d => live(d.cars).sort(byName);
  const carsOf = (d, activityId) => cars(d).filter(c => c.activityId === activityId);
  const tasks = d => live(d.tasks);
  const notes = d => live(d.notes);
  const activityById = (d, id) => d.activities.find(a => a.id === id && !a.deleted) || null;
  const carById = (d, id) => (id ? d.cars.find(c => c.id === id && !c.deleted) || null : null);
  const taskById = (d, id) => d.tasks.find(t => t.id === id) || null;
  const noteById = (d, id) => d.notes.find(n => n.id === id) || null;

  // A waiting record only counts while the work is unfinished.
  const isWaiting = t => !!(t.waiting && t.waiting.active) && t.status !== 'done' && !t.deleted;
  const isOverdueDay = (t, today) => t.scope === 'day' && t.date && t.date < today && t.status !== 'done';
  const needsFollowUp = (t, onDate) => isWaiting(t) && t.waiting.followUp && t.waiting.followUp <= onDate;
  const promiseLate = (t, today) => isWaiting(t) && t.waiting.promised && t.waiting.promised < today;

  const byTime = (a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.createdAt - b.createdAt;
  const STATUS_ORDER = { in_progress: 0, todo: 1, done: 2 };
  const byStatus = (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byTime(a, b);

  // The day screen. Each task appears once, in the first group it qualifies for.
  function dayGroups(d, selected) {
    const today = todayISO();
    const isToday = selected === today;
    const all = tasks(d);
    const used = new Set();
    const take = list => list.filter(t => !used.has(t.id) && used.add(t.id));

    const followUps = take(all.filter(t => (isToday ? needsFollowUp(t, today) : t.waiting?.followUp === selected && isWaiting(t))).sort(
      (a, b) => (a.waiting.followUp || '').localeCompare(b.waiting.followUp || '')));
    const overdue = isToday ? take(all.filter(t => isOverdueDay(t, today)).sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))) : [];
    const sameDay = all.filter(t => t.scope === 'day' && t.date === selected);
    const timed = take(sameDay.filter(t => t.status !== 'done' && t.startTime).sort(byTime));
    const untimed = take(sameDay.filter(t => t.status !== 'done' && !t.startTime).sort(byStatus));
    const done = take(sameDay.filter(t => t.status === 'done').sort(byTime));

    // Progress counts only what is planned for this day, however it is displayed.
    const planned = sameDay;
    return {
      followUps, overdue, timed, untimed, done,
      progress: { total: planned.length, done: planned.filter(t => t.status === 'done').length },
    };
  }

  // Note reminders still shown on the day they are due.
  function dayNoteReminders(d, selected) {
    const today = todayISO();
    return notes(d)
      .filter(n => n.remindOn && !n.remindDone && (selected === today ? n.remindOn <= today : n.remindOn === selected))
      .sort((a, b) => a.remindOn.localeCompare(b.remindOn));
  }

  function waitingList(d) {
    const today = todayISO();
    const rank = t => (!t.waiting.followUp ? 1 : t.waiting.followUp <= today ? 0 : 2);
    return tasks(d).filter(isWaiting).sort((a, b) =>
      rank(a) - rank(b) ||
      (a.waiting.followUp || '9999').localeCompare(b.waiting.followUp || '9999') ||
      a.createdAt - b.createdAt);
  }

  function weekTasks(d, anchor) {
    const from = weekStart(anchor), to = addDays(from, 6);
    return tasks(d).filter(t => t.scope === 'day' && t.date >= from && t.date <= to);
  }

  function plansOf(d, scope, iso) {
    return tasks(d).filter(t => t.scope === scope && t.date === anchorFor(scope, iso)).sort(byStatus);
  }

  function spaceTasks(d, { activityId, carId }) {
    return tasks(d)
      .filter(t => (carId ? t.carId === carId : t.activityId === activityId))
      .sort((a, b) => (a.status === 'done') - (b.status === 'done')
        || (a.date || '9999').localeCompare(b.date || '9999') || byTime(a, b));
  }

  function spaceNotes(d, { activityId, carId }) {
    return notes(d)
      .filter(n => (carId ? n.carId === carId : n.activityId === activityId && !n.carId))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function counts(list) {
    return {
      total: list.length,
      open: list.filter(t => t.status !== 'done').length,
      waiting: list.filter(isWaiting).length,
    };
  }

  // ---------- mutations ----------

  function touch(obj, patch) { Object.assign(obj, patch, { updatedAt: Date.now() }); }

  function logEvent(d, ev) {
    // Same change applied twice (retry, double tap) must not create two entries.
    const id = ev.id || `${ev.taskId || ev.noteId}-${ev.type}-${ev.to ?? ''}-${ev.from ?? ''}`;
    if (d.history.some(h => h.id === id)) return;
    d.history.push(migrateEvent({ ...ev, id, at: ev.at || Date.now() }));
  }

  function newTask(fields) {
    const now = Date.now();
    return migrateTask({
      id: fields.id || uid(),
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
  }

  function setStatus(d, t, status) {
    if (!STATUSES.includes(status) || t.status === status) return;
    if (status === 'done') {
      touch(t, { status, doneAt: Date.now(), prevStatus: t.status });
    } else {
      touch(t, { status, doneAt: null, prevStatus: null });
    }
    logEvent(d, { taskId: t.id, type: 'status', from: t.prevStatus || '', to: status, at: Date.now(), id: `${t.id}-status-${Date.now()}` });
  }

  function toggleDone(d, t) {
    if (t.status === 'done') {
      const back = STATUSES.includes(t.prevStatus) && t.prevStatus !== 'done' ? t.prevStatus : 'todo';
      setStatus(d, t, back);
    } else {
      setStatus(d, t, 'done');
    }
  }

  function setWaiting(d, t, patch) {
    const w = { ...emptyWaiting(), ...(t.waiting || {}), ...patch };
    if (w.active && !w.since) w.since = todayISO();
    if (w.active) w.answeredAt = null;
    touch(t, { waiting: w });
  }

  // An explicitly received answer must not come back when Done is undone.
  function answerReceived(d, t) {
    if (!t.waiting?.active) return;
    touch(t, { waiting: { ...t.waiting, active: false, answeredAt: Date.now() } });
    logEvent(d, { taskId: t.id, type: 'answered', to: todayISO(), at: Date.now(), id: `${t.id}-answered-${Date.now()}` });
  }

  function changeDate(d, t, field, value) {
    const map = { planned: 'date', followUp: 'followUp', promised: 'promised' };
    const key = map[field];
    if (!key) return;
    const from = field === 'planned' ? t.date : t.waiting?.[key] || null;
    if (from === value) return;
    if (field === 'planned') touch(t, { date: value });
    else setWaiting(d, t, { [key]: value });
    logEvent(d, { taskId: t.id, type: field, from, to: value, at: Date.now(), id: `${t.id}-${field}-${Date.now()}` });
  }

  return {
    STATUSES, STATUS_LABEL, SCOPES, ACT_VEHICLES, ACT_GENERAL,
    WEEKDAYS, WD_SHORT, MONTHS, MONTHS_NOM,
    isoDate, todayISO, parseISO, addDays, weekStart, monthStart, monthEnd, yearStart,
    daysBetween, isValidISO, isValidTime, minutesOf, timeOfMinutes, weekNo, anchorFor,
    shortDate, numDate, dayTitle, relDay, stamp, uid,
    normalize, merge, emptyWaiting, canonJSON,
    live, activities, cars, carsOf, tasks, notes, activityById, carById, taskById, noteById,
    isWaiting, isOverdueDay, needsFollowUp, promiseLate, byTime, byStatus,
    dayGroups, dayNoteReminders, waitingList, weekTasks, plansOf, spaceTasks, spaceNotes, counts,
    touch, logEvent, newTask, setStatus, toggleDone, setWaiting, answerReceived, changeDate,
  };
})();

if (typeof module !== 'undefined') module.exports = Model;
