// TEMPORARY STUB — replaced by Task 9 (openForm).
// Remove this once the real implementation lands.
function openForm() {}

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

function maxWeight() { return jars.reduce((m, j) => Math.max(m, j.weight_g), 0); }

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
  const max = maxWeight();
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
      if (jar) openDetail(jar); // defined in Task 8
    });
  });
}

function renderHud() {
  const total = Math.round(jars.reduce((s, j) => s + j.weight_g, 0));
  document.getElementById('hud-total').textContent = `${total}g`;
}

async function loadAndRender() {
  jars = await Api.list();
  renderHud();
  renderShelves(jars);
  return jars;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndRender();
  document.getElementById('add-btn').addEventListener('click', () => openForm()); // defined in Task 9
});
