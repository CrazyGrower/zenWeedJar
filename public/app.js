const CAP_COLORS = ['#79a67e', '#e2a04c', '#b07d9c', '#8fb0d0', '#d08fa8'];

function swatchesHtml(current) {
  const chosen = StashModel.capColor(current);
  const colors = CAP_COLORS.includes(chosen) ? CAP_COLORS : [...CAP_COLORS, chosen];
  return `<fieldset class="swatches"><legend>COUVERCLE</legend>${colors.map((c) =>
    `<label class="swatch" style="--c:${c}" title="${c}"><input type="radio" name="color_tag" value="${c}"${c === chosen ? ' checked' : ''}><span></span></label>`,
  ).join('')}</fieldset>`;
}

async function takeFromJar(jar, n) {
  // the card may have been opened before the last reload landed
  const fresh = jars.find((j) => j.id === jar.id) || jar;
  try {
    await Api.update(jar.id, { weight_g: StashModel.takeGrams(fresh.weight_g, n) });
  } catch (err) {
    alert(err.message);
  }
  await loadAndRender();
}

function openForm(jar) {
  const dlg = document.getElementById('form-dialog');
  const editing = !!jar;
  const j = jar || { name: '', harvest_date: '', weight_g: '', thc_percent: '', indica_pct: '', notes: '', color_tag: CAP_COLORS[0] };

  dlg.innerHTML = `
    <form method="dialog" class="modal">
      <h2>${editing ? 'EDITER' : 'NOUVEAU BOCAL'}</h2>
      <div class="row"><label>NOM *</label><input name="name" value="${escapeHtml(j.name)}" required></div>
      <div class="row"><label>RÉCOLTE (ex 13/07)</label><input name="harvest_date" value="${escapeHtml(j.harvest_date || '')}"></div>
      <div class="row"><label>POIDS (g) *</label><input name="weight_g" type="number" step="0.1" min="0" value="${j.weight_g}" required></div>
      <div class="row"><label>THC %</label><input name="thc_percent" type="number" step="0.1" min="0" value="${j.thc_percent ?? ''}"></div>
      <div class="row"><label>% INDICA (0-100)</label><input name="indica_pct" type="number" step="1" min="0" max="100" value="${j.indica_pct ?? ''}"></div>
      <div class="row">${swatchesHtml(j.color_tag || CAP_COLORS[0])}</div>
      <div class="row"><label>NOTES</label><textarea name="notes" rows="2">${escapeHtml(j.notes || '')}</textarea></div>
      <div class="actions">
        <button class="btn btn--primary" value="save">${editing ? 'ENREGISTRER' : 'AJOUTER'}</button>
        <button class="btn btn--ghost" value="cancel" formnovalidate>ANNULER</button>
      </div>
    </form>`;

  const form = dlg.querySelector('form');
  form.addEventListener('submit', async (e) => {
    // NOTE: deviation from the brief's snippet. `form.returnValue` is only
    // written by the browser's <form method="dialog"> default action, which
    // runs AFTER this submit handler — so checking it here always sees the
    // stale pre-submit value and never detects the cancel button. The
    // submit event's `submitter` reflects the button that was actually
    // activated and is available synchronously, so use that instead.
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    try {
      if (editing) await Api.update(jar.id, data);
      else await Api.create(data);
      dlg.close();
      await loadAndRender();
    } catch (err) {
      alert(err.message);
      await loadAndRender();
      // A 400 means the user can fix the input right there (e.g. a bad
      // name) — keep the dialog open so they don't retype everything.
      // Any other failure (404 because the jar was deleted elsewhere,
      // 500, network drop) isn't fixable by resubmitting this form, so
      // close it and let the re-synced shelf reflect reality.
      if (err.status !== 400) dlg.close();
    }
  });
  dlg.showModal();
}

async function adjustWeight(jar) {
  const input = prompt(`Ajuster le poids de ${jar.name} (ex -2 pour retirer 2g, +5 pour ajouter)`, '-2');
  if (input == null) return;
  const delta = Number(input);
  if (!Number.isFinite(delta)) return alert('Valeur invalide');
  const next = Math.max(0, jar.weight_g + delta);
  try {
    await Api.update(jar.id, { weight_g: next });
    await loadAndRender();
  } catch (err) {
    alert(err.message);
    await loadAndRender();
  }
}

