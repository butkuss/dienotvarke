'use strict';

const STORE_KEY = 'dienotvarke.data.v1';
const UI_KEY = 'dienotvarke.ui';
const DRAFT_KEY = 'dienotvarke.draft';
const M = Model;
const $ = sel => document.querySelector(sel);

const state = {
  data: loadData(),
  view: 'day',
  date: M.todayISO(),
  space: { activityId: null, carId: null },
  spaceTab: 'tasks',
  spaceFilter: 'all',
  showDone: false,
  noteDraft: {},
  form: null,
  menuOpen: false,
  loading: false,
  syncError: '',
};

// ---------- storage ----------

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return M.normalize(JSON.parse(raw));
  } catch (e) { /* fall through */ }
  return M.normalize({});
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.data)); }
  catch (e) { toast('Nepavyko išsaugoti šiame įrenginyje'); }
}

function saveUI() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ view: state.view, space: state.space })); } catch (e) { /* optional */ }
}

function restoreUI() {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if (['day', 'calendar', 'waiting', 'spaces', 'space', 'settings'].includes(ui.view)) state.view = ui.view;
    if (ui.space) state.space = ui.space;
    if (state.view === 'space' && !M.carById(state.data, state.space.carId) && !M.activityById(state.data, state.space.activityId)) {
      state.view = 'day';
    }
  } catch (e) { /* optional */ }
}

// An unfinished form survives a reload, a crash or a lost connection.
function saveDraft() {
  try {
    if (state.form) localStorage.setItem(DRAFT_KEY, JSON.stringify(state.form));
    else localStorage.removeItem(DRAFT_KEY);
  } catch (e) { /* optional */ }
}

function restoreDraft() {
  try {
    const f = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (f && f.fields) state.form = f;
  } catch (e) { /* optional */ }
}

