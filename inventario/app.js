/* ============================================================
   app.js  —  Inventario Pactra
   Frontend conectado a la API REST del servidor (SQLite)
============================================================ */

// ──────────────────────────────────────────────
// API LAYER  (reemplaza localStorage)
// ──────────────────────────────────────────────
const API = {
  async getAll() {
    const r = await fetch('/api/movimientos');
    return r.json();
  },
  async create(record) {
    const r = await fetch('/api/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    return r.json();
  },
  async update(id, record) {
    const r = await fetch(`/api/movimientos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    return r.json();
  },
  async delete(id) {
    const r = await fetch(`/api/movimientos/${id}`, { method: 'DELETE' });
    return r.json();
  },
  async bulk(rows, replace = false) {
    const r = await fetch('/api/movimientos/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows, replace }),
    });
    return r.json();
  },
};

// ──────────────────────────────────────────────
// DATA STORE  (en memoria, sincronizado con API)
// ──────────────────────────────────────────────
let records = [];

async function reloadRecords() {
  try {
    records = await API.getAll();
  } catch (e) {
    console.error('Error cargando datos:', e);
    showToast('Error al conectar con el servidor', 'error');
  }
}

// ──────────────────────────────────────────────
// PAGINATION
// ──────────────────────────────────────────────
let currentPage = 1;
const PAGE_SIZE = 15;
let sortCol = 'fecha';
let sortDir = 'desc';
let filteredRecords = [];

// ──────────────────────────────────────────────
// DOM REFS
// ──────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const mainEl = document.getElementById('main');
const sidebarToggle = document.getElementById('sidebarToggle');
const pageTitleEl = document.getElementById('pageTitle');
const topbarDate = document.getElementById('topbarDate');
const btnNuevo = document.getElementById('btnNuevo');
const btnExport = document.getElementById('btnExport');
const searchInput = document.getElementById('searchInput');
const filterTipo = document.getElementById('filterTipo');
const filterDanado = document.getElementById('filterDanado');
const mainTbody = document.getElementById('mainTbody');
const recentTbody = document.getElementById('recentTbody');
const danosTbody = document.getElementById('danosTbody');
const recordCountEl = document.getElementById('recordCount');
const danosCountEl = document.getElementById('danosCount');
const paginationEl = document.getElementById('pagination');
const badgeDanos = document.getElementById('badge-danos');
const toastContainer = document.getElementById('toastContainer');
// Stats
const statTotal = document.getElementById('statTotal');
const statEntradas = document.getElementById('statEntradas');
const statSalidas = document.getElementById('statSalidas');
const statDanos = document.getElementById('statDanos');
const statPallets = document.getElementById('statPallets');
const statPiezas = document.getElementById('statPiezas');
// Modal
const modalOverlay = document.getElementById('modalOverlay');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalClose = document.getElementById('modalClose');
const movForm = document.getElementById('movForm');
const btnCancelar = document.getElementById('btnCancelar');
const editId = document.getElementById('editId');
const f_tipo = document.getElementById('f_tipo');
const f_fecha = document.getElementById('f_fecha');
const f_cliente = document.getElementById('f_cliente');
const f_contenedor = document.getElementById('f_contenedor');
const f_factura = document.getElementById('f_factura');
const f_modelo = document.getElementById('f_modelo');
const f_lote = document.getElementById('f_lote');
const f_pallets = document.getElementById('f_pallets');
const f_piezas = document.getElementById('f_piezas');
const f_piezas_danadas = document.getElementById('f_piezas_danadas');
// Confirm
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmYes = document.getElementById('confirmYes');
const confirmNo = document.getElementById('confirmNo');
let pendingDeleteId = null;

// ──────────────────────────────────────────────
// DATE
// ──────────────────────────────────────────────
function updateDate() {
  const now = new Date();
  topbarDate.textContent = now.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
updateDate();

// ──────────────────────────────────────────────
// SIDEBAR TOGGLE
// ──────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  mainEl.classList.toggle('expanded');
});

// ──────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────
const views = {
  dashboard: { el: document.getElementById('view-dashboard'), title: 'Dashboard', navId: 'nav-dashboard' },
  movimientos: { el: document.getElementById('view-movimientos'), title: 'Movimientos', navId: 'nav-movimientos' },
  'dañados': { el: document.getElementById('view-dañados'), title: 'Artículos Dañados', navId: 'nav-dañados' },
  'por-modelo': { el: document.getElementById('view-por-modelo'), title: 'Inventario por Modelo', navId: 'nav-por-modelo' },
  'packing': { el: document.getElementById('view-packing'), title: 'Packing List', navId: 'nav-packing' },
};

function showView(name) {
  Object.entries(views).forEach(([key, v]) => {
    v.el.classList.toggle('active', key === name);
    document.getElementById(v.navId).classList.toggle('active', key === name);
  });
  pageTitleEl.textContent = views[name]?.title || '';
  if (name === 'dashboard') renderDashboard();
  if (name === 'movimientos') renderTable();
  if (name === 'dañados') renderDanos();
  if (name === 'por-modelo') renderModelos();
  if (name === 'packing') initPackingView();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    showView(item.dataset.view);
  });
});

// ──────────────────────────────────────────────
// CHIPS / BADGES / HELPERS
// ──────────────────────────────────────────────
function tipoChip(tipo) {
  const map = {
    'Entrada': 'chip-entrada',
    'Salida': 'chip-salida',
    'Transferencia': 'chip-transfer',
    'Devolución': 'chip-dev',
    'Ajuste': 'chip-ajuste',
  };
  return `<span class="chip ${map[tipo] || 'chip-default'}">${tipo || '—'}</span>`;
}

function isDanado(r) {
  return (parseInt(r.piezas_danadas) || 0) > 0 || r.dañado === true;
}

function dañadoCell(r) {
  const qty = parseInt(r.piezas_danadas) || 0;
  if (qty > 0) return `<span class="danado-yes">⚠ ${qty.toLocaleString('es-MX')} pza${qty !== 1 ? 's' : ''}</span>`;
  if (r.dañado === true) return `<span class="danado-yes">⚠ Sí</span>`;
  return `<span class="danado-no">—</span>`;
}

function fmtNum(n) {
  return (parseInt(n) || 0).toLocaleString('es-MX');
}

function fmtDate(d) {
  if (!d) return '—';
  const parts = String(d).split('-');
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  if (!y || !m || !day) return d;
  return `${day.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

// ──────────────────────────────────────────────
// DASHBOARD
// ──────────────────────────────────────────────
function renderDashboard() {
  const total = records.length;
  const entradas = records.filter(r => r.tipo_movimiento === 'Entrada').length;
  const salidas = records.filter(r => r.tipo_movimiento === 'Salida').length;
  const danos = records.filter(r => isDanado(r)).length;
  const pallets = records.reduce((s, r) => s + (parseInt(r.pallets) || 0), 0);
  const piezas = records.reduce((s, r) => s + (parseInt(r.piezas) || 0), 0);

  statTotal.textContent = total.toLocaleString();
  statEntradas.textContent = entradas.toLocaleString();
  statSalidas.textContent = salidas.toLocaleString();
  statDanos.textContent = danos.toLocaleString();
  statPallets.textContent = pallets.toLocaleString();
  statPiezas.textContent = piezas.toLocaleString();

  badgeDanos.textContent = danos;
  badgeDanos.classList.toggle('hidden', danos === 0);

  // Recientes
  const recent = [...records].sort((a, b) => {
    if (b.fecha > a.fecha) return 1;
    if (b.fecha < a.fecha) return -1;
    return b.id_movimiento - a.id_movimiento;
  }).slice(0, 5);

  recentTbody.innerHTML = recent.length
    ? recent.map(r => `
        <tr>
          <td>#${r.id_movimiento}</td>
          <td>${tipoChip(r.tipo_movimiento)}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td>${r.cliente || '—'}</td>
          <td>${r.modelo || '—'}</td>
          <td>${fmtNum(r.piezas)}</td>
          <td>${dañadoCell(r)}</td>
        </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>Sin movimientos aún</p></div></td></tr>`;

  // Breakdown
  const tipos = ['Entrada', 'Salida', 'Transferencia', 'Devolución', 'Ajuste'];
  const colors = { Entrada: '#00d4aa', Salida: '#ff6b6b', Transferencia: '#6c63ff', 'Devolución': '#ffc857', Ajuste: '#4db8ff' };
  document.getElementById('tipoBreakdown').innerHTML = tipos.map(t => {
    const cnt = records.filter(r => r.tipo_movimiento === t).length;
    const pct = total > 0 ? (cnt / total * 100).toFixed(0) : 0;
    return `
      <div class="breakdown-item">
        <label>${t}</label>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar" style="width:${pct}%;background:${colors[t]}"></div>
        </div>
        <span class="breakdown-count">${cnt}</span>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────────
// MAIN TABLE
// ──────────────────────────────────────────────
function applyFilters() {
  const q = searchInput.value.toLowerCase().trim();
  const tipo = filterTipo.value;
  const dano = filterDanado.value;

  filteredRecords = records.filter(r => {
    const matchQ = !q || [r.cliente, r.modelo, r.factura, r.contenedor, r.no_lote, String(r.id_movimiento)]
      .some(f => f && f.toLowerCase().includes(q));
    const matchTipo = !tipo || r.tipo_movimiento === tipo;
    const matchDano = !dano || (dano === 'si' ? isDanado(r) : !isDanado(r));
    return matchQ && matchTipo && matchDano;
  });

  filteredRecords.sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (['pallets', 'piezas', 'id_movimiento', 'piezas_danadas'].includes(sortCol)) {
      va = parseInt(va) || 0; vb = parseInt(vb) || 0;
    } else {
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  currentPage = 1;
}

function renderTable() {
  applyFilters();
  const total = filteredRecords.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRecords = filteredRecords.slice(start, start + PAGE_SIZE);

  recordCountEl.textContent = `${total} registro${total !== 1 ? 's' : ''}`;

  mainTbody.innerHTML = pageRecords.length
    ? pageRecords.map(r => `
        <tr>
          <td><strong>#${r.id_movimiento}</strong></td>
          <td>${tipoChip(r.tipo_movimiento)}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td title="${r.cliente || ''}">${r.cliente || '—'}</td>
          <td title="${r.contenedor || ''}">${r.contenedor || '—'}</td>
          <td title="${r.factura || ''}">${r.factura || '—'}</td>
          <td title="${r.modelo || ''}">${r.modelo || '—'}</td>
          <td>${r.no_lote || '—'}</td>
          <td>${fmtNum(r.pallets)}</td>
          <td>${fmtNum(r.piezas)}</td>
          <td>${dañadoCell(r)}</td>
          <td>
            <div class="actions-cell">
              <button class="btn-icon edit" onclick="openEdit(${r.id_movimiento})" title="Editar">✏️</button>
              <button class="btn-icon del"  onclick="openConfirmDelete(${r.id_movimiento})" title="Eliminar">🗑️</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="12"><div class="empty-state"><div class="empty-icon">🔍</div><p>No se encontraron registros</p></div></td></tr>`;

  renderPagination(total);
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) { paginationEl.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= pages; i++) {
    if (pages <= 7 || Math.abs(i - currentPage) <= 2 || i === 1 || i === pages)
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    else if (Math.abs(i - currentPage) === 3)
      html += `<button class="page-btn" disabled>…</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === pages ? 'disabled' : ''}>›</button>`;
  paginationEl.innerHTML = html;
}

function goPage(p) {
  const pages = Math.ceil(filteredRecords.length / PAGE_SIZE);
  if (p < 1 || p > pages) return;
  currentPage = p;
  renderTable();
}

document.querySelectorAll('.data-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = col; sortDir = 'asc'; }
    renderTable();
  });
});

searchInput.addEventListener('input', () => renderTable());
filterTipo.addEventListener('change', () => renderTable());
filterDanado.addEventListener('change', () => renderTable());

// ──────────────────────────────────────────────
// DAÑADOS VIEW
// ──────────────────────────────────────────────
function renderDanos() {
  const danos = records.filter(r => isDanado(r));
  danosCountEl.textContent = `${danos.length} registro${danos.length !== 1 ? 's' : ''} con daño`;
  danosTbody.innerHTML = danos.length
    ? danos.map(r => `
        <tr>
          <td><strong>#${r.id_movimiento}</strong></td>
          <td>${tipoChip(r.tipo_movimiento)}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td>${r.cliente || '—'}</td>
          <td>${r.contenedor || '—'}</td>
          <td>${r.factura || '—'}</td>
          <td>${r.modelo || '—'}</td>
          <td>${r.no_lote || '—'}</td>
          <td>${fmtNum(r.pallets)}</td>
          <td>${fmtNum(r.piezas)}</td>
          <td>${dañadoCell(r)}</td>
          <td>
            <div class="actions-cell">
              <button class="btn-icon edit" onclick="openEdit(${r.id_movimiento})" title="Editar">✏️</button>
              <button class="btn-icon del"  onclick="openConfirmDelete(${r.id_movimiento})" title="Eliminar">🗑️</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="12"><div class="empty-state"><div class="empty-icon">✅</div><p>Sin artículos dañados registrados</p></div></td></tr>`;
}

// ──────────────────────────────────────────────
// MODAL — OPEN / CLOSE
// ──────────────────────────────────────────────
function openModal() {
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
  movForm.reset();
  editId.value = '';
  modalTitle.textContent = 'Nuevo Movimiento';
}

btnNuevo.addEventListener('click', () => {
  closeModal();
  f_fecha.value = new Date().toISOString().slice(0, 10);
  openModal();
});
modalClose.addEventListener('click', closeModal);
btnCancelar.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

// ──────────────────────────────────────────────
// FORM SUBMIT
// ──────────────────────────────────────────────
movForm.addEventListener('submit', async e => {
  e.preventDefault();
  const isEdit = !!editId.value;
  const piezasDan = parseInt(f_piezas_danadas.value) || 0;
  const record = {
    tipo_movimiento: f_tipo.value,
    fecha: f_fecha.value,
    cliente: f_cliente.value.trim(),
    contenedor: f_contenedor.value.trim(),
    factura: f_factura.value.trim(),
    modelo: f_modelo.value.trim(),
    no_lote: f_lote.value.trim(),
    pallets: parseInt(f_pallets.value) || 0,
    piezas: parseInt(f_piezas.value) || 0,
    piezas_danadas: piezasDan,
    dañado: piezasDan > 0,
  };

  try {
    if (isEdit) {
      await API.update(parseInt(editId.value), record);
      showToast('Movimiento actualizado', 'info');
    } else {
      await API.create(record);
      showToast('Movimiento agregado', 'success');
    }
    await reloadRecords();
    closeModal();
    refreshCurrentView();
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  }
});

// ──────────────────────────────────────────────
// EDIT
// ──────────────────────────────────────────────
function openEdit(id) {
  const r = records.find(rec => rec.id_movimiento === id);
  if (!r) return;
  editId.value = id;
  f_tipo.value = r.tipo_movimiento || '';
  f_fecha.value = r.fecha || '';
  f_cliente.value = r.cliente || '';
  f_contenedor.value = r.contenedor || '';
  f_factura.value = r.factura || '';
  f_modelo.value = r.modelo || '';
  f_lote.value = r.no_lote || '';
  f_pallets.value = r.pallets || '';
  f_piezas.value = r.piezas || '';
  f_piezas_danadas.value = r.piezas_danadas || '';
  modalTitle.textContent = `Editar Movimiento #${id}`;
  openModal();
}

// ──────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────
function openConfirmDelete(id) {
  pendingDeleteId = id;
  confirmOverlay.classList.add('open');
}
confirmNo.addEventListener('click', () => {
  confirmOverlay.classList.remove('open');
  pendingDeleteId = null;
});
confirmYes.addEventListener('click', async () => {
  if (pendingDeleteId === null) return;
  try {
    await API.delete(pendingDeleteId);
    await reloadRecords();
    confirmOverlay.classList.remove('open');
    pendingDeleteId = null;
    showToast('Registro eliminado', 'error');
    refreshCurrentView();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
});

// ──────────────────────────────────────────────
// EXPORT CSV
// ──────────────────────────────────────────────
btnExport.addEventListener('click', () => {
  const cols = ['id_movimiento', 'tipo_movimiento', 'fecha', 'cliente', 'contenedor', 'factura', 'modelo', 'no_lote', 'pallets', 'piezas', 'piezas_danadas'];
  const headers = ['ID Movimiento', 'Tipo de Movimiento', 'Fecha', 'Cliente', 'Contenedor', 'Factura', 'Modelo', 'No Lote', 'Pallets', 'Piezas', 'Piezas Dañadas'];
  const rows = filteredRecords.map(r => cols.map(c => {
    let v = r[c] ?? '';
    if (typeof v === 'string' && v.includes(',')) v = `"${v}"`;
    return v;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pactra_inventario_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exportado correctamente', 'success');
});

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function refreshCurrentView() {
  const active = Object.keys(views).find(k => views[k].el.classList.contains('active'));
  if (active === 'dashboard') renderDashboard();
  if (active === 'movimientos') renderTable();
  if (active === 'dañados') renderDanos();
  if (active === 'por-modelo') renderModelos();
  const danos = records.filter(r => isDanado(r)).length;
  badgeDanos.textContent = danos;
  badgeDanos.classList.toggle('hidden', danos === 0);
}

function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '🗑️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ──────────────────────────────────────────────
// IMPORT MODAL
// ──────────────────────────────────────────────
const importOverlay = document.getElementById('importOverlay');
const importClose = document.getElementById('importClose');
const importCancel = document.getElementById('importCancel');
const importBack = document.getElementById('importBack');
const importConfirm = document.getElementById('importConfirm');
const importStep1 = document.getElementById('importStep1');
const importStep2 = document.getElementById('importStep2');
const dropZone = document.getElementById('dropZone');
const importFile = document.getElementById('importFile');
const importError = document.getElementById('importError');
const importPreviewHead = document.getElementById('importPreviewHead');
const importPreviewBody = document.getElementById('importPreviewBody');
const importPreviewInfo = document.getElementById('importPreviewInfo');
const importReplace = document.getElementById('importReplace');
const btnImport = document.getElementById('btnImport');

let importedRows = [];

const COL_MAP = {
  'tipo de movimiento': 'tipo_movimiento', 'tipo movimiento': 'tipo_movimiento',
  'tipo': 'tipo_movimiento', 'movimiento': 'tipo_movimiento',
  'fecha': 'fecha', 'date': 'fecha',
  'cliente': 'cliente', 'client': 'cliente', 'customer': 'cliente',
  'contenedor': 'contenedor', 'container': 'contenedor', 'cont': 'contenedor',
  'factura': 'factura', 'invoice': 'factura', 'fact': 'factura',
  'modelo': 'modelo', 'model': 'modelo', 'product': 'modelo', 'producto': 'modelo',
  'no lote': 'no_lote', 'no. lote': 'no_lote', 'lote': 'no_lote',
  'no_lote': 'no_lote', 'lot': 'no_lote', 'num lote': 'no_lote', 'numero de lote': 'no_lote',
  'pallets': 'pallets', 'pallet': 'pallets',
  'piezas': 'piezas', 'pieces': 'piezas', 'qty': 'piezas', 'cantidad': 'piezas',
  'danado': 'dañado', 'damaged': 'dañado', 'dano': 'dañado', 'piezas danadas': 'dañado',
  'piezas dañadas': 'dañado',
};

function normalizeColName(raw) {
  return (raw || '').toString().toLowerCase().trim()
    .replace(/[áéíóú]/g, c => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' })[c] || c)
    .replace(/ñ/g, 'n');
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  const s = String(val || '').toLowerCase().trim();
  return ['si', 'sí', 'yes', 'true', 'x', '✓', '✔'].includes(s);
}

function parseDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m2) {
    const [, d, mo, y] = m2;
    return `${y.length === 2 ? '20' + y : y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

function processWorkbook(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (json.length < 2) return { error: 'El archivo está vacío o no tiene datos.' };

  const headerMap = json[0].map(h => COL_MAP[normalizeColName(h)] || null);
  const rows = [];
  for (let i = 1; i < json.length; i++) {
    const rowArr = json[i];
    if (rowArr.every(v => v === '' || v === null || v === undefined)) continue;
    const obj = {};
    headerMap.forEach((field, idx) => {
      if (!field) return;
      let val = rowArr[idx];
      if (field === 'fecha') val = parseDate(val);
      else if (field === 'dañado') {
        const rawNum = typeof val === 'number' ? val : (parseInt(val) || 0);
        obj.piezas_danadas_raw = rawNum;
        val = parseBool(val);
      }
      else if (field === 'pallets' || field === 'piezas') val = parseInt(val) || 0;
      else val = String(val ?? '').trim();
      obj[field] = val;
    });
    rows.push(obj);
  }
  if (rows.length === 0) return { error: 'No se encontraron filas con datos.' };
  return { rows };
}

function showImportError(msg) { importError.textContent = '⚠️ ' + msg; importError.style.display = 'block'; }
function hideImportError() { importError.style.display = 'none'; }

function goToPreview(rows) {
  importedRows = rows;
  importStep1.style.display = 'none';
  importStep2.style.display = 'block';
  importBack.style.display = '';
  importConfirm.style.display = '';

  const preview = rows.slice(0, 8);
  const labels = ['Tipo', 'Fecha', 'Cliente', 'Contenedor', 'Factura', 'Modelo', 'No. Lote', 'Pallets', 'Piezas', 'Pzas Dañadas'];
  importPreviewHead.innerHTML = `<tr>${labels.map(l => `<th>${l}</th>`).join('')}</tr>`;
  importPreviewBody.innerHTML = preview.map(r => `
    <tr>
      <td>${tipoChip(r.tipo_movimiento) || '—'}</td>
      <td>${fmtDate(r.fecha) || '—'}</td>
      <td>${r.cliente || '—'}</td>
      <td>${r.contenedor || '—'}</td>
      <td>${r.factura || '—'}</td>
      <td>${r.modelo || '—'}</td>
      <td>${r.no_lote || '—'}</td>
      <td>${fmtNum(r.pallets)}</td>
      <td>${fmtNum(r.piezas)}</td>
      <td>${fmtNum(r.piezas_danadas_raw || 0)}</td>
    </tr>`).join('');
  if (rows.length > 8) importPreviewBody.innerHTML += `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:10px">… y ${rows.length - 8} filas más</td></tr>`;
  importPreviewInfo.textContent = `${rows.length} fila${rows.length !== 1 ? 's' : ''} encontrada${rows.length !== 1 ? 's' : ''} — mostrando primeras ${Math.min(8, rows.length)}`;
}

function handleFile(file) {
  hideImportError();
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) { showImportError('Formato no soportado. Usa .xlsx, .xls o .csv'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
      const result = processWorkbook(wb);
      if (result.error) { showImportError(result.error); return; }
      goToPreview(result.rows);
    } catch (err) { showImportError('Error al leer el archivo: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

function openImportModal() {
  importOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  importStep1.style.display = '';
  importStep2.style.display = 'none';
  importBack.style.display = 'none';
  importConfirm.style.display = 'none';
  importFile.value = '';
  importReplace.checked = false;
  importedRows = [];
  hideImportError();
  dropZone.classList.remove('drag-over');
}
function closeImportModal() {
  importOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

btnImport.addEventListener('click', openImportModal);
importClose.addEventListener('click', closeImportModal);
importCancel.addEventListener('click', closeImportModal);
importOverlay.addEventListener('click', e => { if (e.target === importOverlay) closeImportModal(); });
importBack.addEventListener('click', () => {
  importStep1.style.display = '';
  importStep2.style.display = 'none';
  importBack.style.display = 'none';
  importConfirm.style.display = 'none';
  importFile.value = '';
  importedRows = [];
});

dropZone.addEventListener('click', () => importFile.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});
importFile.addEventListener('change', () => handleFile(importFile.files[0]));


importConfirm.addEventListener('click', async () => {
  if (!importedRows.length) return;
  importConfirm.disabled = true;
  importConfirm.textContent = 'Importando…';
  try {
    const apiRows = importedRows.map(row => {
      const pzDan = parseInt(row.piezas_danadas_raw) || (row.dañado ? 1 : 0);
      return {
        tipo_movimiento: row.tipo_movimiento || '',
        fecha: row.fecha || '',
        cliente: row.cliente || '',
        contenedor: row.contenedor || '',
        factura: row.factura || '',
        modelo: row.modelo || '',
        no_lote: row.no_lote || '',
        pallets: row.pallets || 0,
        piezas: row.piezas || 0,
        piezas_danadas: pzDan,
        dañado: pzDan > 0 || row.dañado || false,
      };
    });
    const result = await API.bulk(apiRows, importReplace.checked);
    await reloadRecords();
    closeImportModal();
    showToast(`✅ ${result.count} registros importados a la base de datos`, 'success');
    refreshCurrentView();
  } catch (err) {
    showImportError('Error al importar: ' + err.message);
  } finally {
    importConfirm.disabled = false;
    importConfirm.textContent = '✔ Importar datos';
  }
});

// ──────────────────────────────────────────────
// POR MODELO VIEW
// ──────────────────────────────────────────────
let modeloActivo = null;

const modeloGrid = document.getElementById('modeloGrid');
const modeloCount = document.getElementById('modeloCount');
const modeloSearch = document.getElementById('modeloSearch');
const modeloSort = document.getElementById('modeloSort');
const modeloDetalle = document.getElementById('modeloDetalle');
const modeloDetalleTitulo = document.getElementById('modeloDetalleTitulo');
const modeloDetalleTbody = document.getElementById('modeloDetalleTbody');
const modeloDetalleCount = document.getElementById('modeloDetalleCount');
const btnCerrarDetalle = document.getElementById('btnCerrarDetalle');
const btnExportModelo = document.getElementById('btnExportModelo');

function groupByModelo() {
  const map = {};
  records.forEach(r => {
    const key = (r.modelo || '(Sin modelo)').trim();
    if (!map[key]) map[key] = { nombre: key, movimientos: 0, pallets: 0, piezas: 0, danos: 0, tipos: {}, registros: [] };
    map[key].movimientos++;
    map[key].pallets += parseInt(r.pallets) || 0;
    map[key].piezas += parseInt(r.piezas) || 0;
    if (isDanado(r)) map[key].danos++;
    const t = r.tipo_movimiento || 'Otro';
    map[key].tipos[t] = (map[key].tipos[t] || 0) + 1;
    map[key].registros.push(r);
  });
  return Object.values(map);
}

function tipoPillClass(tipo) {
  return { Entrada: 'pill-entrada', Salida: 'pill-salida', Transferencia: 'pill-transfer', 'Devolución': 'pill-dev', Ajuste: 'pill-ajuste' }[tipo] || '';
}

function renderModelos() {
  const q = (modeloSearch?.value || '').toLowerCase().trim();
  const sort = modeloSort?.value || 'modelo';
  let grupos = groupByModelo().filter(g => !q || g.nombre.toLowerCase().includes(q));
  if (sort === 'modelo') grupos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (sort === 'piezas_desc') grupos.sort((a, b) => b.piezas - a.piezas);
  if (sort === 'movimientos_desc') grupos.sort((a, b) => b.movimientos - a.movimientos);
  if (sort === 'danos_desc') grupos.sort((a, b) => b.danos - a.danos);

  modeloCount.textContent = `${grupos.length} modelo${grupos.length !== 1 ? 's' : ''}`;

  if (!grupos.length) {
    modeloGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No se encontraron modelos</p></div>`;
    return;
  }

  modeloGrid.innerHTML = grupos.map(g => {
    const pillsHtml = Object.entries(g.tipos)
      .map(([t, cnt]) => `<span class="modelo-pill ${tipoPillClass(t)}">${t} · ${cnt}</span>`).join('');
    const danoHtml = g.danos > 0
      ? `<span class="modelo-dano-tag">⚠ ${g.danos} dañado${g.danos > 1 ? 's' : ''}</span>`
      : `<span style="color:var(--text-muted);font-size:11px">✔ Sin daños</span>`;
    return `
      <div class="modelo-card ${g.danos > 0 ? 'has-danos' : ''} ${modeloActivo === g.nombre ? 'selected' : ''}"
           onclick="verDetalleModelo('${encodeURIComponent(g.nombre)}')"
           title="Ver movimientos de: ${g.nombre}">
        <div class="modelo-card-header">
          <span class="modelo-card-name">${g.nombre}</span>
          <span class="modelo-card-id">${g.movimientos} mov.</span>
        </div>
        <div class="modelo-stats-row">
          <div class="modelo-stat">
            <span class="modelo-stat-val">${g.piezas.toLocaleString('es-MX')}</span>
            <span class="modelo-stat-lbl">Piezas totales</span>
          </div>
          <div class="modelo-stat">
            <span class="modelo-stat-val">${g.pallets.toLocaleString('es-MX')}</span>
            <span class="modelo-stat-lbl">Pallets totales</span>
          </div>
        </div>
        <div class="modelo-pills">${pillsHtml || '<span style="color:var(--text-muted);font-size:11px">Sin tipo</span>'}</div>
        <div class="modelo-card-footer">${danoHtml}<span class="modelo-ver-btn">📊 Ver detalle ›</span></div>
      </div>`;
  }).join('');

  if (modeloActivo) {
    const g = grupos.find(x => x.nombre === modeloActivo);
    if (g) renderModeloDetalle(g);
    else { modeloDetalle.style.display = 'none'; modeloActivo = null; }
  }
}

function verDetalleModelo(encodedNombre) {
  const nombre = decodeURIComponent(encodedNombre);
  modeloActivo = nombre;
  const g = groupByModelo().find(x => x.nombre === nombre);
  if (!g) return;
  renderModeloDetalle(g);
  setTimeout(() => modeloDetalle.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  renderModelos();
}

function renderModeloDetalle(g) {
  modeloDetalleTitulo.textContent = `Movimientos: ${g.nombre}`;
  modeloDetalleCount.textContent = `${g.registros.length} registro${g.registros.length !== 1 ? 's' : ''}`;
  modeloDetalle.style.display = 'block';
  const sorted = [...g.registros].sort((a, b) => {
    if (b.fecha > a.fecha) return 1; if (b.fecha < a.fecha) return -1;
    return b.id_movimiento - a.id_movimiento;
  });
  modeloDetalleTbody.innerHTML = sorted.map(r => `
    <tr>
      <td><strong>#${r.id_movimiento}</strong></td>
      <td>${tipoChip(r.tipo_movimiento)}</td>
      <td>${fmtDate(r.fecha)}</td>
      <td title="${r.cliente || ''}">${r.cliente || '—'}</td>
      <td title="${r.contenedor || ''}">${r.contenedor || '—'}</td>
      <td title="${r.factura || ''}">${r.factura || '—'}</td>
      <td>${r.no_lote || '—'}</td>
      <td>${fmtNum(r.pallets)}</td>
      <td>${fmtNum(r.piezas)}</td>
      <td>${dañadoCell(r)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn-icon edit" onclick="openEdit(${r.id_movimiento})" title="Editar">✏️</button>
          <button class="btn-icon del"  onclick="openConfirmDelete(${r.id_movimiento})" title="Eliminar">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

btnCerrarDetalle?.addEventListener('click', () => {
  modeloDetalle.style.display = 'none';
  modeloActivo = null;
  renderModelos();
});
if (modeloSearch) modeloSearch.addEventListener('input', () => { modeloActivo = null; modeloDetalle.style.display = 'none'; renderModelos(); });
if (modeloSort) modeloSort.addEventListener('change', () => renderModelos());

btnExportModelo?.addEventListener('click', () => {
  const grupos = groupByModelo();
  const headers = ['Modelo', 'Total Movimientos', 'Total Piezas', 'Total Pallets', 'Con Daños', 'Entradas', 'Salidas', 'Transferencias', 'Devoluciones', 'Ajustes'];
  const rows = grupos.map(g => [
    `"${g.nombre}"`, g.movimientos, g.piezas, g.pallets, g.danos,
    g.tipos['Entrada'] || 0, g.tipos['Salida'] || 0, g.tipos['Transferencia'] || 0,
    g.tipos['Devolución'] || 0, g.tipos['Ajuste'] || 0,
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `pactra_por_modelo_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Resumen por modelo exportado', 'success');
});

// ──────────────────────────────────────────────
// INIT — carga datos desde la API y arranca
// ──────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────
async function init() {
  await reloadRecords();
  showView('dashboard');
}

init();

// ══════════════════════════════════════════════
//  PACKING LIST MODULE
// ══════════════════════════════════════════════

// ── DOM refs ─────────────────────────────────
const pkForm = document.getElementById('packingForm');
const pkCliente = document.getElementById('pk_cliente');
const pkModelo = document.getElementById('pk_modelo');
const pkContainer = document.getElementById('pk_container');
const pkInvoiceNo = document.getElementById('pk_invoice_no');
const pkInvoiceDate = document.getElementById('pk_invoice_date');
const pkLote = document.getElementById('pk_lote');
const pkPallets = document.getElementById('pk_pallets');
const pkSacos = document.getElementById('pk_sacos');
const pkPeso = document.getElementById('pk_peso');
const pkPesoBruto = document.getElementById('pk_peso_bruto');
const pkTruck = document.getElementById('pk_truck');
const pkDriver = document.getElementById('pk_driver');
const pkPlates = document.getElementById('pk_plates');
const pkCiudad = document.getElementById('pk_ciudad');
const pkDireccion = document.getElementById('pk_direccion');
const pkRemarks = document.getElementById('pk_remarks');
const pkPreviewBody = document.getElementById('packingPreviewBody');
const btnGenerarPDF = document.getElementById('btnGenerarPDF');
const btnResetPacking = document.getElementById('btnResetPacking');

// ── Cliente Config ───────────────────────────
const CLIENT_CONFIG = {
  DONGJIN: {
    nombre: 'DONGJIN TECHWIN S.A DE C.V',
    direccion: 'Parque Industrial Jesus Maria\nPesquería, 66616, N.L\nDaniel 8110172194',
    ciudad: 'PESQUERIA NL'
  },
  TAESUNG: {
    nombre: 'TAESUNG PRECISION CO. LTRD',
    direccion: 'Av. Parque Industrial Monterrey #600\nCol. Parque Industrial Monterrey\nApodaca, N.L. CP 66603',
    ciudad: 'APODACA NL'
  }
};

// ── Stepper helper (global for onclick) ──────
function pkStep(id, delta) {
  const el = document.getElementById(id);
  const v = parseFloat(el.value) || 0;
  const step = parseFloat(el.step) || 1;
  el.value = Math.max(0, +(v + delta * step).toFixed(2));

  if (id === 'pk_sacos' || id === 'pk_peso') {
    const sacos = parseInt(pkSacos.value) || 0;
    const peso = parseFloat(pkPeso.value) || 0;
    pkPesoBruto.value = (sacos * peso).toFixed(2);
  }

  renderPackingPreview();
}

// ── Load modelos from inventory API ──────────
async function loadPackingModelos() {
  try {
    const modelos = await fetch('/api/modelos').then(r => r.json());
    pkModelo.innerHTML = '<option value="">— Seleccionar modelo —</option>';
    modelos.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      pkModelo.appendChild(opt);
    });
    if (!modelos.length) pkModelo.innerHTML = '<option value="">(Sin modelos en inventario)</option>';
  } catch (e) {
    pkModelo.innerHTML = '<option value="">Error cargando modelos</option>';
  }
}

// ── Load containers filtered by model ────────
async function loadPackingContainers(modelo) {
  pkContainer.innerHTML = '<option value="">Cargando...</option>';
  if (!modelo) {
    pkContainer.innerHTML = '<option value="">— Selecciona un modelo —</option>';
    return;
  }
  try {
    const containers = await fetch('/api/contenedores?modelo=' + encodeURIComponent(modelo)).then(r => r.json());
    pkContainer.innerHTML = '<option value="">— Seleccionar contenedor —</option>';
    containers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      pkContainer.appendChild(opt);
    });
    if (!containers.length) pkContainer.innerHTML = '<option value="">(Sin contenedores para este modelo)</option>';
  } catch (e) {
    pkContainer.innerHTML = '<option value="">Error cargando contenedores</option>';
  }
}

// ── Event: cliente change → autofill fields ──
pkCliente.addEventListener('change', () => {
  const c = CLIENT_CONFIG[pkCliente.value];
  if (c) {
    pkDireccion.value = c.direccion;
    pkCiudad.value = c.ciudad;
  } else {
    pkDireccion.value = '';
    pkCiudad.value = '';
  }
  renderPackingPreview();
});

// ── Event: modelo change → reload containers ─
pkModelo.addEventListener('change', async () => {
  await loadPackingContainers(pkModelo.value);
  renderPackingPreview();
});

// ── Event: container change → autofill invoice & lote ─
pkContainer.addEventListener('change', () => {
  if (pkContainer.value) {
    // Buscar en los registros el último movimiento con este contenedor
    const record = records.slice().reverse().find(r => r.contenedor === pkContainer.value);
    if (record) {
      if (record.factura) pkInvoiceNo.value = record.factura;
      if (record.no_lote) pkLote.value = record.no_lote;
    }
  }
  renderPackingPreview();
});

// ── Live preview update ───────────────────────
['pk_cliente', 'pk_container', 'pk_invoice_no', 'pk_invoice_date', 'pk_lote', 'pk_pallets',
  'pk_sacos', 'pk_peso', 'pk_peso_bruto', 'pk_truck', 'pk_driver', 'pk_plates',
  'pk_ciudad', 'pk_direccion', 'pk_remarks'
].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (id === 'pk_sacos' || id === 'pk_peso') {
        const sacos = parseInt(pkSacos.value) || 0;
        const peso = parseFloat(pkPeso.value) || 0;
        pkPesoBruto.value = (sacos * peso).toFixed(2);
      }
      renderPackingPreview();
    });
    el.addEventListener('change', renderPackingPreview);
  }
});

function fmtPkDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

// ── Render live HTML preview ──────────────────
function renderPackingPreview() {
  const D = getPKData();
  pkPreviewBody.innerHTML = `
    <div class="pdf-preview-card">
      <div class="pdf-preview-title">PACKING LIST</div>

      <div class="pdf-preview-grid">
        <!-- Left col 1 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">1. Shipper / Exporter</div>
          <strong>Pactra Mexico S. de R.L. de C.V.</strong><br/>
          Blvd. Rogelio Pérez Arrambide 4502,<br/>
          Centro de Pesquería, 66653 Pesquería, N.L.
        </div>
        <!-- Right col 1 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">6. Invoice No. &amp; Date</div>
          <strong>${D.invoiceNo || '—'}</strong> &nbsp; ${fmtPkDate(D.invoiceDate)}
        </div>

        <!-- Left col 2 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">2. For account &amp; risk of Messrs.</div>
          <strong>${D.cliente}</strong><br/>${D.direccion || '—'}
        </div>
        <!-- Right col 2 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">7. Carrier</div>
          <strong>TRUCK:</strong> ${D.truck || '—'}<br/>
          <strong>DRIVER:</strong> ${D.driver || '—'}<br/>
          <strong>PLATES:</strong> ${D.plates || '—'}
        </div>

        <!-- Left col 3 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">3. Notify party</div>
          Same as above
        </div>
        <!-- Right col 3 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">8. Sailing on or about</div>
          ${fmtPkDate(D.invoiceDate)}
        </div>

        <!-- Left col 4 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">4. Port of loading</div>
          <strong>PESQUERIA NL</strong>
        </div>
        <!-- Right col 4 -->
        <div class="pdf-cell">
          <div class="pdf-cell-label">5. Final destination</div>
          <strong>${D.ciudad || '—'}</strong>
        </div>
      </div>

      <div class="pdf-remarks-row">
        <div class="pdf-cell">
          <div class="pdf-cell-label">REMARKS</div>
          ${D.remarks || '&nbsp;'}
        </div>
        <div class="pdf-cell">
          <div class="pdf-cell-label">CONTAINER</div>
          <strong>${D.container || '—'}</strong>
        </div>
      </div>

      <div class="pdf-table-wrap">
        <table>
          <thead><tr>
            <th>LOTE</th><th>PALLET</th><th>SACO</th>
            <th>MODELO</th><th>PESO NETO</th><th>PESO BRUTO</th>
          </tr></thead>
          <tbody><tr>
            <td>${D.lote || '—'}</td>
            <td>${D.pallets}</td>
            <td>${D.sacos}</td>
            <td>${D.modelo || '—'}</td>
            <td>${D.peso} kg</td>
            <td>${D.pesoBruto} kg</td>
          </tr></tbody>
        </table>
      </div>

      <div class="pdf-logo-row">PACTRA</div>
      <div class="pdf-logo-sub">Pactra Mexico S. de R.L. de C.V.</div>

      <div class="pdf-signatures">
        <div class="pdf-sig-box">Firma Bodega Salida</div>
        <div class="pdf-sig-box">Firma Operador</div>
        <div class="pdf-sig-box">Firma Bodega Arribo</div>
      </div>
    </div>`;
}

// ── Get form data ────────────────────────────
function getPKData() {
  const c = CLIENT_CONFIG[pkCliente.value];
  const nombreC = c ? c.nombre : pkCliente.value;

  return {
    cliente: nombreC,
    modelo: pkModelo.value,
    invoiceNo: pkInvoiceNo.value.trim(),
    invoiceDate: pkInvoiceDate.value,
    container: pkContainer.value,
    lote: pkLote.value.trim(),
    pallets: parseInt(pkPallets.value) || 0,
    sacos: parseInt(pkSacos.value) || 0,
    peso: parseFloat(pkPeso.value) || 0,
    pesoBruto: parseFloat(pkPesoBruto.value) || 0,
    truck: pkTruck.value.trim(),
    driver: pkDriver.value.trim(),
    plates: pkPlates.value.trim(),
    ciudad: pkCiudad.value.trim(),
    direccion: pkDireccion.value.trim(),
    remarks: pkRemarks.value.trim(),
  };
}

// ── Generar PDF — servidor usa Chrome headless para crear el PDF ─────────
btnGenerarPDF.addEventListener('click', async () => {
  const D = getPKData();
  if (!D.modelo) { showToast('Selecciona un modelo primero', 'error'); return; }

  const originalText = btnGenerarPDF.textContent;
  btnGenerarPDF.disabled = true;
  btnGenerarPDF.textContent = '⏳ Generando PDF...';

  try {
    const res = await fetch('/api/packing-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(D),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const fname = `PackingList_${D.invoiceNo || 'SN'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ PDF descargado: ' + fname, 'success');

  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  } finally {
    btnGenerarPDF.disabled = false;
    btnGenerarPDF.textContent = originalText;
  }
});



// ── Construye el HTML del Packing List ────────────────────
function buildPackingHTML(D) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Packing List — ${D.invoiceNo || 'SN'}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
  }
  .page {
    width: 216mm;
    min-height: 279mm;
    margin: 0 auto;
    padding: 14mm 14mm 10mm 14mm;
  }

  /* ── Título ── */
  h1.title {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 0.05em;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
    margin-bottom: 0;
  }

  /* ── Tabla de encabezado (secciones 1-8) ── */
  .header-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
  }
  .header-table td {
    border: 1px solid #000;
    padding: 5px 7px 5px 7px;
    vertical-align: top;
    font-size: 9.5pt;
  }
  .section-label {
    font-size: 7.5pt;
    color: #444;
    display: block;
    margin-bottom: 3px;
  }
  .section-value {
    font-size: 9.5pt;
    color: #000;
  }
  .section-value.bold { font-weight: bold; }

  /* Columna izquierda 52%, derecha 48% */
  .col-left  { width: 52%; }
  .col-right { width: 48%; }

  /* ── Tabla de datos ── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 0;
  }
  .data-table th {
    border: 1px solid #000;
    padding: 5px 4px;
    text-align: center;
    font-weight: bold;
    font-size: 9.5pt;
    background: #fff;
  }
  .data-table td {
    border: 1px solid #000;
    padding: 6px 4px;
    text-align: center;
    font-size: 10pt;
  }

  /* ── Logo PACTRA ── */
  .logo-box {
    border: 1px solid #000;
    border-top: none;
    padding: 5px;
    text-align: center;
  }
  .logo-name {
    font-size: 14pt;
    font-weight: bold;
    color: #1a4fb5;
    letter-spacing: 0.12em;
  }
  .logo-sub {
    font-size: 7.5pt;
    color: #555;
    margin-top: 2px;
  }

  /* ── Firmas ── */
  .sig-row {
    display: flex;
    width: 100%;
  }
  .sig-box {
    flex: 1;
    border: 1px solid #000;
    border-top: none;
    height: 28mm;
    background: #ffffa0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 6px;
    font-size: 8pt;
    font-weight: normal;
    color: #333;
    text-align: center;
  }
  .sig-box:not(:last-child) { border-right: none; }

  @media print {
    body { margin: 0; }
    .page { margin:0; padding: 10mm 14mm 8mm 14mm; }
    @page { size: letter portrait; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Título -->
  <h1 class="title">PACKING LIST</h1>

  <!-- Tabla encabezado -->
  <table class="header-table">

    <!-- Fila 1: Shipper + Invoice no -->
    <tr>
      <td class="col-left">
        <span class="section-label">1.&nbsp;&nbsp; Shipper/Exporter</span>
        <span class="section-value bold">Pactra Mexico S. de R.L. de C.V.</span><br/>
        <span class="section-value">Blvd. Rogelio Pérez Arrambide 4502,</span><br/>
        <span class="section-value">Centro de Pesquería, 66653 Pesquería, N.L.</span>
      </td>
      <td class="col-right">
        <span class="section-label">6.&nbsp;&nbsp; Invoice no. &amp; date</span>
        <span class="section-value bold">${esc(D.invoiceNo)}</span><br/>
        <span class="section-value">${fmtPkDate(D.invoiceDate)}</span>
      </td>
    </tr>

    <!-- Fila 2: Consignatario + Carrier -->
    <tr>
      <td class="col-left">
        <span class="section-label">2.&nbsp;&nbsp; For account &amp; risk of Messrs.</span>
        <span class="section-value bold">${esc(D.cliente)}</span><br/>
        <span class="section-value">${esc(D.direccion)}</span>
      </td>
      <td class="col-right">
        <span class="section-label">7.&nbsp;&nbsp; Carrier</span>
        <span class="section-value"><b>TRUCK:</b> ${esc(D.truck)}</span><br/>
        <span class="section-value"><b>DRIVER:</b> ${esc(D.driver)}</span><br/>
        <span class="section-value"><b>PLATES:</b> ${esc(D.plates)}</span>
      </td>
    </tr>

    <!-- Fila 3: Notify + Sailing -->
    <tr>
      <td class="col-left">
        <span class="section-label">3.&nbsp;&nbsp; Notify party</span>
        <span class="section-value">Same as above</span>
      </td>
      <td class="col-right">
        <span class="section-label">8.&nbsp;&nbsp; Sailing on or about</span>
        <span class="section-value">${fmtPkDate(D.invoiceDate)}</span>
      </td>
    </tr>

    <!-- Fila 4: Port of loading + Final destination -->
    <tr>
      <td class="col-left">
        <span class="section-label">4.&nbsp;&nbsp; Port of loading</span>
        <span class="section-value bold">PESQUERIA NL</span>
      </td>
      <td class="col-right">
        <span class="section-label">5.&nbsp;&nbsp; Final destination</span>
        <span class="section-value bold">${esc(D.ciudad)}</span>
      </td>
    </tr>

    <!-- Fila 5: REMARKS + CONTAINER -->
    <tr>
      <td class="col-left">
        <span class="section-label">REMARKS</span>
        <span class="section-value">${esc(D.remarks) || '&nbsp;'}</span>
      </td>
      <td class="col-right">
        <span class="section-label">CONTAINER</span>
        <span class="section-value bold">${esc(D.container)}</span>
      </td>
    </tr>

  </table>

  <!-- Tabla de datos -->
  <table class="data-table">
    <thead>
      <tr>
        <th>LOTE</th>
        <th>Pallet</th>
        <th>Saco</th>
        <th>MODELO</th>
        <th>PESO</th>
        <th>Peso bruto</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(D.lote)}</td>
        <td>${D.pallets}</td>
        <td>${D.sacos}</td>
        <td>${esc(D.modelo)}</td>
        <td>${D.peso} kg</td>
        <td>${D.pesoBruto} kg</td>
      </tr>
    </tbody>
  </table>

  <!-- Logo PACTRA -->
  <div class="logo-box">
    <div class="logo-name">PACTRA</div>
    <div class="logo-sub">Pactra Mexico S. de R.L. de C.V.</div>
  </div>

  <!-- Firmas -->
  <div class="sig-row">
    <div class="sig-box">firma bodega salida</div>
    <div class="sig-box">firma operador</div>
    <div class="sig-box">firma bodega arribo</div>
  </div>

</div>
</body>
</html>`;
}

// HTML-escape helper
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Reset form ───────────────────────────────
btnResetPacking.addEventListener('click', () => {
  pkForm.reset();
  pkInvoiceDate.value = new Date().toISOString().slice(0, 10);
  pkContainer.innerHTML = '<option value="">— Selecciona un modelo —</option>';
  pkPreviewBody.innerHTML = '';
});

// ── Init packing view: load modelos & set date─
async function initPackingView() {
  await loadPackingModelos();
  if (!pkInvoiceDate.value) pkInvoiceDate.value = new Date().toISOString().slice(0, 10);
  renderPackingPreview();
}
