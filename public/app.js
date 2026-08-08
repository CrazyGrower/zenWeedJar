const CAP_COLORS = ['#79a67e', '#e2a04c', '#b07d9c', '#8fb0d0', '#d08fa8'];

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
      <div class="row"><label>COULEUR BOUCHON</label><input name="color_tag" value="${escapeHtml(j.color_tag || CAP_COLORS[0])}"></div>
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
        <div style="font-family:'Press Start 2P';font-size:16px;">${weight} g</div></div>

      ${thc == null ? '' : `<div class="row"><label>THC · ${escapeHtml(String(jar.thc_percent))}%</label>
        <div class="bar"><span style="width:${thc}%"></span></div></div>`}

      ${indica == null ? '' : `<div class="row"><label>INDICA ${indica}% / SATIVA ${100 - indica}%</label>
        <div class="bar ratio"><div class="i" style="width:${indica}%"></div>
        <div class="s" style="width:${100 - indica}%"></div></div></div>`}

      ${!jar.notes ? '' : `<div class="row"><label>NOTES</label>
        <div style="font-size:10px;line-height:1.6;color:#efe6cf;">${escapeHtml(jar.notes)}</div></div>`}

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
  dlg.showModal();
}

let jars = [];

function maxWeight(list) { return list.reduce((m, j) => Math.max(m, j.weight_g), 0); }

function ghostSlot() {
  return `<div class="slot"><svg class="jar ghost" viewBox="0 0 32 46" shape-rendering="crispEdges">
    <use href="#sil" fill="none" stroke="rgba(247,233,207,.20)" stroke-width="0.7"/></svg></div>`;
}

function filledSlot(jar, max) {
  return `<div class="slot"><div class="jarwrap" data-id="${jar.id}">
    ${JarSvg.buildJar(jar, max)}
    <div class="label"><span class="n">${escapeHtml(jar.name)}</span>
      <span class="d">${escapeHtml(jar.harvest_date || '')}</span></div>
  </div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderShelves(list) {
  const PER_ROW = 6;
  const rows = Math.max(2, Math.ceil(list.length / PER_ROW));
  const max = maxWeight(list);
  const cells = list.map((j) => filledSlot(j, max));
  while (cells.length < rows * PER_ROW) cells.push(ghostSlot());

  let html = '';
  for (let r = 0; r < rows; r++) {
    const slots = cells.slice(r * PER_ROW, r * PER_ROW + PER_ROW).join('');
    html += `<div class="shelf"><div class="shelf__row">${slots}</div><div class="shelf__plank"></div></div>`;
  }
  const container = document.getElementById('shelves');
  container.innerHTML = html;

  container.querySelectorAll('.jarwrap').forEach((el) => {
    el.addEventListener('click', () => {
      const jar = jars.find((j) => j.id === Number(el.dataset.id));
      if (jar) openDetail(jar);
    });
  });
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
  notice.className = 'hud__label';
  notice.textContent = 'Serveur injoignable. Nouvel essai au prochain chargement.';
  document.querySelector('.hud__tag').appendChild(notice);
}

async function loadAndRender() {
  try {
    jars = await Api.list();
    renderHud(jars);
    renderShelves(jars);
    setOfflineNotice(false);
    return jars;
  } catch (err) {
    jars = [];
    renderShelves([]);
    setOfflineNotice(true);
    return jars;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();
  document.getElementById('add-btn').addEventListener('click', () => openForm());
});