function commit() {
  persist();
  Sync.schedule();
  render();
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- render ----------

let renderSoft = false;
let pendingRender = false;

function render() {
  // A background sync must never wipe what is being typed.
  const active = document.activeElement;
  if (renderSoft && active && active.matches('input, textarea, select') && document.body.contains(active)) {
    pendingRender = true;
    renderSoft = false;
    // Try again shortly, so a deferred redraw can never get stuck.
    clearTimeout(render.retry);
    render.retry = setTimeout(() => { renderSoft = true; render(); }, 500);
    return;
  }
  clearTimeout(render.retry);
  renderSoft = false;
  pendingRender = false;

  const d = state.data;
  $('#side').innerHTML = Views.sidebar(d, state);
  $('#bottom').innerHTML = Views.bottomNav(d, state);
  $('#crumbs').innerHTML = Views.crumbs(d, state);
  renderSync();

  const views = {
    day: () => Views.dayView(d, state),
    calendar: () => Views.calendarView(d, state),
    waiting: () => Views.waitingView(d),
    spaces: () => Views.spacesView(d),
    space: () => Views.spaceView(d, state),
    settings: () => Views.settingsView(d, state),
  };
  const body = state.loading
    ? `<div style="padding:24px 0">${'<div class="skeleton"></div>'.repeat(5)}</div>`
    : (views[state.view] || views.day)();
  $('#view').innerHTML = syncBanner() + body;

  const panel = $('#panel');
  if (state.form) {
    panel.hidden = false;
    panel.innerHTML = state.form.kind === 'note' ? Views.notePanel(d, state.form) : Views.taskPanel(d, state.form);
  } else {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  $('#scrim').hidden = !state.form && !state.menuOpen;
  document.body.classList.toggle('menu-open', state.menuOpen);

  if (state.focusSel) {
    const el = document.querySelector(state.focusSel);
    if (el) el.focus();
    state.focusSel = null;
  }
}

function renderSync() {
  const s = Sync.status();
  const el = $('#syncLine');
  if (!Sync.config()) { el.textContent = ''; el.className = 'sync-line'; return; }
  const text = { syncing: 'Sinchronizuojama…', ok: 'Išsaugota', offline: 'Nėra ryšio', error: 'Nepavyko sinchronizuoti' }[s.state] || '';
  el.textContent = text;
  el.className = 'sync-line' + (s.state === 'error' ? ' err' : '');
}

function syncBanner() {
  if (state.view === 'settings') return '';
  if (!Sync.config()) {
    return `<div class="banner"><span><b>Sinchronizacija neįjungta šiame įrenginyje.</b> Duomenys saugomi tik čia.</span>
      <button class="btn sm quiet" data-action="go" data-view="settings">Įjungti</button></div>`;
  }
  const s = Sync.status();
  if (s.state === 'error') {
    return `<div class="banner err"><span><b>Nepavyko sinchronizuoti.</b> ${Views.esc(s.error || '')}</span>
      <button class="btn sm quiet" data-action="sync-now">Bandyti dar kartą</button></div>`;
  }
  if (s.state === 'offline') {
    return `<div class="banner"><span>Nėra ryšio · pakeitimai laukia išsiuntimo.</span>
      <button class="btn sm quiet" data-action="sync-now">Bandyti dar kartą</button></div>`;
  }
  return '';
}

// ---------- forms ----------

function openTaskForm(task, defaults = {}) {
  const w = task?.waiting || M.emptyWaiting();
  state.form = {
    kind: 'task',
    id: task?.id || null,
    baseUpdatedAt: task?.updatedAt || null,
    fields: {
      title: task?.title || defaults.title || '',
      description: task?.description || defaults.description || '',
      date: task?.date || defaults.date || state.date,
      startTime: task?.startTime || defaults.startTime || '',
      duration: task?.duration || (defaults.startTime ? 30 : ''),
      status: task?.status || 'todo',
      activityId: task?.activityId || defaults.activityId || currentActivityId(),
      carId: task?.carId || defaults.carId || currentCarId(),
      scope: task?.scope || 'day',
      waitingActive: !!w.active,
      person: w.person || '',
      since: w.since || '',
      followUp: w.followUp || '',
      promised: w.promised || '',
      sourceNoteId: task?.sourceNoteId || defaults.sourceNoteId || null,
    },
    errors: {},
  };
  saveDraft();
  render();
  state.focusSel = '#f-title';
  const el = document.querySelector('#f-title');
  if (el && !state.form.id) el.focus();
}

function currentActivityId() {
  if (state.view === 'space') {
    const car = M.carById(state.data, state.space.carId);
    if (car) return car.activityId;
    if (state.space.activityId) return state.space.activityId;
  }
  return M.ACT_GENERAL;
}
function currentCarId() {
  return state.view === 'space' && state.space.carId ? state.space.carId : '';
}

function closeForm() {
  state.form = null;
  saveDraft();
  render();
}

function validateTask(v) {
  const e = {};
  if (!v.title.trim()) e.title = 'Įrašyk, ką reikia padaryti.';
  if (!M.isValidISO(v.date)) e.date = 'Pasirink suplanuotą dieną.';
  if (v.startTime && !M.isValidTime(v.startTime)) e.startTime = 'Laikas turi būti pvz. 14:30.';
  if (v.duration && !v.startTime) e.duration = 'Trukmė galioja tik nurodžius laiką.';
  if (v.waitingActive) {
    if (!v.person.trim()) e.person = 'Įrašyk, iš ko lauki atsakymo.';
    if (!M.isValidISO(v.since)) e.since = 'Nurodyk, nuo kada lauki.';
    if (!M.isValidISO(v.followUp)) e.followUp = 'Nurodyk, kada vėl susisiekti.';
  }
  return e;
}

function saveTask() {
  const f = state.form;
  const v = f.fields;
  const e = validateTask(v);
  if (Object.keys(e).length) {
    f.errors = e;
    render();
    const first = document.querySelector('.field.err input, .field.err select, .field.err textarea');
    if (first) first.focus();
    return;
  }
  const d = state.data;
  const existing = f.id ? M.taskById(d, f.id) : null;
  const t = existing || M.newTask({ title: v.title.trim(), date: v.date });
  if (!existing) d.tasks.push(t);

  if (existing && existing.date !== v.date) M.changeDate(d, t, 'planned', v.date);
  else t.date = v.date;

  M.touch(t, {
    title: v.title.trim(),
    description: v.description.trim(),
    startTime: v.startTime || null,
    duration: v.startTime ? Number(v.duration) || 30 : null,
    activityId: v.activityId,
    carId: v.carId || null,
    scope: v.scope || 'day',
    sourceNoteId: v.sourceNoteId || null,
  });
  if (t.status !== v.status) M.setStatus(d, t, v.status);

  const wasFollow = t.waiting?.followUp || null;
  const wasPromised = t.waiting?.promised || null;
  if (v.waitingActive) {
    M.setWaiting(d, t, {
      active: true, person: v.person.trim(), since: v.since,
      followUp: v.followUp || null, promised: v.promised || null,
    });
    if (wasFollow !== (v.followUp || null)) M.changeDate(d, t, 'followUp', v.followUp || null);
    if (wasPromised !== (v.promised || null)) M.changeDate(d, t, 'promised', v.promised || null);
  } else if (t.waiting?.active) {
    M.setWaiting(d, t, { active: false });
  }

  // Keep the note that produced this task pointing back at it.
  if (v.sourceNoteId) {
    const n = M.noteById(d, v.sourceNoteId);
    if (n && n.linkedTaskId !== t.id) M.touch(n, { linkedTaskId: t.id });
  }
  closeForm();
  commit();
  toast(existing ? 'Išsaugota' : 'Užduotis pridėta');
}

function saveNotePanel() {
  const f = state.form;
  const text = (f.fields.text || '').trim();
  if (!text) { f.errors = { text: 'Užrašas negali būti tuščias.' }; render(); return; }
  const n = M.noteById(state.data, f.id);
  if (n) {
    const oldPromise = n.promisedDate;
    M.touch(n, {
      text,
      promisedBy: (f.fields.promisedBy || '').trim(),
      promisedDate: f.fields.promisedDate || null,
      remindOn: f.fields.remindOn || null,
      remindDone: f.fields.remindOn && f.fields.remindOn !== n.remindOn ? false : n.remindDone,
    });
    if (oldPromise !== n.promisedDate) {
      M.logEvent(state.data, { noteId: n.id, type: 'promised', from: oldPromise, to: n.promisedDate, id: `${n.id}-promised-${Date.now()}` });
    }
  }
  closeForm();
  commit();
  toast('Išsaugota');
}

// The note and the follow-up task it creates are saved together.
function saveNoteFromSpace() {
  const nd = state.noteDraft;
  const text = (nd.text || '').trim();
  if (!text) { nd.error = 'Užrašas negali būti tuščias.'; render(); return; }
  if (nd.promise && nd.makeTask && !M.isValidISO(nd.followUp)) {
    nd.error = 'Nurodyk, kada susisiekti, arba išjunk pasitikslinimo užduotį.';
    render();
    return;
  }
  if (nd.saving) return;
  nd.saving = true;

  const d = state.data;
  const car = M.carById(d, state.space.carId);
  const activityId = car ? car.activityId : state.space.activityId;
  const now = Date.now();
  const note = {
    id: M.uid(), activityId, carId: car ? car.id : null, text,
    promisedBy: nd.promise ? (nd.person || '').trim() : '',
    promisedDate: nd.promise ? (nd.promised || null) : null,
    linkedTaskId: null, remindOn: null, remindDone: false,
    createdAt: now, updatedAt: now,
  };
  d.notes.push(note);

  if (nd.promise && nd.makeTask) {
    const t = M.newTask({
      title: `Pasitikslinti: ${text.split('\n')[0].slice(0, 60)}`,
      description: text,
      date: nd.followUp,
      activityId, carId: car ? car.id : null,
      sourceNoteId: note.id,
    });
    t.waiting = { ...M.emptyWaiting(), active: true, person: note.promisedBy, since: M.todayISO(), followUp: nd.followUp, promised: note.promisedDate };
    d.tasks.push(t);
    note.linkedTaskId = t.id;
    if (note.promisedDate) M.logEvent(d, { taskId: t.id, noteId: note.id, type: 'promised', from: null, to: note.promisedDate, id: `${t.id}-promised-init` });
    M.logEvent(d, { taskId: t.id, noteId: note.id, type: 'followUp', from: null, to: nd.followUp, id: `${t.id}-followUp-init` });
  }
  state.noteDraft = {};
  commit();
  toast(nd.makeTask ? 'Užrašas ir pasitikslinimas išsaugoti' : 'Užrašas išsaugotas');
}

// ---------- actions ----------

function go(view) {
  state.view = view;
  state.menuOpen = false;
  saveUI();
  render();
  scrollTo(0, 0);
}

const actions = {
  'menu': () => { state.menuOpen = !state.menuOpen; render(); },
  'go': (el) => go(el.dataset.view),
  'go-waiting': () => go('waiting'),
  'open-space': (el) => {
    const car = el.dataset.car ? M.carById(state.data, el.dataset.car) : null;
    state.space = { activityId: car ? car.activityId : el.dataset.act, carId: car ? car.id : null };
    state.spaceTab = 'tasks';
    state.spaceFilter = 'all';
    state.noteDraft = {};
    go('space');
  },
  'space-tab': (el) => { state.spaceTab = el.dataset.tab; render(); },
  'space-filter': (el) => { state.spaceFilter = el.dataset.filter; render(); },
  'pick-day': (el) => { state.date = el.dataset.date; render(); },
  'go-today': () => { state.date = M.todayISO(); render(); },
  'week-prev': () => { state.date = M.addDays(state.date, -7); render(); },
  'week-next': () => { state.date = M.addDays(state.date, 7); render(); },
  'toggle-done-group': () => { state.showDone = !state.showDone; render(); },

  'new-task': () => openTaskForm(null, { date: state.view === 'day' || state.view === 'calendar' ? state.date : M.todayISO() }),
  'new-at': (el) => openTaskForm(null, { date: el.dataset.date, startTime: el.dataset.time || '' }),
  'new-plan': () => {
    const scope = prompt('Koks planas? Įrašyk: savaitė, mėnuo arba metai', 'savaitė');
    const map = { 'savaitė': 'week', 'savaite': 'week', 'mėnuo': 'month', 'menuo': 'month', 'metai': 'year' };
    const s = map[(scope || '').trim().toLowerCase()];
    if (!s) return;
    openTaskForm(null, { date: M.anchorFor(s, state.date) });
    state.form.fields.scope = s;
  },
  'open-task': (el) => {
    const t = M.taskById(state.data, el.dataset.id);
    if (t) openTaskForm(t);
  },
  'toggle-done': (el) => {
    const t = M.taskById(state.data, el.dataset.id);
    if (t) { M.toggleDone(state.data, t); commit(); }
  },
  'answered': (el) => {
    const t = M.taskById(state.data, el.dataset.id);
    if (t) { M.answerReceived(state.data, t); commit(); toast('Laukimas uždarytas. Būsena nepakeista.'); }
  },
  'save-task': saveTask,
  'delete-task': () => {
    if (!confirm('Ištrinti šią užduotį?')) return;
    const t = M.taskById(state.data, state.form.id);
    if (t) M.touch(t, { deleted: true });
    closeForm();
    commit();
  },
  'close-panel': () => {
    if (state.form && state.form.dirty && !confirm('Atmesti neišsaugotus pakeitimus?')) return;
    closeForm();
  },

  'save-note': saveNoteFromSpace,
  'save-note-panel': saveNotePanel,
  'edit-note': (el) => {
    const n = M.noteById(state.data, el.dataset.id);
    if (!n) return;
    state.form = { kind: 'note', id: n.id, fields: { text: n.text, promisedBy: n.promisedBy, promisedDate: n.promisedDate, remindOn: n.remindOn }, errors: {} };
    render();
  },
  'delete-note': (el) => {
    if (!confirm('Ištrinti šį užrašą? Susieta užduotis liks.')) return;
    const n = M.noteById(state.data, el.dataset.id);
    if (n) M.touch(n, { deleted: true });
    commit();
  },
  'reminder-done': (el) => {
    const n = M.noteById(state.data, el.dataset.id);
    if (n) { M.touch(n, { remindDone: true }); commit(); }
  },
  'task-from-note': (el) => {
    const n = M.noteById(state.data, el.dataset.id);
    if (!n) return;
    openTaskForm(null, {
      description: n.text, activityId: n.activityId, carId: n.carId || '',
      sourceNoteId: n.id, date: M.todayISO(),
    });
  },
  'open-note-space': (el) => {
    const n = M.noteById(state.data, el.dataset.id);
    if (!n) return;
    state.space = { activityId: n.activityId, carId: n.carId };
    state.spaceTab = 'notes';
    go('space');
  },

  'new-activity': () => {
    const name = (prompt('Veiklos pavadinimas, pvz. Internetinė svetainė') || '').trim();
    if (!name) return;
    const now = Date.now();
    state.data.activities.push({ id: M.uid(), name, kind: 'general', createdAt: now, updatedAt: now });
    commit();
  },
  'new-car': (el) => {
    const name = (prompt('Automobilio pavadinimas, pvz. BMW X3') || '').trim();
    if (!name) return;
    const now = Date.now();
    state.data.cars.push({ id: M.uid(), name, activityId: el.dataset.act || M.ACT_VEHICLES, createdAt: now, updatedAt: now });
    commit();
  },
  'rename-space': () => {
    const car = M.carById(state.data, state.space.carId);
    const obj = car || M.activityById(state.data, state.space.activityId);
    if (!obj) return;
    const name = (prompt('Naujas pavadinimas', obj.name) || '').trim();
    if (name) { M.touch(obj, { name }); commit(); }
  },

  'sync-now': () => Sync.run(),
  'sync-connect': async (el) => {
    const get = n => (document.querySelector(`[data-input="${n}"]`)?.value || '').trim();
    el.disabled = true;
    el.textContent = 'Jungiamasi…';
    try {
      await Sync.connect({ owner: get('owner'), repo: get('repo'), token: get('token'), path: 'data.json' });
      state.syncError = '';
      toast('Sinchronizacija įjungta');
      render();
    } catch (err) {
      state.syncError = err.message;
      render();
    }
  },
  'sync-off': () => {
    if (!confirm('Atjungti šį įrenginį? Duomenys jame liks.')) return;
    Sync.configure(null);
    render();
  },
  'export': () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diena-${M.todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

const changes = {
  'status': (el) => {
    const t = M.taskById(state.data, el.dataset.id);
    if (t) { M.setStatus(state.data, t, el.value); commit(); }
  },
  'pick-date': (el) => { if (el.value) { state.date = el.value; render(); } },
  'waiting': (el) => {
    const v = state.form.fields;
    v.waitingActive = el.checked;
    if (v.waitingActive) {
      if (!v.since) v.since = M.todayISO();
      if (!v.followUp) v.followUp = M.addDays(M.todayISO(), 2);
    }
    state.form.dirty = true;
    saveDraft();
    render();
  },
  'note-promise': (el) => { state.noteDraft.promise = el.checked; state.noteDraft.error = ''; render(); },
  'note-followup': (el) => {
    state.noteDraft.makeTask = el.checked;
    if (el.checked && !state.noteDraft.followUp) state.noteDraft.followUp = M.addDays(M.todayISO(), 2);
    render();
  },
  'import': async (el) => {
    const file = el.files[0];
    if (!file) return;
    try {
      const incoming = M.normalize(JSON.parse(await file.text()));
      state.data = M.merge(state.data, incoming);
      commit();
      toast('Kopija įkelta ir sujungta');
    } catch (err) { toast('Šis failas netinka'); }
  },
};

// Typing updates the draft without re-rendering, so nothing is lost mid-word.
const NOTE_INPUTS = { noteText: 'text', notePerson: 'person', notePromised: 'promised', noteFollowUp: 'followUp' };

document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  const name = el.dataset.input;
  if (NOTE_INPUTS[name]) {
    state.noteDraft[NOTE_INPUTS[name]] = el.value;
    return;
  }
  if (state.form && name in state.form.fields) {
    state.form.fields[name] = el.value;
    state.form.dirty = true;
    saveDraft();
  }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el);
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
});

$('#scrim').addEventListener('click', () => {
  if (state.menuOpen) { state.menuOpen = false; render(); return; }
  actions['close-panel']();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.form) actions['close-panel']();
    else if (state.menuOpen) { state.menuOpen = false; render(); }
  }
});

