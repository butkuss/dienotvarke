'use strict';

// Sync through one JSON file in a private GitHub repository.
// Every record carries an id and updatedAt; merging keeps the newest copy of each,
// and deletions are kept as `deleted: true` so they spread to other devices too.
const Sync = (() => {
  const CFG_KEY = 'dienotvarke.sync.v1';
  const API = 'https://api.github.com/repos';

  let cfg = loadCfg();
  let hooks = null;
  let timer = null;
  let running = false;
  let again = false;
  let status = { state: 'idle', at: null, error: null };

  function loadCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch (e) { return null; }
  }

  function configure(next) {
    cfg = next;
    try {
      if (next) localStorage.setItem(CFG_KEY, JSON.stringify(next));
      else localStorage.removeItem(CFG_KEY);
    } catch (e) { /* storage unavailable: config lives for this page load only */ }
    status = { state: 'idle', at: null, error: null };
  }

  function setStatus(state, error = null) {
    status = { state, at: state === 'ok' ? Date.now() : status.at, error };
    hooks?.onStatus?.();
  }

  // ---- data shape ----
  // Shapes, migration and record merging live in model.js so every client agrees.
  const normalize = d => Model.normalize(d);
  const merge = (a, b) => Model.merge(a, b);
  const canonical = d => JSON.stringify(merge(d, normalize({})));

  // ---- GitHub API ----

  // UTF-8 safe base64 (btoa alone breaks on ą, č, ę…)
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  async function api(c, path, opts = {}) {
    let res;
    try {
      res = await fetch(`${API}/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`, {
        ...opts,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${c.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch (e) {
      const err = new Error('Nėra ryšio su GitHub');
      err.offline = true;
      throw err;
    }
    return res;
  }

  function httpError(res) {
    const msg = {
      401: 'GitHub nepriėmė token. Gal baigėsi jo galiojimas?',
      403: 'Token neturi teisės rašyti į šią repozitoriją',
      404: 'Repozitorija nerasta arba token neturi prieigos prie jos',
    }[res.status] || `GitHub klaida (${res.status})`;
    return new Error(msg);
  }

  const filePath = () => `/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;

  async function fetchRemote() {
    const res = await api(cfg, filePath());
    if (res.status === 404) return { data: null, sha: null };
    if (!res.ok) throw httpError(res);
    const j = await res.json();
    return { data: normalize(JSON.parse(b64decode(j.content))), sha: j.sha };
  }

  function pushRemote(data, sha) {
    const body = {
      message: `Atnaujinta ${new Date().toISOString()}`,
      content: b64encode(JSON.stringify(data, null, 2) + '\n'),
      ...(sha ? { sha } : {}),
    };
    return api(cfg, filePath(), { method: 'PUT', body: JSON.stringify(body) });
  }

  // ---- public ----

  async function run() {
    if (!cfg || !hooks) return;
    if (running) { again = true; return; }
    running = true;
    clearTimeout(timer);
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await fetchRemote();
        const merged = remote.data ? merge(hooks.getLocal(), remote.data) : merge(hooks.getLocal(), normalize({}));
        if (remote.data) hooks.applyRemote(merged);
        if (remote.data && canonical(remote.data) === canonical(merged)) { setStatus('ok'); return; }
        const res = await pushRemote(merged, remote.sha);
        // 409/422: another device wrote in between; fetch again and re-merge.
        if (res.status === 409 || res.status === 422) continue;
        if (!res.ok) throw httpError(res);
        setStatus('ok');
        return;
      }
      throw new Error('Nepavyko sinchronizuoti, bandysiu vėliau');
    } catch (e) {
      setStatus(e.offline || !navigator.onLine ? 'offline' : 'error', e.message);
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
  }

  function schedule(delay = 2000) {
    if (!cfg) return;
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  async function connect(next) {
    if (!next.owner || !next.repo || !next.token) throw new Error('Užpildyk visus laukus');
    const res = await api(next, '');
    if (!res.ok) throw httpError(res);
    const repo = await res.json();
    if (!repo.private) throw new Error('Ši repozitorija vieša. Užduotis matytų visi, todėl naudok privačią.');
    if (repo.permissions && !repo.permissions.push) throw new Error('Token neturi teisės rašyti į šią repozitoriją');
    configure(next);
    await run();
    if (status.state === 'error') throw new Error(status.error);
  }

  return {
    init: h => { hooks = h; },
    config: () => (cfg ? { owner: cfg.owner, repo: cfg.repo } : null),
    status: () => status,
    configure, connect, run, schedule, merge, normalize,
  };
})();

window.addEventListener('online', () => Sync.run());
