'use strict';

const STORE_KEY = 'dienotvarke.data.v1';
const WEEKDAYS = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];
const MONTHS = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio', 'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
const STATUS_ORDER = { todo: 0, waiting: 1, done: 2 };

const state = {
  data: loadData(),
  tab: 'day',
  date: todayISO(),
  carId: null,
  editId: null,
  focus: null,
  openDetails: {},
  pendingRender: false,
};

// ---------- helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO() { return isoDate(new Date()); }
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

function shortDate(iso) {
  const d = parseISO(iso);
  const s = `${MONTHS[d.getMonth()]} ${d.getDate()} d.`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${d.getFullYear()} m. ${s}`;
}

function dayLabel(iso) {
  const t = todayISO();
  const rel = { [t]: 'Šiandien', [addDays(t, 1)]: 'Rytoj', [addDays(t, -1)]: 'Vakar' }[iso];
  const d = parseISO(iso);
  const weekday = WEEKDAYS[d.getDay()];
  return {
    main: rel || weekday.charAt(0).toUpperCase() + weekday.slice(1),
    sub: rel ? `${shortDate(iso)}, ${weekday}` : shortDate(iso),
  };
}

function stamp(ms) {
  const d = new Date(ms);
  return `${shortDate(isoDate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function waitAge(ms) {
  const n = daysBetween(isoDate(new Date(ms)), todayISO());
  return n <= 0 ? 'nuo šiandien' : `${n} d.`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------- data ----------

function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return Sync.normalize(JSON.parse(raw));
  } catch (e) { /* fall through to empty data */ }
  return Sync.normalize({});
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.data)); }
  catch (e) { toast('Nepavyko išsaugoti šiame įrenginyje'); }
}

// Every user change goes through here: save locally, push to sync, redraw.
function commit() {
  persist();
  Sync.schedule();
  render();
}

const live = arr => arr.filter(x => !x.deleted);
const tasks = () => live(state.data.tasks);
const notes = () => live(state.data.notes).filter(n => carById(n.carId));
const cars = () => live(state.data.cars).sort((a, b) => a.name.localeCompare(b.name, 'lt'));
const carById = id => id && state.data.cars.find(c => c.id === id && !c.deleted);
const findTask = id => state.data.tasks.find(t => t.id === id);
const findNote = id => state.data.notes.find(n => n.id === id);

function touch(obj, patch) {
  Object.assign(obj, patch, { updatedAt: Date.now() });
}

function addTask({ title, date = null, carId = null }) {
  const now = Date.now();
  state.data.tasks.push({
    id: uid(), title, date, carId, status: 'todo',
    waitingFor: '', waitingSince: null, note: '',
    createdAt: now, updatedAt: now, doneAt: null,
  });
}

function setStatus(t, status) {
  const patch = { status, doneAt: status === 'done' ? Date.now() : null };
  if (status === 'waiting' && t.status !== 'waiting') patch.waitingSince = Date.now();
  touch(t, patch);
}

function sortTasks(list) {
  return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.createdAt - b.createdAt);
}

// ---------- views ----------

function render() {
  // Don't wipe out what the user is typing when a background sync lands.
  const active = document.activeElement;
  if (state.renderSoft && active && $('#view').contains(active) && active.matches('input, textarea, select')) {
    state.pendingRender = true;
    state.renderSoft = false;
    return;
  }
  state.renderSoft = false;
  state.pendingRender = false;

  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#waitCount').textContent = tasks().filter(t => t.status === 'waiting').length || '';

  const views = { day: viewDay, waiting: viewWaiting, cars: state.carId ? viewCar : viewCars, settings: viewSettings };
  $('#view').innerHTML = views[state.tab]();
  renderSyncDot();

  if (state.focus) {
    const el = $(state.focus, $('#view'));
    if (el) el.focus();
    state.focus = null;
  }
}

function section(title, body, cls = '') {
  return `<section class="section ${cls}"><h3>${title}</h3>${body}</section>`;
}