async function removeJar(jar) {
  if (!confirm(`Supprimer le bocal "${jar.name}" (${jar.weight_g}g) ?`)) return;
  try {
    await Api.remove(jar.id);
    await loadAndRender();
  } catch (err) {
    alert(err.message);
    await loadAndRender();
  }
}

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function openDetail(jar) {
  const dlg = document.getElementById('detail-dialog');
  const indica = jar.indica_pct == null ? null : clampPct(jar.indica_pct);
  const thc = jar.thc_percent == null ? null : clampPct(jar.thc_percent);
  const weight = Number.isFinite(Number(jar.weight_g)) ? Number(jar.weight_g) : 0;

  dlg.innerHTML = `
    <div class="modal">
      <h2>${escapeHtml(jar.name)}</h2>
      <div class="sub">RÉCOLTE ${escapeHtml(jar.harvest_date || '—')}</div>

      <div class="row"><label>POIDS</label>
        <div class="weight">${escapeHtml(StashModel.formatTapeGrams(weight))}</div></div>

      <div class="row"><label>RETIRER</label><div class="take">
        <button class="btn btn--take" data-take="0.5">-0,5 g</button>
        <button class="btn btn--take" data-take="1">-1 g</button>
        <button class="btn btn--take" data-take="2">-2 g</button>
      </div></div>

      ${thc == null ? '' : `<div class="row"><label>THC · ${escapeHtml(String(jar.thc_percent))}%</label>
        <div class="bar"><span style="width:${thc}%"></span></div></div>`}

      ${indica == null ? '' : `<div class="row"><label>INDICA ${indica}% / SATIVA ${100 - indica}%</label>
        <div class="bar ratio"><div class="i" style="width:${indica}%"></div>
        <div class="s" style="width:${100 - indica}%"></div></div></div>`}

      ${!jar.notes ? '' : `<div class="row"><label>NOTES</label>
        <div class="stats__line">${escapeHtml(jar.notes)}</div></div>`}

      <div class="actions">
        <button class="btn btn--primary" data-act="adjust">AJUSTER POIDS</button>
        <button class="btn btn--edit" data-act="edit">EDITER</button>
        <button class="btn btn--del" data-act="delete">SUPPRIMER</button>
        <button class="btn btn--ghost" data-act="close">FERMER</button>
      </div>
    </div>`;

  dlg.querySelector('[data-act="close"]').onclick = () => dlg.close();
  dlg.querySelector('[data-act="edit"]').onclick = () => { dlg.close(); openForm(jar); };
  dlg.querySelector('[data-act="adjust"]').onclick = () => { dlg.close(); adjustWeight(jar); };
  dlg.querySelector('[data-act="delete"]').onclick = () => { dlg.close(); removeJar(jar); };
  dlg.querySelectorAll('[data-take]').forEach((b) => {
    b.onclick = () => { dlg.close(); takeFromJar(jar, Number(b.dataset.take)); };
  });
  if (window.Scene3D && window.Scene3D.select) {
    window.Scene3D.select(jar.id);
    dlg.addEventListener('close', () => window.Scene3D.select(null), { once: true });
  }
  dlg.showModal();
}

// --- the movement journal ----------------------------------------------------

// One decimal: the shelf deals in tenths of a gram and a pixel label has no
// room for more. An ASCII hyphen, not U+2212 — the pixel fonts have no glyph
// for a real minus sign and would render tofu.
function formatDelta(delta_g) {
  const n = Number(delta_g);
  if (!Number.isFinite(n)) return '0g';
  const g = Math.round(n * 10) / 10;
  if (g === 0) return '0g';
  return `${g > 0 ? '+' : '-'}${Math.abs(g)}g`;
}

