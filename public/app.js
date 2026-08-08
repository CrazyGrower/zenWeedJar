// TEMPORARY STUBS — replaced by Task 8 (openDetail) and Task 9 (openForm).
// Remove these once the real implementations land.
function openDetail() {}
function openForm() {}

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