function carOptions(selected) {
  return `<option value="">Be automobilio</option>` +
    cars().map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function addTaskForm(ctx) {
  const extra = ctx === 'day'
    ? (cars().length ? `<select name="car" aria-label="Automobilis">${carOptions(null)}</select>` : '')
    : `<input type="date" name="date" aria-label="Data, nebūtina" title="Data, nebūtina">`;
  return `<form class="add" data-form="add-task" data-ctx="${ctx}">
    <input name="title" placeholder="${ctx === 'day' ? 'Nauja užduotis…' : 'Naujas darbas…'}" autocomplete="off" enterkeyhint="done">
    ${extra}
    <button type="submit">Pridėti</button>
  </form>`;
}

function progress(done, total) {
  if (!total) return '';
  const pct = Math.round(done / total * 100);
  return `<div class="progress"><span>Atlikta ${done} iš ${total}</span><div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

function taskRow(t, o = {}) {
  const car = carById(t.carId);
  const meta = [];
  if (o.showDate) meta.push(t.date ? `<span class="chip">${shortDate(t.date)}</span>` : `<span class="chip muted">be datos</span>`);
  if (car && !o.hideCar) meta.push(`<span class="chip car">${esc(car.name)}</span>`);
  const waiting = t.status === 'waiting'
    ? `<div class="waiting-line">Laukiu${t.waitingFor ? ': ' + esc(t.waitingFor) : ' atsakymo'} · ${waitAge(t.waitingSince || t.updatedAt)}</div>` : '';
  const actions = [];
  if (o.moveToday) actions.push(`<button class="small" data-action="move-today">Į šiandien</button>`);
  if (o.waitingActions) actions.push(`<button class="small" data-action="answered">Atsakė, tęsiu šiandien</button>`);

  const row = `<li class="task ${t.status}" data-id="${t.id}">
    <button class="check" data-action="toggle-done" aria-label="${t.status === 'done' ? 'Grąžinti į neatliktas' : 'Pažymėti atlikta'}">${t.status === 'done' ? '✓' : ''}</button>
    <div class="body" data-action="edit">
      <div class="title">${esc(t.title)}</div>
      ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      ${waiting}
      ${t.note ? `<div class="tnote">${esc(t.note)}</div>` : ''}
      ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}
    </div>
    ${t.status !== 'done' ? `<button class="icon wait ${t.status === 'waiting' ? 'on' : ''}" data-action="toggle-wait" aria-label="Laukiu atsakymo" title="Laukiu atsakymo">⏳</button>` : ''}
  </li>`;
  return row + (state.editId === t.id ? taskEditor(t) : '');
}

function taskEditor(t) {
  const st = (v, label) => `<option value="${v}" ${t.status === v ? 'selected' : ''}>${label}</option>`;
  return `<li class="editor"><form data-form="edit-task" data-id="${t.id}">
    <label>Pavadinimas<input name="title" value="${esc(t.title)}" required></label>
    <div class="row">
      <label>Data<input type="date" name="date" value="${t.date || ''}"></label>
      <label>Automobilis<select name="car">${carOptions(t.carId)}</select></label>
    </div>
    <label>Būsena<select name="status">${st('todo', 'Reikia padaryti')}${st('waiting', 'Laukiu atsakymo')}${st('done', 'Atlikta')}</select></label>
    <label>Ko laukiu<input name="waitingFor" value="${esc(t.waitingFor)}" placeholder="pvz. meistro atsakymo dėl kainos"></label>
    <label>Pastaba<textarea name="note" rows="2">${esc(t.note)}</textarea></label>
    <div class="row buttons">
      <button type="submit">Išsaugoti</button>
      <button type="button" class="small ghost" data-action="edit-cancel">Atšaukti</button>
      <button type="button" class="small danger" data-action="delete-task" data-id="${t.id}">Ištrinti</button>
    </div>
  </form></li>`;
}

function reminderRow(n) {
  const late = n.remindOn < state.date;
  return `<li class="reminder ${late ? 'late' : ''}" data-id="${n.id}">
    <div class="body" data-action="open-note-car">
      <div class="meta"><span class="chip car">${esc(carById(n.carId).name)}</span>${late ? `<span class="chip due">nuo ${shortDate(n.remindOn)}</span>` : ''}</div>
      <div class="title">${esc(n.text)}</div>
    </div>
    <button class="small" data-action="reminder-done">Atlikta</button>
  </li>`;
}

function viewDay() {
  const d = state.date;
  const t = todayISO();
  const lbl = dayLabel(d);
  const dayTasks = sortTasks(tasks().filter(x => x.date === d));
  const doneCount = dayTasks.filter(x => x.status === 'done').length;
  const overdue = d === t ? sortTasks(tasks().filter(x => x.date && x.date < t && x.status !== 'done')) : [];
  const reminders = notes()
    .filter(n => n.remindOn && !n.remindDone && (n.remindOn === d || (d === t && n.remindOn < t)))
    .sort((a, b) => a.remindOn.localeCompare(b.remindOn));

  return `
    <div class="daynav">
      <button class="icon" data-action="day-prev" aria-label="Ankstesnė diena">‹</button>
      <label class="daylabel"><span class="rel">${lbl.main}</span><span class="full">${lbl.sub}</span>
        <input type="date" data-change="day-pick" value="${d}" aria-label="Pasirinkti dieną"></label>
      <button class="icon" data-action="day-next" aria-label="Kita diena">›</button>
    </div>
    ${d !== t ? `<button class="link today-link" data-action="day-today">Grįžti į šiandien</button>` : ''}
    ${addTaskForm('day')}
    ${reminders.length ? section('Priminimai', `<ul class="list">${reminders.map(reminderRow).join('')}</ul>`) : ''}
    ${overdue.length ? section(`Neatlikta anksčiau (${overdue.length})`,
      `<ul class="list">${overdue.map(x => taskRow(x, { showDate: true, moveToday: true })).join('')}</ul>
       <div class="actions"><button class="small" data-action="move-all-today">Perkelti visas į šiandien</button></div>`, 'warn') : ''}
    ${progress(doneCount, dayTasks.length)}
    ${dayTasks.length
      ? `<ul class="list">${dayTasks.map(x => taskRow(x)).join('')}</ul>`
      : `<p class="empty">Šiai dienai užduočių nėra.</p>`}
  `;
}

function viewWaiting() {
  const list = tasks().filter(t => t.status === 'waiting')
    .sort((a, b) => (a.waitingSince || 0) - (b.waitingSince || 0));
  if (!list.length) {
    return `<h2>Laukiu atsakymo</h2><p class="empty">Nieko nelauki. Kai užduotis stringa, nes reikia kito žmogaus atsakymo, paspausk ⏳ prie jos.</p>`;
  }
  return `<h2>Laukiu atsakymo</h2><p class="hint">Seniausiai laukiamos viršuje.</p>
    <ul class="list">${list.map(t => taskRow(t, { showDate: true, waitingActions: true })).join('')}</ul>`;
}

function carCard(c) {
  const open = tasks().filter(t => t.carId === c.id && t.status !== 'done');
  const waiting = open.filter(t => t.status === 'waiting').length;
  const next = notes().filter(n => n.carId === c.id && n.remindOn && !n.remindDone)
    .sort((a, b) => a.remindOn.localeCompare(b.remindOn))[0];
  const short = s => s.length > 70 ? s.slice(0, 70) + '…' : s;
  return `<li><button class="carcard" data-action="open-car" data-id="${c.id}">
    <span class="name">${esc(c.name)}</span>
    <span class="sub">${open.length ? `Neatlikti darbai: ${open.length}` : 'Neatliktų darbų nėra'}</span>
    ${waiting ? `<span class="sub wait-sub">Laukia atsakymo: ${waiting}</span>` : ''}
    ${next ? `<span class="sub ${next.remindOn <= todayISO() ? 'due' : ''}">🔔 ${shortDate(next.remindOn)}: ${esc(short(next.text))}</span>` : ''}
  </button></li>`;
}

function viewCars() {
  const list = cars();
  return `<h2>Automobiliai</h2>
    <form class="add" data-form="add-car">
      <input name="name" placeholder="Naujas automobilis, pvz. BMW X3" autocomplete="off" enterkeyhint="done">
      <button type="submit">Pridėti</button>
    </form>
    ${list.length ? `<ul class="cars">${list.map(carCard).join('')}</ul>` : `<p class="empty">Automobilių dar nėra.</p>`}`;
}

function noteRow(n) {
  if (state.editId === n.id) {
    return `<li class="editor"><form data-form="edit-note" data-id="${n.id}">
      <label>Užrašas<textarea name="text" rows="4" required>${esc(n.text)}</textarea></label>
      <div class="row">
        <label>Priminti<input type="date" name="remindOn" value="${n.remindOn || ''}"></label>
        <label class="inline-check"><input type="checkbox" name="remindDone" ${n.remindDone ? 'checked' : ''}>Priminimas atliktas</label>
      </div>
      <div class="row buttons">
        <button type="submit">Išsaugoti</button>
        <button type="button" class="small ghost" data-action="edit-cancel">Atšaukti</button>
        <button type="button" class="small danger" data-action="delete-note" data-id="${n.id}">Ištrinti</button>
      </div>
    </form></li>`;
  }
  const t = todayISO();
  const rem = n.remindOn
    ? `<span class="chip ${n.remindDone ? 'muted' : n.remindOn <= t ? 'due' : 'car'}">🔔 ${shortDate(n.remindOn)}${n.remindDone ? ' ✓' : ''}</span>` : '';
  return `<li class="note" data-id="${n.id}">
    <div class="nmeta"><span>${stamp(n.createdAt)}</span>${rem}</div>
    <div class="ntext" data-action="edit-note">${esc(n.text)}</div>
  </li>`;
}

function viewCar() {
  const c = carById(state.carId);
  if (!c) { state.carId = null; return viewCars(); }
  const all = sortTasks(tasks().filter(t => t.carId === c.id));
  const open = all.filter(t => t.status !== 'done');
  const done = all.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const carNotes = notes().filter(n => n.carId === c.id).sort((a, b) => b.createdAt - a.createdAt);

  return `
    <div class="carhead">
      <button class="link" data-action="close-car">‹ Visi automobiliai</button>
      <h2>${esc(c.name)}</h2>
      <div class="row">
        <button class="small ghost" data-action="rename-car">Pervadinti</button>
        <button class="small danger" data-action="delete-car">Ištrinti</button>
      </div>
    </div>

    <h3>Darbai</h3>
    ${addTaskForm('car')}
    ${open.length
      ? `<ul class="list">${open.map(t => taskRow(t, { showDate: true, hideCar: true })).join('')}</ul>`
      : `<p class="empty">Neatliktų darbų nėra.</p>`}
    ${done.length ? `<details data-details="done-${c.id}" ${state.openDetails['done-' + c.id] ? 'open' : ''}>
      <summary>Atlikti darbai (${done.length})</summary>
      <ul class="list">${done.map(t => taskRow(t, { showDate: true, hideCar: true })).join('')}</ul>
    </details>` : ''}

    <h3>Užrašai</h3>
    <form class="note-add" data-form="add-note">
      <textarea name="text" rows="3" placeholder="pvz. Meistras žadėjo baigti iki lapkričio 5 d."></textarea>
      <div class="row">
        <label>Priminti man (nebūtina)<input type="date" name="remindOn"></label>
        <button type="submit">Išsaugoti užrašą</button>
      </div>
    </form>
    ${carNotes.length ? `<ul class="notes">${carNotes.map(noteRow).join('')}</ul>` : `<p class="empty">Užrašų dar nėra.</p>`}
  `;
}

function syncStatusText(st) {
  if (st.state === 'syncing') return 'Sinchronizuojama…';
  if (st.state === 'offline') return 'Nėra interneto. Pakeitimai išsaugoti šiame įrenginyje ir bus išsiųsti vėliau.';
  if (st.state === 'error') return `Klaida: ${esc(st.error)}`;
  if (st.at) return `Paskutinį kartą sinchronizuota ${stamp(st.at)}.`;
  return 'Dar nesinchronizuota.';
}

function viewSettings() {
  const cfg = Sync.config();
  const st = Sync.status();
  const d = state.data;
  const syncCard = cfg
    ? `<p>Prijungta prie <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>.</p>
       <p class="hint">${syncStatusText(st)}</p>
       <div class="row">
         <button class="btn" data-action="sync-now">Sinchronizuoti dabar</button>
         <button class="small ghost" data-action="sync-off">Atjungti šiame įrenginyje</button>
       </div>`
    : `<p class="hint">Kol sinchronizacija neįjungta, užduotys saugomos tik šiame įrenginyje.
         Įjungus jos saugomos tavo privačioje GitHub repozitorijoje, faile <code>data.json</code>,
         ir telefone bei kompiuteryje matai tą patį.</p>
       <form data-form="sync-setup">
         <label>GitHub vartotojo vardas<input name="owner" autocomplete="off" autocapitalize="off" required></label>
         <label>Privati repozitorija duomenims<input name="repo" value="dienotvarke-duomenys" autocomplete="off" autocapitalize="off" required></label>
         <label>Token<input name="token" type="password" autocomplete="off" required></label>
         <button type="submit">Prijungti</button>
       </form>
       <details><summary>Kaip gauti token?</summary>
         <ol class="hint">
           <li>GitHub svetainėje: Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
           <li>Repository access: „Only select repositories“ ir pasirink tik duomenų repozitoriją.</li>
           <li>Permissions → Contents: „Read and write“. Daugiau nieko nereikia.</li>
           <li>Nukopijuok token ir įklijuok čia. Kiekviename įrenginyje tai reikia padaryti vieną kartą.</li>
         </ol>
       </details>`;

  return `<h2>Nustatymai</h2>
    <section class="card"><h3>Sinchronizacija tarp įrenginių</h3>${syncCard}</section>
    <section class="card"><h3>Atsarginė kopija</h3>
      <p class="hint">Iš viso: ${live(d.tasks).length} užduotys, ${live(d.cars).length} automobiliai, ${live(d.notes).length} užrašai.</p>
      <div class="row">
        <button class="small" data-action="export">Atsisiųsti kopiją</button>
        <label class="small" style="display:inline-flex;align-items:center;cursor:pointer;color:var(--text)">Įkelti iš kopijos
          <input type="file" accept="application/json,.json" data-change="import" hidden></label>
      </div>
      <p class="hint">Įkeliant kopiją niekas neištrinama: ji sujungiama su esamais duomenimis.</p>
    </section>`;
}

function renderSyncDot() {
  const dot = $('#syncDot');
  const st = Sync.status();
  dot.className = 'sync-dot ' + (Sync.config() ? st.state : 'off');
  dot.title = Sync.config() ? syncStatusText(st).replace(/<[^>]+>/g, '') : 'Sinchronizacija neįjungta';
}

// ---------- actions ----------

const actions = {
  'day-prev': () => { state.date = addDays(state.date, -1); state.editId = null; render(); },
  'day-next': () => { state.date = addDays(state.date, 1); state.editId = null; render(); },
  'day-today': () => { state.date = todayISO(); state.editId = null; render(); },

  'toggle-done': id => { const t = findTask(id); setStatus(t, t.status === 'done' ? 'todo' : 'done'); commit(); },
  'toggle-wait': id => {
    const t = findTask(id);
    if (t.status === 'waiting') {
      setStatus(t, 'todo');
    } else {
      setStatus(t, 'waiting');
      state.editId = id;
      state.focus = '.editor [name=waitingFor]';
    }
    commit();
  },
  'edit': id => { state.editId = state.editId === id ? null : id; render(); },
  'edit-cancel': () => { state.editId = null; render(); },
  'delete-task': id => {
    if (!confirm('Ištrinti šią užduotį?')) return;
    touch(findTask(id), { deleted: true });
    state.editId = null;
    commit();
  },
  'move-today': id => { touch(findTask(id), { date: todayISO() }); commit(); },
  'move-all-today': () => {
    const t = todayISO();
    tasks().filter(x => x.date && x.date < t && x.status !== 'done').forEach(x => touch(x, { date: t }));
    commit();
  },
  'answered': id => { const t = findTask(id); setStatus(t, 'todo'); touch(t, { date: todayISO() }); commit(); toast('Perkelta į šiandien'); },

  'open-car': id => { state.carId = id; state.editId = null; render(); scrollTo(0, 0); },
  'close-car': () => { state.carId = null; state.editId = null; render(); },
  'rename-car': () => {
    const c = carById(state.carId);
    const name = prompt('Naujas pavadinimas', c.name);
    if (name && name.trim()) { touch(c, { name: name.trim() }); commit(); }
  },
  'delete-car': () => {
    const c = carById(state.carId);
    if (!confirm(`Ištrinti „${c.name}“ ir visus jo užrašus? Užduotys liks, tik be automobilio.`)) return;
    touch(c, { deleted: true });
    live(state.data.notes).filter(n => n.carId === c.id).forEach(n => touch(n, { deleted: true }));
    tasks().filter(t => t.carId === c.id).forEach(t => touch(t, { carId: null }));
    state.carId = null;
    commit();
  },
  'edit-note': id => { state.editId = id; render(); },
  'delete-note': id => {
    if (!confirm('Ištrinti šį užrašą?')) return;
    touch(findNote(id), { deleted: true });
    state.editId = null;
    commit();
  },
  'reminder-done': id => { touch(findNote(id), { remindDone: true }); commit(); },
  'open-note-car': id => { state.tab = 'cars'; state.carId = findNote(id).carId; state.editId = null; render(); scrollTo(0, 0); },

  'sync-dot': () => {
    if (Sync.config()) Sync.run();
    else { state.tab = 'settings'; render(); }
  },
  'sync-now': () => Sync.run(),
  'sync-off': () => {
    if (!confirm('Atjungti sinchronizaciją šiame įrenginyje? Duomenys šiame įrenginyje liks.')) return;
    Sync.configure(null);
    render();
  },
  'export': () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dienotvarke-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

const changes = {
  'day-pick': el => { if (el.value) { state.date = el.value; state.editId = null; render(); } },
  'import': async el => {
    const file = el.files[0];
    if (!file) return;
    try {
      const incoming = Sync.normalize(JSON.parse(await file.text()));
      state.data = Sync.merge(state.data, incoming);
      commit();
      toast('Kopija įkelta');
    } catch (e) {
      toast('Šis failas netinka');
    }
  },
};

const forms = {
  'add-task': (fd, f) => {
    const title = (fd.title || '').trim();
    if (!title) return;
    if (f.dataset.ctx === 'day') addTask({ title, date: state.date, carId: fd.car || null });
    else addTask({ title, date: fd.date || null, carId: state.carId });
    state.focus = '[data-form=add-task] [name=title]';
    commit();
  },
  'edit-task': (fd, f) => {
    const t = findTask(f.dataset.id);
    const title = fd.title.trim();
    if (!title) return;
    if (fd.status !== t.status) setStatus(t, fd.status);
    touch(t, { title, date: fd.date || null, carId: fd.car || null, waitingFor: fd.waitingFor.trim(), note: fd.note.trim() });
    state.editId = null;
    commit();
  },
  'add-car': fd => {
    const name = (fd.name || '').trim();
    if (!name) return;
    const now = Date.now();
    state.data.cars.push({ id: uid(), name, createdAt: now, updatedAt: now });
    state.focus = '[data-form=add-car] [name=name]';
    commit();
  },
  'add-note': fd => {
    const text = (fd.text || '').trim();
    if (!text) return;
    const now = Date.now();
    state.data.notes.push({ id: uid(), carId: state.carId, text, remindOn: fd.remindOn || null, remindDone: false, createdAt: now, updatedAt: now });
    commit();
    if (fd.remindOn) toast(`Priminsiu ${shortDate(fd.remindOn)}`);
  },
  'edit-note': (fd, f) => {
    const n = findNote(f.dataset.id);
    const text = fd.text.trim();
    if (!text) return;
    const remindOn = fd.remindOn || null;
    // Picking a new reminder date re-arms a reminder that was already dismissed.
    const remindDone = remindOn !== n.remindOn ? false : !!fd.remindDone;
    touch(n, { text, remindOn, remindDone });
    state.editId = null;
    commit();
  },
  'sync-setup': async (fd, f) => {
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Jungiamasi…';
    try {
      await Sync.connect({ owner: fd.owner.trim(), repo: fd.repo.trim(), token: fd.token.trim(), path: 'data.json' });
      toast('Sinchronizacija įjungta');
      render();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Prijungti';
      toast(e.message);
    }
  },
};

document.addEventListener('click', e => {
  const tab = e.target.closest('.tabs button');
  if (tab) {
    if (state.tab === 'cars' && tab.dataset.tab === 'cars') state.carId = null;
    state.tab = tab.dataset.tab;
    state.editId = null;
    render();
    scrollTo(0, 0);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  const id = el.dataset.id || el.closest('[data-id]')?.dataset.id;
  actions[el.dataset.action](id, el);
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
});

document.addEventListener('submit', e => {
  const f = e.target;
  if (!forms[f.dataset.form]) return;
  e.preventDefault();
  forms[f.dataset.form](Object.fromEntries(new FormData(f)), f);
});

// <details> "toggle" doesn't bubble, so listen in the capture phase.
document.addEventListener('toggle', e => {
  const key = e.target.dataset?.details;
  if (key) state.openDetails[key] = e.target.open;
}, true);

document.addEventListener('focusout', () => {
  setTimeout(() => { if (state.pendingRender) { state.renderSoft = true; render(); } }, 0);
});

// ---------- start ----------

let lastToday = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // App left open overnight: follow "today" forward.
  const t = todayISO();
  if (t !== lastToday) {
    if (state.date === lastToday) state.date = t;
    lastToday = t;
    render();
  }
  Sync.run();
});

Sync.init({
  getLocal: () => state.data,
  applyRemote: merged => {
    const before = JSON.stringify(Sync.merge(state.data, Sync.normalize({})));
    state.data = Sync.merge(state.data, merged);
    if (JSON.stringify(state.data) === before) return;
    persist();
    state.renderSoft = true;
    render();
  },
  onStatus: () => {
    renderSyncDot();
    if (state.tab === 'settings') { state.renderSoft = true; render(); }
  },
});

render();
Sync.run();
setInterval(() => { if (document.visibilityState === 'visible') Sync.run(); }, 60000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