// SQLite's CURRENT_TIMESTAMP is UTC and has no zone suffix; new Date() would
// read "2026-08-16 21:34:00" as local time and shift the whole journal by the
// local offset. Appending Z makes the parse explicit.
function formatStamp(created_at) {
  const d = new Date(`${String(created_at).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function eventLine(ev) {
  const total = Math.round(Number(ev.total_after_g) || 0);
  return `${formatStamp(ev.created_at)} · ${formatDelta(ev.delta_g)} · ${ev.jar_name} · → ${total}g`;
}

// The newest movement, in one line under the title. textContent, not HTML:
// the jar name never needs escaping here.
function renderLastMove(events) {
  const el = document.getElementById('hud-last');
  if (!el) return;
  const ev = (events || [])[0];
  el.textContent = ev ? `Dernier mouvement : ${formatDelta(ev.delta_g)} ${ev.jar_name}` : '';
}

// --- stats and runway --------------------------------------------------------

const DAY_MS = 86400000;

function formatGrams(g) {
  return `${Math.round((Number(g) || 0) * 10) / 10}`;
}

// The same short label on the sign and in the modal. Tilde, not ≈ — the pixel
// fonts have no glyph for it, same as the minus sign.
function formatRunway(stats) {
  if (!stats || !stats.ready || stats.days_left == null) return '';
  const d = stats.days_left;
  if (d < 1) return '<1 J';
  if (d > 365) return '>1 AN';
  return `~${Math.round(d)} J`;
}

function formatTrend(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return '—';
  const n = Math.round(Number(pct));
  if (n === 0) return '0%';
  return `${n > 0 ? '+' : '-'}${Math.abs(n)}%`;
}

function runwayDate(days_left, now = new Date()) {
  if (days_left == null) return '';
  const d = new Date(now.getTime() + days_left * DAY_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

function statsBody(stats, now = new Date()) {
  const runway = formatRunway(stats);
  const head = !stats.ready
    ? '<div class="log__empty">PAS ENCORE ASSEZ DE DONNÉES — il faut une semaine de mouvements.</div>'
    : runway === ''
      ? '<div class="log__empty">Aucune conso sur 30 jours : pas de date de fin.</div>'
      : `<div class="stats__big">${runway}</div>
         <div class="sub">JUSQU'AU ${runwayDate(stats.days_left, now)}</div>`;

  const rate = !stats.ready ? '' : `
    <div class="row"><label>CONSO MOYENNE (${Math.round(stats.window_days)}J)</label>
      <div class="stats__line">${formatGrams(stats.per_day_g)} g/j · ${formatGrams(stats.per_day_g * 7)} g/sem</div></div>
    <div class="row"><label>7 DERNIERS JOURS VS MOYENNE</label>
      <div class="stats__line">${formatTrend(stats.trend_pct)}</div></div>`;

  const max = Math.max(0, ...stats.daily.map((d) => d.g));
  const bars = stats.daily.map((d) => {
    const h = max > 0 ? Math.round((d.g / max) * 100) : 0;
    const [, m, day] = String(d.day).split('-');
    const tip = `${day}/${m} · ${formatGrams(d.g)}g`;
    // The column is full height so an empty day is still a target; tabindex
    // lets a tap focus it on a phone, where there is no hover.
    return `<div class="stats__col" tabindex="0" data-tip="${escapeHtml(tip)}">` +
      `<div class="stats__bar" style="height:${h}%"></div></div>`;
  }).join('');

  const top = stats.top.length === 0 ? '' : `
    <div class="row"><label>+ CONSOMMÉ (30J)</label>
      <div class="stats__line">${stats.top
        .map((t) => `${escapeHtml(t.name)} ${formatGrams(t.g)}g`).join(' · ')}</div></div>`;

  return `${head}${rate}
    <div class="row"><label>14 DERNIERS JOURS</label><div class="stats__bars">${bars}</div></div>
    ${top}`;
}

async function openHistory(tab = 'journal') {
  const dlg = document.getElementById('history-dialog');
  let events;
  try {
    events = await Api.events();
  } catch (err) {
    alert(err.message);
    return;
  }
  // Stats are a second pane: if they fail, the journal still opens.
  let stats = null;
  try {
    stats = await Api.stats();
  } catch (err) {
    stats = null;
  }
  const journal = events.length === 0
    ? '<div class="log__empty">Aucun mouvement enregistré</div>'
    : `<div class="log">${events
        .map((ev) => `<div class="log__line">${escapeHtml(eventLine(ev))}</div>`)
        .join('')}</div>`;
  const statsPane = stats
    ? statsBody(stats)
    : '<div class="log__empty">Stats indisponibles</div>';

  dlg.innerHTML = `
    <div class="modal">
      <h2>STASH</h2>
      <div class="tabs">
        <button class="tab" data-tab="journal">JOURNAL</button>
        <button class="tab" data-tab="stats">STATS</button>
      </div>
      <div data-pane="journal"><div class="sub">MOUVEMENTS DU STASH</div>${journal}</div>
      <div data-pane="stats">${statsPane}</div>
      <div class="actions">
        <button class="btn btn--ghost" data-act="close">FERMER</button>
      </div>
    </div>`;

  const show = (name) => {
    ['journal', 'stats'].forEach((t) => {
      const pane = dlg.querySelector(`[data-pane="${t}"]`);
      const btn = dlg.querySelector(`[data-tab="${t}"]`);
      if (pane) pane.hidden = t !== name;
      if (btn) btn.className = `tab${t === name ? ' tab--on' : ''}`;
    });
  };
  ['journal', 'stats'].forEach((t) => {
    dlg.querySelector(`[data-tab="${t}"]`).onclick = () => show(t);
  });
  show(tab);
  dlg.querySelector('[data-act="close"]').onclick = () => dlg.close();
  dlg.showModal();
}

let jars = [];

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PREF_MODE_KEY = 'pixelstash.window';

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch (err) { return fallback; }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch (err) { /* private mode: keep the choice for this visit only */ }
}

