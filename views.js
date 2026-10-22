'use strict';

// Pure rendering: every function returns HTML for the current data and UI state.
const Views = (() => {
  const M = Model;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const planLabel = t => t.scope === 'week' ? `${M.weekNo(t.date)} sav. planas`
    : t.scope === 'month' ? `${M.MONTHS_NOM[M.parseISO(t.date).getMonth()]} planas`
    : t.scope === 'year' ? `${M.parseISO(t.date).getFullYear()} m. planas` : '';

  const spaceName = (d, t) => {
    const car = M.carById(d, t.carId);
    if (car) return car.name;
    const act = M.activityById(d, t.activityId);
    return act && act.id !== M.ACT_GENERAL ? act.name : '';
  };

  function statusPill(t) {
    return `<select class="pill s-${t.status} row-pill" data-change="status" data-id="${t.id}" aria-label="Užduoties būsena">
      ${M.STATUSES.map(s => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}
    </select>`;
  }

  // One task line, used by every list in the app.
  function taskRow(d, t, o = {}) {
    const meta = [];
    if (t.startTime) meta.push(`<span>${t.startTime}</span>`);
    if (t.scope !== 'day') meta.push(`<span class="tag plain">${esc(planLabel(t))}</span>`);
    const sp = spaceName(d, t);
    if (sp) meta.push(`<span class="tag">${esc(sp)}</span>`);
    if (o.showPlannedDate && t.date) {
      const late = t.date < M.todayISO() && t.status !== 'done';
      meta.push(`<span class="${late ? 'flag over' : ''}">${M.numDate(t.date)}${late ? ' · pradelsta' : ''}</span>`);
    }
    if (M.isWaiting(t)) {
      meta.push(`<span class="flag wait">⌛ Laukiu atsakymo</span>`);
      if (t.waiting.followUp) {
        const due = t.waiting.followUp <= M.todayISO();
        meta.push(`<span class="${due ? 'flag wait' : ''}">Pasitikslinti: ${M.numDate(t.waiting.followUp)}</span>`);
      }
      if (M.promiseLate(t, M.todayISO())) meta.push(`<span class="flag over">Pažadėta iki ${M.numDate(t.waiting.promised)}</span>`);
    }
    return `<li class="row ${t.status === 'done' ? 'is-done' : ''}" data-id="${t.id}">
      <button class="done-btn" data-action="toggle-done" data-id="${t.id}"
        aria-label="${t.status === 'done' ? 'Grąžinti į neatliktas' : 'Pažymėti atlikta'}"><span>${t.status === 'done' ? '✓' : ''}</span></button>
      <button class="row-main" data-action="open-task" data-id="${t.id}">
        <span class="row-title">${esc(t.title)}</span>
        ${meta.length ? `<span class="row-meta">${meta.join('<span class="sep">·</span>')}</span>` : ''}
        ${t.description ? `<span class="row-note">${esc(t.description)}</span>` : ''}
      </button>
      ${statusPill(t)}
    </li>`;
  }

  const group = (title, count, body, cls = '') => !body ? '' :
    `<div class="group-head ${cls}"><span>${title}</span><span class="c">${count}</span></div><ul>${body}</ul>`;

  // ---------- week strip ----------

  function weekStrip(d, selected) {
    const start = M.weekStart(selected);
    const today = M.todayISO();
    const month = `${M.parseISO(selected).getFullYear()} m. ${M.MONTHS[M.parseISO(selected).getMonth()]}`;
    const days = Array.from({ length: 7 }, (_, i) => M.addDays(start, i)).map(iso => {
      const n = M.tasks(d).filter(t => t.scope === 'day' && t.date === iso && t.status !== 'done').length;
      const dots = Array.from({ length: Math.min(n, 3) }, () => '<i></i>').join('');
      return `<button class="d ${iso === selected ? 'sel' : ''} ${iso === today && iso !== selected ? 'today' : ''}"
          data-action="pick-day" data-date="${iso}" aria-label="${esc(M.dayTitle(iso))}" ${iso === selected ? 'aria-current="date"' : ''}>
        <span class="wd">${M.WD_SHORT[(M.parseISO(iso).getDay() + 6) % 7]}</span>
        <span class="dn">${M.parseISO(iso).getDate()}</span>
        <span class="dots">${dots}</span>
      </button>`;
    }).join('');
    return `<div class="strip-head">
        <span class="month">${month}</span>
        <button class="btn sm quiet" data-action="go-today">Šiandien</button>
        <button class="nav-btn" data-action="week-prev" aria-label="Ankstesnė savaitė">‹</button>
        <button class="nav-btn" data-action="week-next" aria-label="Kita savaitė">›</button>
        <span class="date-pick"><button class="nav-btn" aria-hidden="true" tabindex="-1">▦</button>
          <input type="date" value="${selected}" data-change="pick-date" aria-label="Pasirinkti datą"></span>
      </div>
      <div class="week">${days}</div>`;
  }

  // ---------- day ----------

  function dayView(d, st) {
    const sel = st.date;
    const g = M.dayGroups(d, sel);
    const rem = M.dayNoteReminders(d, sel);
    const pct = g.progress.total ? Math.round(g.progress.done / g.progress.total * 100) : 0;
    const rel = M.relDay(sel);

    const body = [
      group('Laikas vėl susisiekti', g.followUps.length,
        g.followUps.map(t => taskRow(d, t, { showPlannedDate: true })).join('') + rem.map(noteReminderRow).join(''), 'wait'),
      group('Iš ankstesnių dienų', g.overdue.length,
        g.overdue.map(t => taskRow(d, t, { showPlannedDate: true })).join(''), 'warn'),
      group('Suplanuota', g.timed.length, g.timed.map(t => taskRow(d, t)).join('')),
      group('Be konkretaus laiko', g.untimed.length, g.untimed.map(t => taskRow(d, t)).join('')),
    ].join('');

    const doneBlock = g.done.length ? `
      <div class="group-head">
        <button data-action="toggle-done-group" aria-expanded="${st.showDone}">
          <span>${st.showDone ? '⌄' : '›'}</span><span>Atlikta</span><span class="c">${g.done.length}</span>
        </button>
      </div>
      ${st.showDone ? `<ul>${g.done.map(t => taskRow(d, t)).join('')}</ul>` : ''}` : '';

    const empty = !body && !g.done.length
      ? `<p class="empty">Ši diena dar laisva.<br><button class="btn" data-action="new-task">Pridėti užduotį</button></p>` : '';

    return `
      ${pageHead('Tavo ritmu', 'Mano diena', `${M.dayTitle(sel)}${rel ? ' · ' + rel.toLowerCase() : ''}`)}
      ${weekStrip(d, sel)}
      <div class="cols">
        <div class="list-col">
          <div class="progress-head">
            <h2>${rel || M.dayTitle(sel).split(',')[0]}</h2>
            <span class="n">${g.progress.total ? `${g.progress.done} iš ${g.progress.total} atlikta` : '0 užduočių'}</span>
          </div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          ${body}
          ${empty}
          <button class="add-inline" data-action="new-task">＋ Pridėti užduotį šiai dienai</button>
          ${doneBlock}
        </div>
        <div class="ctx-col">${contextCards(d, st)}</div>
      </div>`;
  }

  function noteReminderRow(n) {
    return `<li class="row" data-note="${n.id}">
      <button class="done-btn" data-action="reminder-done" data-id="${n.id}" aria-label="Priminimas atliktas"><span></span></button>
      <button class="row-main" data-action="open-note-space" data-id="${n.id}">
        <span class="row-title">${esc(n.text.split('\n')[0].slice(0, 90))}</span>
        <span class="row-meta"><span class="flag wait">🔔 Užrašo priminimas ${M.numDate(n.remindOn)}</span></span>
      </button>
    </li>`;
  }

  // Context cards are derived from real records only.
  function contextCards(d, st) {
    const today = M.todayISO();
    const waits = M.waitingList(d);
    const cards = [];

    if (waits.length) {
      const late = waits.find(t => M.promiseLate(t, today));
      const rest = waits.filter(t => t !== late).slice(0, 2);
      cards.push(`<div class="card">
        <h3>⌛ Laukiu atsakymo<span class="c">${waits.length}</span></h3>
        ${late ? `<div class="alert wait">
            <b>Pažadėta data praėjo</b>
            <div class="t">${esc(spaceName(d, late) || late.title)}${late.waiting.person ? ' · ' + esc(late.waiting.person) : ''}</div>
            <div>Buvo žadėta iki ${M.numDate(late.waiting.promised)}</div>
            ${late.waiting.followUp ? `<div>Pasitikslinti: ${M.numDate(late.waiting.followUp)}</div>` : ''}
            <button class="linkbtn" data-action="open-task" data-id="${late.id}">Atidaryti užduotį ↗</button>
          </div>` : ''}
        ${rest.map(t => `<div class="ctx-item">
            <div><b>${esc(t.title)}</b></div>
            <div class="sub">${[spaceName(d, t), t.waiting.person, t.waiting.followUp ? M.numDate(t.waiting.followUp) : '']
              .filter(Boolean).map(esc).join(' · ')}</div>
          </div>`).join('')}
        <button class="linkbtn" data-action="go-waiting">Visi laukiami atsakymai →</button>
      </div>`);
    }

    // The newest note from a space that appears in the selected day, else the newest note.
    const dayTaskIds = M.dayGroups(d, st.date);
    const spaces = new Set([...dayTaskIds.timed, ...dayTaskIds.untimed, ...dayTaskIds.overdue, ...dayTaskIds.followUps]
      .map(t => t.carId || t.activityId));
    const notes = M.notes(d).sort((a, b) => b.createdAt - a.createdAt);
    const note = notes.find(n => spaces.has(n.carId || n.activityId)) || notes[0];
    if (note) {
      const car = M.carById(d, note.carId);
      const act = M.activityById(d, note.activityId);
      cards.push(`<div class="card">
        <h3>🗒 ${esc(car ? car.name : act ? act.name : 'Užrašai')}</h3>
        <div class="sub">${M.shortDate(M.isoDate(new Date(note.createdAt)))}</div>
        <p>${esc(note.text.slice(0, 220))}${note.text.length > 220 ? '…' : ''}</p>
        ${note.promisedDate ? `<div class="sub">Buvo pažadėta iki ${M.numDate(note.promisedDate)}</div>` : ''}
        <button class="linkbtn" data-action="open-note-space" data-id="${note.id}">Atidaryti istoriją →</button>
      </div>`);
    }
    return cards.join('');
  }

  function pageHead(eyebrow, title, lead, extra = '') {
    return `<div class="page-head">
      <div class="grow">
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h1>${esc(title)}</h1>
        ${lead ? `<div class="lead">${esc(lead)}</div>` : ''}
      </div>
      ${extra}
      <button class="btn new" data-action="new-task">＋<span> Nauja užduotis</span></button>
    </div>`;
  }

  // ---------- calendar ----------

  const HOUR_H = 48;

  function layoutDay(list) {
    // Overlapping tasks share the width instead of hiding each other.
    const items = list.map(t => ({
      t, from: M.minutesOf(t.startTime), to: M.minutesOf(t.startTime) + Math.max(t.duration || 30, 15),
    })).sort((a, b) => a.from - b.from || a.to - b.to);
    let cluster = [], clusterEnd = -1;
    const out = [];
    const flush = () => {
      const cols = [];
      cluster.forEach(it => {
        let c = cols.findIndex(end => end <= it.from);
        if (c === -1) { c = cols.length; cols.push(0); }
        cols[c] = it.to;
        it.col = c;
      });
      cluster.forEach(it => out.push({ ...it, cols: cols.length }));
      cluster = [];
    };
    for (const it of items) {
      if (cluster.length && it.from >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.to);
    }
    if (cluster.length) flush();
    return out;
  }

  function calendarView(d, st) {
    const start = M.weekStart(st.date);
    const days = Array.from({ length: 7 }, (_, i) => M.addDays(start, i));
    const today = M.todayISO();
    const week = M.weekTasks(d, start);
    const timed = week.filter(t => t.startTime);

    let from = 8 * 60, to = 18 * 60;
    timed.forEach(t => {
      from = Math.min(from, M.minutesOf(t.startTime));
      to = Math.max(to, M.minutesOf(t.startTime) + (t.duration || 30));
    });
    from = Math.floor(from / 60) * 60;
    to = Math.ceil(to / 60) * 60;
    const hours = (to - from) / 60;

    const hourCol = `<div class="cal-col cal-hours">${Array.from({ length: hours }, (_, i) =>
      `<div class="h cal-slot" style="height:${HOUR_H}px"><span>${M.timeOfMinutes(from + i * 60)}</span></div>`).join('')}</div>`;

    const dayCols = days.map(iso => {
      const evs = layoutDay(week.filter(t => t.date === iso && t.startTime)).map(({ t, from: f, to: e, col, cols }) => {
        const top = (f - from) / 60 * HOUR_H;
        const h = Math.max((e - f) / 60 * HOUR_H - 2, 20);
        const w = 100 / cols;
        const cls = t.status === 'done' ? 'd' : M.isWaiting(t) ? 'w' : '';
        return `<button class="ev ${cls}" data-action="open-task" data-id="${t.id}"
          style="top:${top}px;height:${h}px;left:${col * w}%;width:calc(${w}% - 3px)" title="${esc(t.title)}">
          <span class="t">${t.startTime}</span><span class="n">${esc(t.title)}</span></button>`;
      }).join('');
      const slots = Array.from({ length: hours }, (_, i) =>
        `<button class="cal-slot" style="height:${HOUR_H}px" data-action="new-at" data-date="${iso}"
          data-time="${M.timeOfMinutes(from + i * 60)}" aria-label="Pridėti ${esc(M.dayTitle(iso))} ${M.timeOfMinutes(from + i * 60)}"></button>`).join('');
      return `<div class="cal-col">${slots}${evs}</div>`;
    }).join('');

    const heads = `<div class="hd"></div>` + days.map(iso => `<div class="hd ${iso === today ? 'today' : ''}">
        <div class="wd">${M.WD_SHORT[(M.parseISO(iso).getDay() + 6) % 7]}</div>
        <div class="dn">${M.parseISO(iso).getDate()}</div></div>`).join('');

    const allday = `<div class="allday lbl">Be laiko</div>` + days.map(iso => `<div class="allday">${
      week.filter(t => t.date === iso && !t.startTime).map(t =>
        `<button class="chip-ev" data-action="open-task" data-id="${t.id}">${esc(t.title)}</button>`).join('')
    }</div>`).join('');

    return `
      ${pageHead('Tavo ritmu', 'Kalendorius', 'Visa savaitė vienoje vietoje. Laikas tik tada, kai jo reikia.')}
      <div class="strip-head">
        <span class="month">${M.numDate(start)} – ${M.numDate(M.addDays(start, 6))}, ${M.parseISO(start).getFullYear()}</span>
        <button class="btn sm quiet" data-action="go-today">Ši savaitė</button>
        <button class="nav-btn" data-action="week-prev" aria-label="Ankstesnė savaitė">‹</button>
        <button class="nav-btn" data-action="week-next" aria-label="Kita savaitė">›</button>
        <span class="date-pick"><button class="nav-btn" aria-hidden="true" tabindex="-1">▦</button>
          <input type="date" value="${st.date}" data-change="pick-date" aria-label="Pasirinkti datą"></span>
      </div>
      <div class="cal-grid">${heads}${allday}${hourCol}${dayCols}</div>
      <div class="agenda">${agenda(d, days)}</div>
      ${plansBlock(d, st)}`;
  }

  function agenda(d, days) {
    const today = M.todayISO();
    return days.map(iso => {
      const list = M.tasks(d).filter(t => t.scope === 'day' && t.date === iso).sort(M.byTime);
      const timed = list.filter(t => t.startTime);
      const untimed = list.filter(t => !t.startTime);
      return `<div class="agenda-day">
        <div class="agenda-head ${iso === today ? 'today' : ''}">
          <span class="dn">${M.parseISO(iso).getDate()} d.</span>
          <span class="wd">${M.WEEKDAYS[M.parseISO(iso).getDay()]}</span>
          <button class="btn sm quiet" data-action="new-at" data-date="${iso}">＋</button>
        </div>
        ${list.length ? `<ul>${[...timed, ...untimed].map(t => taskRow(d, t)).join('')}</ul>`
          : `<p class="hint">Nieko suplanuota.</p>`}
      </div>`;
    }).join('');
  }

  // Week / month / year plans stay available from the calendar.
  function plansBlock(d, st) {
    const blocks = ['week', 'month', 'year'].map(scope => {
      const list = M.plansOf(d, scope, st.date);
      const label = { week: 'Savaitės planai', month: 'Mėnesio planai', year: 'Metų planai' }[scope];
      if (!list.length) return '';
      return group(label, list.length, list.map(t => taskRow(d, t)).join(''));
    }).filter(Boolean).join('');
    return `<div class="plans">${blocks}
      <button class="add-inline" data-action="new-plan">＋ Pridėti savaitės, mėnesio ar metų planą</button></div>`;
  }

  // ---------- waiting ----------

  function waitingView(d) {
    const today = M.todayISO();
    const list = M.waitingList(d);
    if (!list.length) {
      return `${pageHead('Tavo ritmu', 'Laukiu atsakymo', 'Kur darbas stovi, nes laukiu kito žmogaus.')}
        <p class="empty">Šiuo metu nelauki atsakymų.</p>`;
    }
    const now = list.filter(t => t.waiting.followUp && t.waiting.followUp <= today);
    const later = list.filter(t => !now.includes(t));
    const row = t => {
      const bits = [];
      if (t.waiting.person) bits.push(`iš ko: ${esc(t.waiting.person)}`);
      if (t.waiting.since) bits.push(`nuo ${M.numDate(t.waiting.since)}`);
      if (t.waiting.followUp) bits.push(`pasitikslinti ${M.numDate(t.waiting.followUp)}`);
      if (t.waiting.promised) bits.push(`pažadėta iki ${M.numDate(t.waiting.promised)}`);
      return `<li class="row" data-id="${t.id}">
        <button class="done-btn" data-action="toggle-done" data-id="${t.id}" aria-label="Pažymėti atlikta"><span></span></button>
        <button class="row-main" data-action="open-task" data-id="${t.id}">
          <span class="row-title">${esc(t.title)}</span>
          <span class="row-meta">
            ${spaceName(d, t) ? `<span class="tag">${esc(spaceName(d, t))}</span>` : ''}
            <span>${bits.join(' · ')}</span>
            ${M.promiseLate(t, today) ? `<span class="flag over">Pažadėta data praėjo</span>` : ''}
          </span>
        </button>
        <span class="row-pill" style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm quiet" data-action="answered" data-id="${t.id}">Atsakymas gautas</button>
          <button class="btn sm quiet" data-action="open-task" data-id="${t.id}">Keisti priminimą</button>
        </span>
      </li>`;
    };
    return `${pageHead('Tavo ritmu', 'Laukiu atsakymo', 'Kur darbas stovi, nes laukiu kito žmogaus.')}
      ${group('Šiandien ir pradelsta', now.length, now.map(row).join(''), 'wait')}
      ${group('Vėliau', later.length, later.map(row).join(''))}`;
  }

  // ---------- spaces ----------

  function spacesView(d) {
    const body = M.activities(d).map(a => {
      const cars = M.carsOf(d, a.id);
      const own = M.counts(M.spaceTasks(d, { activityId: a.id }));
      return `<div class="card" style="margin-bottom:12px">
        <h3>${a.kind === 'vehicles' ? '🚗' : '●'} ${esc(a.name)}<span class="c">${own.open} likę</span></h3>
        <button class="btn sm quiet" data-action="open-space" data-act="${a.id}">Atidaryti veiklą</button>
        ${cars.length ? `<ul style="margin-top:12px">${cars.map(c => {
          const cc = M.counts(M.spaceTasks(d, { carId: c.id }));
          return `<li class="row"><span></span><button class="row-main" data-action="open-space" data-car="${c.id}">
            <span class="row-title">${esc(c.name)}</span>
            <span class="row-meta">${cc.open} likę darbai${cc.waiting ? ` · <span class="flag wait">${cc.waiting} laukia</span>` : ''}</span>
          </button></li>`;
        }).join('')}</ul>` : ''}
        ${a.kind === 'vehicles' ? `<button class="add-inline" data-action="new-car" data-act="${a.id}">＋ Pridėti automobilį</button>` : ''}
      </div>`;
    }).join('');
    return `${pageHead('Tavo veiklos', 'Veiklos', 'Automobiliai ir kitos sritys.')}
      ${body}
      <button class="add-inline" data-action="new-activity">＋ Pridėti veiklą</button>`;
  }

  function spaceView(d, st) {
    const car = M.carById(d, st.space.carId);
    const act = M.activityById(d, car ? car.activityId : st.space.activityId);
    if (!car && !act) return spacesView(d);
    const key = car ? { carId: car.id } : { activityId: act.id };
    const title = car ? car.name : act.name;
    const all = M.spaceTasks(d, key);
    const notes = M.spaceNotes(d, key);
    const c = M.counts(all);

    const filter = st.spaceFilter || 'all';
    const shown = filter === 'all' ? all : all.filter(t => t.status === filter);

    const tasksTab = `
      <div class="filters">
        ${[['all', 'Visos'], ...M.STATUSES.map(s => [s, M.STATUS_LABEL[s]])].map(([v, l]) =>
          `<button class="chipbtn ${filter === v ? 'on' : ''}" data-action="space-filter" data-filter="${v}">${l}</button>`).join('')}
      </div>
      ${shown.length ? `<ul>${shown.map(t => taskRow(d, t, { showPlannedDate: true })).join('')}</ul>`
        : `<p class="empty">Šiame filtre darbų nėra.</p>`}
      <button class="add-inline" data-action="new-task">＋ Pridėti darbą</button>`;

    const notesTab = `
      <div class="note-form">
        <div class="lbl">Naujas užrašas${car ? ' · ' + esc(car.name) : ''}</div>
        <textarea data-input="noteText" rows="3" placeholder="Kas sutarta? Kas padaryta? Ką svarbu prisiminti?">${esc(st.noteDraft.text || '')}</textarea>
        <label class="check"><input type="checkbox" data-change="note-promise" ${st.noteDraft.promise ? 'checked' : ''}>Yra pažadėtas terminas</label>
        ${st.noteDraft.promise ? `<div class="subform">
          <div class="two">
            <div class="field"><label>Kas pažadėjo</label><input data-input="notePerson" value="${esc(st.noteDraft.person || '')}" placeholder="pvz. Tomas"></div>
            <div class="field"><label>Pažadėjo atlikti iki</label><input type="date" data-input="notePromised" value="${st.noteDraft.promised || ''}"></div>
          </div>
          <label class="check"><input type="checkbox" data-change="note-followup" ${st.noteDraft.makeTask ? 'checked' : ''}>Sukurti užduotį pasitikslinti</label>
          ${st.noteDraft.makeTask ? `<div class="field"><label>Kada susisiekti?</label>
            <input type="date" data-input="noteFollowUp" value="${st.noteDraft.followUp || ''}"></div>` : ''}
        </div>` : ''}
        ${st.noteDraft.error ? `<div class="err-msg">${esc(st.noteDraft.error)}</div>` : ''}
        <button class="btn" data-action="save-note">＋ Išsaugoti užrašą</button>
      </div>
      ${notes.length ? `<div class="timeline">${notes.map(n => noteItem(d, n)).join('')}</div>`
        : `<p class="empty">Užrašų dar nėra. Pirmas užrašas gali būti tiesiog tai, kas buvo sutarta.</p>`}`;

    return `
      ${pageHead(car ? 'Tavo veiklos' : 'Tavo erdvė', title,
        car ? `${act ? act.name + ' / ' : ''}darbai, susitarimai ir visa istorija.` : 'Visi šios veiklos darbai ir užrašai.')}
      <div class="summary">
        <span><b>${c.open}</b> likę darbai</span><span><b>${c.waiting}</b> laukiami atsakymai</span><span><b>${notes.length}</b> užrašai</span>
        <button class="linkbtn" data-action="rename-space" style="margin-left:auto">Pervadinti</button>
      </div>
      <div class="tabs">
        <button class="${st.spaceTab === 'tasks' ? 'on' : ''}" data-action="space-tab" data-tab="tasks">Užduotys</button>
        <button class="${st.spaceTab === 'notes' ? 'on' : ''}" data-action="space-tab" data-tab="notes">Užrašai ir eiga</button>
      </div>
      ${st.spaceTab === 'notes' ? notesTab : tasksTab}`;
  }

  function noteItem(d, n) {
    const linked = n.linkedTaskId ? M.taskById(d, n.linkedTaskId) : null;
    const changed = linked && linked.waiting?.promised && n.promisedDate && linked.waiting.promised !== n.promisedDate;
    return `<div class="tl-item" data-note="${n.id}">
      <div class="tl-meta">${M.stamp(n.createdAt)}${n.promisedBy ? ' · ' + esc(n.promisedBy) : ''}</div>
      <div class="tl-text">${esc(n.text)}</div>
      ${n.promisedDate ? `<div class="promise-line">
          <span>🏳 Buvo pažadėta iki ${M.numDate(n.promisedDate)}${changed ? ` · dabar ${M.numDate(linked.waiting.promised)}` : ''}</span>
          ${linked ? `<button class="linkbtn" data-action="open-task" data-id="${linked.id}">Susieta užduotis</button>` : ''}
        </div>` : ''}
      ${n.remindOn && !n.remindDone ? `<div class="promise-line"><span>🔔 Priminti ${M.numDate(n.remindOn)}</span>
        <button class="linkbtn" data-action="reminder-done" data-id="${n.id}">Atlikta</button></div>` : ''}
      <div class="tl-actions">
        ${!n.linkedTaskId ? `<button class="linkbtn" data-action="task-from-note" data-id="${n.id}">⇥ Sukurti užduotį iš užrašo</button>` : ''}
        <button class="linkbtn" data-action="edit-note" data-id="${n.id}">Redaguoti</button>
        <button class="linkbtn" data-action="delete-note" data-id="${n.id}">Ištrinti</button>
      </div>
      ${history(d, n)}
    </div>`;
  }

  function history(d, n) {
    const linked = n.linkedTaskId;
    const evs = M.live(d.history).filter(h => (linked && h.taskId === linked) || h.noteId === n.id)
      .filter(h => ['promised', 'followUp', 'planned', 'answered'].includes(h.type))
      .sort((a, b) => b.at - a.at);
    if (!evs.length) return '';
    const name = { promised: 'Pažadėtas terminas', followUp: 'Susisiekimo data', planned: 'Suplanuota diena', answered: 'Atsakymas gautas' };
    return `<details style="margin-top:8px"><summary class="hint">Susitarimo istorija (${evs.length})</summary>
      <ul>${evs.map(h => `<li class="hint" style="padding:4px 0">${M.stamp(h.at)} · ${name[h.type]}${
        h.type === 'answered' ? '' : `: ${h.from ? M.numDate(h.from) : '—'} → ${h.to ? M.numDate(h.to) : '—'}`}</li>`).join('')}</ul>
    </details>`;
  }

  // ---------- settings ----------

  function settingsView(d, st) {
    const cfg = Sync.config();
    const s = Sync.status();
    const text = s.state === 'error' ? `Klaida: ${esc(s.error)}`
      : s.state === 'syncing' ? 'Sinchronizuojama…'
      : s.state === 'offline' ? 'Nėra ryšio · pakeitimai laukia išsiuntimo'
      : s.at ? `Išsaugota ${M.stamp(s.at)}` : 'Dar nesinchronizuota';
    return `${pageHead('Tavo erdvė', 'Nustatymai', 'Įrenginiai, atsarginė kopija.')}
      <div class="card" style="margin-bottom:16px">
        <h3>Sinchronizacija tarp įrenginių</h3>
        ${cfg ? `<p>Prijungta prie <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>.</p>
          <p class="sub">${text}</p>
          <div class="two" style="margin-top:12px">
            <button class="btn quiet" data-action="sync-now">Sinchronizuoti dabar</button>
            <button class="btn danger" data-action="sync-off">Atjungti šį įrenginį</button>
          </div>`
        : `<p class="sub">Kol sinchronizacija neįjungta, duomenys saugomi tik šiame įrenginyje.</p>
          <p class="sub"><b>iPhone:</b> iš pradinio ekrano atidaryta programėlė turi atskirą atmintį nuo Safari. Token įvesk ten, kur rašai užduotis.</p>
          <div class="field"><label>GitHub vartotojo vardas</label><input data-input="owner" autocapitalize="off" autocomplete="off"></div>
          <div class="field"><label>Privati repozitorija</label><input data-input="repo" value="dienotvarke-duomenys" autocapitalize="off" autocomplete="off"></div>
          <div class="field"><label>Token</label><input data-input="token" type="password" autocomplete="off"></div>
          ${st.syncError ? `<div class="err-msg">${esc(st.syncError)}</div>` : ''}
          <button class="btn" data-action="sync-connect">Prijungti</button>`}
      </div>
      <div class="card">
        <h3>Atsarginė kopija</h3>
        <p class="sub">${M.tasks(d).length} užduotys · ${M.cars(d).length} automobiliai · ${M.notes(d).length} užrašai · ${M.live(d.history).length} istorijos įrašai</p>
        <div class="two" style="margin-top:12px">
          <button class="btn quiet" data-action="export">Atsisiųsti kopiją</button>
          <label class="btn quiet" style="cursor:pointer">Įkelti kopiją
            <input type="file" accept="application/json,.json" data-change="import" hidden></label>
        </div>
      </div>`;
  }

  // ---------- panel: task form ----------

  function taskPanel(d, f) {
    const e = f.errors || {};
    const fld = (name, label, input, hint) => `<div class="field ${e[name] ? 'err' : ''}">
      <label for="f-${name}">${label}</label>${input}
      ${e[name] ? `<div class="err-msg">${esc(e[name])}</div>` : hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    const v = f.fields;
    const acts = M.activities(d);
    const act = M.activityById(d, v.activityId);
    const carList = act ? M.carsOf(d, act.id) : [];

    return `
      <div class="panel-head">
        <h2>${f.id ? 'Užduotis' : 'Nauja užduotis'}</h2>
        <button class="nav-btn" data-action="close-panel" aria-label="Uždaryti">✕</button>
      </div>
      <div class="panel-body">
        ${f.conflict ? `<div class="banner-inline">Šią užduotį pakeitė kitas įrenginys. Išsaugojus bus palikta tai, ką įrašei čia.</div>` : ''}
        ${fld('title', 'Užduoties pavadinimas', `<input id="f-title" data-input="title" value="${esc(v.title)}" enterkeyhint="done">`)}
        ${fld('date', 'Suplanuota diena', `<input id="f-date" type="date" data-input="date" value="${v.date || ''}">`)}
        <div class="two">
          ${fld('startTime', 'Laikas', `<input id="f-startTime" type="time" data-input="startTime" value="${v.startTime || ''}">`, 'Nebūtina')}
          ${fld('duration', 'Trukmė', `<select id="f-duration" data-input="duration">
            ${['', 15, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${String(v.duration || '') === String(n) ? 'selected' : ''}>${n ? n + ' min.' : '—'}</option>`).join('')}
          </select>`)}
        </div>
        ${fld('status', 'Būsena', `<select id="f-status" data-input="status">
          ${M.STATUSES.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select>`)}
        ${fld('activityId', 'Veikla', `<select id="f-activityId" data-input="activityId">
          ${acts.map(a => `<option value="${a.id}" ${v.activityId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`)}
        ${carList.length ? fld('carId', 'Automobilis', `<select id="f-carId" data-input="carId">
          <option value="">Bendras darbas</option>
          ${carList.map(c => `<option value="${c.id}" ${v.carId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`) : ''}
        ${fld('description', 'Detalės', `<textarea id="f-description" data-input="description" rows="3">${esc(v.description)}</textarea>`)}
        <label class="check"><input type="checkbox" data-change="waiting" ${v.waitingActive ? 'checked' : ''}>⌛ Laukiu atsakymo</label>
        ${v.waitingActive ? `<div class="subform">
          ${fld('person', 'Iš ko laukiama', `<input id="f-person" data-input="person" value="${esc(v.person)}" placeholder="pvz. Tomas, meistras">`)}
          <div class="two">
            ${fld('since', 'Laukiama nuo', `<input id="f-since" type="date" data-input="since" value="${v.since || ''}">`)}
            ${fld('followUp', 'Kada vėl susisiekti', `<input id="f-followUp" type="date" data-input="followUp" value="${v.followUp || ''}">`)}
          </div>
          ${fld('promised', 'Pažadėjo atlikti iki', `<input id="f-promised" type="date" data-input="promised" value="${v.promised || ''}">`, 'Kito žmogaus terminas, atskiras nuo susisiekimo')}
        </div>` : ''}
        ${f.id ? `<button class="btn danger" data-action="delete-task" style="width:100%">Ištrinti užduotį</button>` : ''}
      </div>
      <div class="panel-foot">
        <button class="btn quiet" data-action="close-panel">Atšaukti</button>
        <button class="btn" data-action="save-task">Išsaugoti</button>
      </div>`;
  }

  function notePanel(d, f) {
    return `
      <div class="panel-head"><h2>Užrašas</h2>
        <button class="nav-btn" data-action="close-panel" aria-label="Uždaryti">✕</button></div>
      <div class="panel-body">
        <div class="field ${f.errors?.text ? 'err' : ''}"><label for="f-text">Užrašas</label>
          <textarea id="f-text" data-input="text" rows="6">${esc(f.fields.text)}</textarea>
          ${f.errors?.text ? `<div class="err-msg">${esc(f.errors.text)}</div>` : ''}</div>
        <div class="two">
          <div class="field"><label>Kas pažadėjo</label><input data-input="promisedBy" value="${esc(f.fields.promisedBy || '')}"></div>
          <div class="field"><label>Pažadėjo iki</label><input type="date" data-input="promisedDate" value="${f.fields.promisedDate || ''}"></div>
        </div>
        <div class="field"><label>Priminti man</label><input type="date" data-input="remindOn" value="${f.fields.remindOn || ''}"></div>
      </div>
      <div class="panel-foot">
        <button class="btn quiet" data-action="close-panel">Atšaukti</button>
        <button class="btn" data-action="save-note-panel">Išsaugoti</button>
      </div>`;
  }

  // ---------- chrome ----------

  function sidebar(d, st) {
    const waiting = M.waitingList(d).length;
    const dayCount = M.dayGroups(d, M.todayISO()).progress;
    const item = (view, icon, label, count, on) =>
      `<button class="${on ? 'on' : ''}" data-action="go" data-view="${view}">
        <span class="ico">${icon}</span><span class="n">${label}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`;
    return `
      <div class="brand"><span class="mark">✓</span>diena.</div>
      <div class="space-card">
        <span class="av">Š</span>
        <span><span class="nm">Mano erdvė</span><br><span class="sb">Asmeninis planuoklis</span></span>
      </div>
      <nav class="nav">
        ${item('day', '☀', 'Mano diena', dayCount.total - dayCount.done, st.view === 'day')}
        ${item('calendar', '▦', 'Kalendorius', 0, st.view === 'calendar')}
        ${item('waiting', '⌛', 'Laukiu atsakymo', waiting, st.view === 'waiting')}
      </nav>
      <div>
        <div class="side-head"><span>Veiklos</span><button data-action="new-activity" aria-label="Pridėti veiklą">＋</button></div>
        <nav class="nav">
          ${M.activities(d).map(a => `
            <button class="${st.view === 'space' && !st.space.carId && st.space.activityId === a.id ? 'on' : ''}"
              data-action="open-space" data-act="${a.id}">
              <span class="ico">${a.kind === 'vehicles' ? '🚗' : '●'}</span><span class="n">${esc(a.name)}</span></button>
            ${M.carsOf(d, a.id).map(c => `
              <button class="sub-item ${st.view === 'space' && st.space.carId === c.id ? 'on' : ''}"
                data-action="open-space" data-car="${c.id}" style="padding-left:28px;font-size:13.5px">
                <span class="dot"></span><span class="n">${esc(c.name)}</span></button>`).join('')}
          `).join('')}
        </nav>
      </div>
      <div class="side-foot">
        <nav class="nav"><button data-action="go" data-view="settings" class="${st.view === 'settings' ? 'on' : ''}">
          <span class="ico">⚙</span><span class="n">Nustatymai</span></button></nav>
      </div>`;
  }

  function bottomNav(d, st) {
    const waiting = M.waitingList(d).length;
    const b = (view, icon, label, badge) => `<button class="${st.view === view ? 'on' : ''}" data-action="go" data-view="${view}">
      <span class="ico">${icon}</span>${badge ? `<span class="badge">${badge}</span>` : ''}<span>${label}</span></button>`;
    return b('day', '☀', 'Diena', 0) + b('calendar', '▦', 'Kalendorius', 0) +
      b('waiting', '⌛', 'Laukiu', waiting) + b('spaces', '🚗', 'Veiklos', 0);
  }

  function crumbs(d, st) {
    const names = { day: 'Mano diena', calendar: 'Kalendorius', waiting: 'Laukiu atsakymo', spaces: 'Veiklos', settings: 'Nustatymai' };
    let last = names[st.view] || '';
    if (st.view === 'space') {
      const car = M.carById(d, st.space.carId);
      last = car ? car.name : (M.activityById(d, st.space.activityId)?.name || 'Veikla');
    }
    return `Mano erdvė <span class="sep">/</span> <b>${esc(last)}</b>`;
  }

  return { esc, taskRow, dayView, calendarView, waitingView, spacesView, spaceView, settingsView,
    taskPanel, notePanel, sidebar, bottomNav, crumbs, planLabel };
})();
