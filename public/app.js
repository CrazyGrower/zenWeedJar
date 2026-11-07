const CAP_COLORS = ['#79a67e', '#e2a04c', '#b07d9c', '#8fb0d0', '#d08fa8'];

function swatchesHtml(current) {
  const chosen = StashModel.capColor(current);
  const colors = CAP_COLORS.includes(chosen) ? CAP_COLORS : [...CAP_COLORS, chosen];
  return `<fieldset class="swatches"><legend>COUVERCLE</legend>${colors.map((c) =>
    `<label class="swatch" style="--c:${c}" title="${c}"><input type="radio" name="color_tag" value="${c}"${c === chosen ? ' checked' : ''}><span></span></label>`,
  ).join('')}</fieldset>`;
}

// The weed colour, picked like the cap. A jar saved before this existed shows
// the colour it already had on the shelf.
function budSwatchesHtml(current, capTag) {
  const chosen = StashModel.budKey(current, capTag);
  return `<fieldset class="swatches"><legend>WEED</legend>${StashModel.BUD_KEYS.map((k) =>
    `<label class="swatch swatch--bud" style="--c:${StashModel.budSwatch(k)}" title="${StashModel.BUD_PALETTES[k].label}"><input type="radio" name="bud_color" value="${k}" aria-label="${StashModel.BUD_PALETTES[k].label}"${k === chosen ? ' checked' : ''}><span></span></label>`,
  ).join('')}</fieldset>`;
}

// 'share' marks grams that went to someone else: the server keeps them out of
// the consumption stats. 'self' is the default and is not sent at all.
function withReason(data, reason) {
  return reason === 'share' ? { ...data, reason } : data;
}

// Whose weed the jar holds, picked at creation and changeable in EDITER.
// Radios, not buttons, so the choice rides along in the form's FormData.
function ownerHtml(current) {
  const pick = current === 'other' ? 'other' : 'self';
  const opt = (v, label) =>
    `<label class="owner"><input type="radio" name="owner" value="${v}"${v === pick ? ' checked' : ''}><span>${label}</span></label>`;
  return `<fieldset class="owners"><legend>À QUI</legend>${opt('self', 'À MOI')}${opt('other', 'PAS À MOI')}</fieldset>`;
}

function ownerTag(jar) {
  return jar && jar.owner === 'other' ? ' · PAS À MOI' : '';
}