function fallbackHtml(list) {
  if (!list || list.length === 0) return '<p class="fallback__empty">Aucun bocal pour l’instant.</p>';
  return list.map((jar) => `<button class="fallback__jar" type="button" data-id="${Number(jar.id)}">` +
    `<span>${escapeHtml(jar.name)}</span><b>${escapeHtml(StashModel.formatTapeGrams(jar.weight_g))}</b></button>`).join('');
}

// The 3D shelf when WebGL is there, a plain list of buttons otherwise.
function renderJars(list) {
  const S = window.Scene3D;
  if (S && S.isMounted()) { S.setJars(list); return; }
  const box = document.getElementById('fallback');
  if (!box) return;
  box.hidden = false;
  box.innerHTML = fallbackHtml(list);
  box.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => {
      const jar = jars.find((j) => j.id === Number(el.dataset.id));
      if (jar) openDetail(jar);
    });
  });
}

function mountScene() {
  const S = window.Scene3D;
  const canvas = document.getElementById('scene');
  if (!canvas) return false;
  if (!S) { canvas.hidden = true; return false; }
  // The HUD and the bottom bar float over the canvas; the scene frames the
  // shelves in the band left between them.
  const height = (sel) => { const el = document.querySelector(sel); return el ? el.offsetHeight : 0; };
  const ok = S.mount(canvas, document.getElementById('labels'), {
    mode: readPref(PREF_MODE_KEY, 'sunset'),
    insets: () => ({ top: height('.hud'), bottom: height('.bottom') }),
  });
  if (!ok) { canvas.hidden = true; return false; }
  // the HUD grows when the last-move line or the offline notice fills in
  if (typeof ResizeObserver !== 'undefined' && S.refit) {
    const ro = new ResizeObserver(() => S.refit());
    ['.hud', '.bottom'].forEach((sel) => { const el = document.querySelector(sel); if (el) ro.observe(el); });
  }
  S.onJarClick((id) => {
    const jar = jars.find((j) => j.id === id);
    if (jar) openDetail(jar);
  });
  return true;
}

function showMode(mode) {
  document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}

function renderHud(list) {
  const total = Math.round(list.reduce((s, j) => s + j.weight_g, 0));
  document.getElementById('hud-total').textContent = `${total}g`;
}

function setOfflineNotice(show) {
  const existing = document.getElementById('offline-notice');
  if (!show) {
    if (existing) existing.remove();
    return;
  }
  document.getElementById('hud-total').textContent = 'HORS LIGNE';
  if (existing) return;
  const notice = document.createElement('div');
  notice.id = 'offline-notice';
  notice.className = 'hud__offline';
  notice.textContent = 'Serveur injoignable. Nouvel essai au prochain chargement.';
  document.querySelector('.hud').appendChild(notice);
}

async function loadAndRender() {
  try {
    jars = await Api.list();
    renderHud(jars);
    renderJars(jars);
    setOfflineNotice(false);
  } catch (err) {
    jars = [];
    renderJars([]);
    renderLastMove([]);
    const eta = document.getElementById('hud-eta');
    if (eta) eta.textContent = '';
    setOfflineNotice(true);
    return jars;
  }
  // Its own try: the journal is a garnish, and losing it must not blank the
  // shelves that just loaded fine.
  try {
    renderLastMove(await Api.events(1));
  } catch (err) {
    renderLastMove([]);
  }
  // Same for the runway under the total: a garnish, blank when unavailable.
  const eta = document.getElementById('hud-eta');
  if (eta) {
    try {
      eta.textContent = formatRunway(await Api.stats());
    } catch (err) {
      eta.textContent = '';
    }
  }
  return jars;
}

document.addEventListener('DOMContentLoaded', () => {
  mountScene();
  showMode(readPref(PREF_MODE_KEY, 'sunset'));
  loadAndRender();
  document.getElementById('add-btn').addEventListener('click', () => openForm());
  document.getElementById('hud-tag').addEventListener('click', () => openHistory());
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.mode;
    writePref(PREF_MODE_KEY, mode);
    showMode(mode);
    if (window.Scene3D && window.Scene3D.isMounted()) window.Scene3D.setMode(mode);
  }));
});