document.addEventListener('focusout', () => {
  setTimeout(() => { if (pendingRender) { renderSoft = true; render(); } }, 0);
});

// ---------- boot ----------

let lastToday = M.todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const t = M.todayISO();
  if (t !== lastToday) {
    if (state.date === lastToday) state.date = t;
    lastToday = t;
    render();
  }
  Sync.run();
});
setInterval(() => {
  const t = M.todayISO();
  if (t !== lastToday) { if (state.date === lastToday) state.date = t; lastToday = t; render(); }
}, 60000);

Sync.init({
  getLocal: () => state.data,
  applyRemote: merged => {
    const before = JSON.stringify(state.data);
    state.data = M.merge(state.data, merged);
    if (JSON.stringify(state.data) === before) return;
    persist();
    // Warn instead of silently replacing what is open in the form.
    if (state.form?.id) {
      const t = M.taskById(state.data, state.form.id);
      if (t && state.form.baseUpdatedAt && t.updatedAt > state.form.baseUpdatedAt) state.form.conflict = true;
    }
    renderSoft = true;
    render();
  },
  onStatus: () => {
    if (state.loading && ['ok', 'error', 'offline'].includes(Sync.status().state)) state.loading = false;
    renderSync();
    renderSoft = true;
    render();
  },
});

restoreUI();
restoreDraft();
state.loading = !!Sync.config() && state.data.tasks.length === 0;
render();
Sync.run();
setInterval(() => { if (document.visibilityState === 'visible') Sync.run(); }, 60000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