function openForm(jar) {
  const dlg = document.getElementById('form-dialog');
  const editing = !!jar;
  const j = jar || { name: '', harvest_date: '', weight_g: '', color_tag: CAP_COLORS[0], bud_color: 'green', owner: 'self' };

  dlg.innerHTML = `
    <form method="dialog" class="modal">
      <h2>${editing ? 'EDITER' : 'NOUVEAU BOCAL'}</h2>
      <div class="row"><label>NOM *</label><input name="name" value="${escapeHtml(j.name)}" required></div>
      <div class="row"><label>RÉCOLTE (ex 13/07)</label><input name="harvest_date" value="${escapeHtml(j.harvest_date || '')}"></div>
      <div class="row"><label>POIDS (g) *</label><input name="weight_g" type="number" step="0.1" min="0" value="${j.weight_g}" required></div>
      <div class="row">${ownerHtml(j.owner)}</div>
      <div class="row">${swatchesHtml(j.color_tag || CAP_COLORS[0])}</div>
      <div class="row">${budSwatchesHtml(j.bud_color, j.color_tag)}</div>
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

// Reads what was typed in the adjust box. A French phone keyboard gives a
// comma, so both separators count; anything else, or zero, is no amount.
function parseGrams(text) {
  const t = String(text == null ? '' : text).trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Math.round(Number(t) * 10) / 10;
  return n > 0 ? n : null;
}

// The weight the jar ends at, never below zero; null when there is no amount.
function adjustTarget(weight_g, mode, text) {
  const n = parseGrams(text);
  if (n == null) return null;
  const w = Number(weight_g) || 0;
  return mode === 'add' ? Math.round((w + n) * 10) / 10 : StashModel.takeGrams(w, n);
}

// A two-button pick (RETIRER / AJOUTER, MOI / PARTAGE): lights the chosen one
// and reports its value.
function wireToggle(dlg, attr, onPick) {
  const buttons = dlg.querySelectorAll(`[${attr}]`);
  buttons.forEach((b) => {
    b.onclick = () => {
      const value = b.getAttribute(attr);
      buttons.forEach((o) => {
        const on = o.getAttribute(attr) === value;
        o.className = `btn btn--for${on ? ' btn--for-on' : ''}`;
        o.setAttribute('aria-checked', String(on));
      });
      onPick(value);
    };
  });
}

function openAdjust(jar) {
  const dlg = document.getElementById('form-dialog');
  const fresh = () => jars.find((j) => j.id === jar.id) || jar;
  let mode = 'take';
  // MOI each time: sharing is the exception, and a remembered PARTAGE would
  // silently hide your own consumption.
  let reason = 'self';

  dlg.innerHTML = `
    <form method="dialog" class="modal" novalidate>
      <h2>AJUSTER</h2>
      <div class="sub">${escapeHtml(jar.name)}${ownerTag(jar)}</div>

      <div class="row"><div class="for" role="radiogroup" aria-label="Sens">
        <button type="button" class="btn btn--for btn--for-on" data-mode="take" role="radio" aria-checked="true">RETIRER</button>
        <button type="button" class="btn btn--for" data-mode="add" role="radio" aria-checked="false">AJOUTER</button>
      </div></div>

      <div class="row" data-for-row><label>POUR</label><div class="for" role="radiogroup" aria-label="Pour qui">
        <button type="button" class="btn btn--for btn--for-on" data-for="self" role="radio" aria-checked="true">MOI</button>
        <button type="button" class="btn btn--for" data-for="share" role="radio" aria-checked="false">PARTAGE</button>
      </div></div>

      <div class="row"><label for="adjust-g">QUANTITÉ (g)</label><div class="stepper">
        <button type="button" class="btn btn--take" data-step="-0.5" aria-label="moins 0,5 g">-</button>
        <input id="adjust-g" name="grams" inputmode="decimal" autocomplete="off" value="2">
        <button type="button" class="btn btn--take" data-step="0.5" aria-label="plus 0,5 g">+</button>
      </div></div>

      <div class="adjust__preview" aria-live="polite"></div>

      <div class="actions">
        <button class="btn btn--primary" value="save">VALIDER</button>
        <button class="btn btn--ghost" value="cancel" formnovalidate>ANNULER</button>
      </div>
    </form>`;

  const form = dlg.querySelector('form');
  const input = dlg.querySelector('#adjust-g');
  const preview = dlg.querySelector('.adjust__preview');
  const save = dlg.querySelector('[value="save"]');
  const forRow = dlg.querySelector('[data-for-row]');
  const paint = () => {
    // grams added are a restock, never "shared": the pick only shows on a withdrawal
    if (forRow) forRow.hidden = mode !== 'take';
    const w = fresh().weight_g;
    const next = adjustTarget(w, mode, input.value);
    save.disabled = next == null || next === Math.round((Number(w) || 0) * 10) / 10;
    preview.textContent = next == null
      ? 'Quantité invalide'
      : `${StashModel.formatTapeGrams(w)}  ->  ${StashModel.formatTapeGrams(next)}`;
  };

  wireToggle(dlg, 'data-mode', (v) => { mode = v; paint(); });
  wireToggle(dlg, 'data-for', (v) => { reason = v; });
  dlg.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const n = (parseGrams(input.value) || 0) + Number(b.dataset.step);
      input.value = String(Math.max(0.5, Math.round(n * 10) / 10)).replace('.', ',');
      paint();
    };
  });
  input.addEventListener('input', paint);

  form.addEventListener('submit', async (e) => {
    // submitter, not returnValue: see the note in openForm
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const next = adjustTarget(fresh().weight_g, mode, input.value);
    if (next == null) return;
    dlg.close();
    try {
      await Api.update(jar.id, withReason({ weight_g: next }, mode === 'take' ? reason : 'self'));
    } catch (err) {
      alert(err.message);
    }
    await loadAndRender();
  });

  paint();
  dlg.showModal();
  if (input.select) input.select();
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

function openDetail(jar) {
  const dlg = document.getElementById('detail-dialog');
  const weight = Number.isFinite(Number(jar.weight_g)) ? Number(jar.weight_g) : 0;

  dlg.innerHTML = `
    <div class="modal">
      <h2>${escapeHtml(jar.name)}</h2>
      <div class="sub">RÉCOLTE ${escapeHtml(jar.harvest_date || '—')}${ownerTag(jar)}</div>

      <div class="row"><label>POIDS</label>
        <div class="weight">${escapeHtml(StashModel.formatTapeGrams(weight))}</div></div>

      <div class="actions">
        <button class="btn btn--primary" data-act="adjust">AJUSTER POIDS</button>
        <button class="btn btn--edit" data-act="edit">EDITER</button>
        <button class="btn btn--del" data-act="delete">SUPPRIMER</button>
        <button class="btn btn--ghost" data-act="close">FERMER</button>
      </div>
    </div>`;

  dlg.querySelector('[data-act="close"]').onclick = () => dlg.close();
  dlg.querySelector('[data-act="edit"]').onclick = () => { dlg.close(); openForm(jar); };
  dlg.querySelector('[data-act="adjust"]').onclick = () => { dlg.close(); openAdjust(jar); };
  dlg.querySelector('[data-act="delete"]').onclick = () => { dlg.close(); removeJar(jar); };
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

// A shared withdrawal says so, so the journal explains why it is missing
// from the consumption stats.
function eventName(ev) {
  return ev.kind === 'share' ? `${ev.jar_name} (PARTAGE)` : ev.jar_name;
}

function eventLine(ev) {
  const total = Math.round(Number(ev.total_after_g) || 0);
  return `${formatStamp(ev.created_at)} · ${formatDelta(ev.delta_g)} · ${eventName(ev)} · → ${total}g`;
}

// The newest movement, in one line under the title. textContent, not HTML:
// the jar name never needs escaping here.
function renderLastMove(events) {
  const el = document.getElementById('hud-last');
  if (!el) return;
  const ev = (events || [])[0];
  el.textContent = ev ? `Dernier mouvement : ${formatDelta(ev.delta_g)} ${eventName(ev)}` : '';
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
  // with the year: a runway past a year would otherwise not say which April
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Under the total on the sign: the day the stash runs out, which reads faster
// than a count of days. The year only when it is not this one — the sign is
// narrow, and "16/12" needs no more.
function hudRunway(stats, now = new Date()) {
  if (!stats || !stats.ready || stats.days_left == null) return '';
  const d = new Date(now.getTime() + stats.days_left * DAY_MS);
  const p = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear() === now.getFullYear() ? '' : `/${String(d.getFullYear()).slice(2)}`;
  return `jusqu'au ${p(d.getDate())}/${p(d.getMonth() + 1)}${year}`;
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

  // Shared grams are not consumption, but they do bring the run-out date
  // closer — this line says why the date and the rate don't line up.
  const shared = !(Number(stats.shared_g) > 0) ? '' : `
    <div class="row"><label>PARTAGÉ (30J) · HORS CONSO</label>
      <div class="stats__line">${formatGrams(stats.shared_g)} g · compté dans la date de fin</div></div>`;

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

  // Someone else's jars count in the stash; this says how much is theirs.
  const others = !(Number(stats.others_g) > 0) ? '' : `
    <div class="row"><label>EN RÉSERVE</label>
      <div class="stats__line">${formatGrams(stats.total_g)} g · dont ${formatGrams(stats.others_g)} g pas à moi</div></div>`;

  return `${head}${rate}${shared}${others}
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

// The window follows the clock: sunset light at dawn and dusk, day between,
// night after. ?scene=day (or sunset, night) pins one, to look at it.
function currentScene(now = new Date(), search = '') {
  const pinned = new URLSearchParams(search).get('scene');
  return ['sunset', 'day', 'night'].includes(pinned) ? pinned : StashModel.sceneAt(now);
}

function pageSearch() {
  return typeof location === 'undefined' ? '' : location.search;
}

function syncScene() {
  const S = window.Scene3D;
  if (S && S.isMounted()) S.setMode(currentScene(new Date(), pageSearch()));
}

function fallbackHtml(list) {
  if (!list || list.length === 0) return '<p class="fallback__empty">Aucun bocal pour l’instant.</p>';
  return list.map((jar) => `<button class="fallback__jar${jar.owner === 'other' ? ' fallback__jar--other' : ''}" type="button" data-id="${Number(jar.id)}">` +
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
    mode: currentScene(new Date(), pageSearch()),
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
      eta.textContent = hudRunway(await Api.stats());
    } catch (err) {
      eta.textContent = '';
    }
  }
  return jars;
}

document.addEventListener('DOMContentLoaded', () => {
  mountScene();
  loadAndRender();
  // setMode does nothing until the light actually changes
  setInterval(syncScene, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncScene(); });
  document.getElementById('add-btn').addEventListener('click', () => openForm());
  document.getElementById('hud-tag').addEventListener('click', () => openHistory());
});
