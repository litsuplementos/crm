// memorias.js — Componente de respaldo mensual

const MEMORIAS_BUCKET = 'memorias';

// ── INIT ─────────────────────────────────────────────────────────────────────
async function renderMemorias() {
  await _ensureBucket();
  if (currentUser?.rol === 'admin') {
    _renderMemoriasUI();
    await _cargarRespaldosStorage();
  } else {
    _renderMemoriasAgente();
  }
}

async function _ensureBucket() {
  try {
    await db.storage.from(MEMORIAS_BUCKET).list('', { limit: 1 });
  } catch(e) {
    console.warn('Bucket memorias no accesible:', e.message);
  }
}

// ── ESTADO INTERNO ────────────────────────────────────────────────────────────
let _memoriaData = [];
let _memoriaMes  = '';
let _memoriaEstadosFiltro = ['todos']; // array de estados seleccionados
let _memoriaAgenteId = 'todos'; // agente seleccionado para el filtro admin

// Paginación para la vista de agente
const _AGENTE_PAGE_SIZE = 15;
let _agenteStoragePage = 1;
let _agenteStorageItems = [];

const _ESTADOS_LABELS = {
  todos:        { label: 'Todos',          emoji: '🗂️',  color: '#6366f1' },
  vendido:      { label: 'Vendido',        emoji: '✅',  color: '#22d3a4' },
  rellamada:    { label: 'Rellamada',      emoji: '🔁',  color: '#a78bfa' },
  seguimiento:  { label: 'Seguimiento',    emoji: '🔄',  color: '#60a5fa' },
  interesado:   { label: 'Interesado',     emoji: '🌟',  color: '#fbbf24' },
  agendar:      { label: 'Agendar',        emoji: '📅',  color: '#fb923c' },
  sin_respuesta:{ label: 'Sin respuesta',  emoji: '📵',  color: '#f87171' },
  no_interesado:{ label: 'No interesado',  emoji: '👎',  color: '#94a3b8' },
  enviado:      { label: 'Enviado',        emoji: '📦',  color: '#60a5fa' },
  cancelado:    { label: 'Cancelado',      emoji: '❌',  color: '#f87171' },
  spam:         { label: 'SPAM',           emoji: '🚫',  color: '#94a3b8' },
};

// ── UI AGENTE (solo lectura) ──────────────────────────────────────────────────
function _renderMemoriasAgente() {
  const wrap = document.getElementById('memorias-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="config-card">
      <div class="config-card-title">🗄️ Mis respaldos</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;">
        Aquí puedes ver los respaldos mensuales de tus registros guardados por el administrador.
      </div>

      <!-- Selector de mes -->
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Filtrar por mes</label>
          <select class="filter-select" id="agente-mem-mes" style="min-width:220px;font-size:14px;" onchange="_cargarRespaldosAgente()">
            <option value="">Todos los meses</option>
            ${_buildMesesOptions()}
          </select>
        </div>
        <button class="btn-secondary" onclick="_cargarRespaldosAgente()">🔄 Actualizar</button>
      </div>

      <!-- Lista de archivos -->
      <div id="agente-storage-list" style="overflow-y:auto;max-height:540px;">
        <div style="color:var(--text3);font-size:13px;">Cargando...</div>
      </div>
      <!-- Paginación -->
      <div id="agente-storage-pagination" style="display:flex;justify-content:center;gap:6px;margin-top:14px;"></div>
    </div>

    <!-- MODAL PREVISUALIZACIÓN CSV -->
    <div class="modal-overlay" id="mem-csv-modal">
      <div class="modal" style="max-width:90vw;width:90vw;max-height:85vh;">
        <div class="modal-header">
          <div class="modal-title" id="mem-csv-modal-title">📋 Vista previa</div>
          <button class="modal-close" onclick="document.getElementById('mem-csv-modal').classList.remove('open')">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;max-height:calc(85vh - 80px);">
          <div id="mem-csv-modal-body"></div>
        </div>
      </div>
    </div>
  `;

  _cargarRespaldosAgente();
}

function _buildMesesOptions() {
  const hoy = new Date();
  const meses = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    if (d < new Date(2026, 0, 1)) break;
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
    meses.push(`<option value="${valor}">${label}</option>`);
  }
  return meses.join('');
}

async function _cargarRespaldosAgente() {
  const listEl = document.getElementById('agente-storage-list');
  const pagEl  = document.getElementById('agente-storage-pagination');
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:var(--text3);font-size:13px;">Cargando...</div>';
  if (pagEl) pagEl.innerHTML = '';

  try {
    // Los archivos del agente están en agentes/{nombre}/
    const agenteCarpeta = `agentes/${currentUser.nombre}`;
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET)
      .list(agenteCarpeta, { sortBy: { column: 'name', order: 'desc' } });

    if (error) throw error;

    const mesFiltro = document.getElementById('agente-mem-mes')?.value || '';
    let archivos = (data || []).filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'));

    if (mesFiltro) {
      archivos = archivos.filter(f => f.name.startsWith(mesFiltro));
    }

    _agenteStorageItems = archivos;
    _agenteStoragePage = 1;
    _renderAgenteStoragePage();
  } catch(e) {
    listEl.innerHTML = `<p style="color:var(--text3);font-size:13px;">Sin respaldos disponibles.</p>`;
  }
}

function _renderAgenteStoragePage() {
  const listEl = document.getElementById('agente-storage-list');
  const pagEl  = document.getElementById('agente-storage-pagination');
  const items  = _agenteStorageItems;
  const total  = items.length;
  const pages  = Math.ceil(total / _AGENTE_PAGE_SIZE) || 1;
  if (_agenteStoragePage > pages) _agenteStoragePage = 1;
  const page   = items.slice((_agenteStoragePage - 1) * _AGENTE_PAGE_SIZE, _agenteStoragePage * _AGENTE_PAGE_SIZE);
  const agenteCarpeta = `agentes/${currentUser.nombre}`;

  if (total === 0) {
    listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;">Sin respaldos guardados aún.</p>';
    if (pagEl) pagEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${page.map(f => {
        const isPdf = f.name.endsWith('.pdf');
        const base  = f.name.replace(/\.(csv|pdf)$/, '');
        // Nombre puede ser "2026-03" o "2026-03_vendido" etc
        const partes = base.split('_');
        const [yr, mo] = partes[0].split('-');
        const fechaLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo)-1, 1)
          .toLocaleDateString('es-BO',{month:'long',year:'numeric'})
          .replace(/^\w/,c=>c.toUpperCase()) : base;
        const sufijo = partes.slice(1).join('_');
        const size = f.metadata?.size ? `${(f.metadata.size/1024).toFixed(1)} KB` : '';
        const icon = isPdf ? '📄' : '📊';
        const badge = isPdf
          ? `<span style="background:rgba(99,102,241,0.15);border:1px solid #6366f1;color:#a5b4fc;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;">PDF</span>`
          : `<span style="background:rgba(34,211,164,0.15);border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;">CSV</span>`;
        const sufijoLabel = sufijo
          ? `<span style="font-size:10px;color:var(--text3);"> · ${sufijo.replace(/-/g,', ')}</span>`
          : '';
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">${icon}</span>
            <div>
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">
                <span style="font-weight:600;font-size:14px;">${fechaLabel}</span>
                ${badge}
                ${sufijoLabel}
              </div>
              <div style="font-size:11px;color:var(--text3);">${f.name}${size ? ' · ' + size : ''}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            ${isPdf
              ? `<button class="icon-btn" onclick="_verPDFStorageAgente('${agenteCarpeta}/${f.name}')" title="Ver">👁️</button>`
              : `<button class="icon-btn" onclick="_verCSVStorageAgente('${agenteCarpeta}/${f.name}','${f.name}')" title="Ver">👁️</button>`}
            <button class="icon-btn" onclick="_descargarStorageAgente('${agenteCarpeta}/${f.name}','${f.name}')" title="Descargar">💾</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;

  // Paginación
  if (pagEl) {
    if (pages <= 1) { pagEl.innerHTML = ''; return; }
    let html = `<button class="page-btn" onclick="_goAgentePage(${_agenteStoragePage-1})" ${_agenteStoragePage===1?'disabled':''}>‹</button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="page-btn ${i===_agenteStoragePage?'active':''}" onclick="_goAgentePage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" onclick="_goAgentePage(${_agenteStoragePage+1})" ${_agenteStoragePage===pages?'disabled':''}>›</button>`;
    pagEl.innerHTML = html;
  }
}

function _goAgentePage(p) {
  _agenteStoragePage = p;
  _renderAgenteStoragePage();
}

async function _verCSVStorageAgente(path, nombre) {
  try {
    // path incluye la carpeta, pero storage.download necesita la ruta relativa al bucket
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const text = await data.text();
    _mostrarCSVEnModal(text, nombre);
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

async function _verPDFStorageAgente(path) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

async function _descargarStorageAgente(path, nombre) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(data);
    a.download = nombre;
    a.click();
    toast('💾 Descargado', 'success');
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

// ── UI PRINCIPAL (Admin) ──────────────────────────────────────────────────────
function _renderMemoriasUI() {
  const wrap = document.getElementById('memorias-wrap');
  if (!wrap) return;

  const hoy  = new Date();
  const meses = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    if (d < new Date(2026, 0, 1)) break;
    meses.push({
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
              .replace(/^\w/, c => c.toUpperCase()),
    });
  }

  // Chips de estado
  const estadosChips = Object.entries(_ESTADOS_LABELS).map(([k, v]) => {
    const isActive = _memoriaEstadosFiltro.includes(k);
    return `
      <span class="mem-estado-chip ${isActive ? 'active' : ''}"
        data-estado="${k}"
        onclick="_toggleEstadoFiltro('${k}')"
        style="
          display:inline-flex;align-items:center;gap:5px;
          padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;
          cursor:pointer;transition:all 0.18s;
          border:1.5px solid ${isActive ? v.color : 'var(--border)'};
          background:${isActive ? v.color + '22' : 'var(--surface2)'};
          color:${isActive ? v.color : 'var(--text2)'};
          user-select:none;
        ">
        ${v.emoji} ${v.label}
      </span>`;
  }).join('');

  // Selector de agentes para admin
  const agentesOptions = `
    <option value="todos">👥 Todos los agentes</option>
    ${(allAgents || []).filter(a => a.rol === 'agente').map(a =>
      `<option value="${a.id}" data-nombre="${a.nombre}">👤 ${a.nombre}</option>`
    ).join('')}
  `;

  wrap.innerHTML = `
    <!-- SECCIÓN 1: CREAR RESPALDO -->
    <div class="config-card" id="memoria-seccion-crear">
      <div class="config-card-title">📦 Crear respaldo mensual</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;">
        Selecciona el mes, agente y los estados a incluir. Puedes exportar como CSV plano o PDF con diseño.
        Al guardar en Supabase, el archivo se guarda en la carpeta del agente correspondiente.
      </div>

      <!-- Fila: mes + agente + botón preview -->
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Mes</label>
          <select class="filter-select" id="mem-mes-selector" style="min-width:220px;font-size:14px;" onchange="_onMemMesChange()">
            ${meses.map(m => `<option value="${m.valor}">${m.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Agente</label>
          <select class="filter-select" id="mem-agente-selector" style="min-width:200px;font-size:14px;" onchange="_onMemAgenteChange()">
            ${agentesOptions}
          </select>
        </div>
        <button class="btn-save" onclick="_generarPreviewMemoria()" id="mem-btn-preview">
          🔍 Previsualizar
        </button>
      </div>

      <!-- Filtro por estados -->
      <div style="margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Filtrar por estado <span style="color:var(--text3);font-weight:400;">(selecciona uno o varios)</span>
        </div>
        <div id="mem-estados-chips" style="display:flex;flex-wrap:wrap;gap:7px;">
          ${estadosChips}
        </div>
      </div>

      <!-- Preview -->
      <div id="mem-preview-wrap" style="display:none;margin-top:22px;">
        <div id="mem-preview-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;"></div>

        <!-- Botones de exportar -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
          <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">Guardar como:</div>

          <!-- CSV local -->
          <button class="btn-save" onclick="_exportarCSVLocal()" id="mem-btn-csv-local"
            style="background:var(--green);display:flex;align-items:center;gap:6px;">
            💾 CSV — PC
          </button>
          <!-- CSV Supabase -->
          <button class="btn-save" onclick="_exportarCSVStorage()" id="mem-btn-csv-storage"
            style="background:var(--blue);display:flex;align-items:center;gap:6px;">
            ☁️ CSV — Supabase
          </button>
          <!-- PDF local -->
          <button class="btn-save" onclick="_exportarPDFLocal()" id="mem-btn-pdf-local"
            style="background:var(--accent2);color:#0a0a0f;display:flex;align-items:center;gap:6px;">
            🖨️ PDF — PC
          </button>
          <!-- PDF Supabase -->
          <button class="btn-save" onclick="_exportarPDFStorage()" id="mem-btn-pdf-storage"
            style="background:var(--accent);display:flex;align-items:center;gap:6px;">
            ☁️ PDF — Supabase
          </button>
        </div>

        <div id="mem-preview-table-wrap" style="margin-top:4px;overflow-x:auto;max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
        </div>
      </div>
    </div>

    <!-- SECCIÓN 2: RESPALDOS GUARDADOS -->
    <div class="config-card" id="memoria-seccion-storage">
      <div class="config-card-title">🗄️ Respaldos guardados</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="_cargarRespaldosStorage()">🔄 Actualizar lista</button>
        <label class="btn-secondary" style="cursor:pointer;">
          📂 Importar CSV desde PC
          <input type="file" accept=".csv" style="display:none;" onchange="_importarCSVLocal(this)">
        </label>
      </div>

      <!-- Filtro por agente en la lista guardada -->
      <div style="margin-bottom:12px;">
        <label style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Ver respaldos de:</label>
        <select class="filter-select" id="mem-storage-agente-filtro" style="min-width:200px;font-size:14px;" onchange="_cargarRespaldosStorage()">
          <option value="todos">👥 Todos los agentes</option>
          ${(allAgents || []).filter(a => a.rol === 'agente').map(a =>
            `<option value="${a.nombre}">👤 ${a.nombre}</option>`
          ).join('')}
          <option value="_raiz">📁 Raíz (sin agente)</option>
        </select>
      </div>

      <div id="mem-storage-list">
        <div style="color:var(--text3);font-size:13px;">Cargando...</div>
      </div>
    </div>

    <!-- SECCIÓN 3: LIMPIAR -->
    <div class="config-card" id="memoria-seccion-limpiar" style="border-color:rgba(239,68,68,0.3);">
      <div class="config-card-title" style="color:var(--red);">🗑️ Limpiar registros del mes</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.7;">
        Elimina permanentemente los registros de <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;">ventas</code>,
        <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;">venta_items</code> y
        <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;">leads</code> del mes seleccionado.<br>
        <b style="color:var(--text);">La tabla de clientes nunca se toca.</b>
      </div>
      <div id="mem-limpiar-info" style="background:var(--red-bg);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:var(--text2);">
        Primero previsualiza un mes para habilitar la limpieza.
      </div>
      <button class="btn-save" id="mem-btn-limpiar" disabled
        style="background:var(--red);opacity:0.5;cursor:not-allowed;"
        onclick="_confirmarLimpieza()">
        🗑️ Limpiar mes
      </button>
    </div>

    <!-- MODAL PREVISUALIZACIÓN CSV -->
    <div class="modal-overlay" id="mem-csv-modal">
      <div class="modal" style="max-width:90vw;width:90vw;max-height:85vh;">
        <div class="modal-header">
          <div class="modal-title" id="mem-csv-modal-title">📋 Vista previa</div>
          <button class="modal-close" onclick="document.getElementById('mem-csv-modal').classList.remove('open')">×</button>
        </div>
        <div class="modal-body" style="overflow-y:auto;max-height:calc(85vh - 80px);">
          <div id="mem-csv-modal-body"></div>
        </div>
      </div>
    </div>

    <!-- MODAL CONFIRMACIÓN LIMPIEZA -->
    <div class="modal-overlay" id="mem-confirm-modal">
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <div class="modal-title" style="color:var(--red);">⚠️ Confirmar limpieza</div>
          <button class="modal-close" onclick="document.getElementById('mem-confirm-modal').classList.remove('open')">×</button>
        </div>
        <div class="modal-body">
          <div id="mem-confirm-detalle" style="font-size:13px;color:var(--text2);margin-bottom:16px;line-height:1.7;"></div>
          <p style="font-size:13px;color:var(--text2);margin-bottom:8px;">Para confirmar, escribe el mes en formato <b>YYYY-MM</b>:</p>
          <input class="smart-input" id="mem-confirm-input" placeholder="ej: 2026-03" autocomplete="off">
          <div id="mem-confirm-error" style="display:none;color:var(--red);font-size:12px;margin-top:6px;">⚠️ No coincide</div>
          <div class="modal-actions" style="margin-top:20px;">
            <button class="btn-secondary" onclick="document.getElementById('mem-confirm-modal').classList.remove('open')">Cancelar</button>
            <button id="mem-confirm-btn" style="background:var(--red);border:none;border-radius:var(--radius-sm);padding:11px 24px;color:white;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;cursor:pointer;">
              Eliminar permanentemente
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── HELPERS AGENTE SELECTOR ───────────────────────────────────────────────────
function _getAgenteSeleccionado() {
  const sel = document.getElementById('mem-agente-selector');
  if (!sel || sel.value === 'todos') return null;
  const opt = sel.options[sel.selectedIndex];
  return { id: sel.value, nombre: opt.dataset.nombre };
}

function _onMemAgenteChange() {
  // Resetear preview al cambiar de agente
  _onMemMesChange();
}

// ── TOGGLE ESTADO FILTRO ──────────────────────────────────────────────────────
function _toggleEstadoFiltro(estado) {
  if (estado === 'todos') {
    _memoriaEstadosFiltro = ['todos'];
  } else {
    _memoriaEstadosFiltro = _memoriaEstadosFiltro.filter(e => e !== 'todos');
    if (_memoriaEstadosFiltro.includes(estado)) {
      _memoriaEstadosFiltro = _memoriaEstadosFiltro.filter(e => e !== estado);
      if (_memoriaEstadosFiltro.length === 0) _memoriaEstadosFiltro = ['todos'];
    } else {
      _memoriaEstadosFiltro.push(estado);
    }
  }

  // Redibujar chips
  const chipsWrap = document.getElementById('mem-estados-chips');
  if (!chipsWrap) return;
  chipsWrap.querySelectorAll('.mem-estado-chip').forEach(chip => {
    const k = chip.dataset.estado;
    const v = _ESTADOS_LABELS[k];
    const isActive = _memoriaEstadosFiltro.includes(k);
    chip.style.border = `1.5px solid ${isActive ? v.color : 'var(--border)'}`;
    chip.style.background = isActive ? v.color + '22' : 'var(--surface2)';
    chip.style.color = isActive ? v.color : 'var(--text2)';
  });

  if (_memoriaData.length > 0) {
    _actualizarPreviewConFiltro();
  }
}

function _actualizarPreviewConFiltro() {
  const filtrados = _getDataFiltrada();
  _renderPreviewStats(filtrados);
  document.getElementById('mem-preview-table-wrap').innerHTML =
    _buildPreviewTable(filtrados.slice(0, 20), filtrados.length > 20);
}

function _getDataFiltrada() {
  let data = _memoriaData;

  // Filtro por agente (ya aplicado en el fetch, pero doble check)
  const agente = _getAgenteSeleccionado();
  if (agente) {
    data = data.filter(r => r.agente === agente.nombre);
  }

  // Filtro por estado
  if (_memoriaEstadosFiltro.includes('todos')) return data;
  return data.filter(r => _memoriaEstadosFiltro.includes(r.estado));
}

// ── GENERAR PREVIEW ───────────────────────────────────────────────────────────
function _onMemMesChange() {
  document.getElementById('mem-preview-wrap').style.display = 'none';
  _memoriaData = [];
  const btn = document.getElementById('mem-btn-limpiar');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  const info = document.getElementById('mem-limpiar-info');
  if (info) info.innerHTML = 'Primero previsualiza un mes para habilitar la limpieza.';
}

async function _generarPreviewMemoria() {
  const mes = document.getElementById('mem-mes-selector').value;
  if (!mes) return;
  _memoriaMes = mes;

  const btn = document.getElementById('mem-btn-preview');
  btn.textContent = '⏳ Cargando...';
  btn.disabled = true;

  try {
    const [year, month] = mes.split('-').map(Number);
    const desdeStr = `${year}-${String(month).padStart(2,'0')}-01`;
    const hasta    = new Date(year, month, 1);
    const hastaStr = `${hasta.getFullYear()}-${String(hasta.getMonth()+1).padStart(2,'0')}-01`;

    const agente = _getAgenteSeleccionado();

    let query = db.from('ventas')
      .select(`
        id, created_at, fecha, estado, intentos, notas,
        monto_total, descuento_pct, archivado,
        cliente:cliente_id ( celular, nombre, ubicacion ),
        agente:agente_id   ( nombre ),
        venta_items ( id, cantidad, subtotal, producto_id, productos ( nombre ) )
      `)
      .gte('fecha', desdeStr)
      .lt('fecha', hastaStr)
      .order('fecha', { ascending: true });

    // Si se seleccionó un agente específico, filtrar por él
    if (agente) {
      query = query.eq('agente_id', agente.id);
    }

    const { data: ventasData, error } = await query;
    if (error) throw error;

    // Aplanar
    _memoriaData = [];
    for (const v of (ventasData || [])) {
      const items = v.venta_items?.length > 0 ? v.venta_items : [null];
      for (const it of items) {
        _memoriaData.push({
          fecha_creacion: v.created_at ? v.created_at.slice(0, 10) : '',
          fecha_registro: v.fecha || '',
          cliente:        v.cliente?.nombre || 's/n',
          celular:        v.cliente?.celular || '',
          ubicacion:      v.cliente?.ubicacion || '',
          producto:       it?.productos?.nombre || '—',
          cantidad:       it?.cantidad ?? '',
          subtotal:       it?.subtotal ?? '',
          monto_total:    v.monto_total ?? '',
          descuento_pct:  v.descuento_pct ?? 0,
          estado:         v.estado || '',
          archivado:      v.archivado ? 'Sí' : 'No',
          notas:          v.notas || '',
          agente:         v.agente?.nombre || '',
          venta_id:       v.id,
        });
      }
    }

    const filtrados = _getDataFiltrada();

    // Mostrar info de agente seleccionado
    const agenteLabel = agente ? `👤 ${agente.nombre}` : '👥 Todos los agentes';
    const agenteInfo = document.createElement('div');

    if (filtrados.length === 0) {
      document.getElementById('mem-preview-stats').innerHTML =
        `<div style="color:var(--text3);font-size:13px;padding:8px 0;">Sin registros en este período con los filtros seleccionados.</div>`;
      document.getElementById('mem-preview-table-wrap').innerHTML = '';
      document.getElementById('mem-preview-wrap').style.display = '';
      _deshabilitarBotonesExportar();
      return;
    }

    _habilitarBotonesExportar();
    _renderPreviewStats(filtrados, agenteLabel);
    document.getElementById('mem-preview-table-wrap').innerHTML =
      _buildPreviewTable(filtrados.slice(0, 20), filtrados.length > 20);
    document.getElementById('mem-preview-wrap').style.display = '';

    // Habilitar limpieza (siempre sobre datos completos del mes)
    const ventasUnicasTotal = new Set(_memoriaData.map(r => r.venta_id)).size;
    const [d1, d2] = _getRangoMes(mes);
    document.getElementById('mem-limpiar-info').innerHTML = `
      <b style="color:var(--red);">Se eliminarán ${ventasUnicasTotal} registros de ventas</b> del mes completo
      ${agente ? `(agente: <b>${agente.nombre}</b>)` : '(todos los agentes)'}
      (<b>${d1.toLocaleDateString('es-BO')}</b> al <b>${new Date(d2.getTime()-1).toLocaleDateString('es-BO')}</b>).
      También se limpiarán sus items y los leads del mismo período.
    `;
    const btnL = document.getElementById('mem-btn-limpiar');
    btnL.disabled = false; btnL.style.opacity = ''; btnL.style.cursor = '';

  } catch(e) {
    toast('❌ Error generando preview: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.textContent = '🔍 Previsualizar';
    btn.disabled = false;
  }
}

function _deshabilitarBotonesExportar() {
  ['mem-btn-csv-local','mem-btn-csv-storage','mem-btn-pdf-local','mem-btn-pdf-storage'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = true; b.style.opacity = '0.4'; }
  });
}
function _habilitarBotonesExportar() {
  ['mem-btn-csv-local','mem-btn-csv-storage','mem-btn-pdf-local','mem-btn-pdf-storage'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.disabled = false; b.style.opacity = ''; }
  });
}

function _renderPreviewStats(filtrados, agenteLabel) {
  const ventasUnicas  = new Set(filtrados.map(r => r.venta_id)).size;
  const totalUnidades = filtrados.reduce((s, r) => s + (parseInt(r.cantidad) || 0), 0);
  const montoTotal    = [...new Set(filtrados.map(r => r.venta_id))]
    .filter(id => filtrados.find(r => r.venta_id === id)?.estado === 'vendido')
    .reduce((s, id) => {
      const row = filtrados.find(r => r.venta_id === id);
      return s + (parseFloat(row?.monto_total) || 0);
    }, 0);
  const tieneVendidos = filtrados.some(r => r.estado === 'vendido');

  document.getElementById('mem-preview-stats').innerHTML = `
    ${agenteLabel ? `<div style="width:100%;font-size:12px;color:var(--accent2);font-weight:600;margin-bottom:4px;">📁 ${agenteLabel}</div>` : ''}
    <div class="stat-card" style="flex:1;min-width:110px;padding:12px 16px;">
      <div class="stat-value" style="font-size:22px;color:var(--accent2);">${ventasUnicas}</div>
      <div class="stat-label">REGISTROS</div>
    </div>
    <div class="stat-card" style="flex:1;min-width:110px;padding:12px 16px;">
      <div class="stat-value" style="font-size:22px;color:var(--blue);">${totalUnidades}</div>
      <div class="stat-label">UNIDADES</div>
    </div>
    ${tieneVendidos ? `
    <div class="stat-card" style="flex:1;min-width:110px;padding:12px 16px;">
      <div class="stat-value" style="font-size:22px;color:var(--green);">Bs.${montoTotal.toFixed(0)}</div>
      <div class="stat-label">MONTO VENDIDO</div>
    </div>` : ''}
    <div class="stat-card" style="flex:1;min-width:110px;padding:12px 16px;">
      <div class="stat-value" style="font-size:22px;color:var(--text2);">${filtrados.length}</div>
      <div class="stat-label">FILAS</div>
    </div>
  `;
}

function _getRangoMes(mes) {
  const [year, month] = mes.split('-').map(Number);
  return [new Date(year, month - 1, 1), new Date(year, month, 1)];
}

function _buildPreviewTable(rows, truncated) {
  if (rows.length === 0) return '<p style="color:var(--text3);padding:16px;font-size:13px;">Sin registros.</p>';
  const cols    = ['fecha_registro','cliente','celular','ubicacion','producto','cantidad','subtotal','monto_total','descuento_pct','estado','archivado','notas','agente'];
  const headers = ['Fecha','Cliente','Celular','Ubicación','Producto','Cant.','Subtotal','Monto','Desc.%','Estado','Arch.','Notas','Agente'];
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr>${headers.map(h => `<th style="background:var(--surface2);padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr style="border-bottom:1px solid var(--border);">
          ${cols.map(c => `<td style="padding:6px 10px;color:var(--text2);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;" title="${r[c]??''}">${r[c]??''}</td>`).join('')}
        </tr>`).join('')}
        ${truncated ? `<tr><td colspan="${cols.length}" style="padding:10px;text-align:center;color:var(--text3);font-size:12px;">… mostrando primeras 20 filas. El archivo tendrá todas.</td></tr>` : ''}
      </tbody>
    </table>`;
}

// ── CSV ───────────────────────────────────────────────────────────────────────
function _buildCSV(rows) {
  const cols    = ['fecha_creacion','fecha_registro','cliente','celular','ubicacion','producto','cantidad','subtotal','monto_total','descuento_pct','estado','archivado','notas','agente'];
  const headers = ['Fecha Creacion','Fecha Registro','Cliente','Celular','Ubicacion','Producto','Cantidad','Subtotal','Monto Total','Descuento %','Estado','Archivado','Notas','Agente'];
  const escape  = v => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(r => cols.map(c => escape(r[c])).join(','))].join('\n');
}

function _exportarCSVLocal() {
  const filtrados = _getDataFiltrada();
  if (filtrados.length === 0) { toast('⚠️ Primero genera el preview', 'error'); return; }
  const csv  = _buildCSV(filtrados);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `memoria_${_memoriaMes}${_sufijoDeFiltro()}.csv`;
  a.click();
  toast('💾 CSV descargado', 'success');
}

async function _exportarCSVStorage() {
  const filtrados = _getDataFiltrada();
  if (filtrados.length === 0) { toast('⚠️ Primero genera el preview', 'error'); return; }
  const btn = document.getElementById('mem-btn-csv-storage');
  btn.textContent = '⏳ Subiendo...'; btn.disabled = true;
  try {
    const csv  = _buildCSV(filtrados);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const path = _buildStoragePath('csv');
    const { error } = await db.storage.from(MEMORIAS_BUCKET).upload(path, blob, { upsert: true, contentType: 'text/csv' });
    if (error) throw error;
    toast(`☁️ CSV guardado en Supabase → ${path}`, 'success');
    await _cargarRespaldosStorage();
  } catch(e) {
    toast('❌ Error subiendo: ' + e.message, 'error');
  } finally {
    btn.textContent = '☁️ CSV — Supabase'; btn.disabled = false;
  }
}

// ── PATH BUILDER ──────────────────────────────────────────────────────────────
function _buildStoragePath(ext) {
  const agente = _getAgenteSeleccionado();
  const fileName = `${_memoriaMes}${_sufijoDeFiltro()}.${ext}`;
  if (agente) {
    return `agentes/${agente.nombre}/${fileName}`;
  }
  // Si es "todos los agentes", guardar en raíz
  return fileName;
}

function _sufijoDeFiltro() {
  if (_memoriaEstadosFiltro.includes('todos')) return '';
  return '_' + _memoriaEstadosFiltro.join('-');
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function _cargarJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => reject(new Error('No se pudo cargar jsPDF'));
    document.head.appendChild(s);
  });
}

async function _construirPDF() {
  const filtrados = _getDataFiltrada();
  if (filtrados.length === 0) { toast('⚠️ Sin datos para exportar', 'error'); return null; }

  const JsPDF = await _cargarJsPDF();
  const doc   = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W     = doc.internal.pageSize.getWidth();
  const H     = doc.internal.pageSize.getHeight();

  const C = {
    bg:      [10,  10,  20],
    surface: [20,  20,  38],
    accent:  [99,  102, 241],
    green:   [34,  211, 164],
    yellow:  [251, 191, 36],
    red:     [248, 113, 113],
    blue:    [96,  165, 250],
    text:    [230, 230, 255],
    text2:   [140, 140, 180],
    border:  [40,  40,  65],
    white:   [255, 255, 255],
  };

  const estadoColor = {
    vendido:       C.green,
    rellamada:     [167,139,250],
    seguimiento:   C.blue,
    interesado:    C.yellow,
    agendar:       [251,146,60],
    sin_respuesta: C.red,
    no_interesado: C.text2,
    enviado:       C.blue,
    cancelado:     C.red,
    spam:          C.text2,
  };

  const setFill  = c => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke= c => doc.setDrawColor(c[0], c[1], c[2]);
  const setTextC = c => doc.setTextColor(c[0], c[1], c[2]);
  const rect     = (x,y,w,h,r=0) => r ? doc.roundedRect(x,y,w,h,r,r,'F') : doc.rect(x,y,w,h,'F');

  setFill(C.bg); rect(0, 0, W, H);
  setFill(C.surface); rect(0, 0, W, 22);
  setFill(C.accent); rect(0, 0, 4, 22);

  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  setTextC(C.white);
  doc.text('LIT CRM', 9, 14);
  doc.setFontSize(8);
  setTextC(C.accent);
  doc.text('PRO', 28, 10);

  const [year, month] = _memoriaMes.split('-').map(Number);
  const mesLabel = new Date(year, month-1, 1).toLocaleDateString('es-BO', { month:'long', year:'numeric' }).replace(/^\w/,c=>c.toUpperCase());
  const filtroLabel = _memoriaEstadosFiltro.includes('todos') ? 'Todos los estados' :
    _memoriaEstadosFiltro.map(e => _ESTADOS_LABELS[e]?.label || e).join(', ');

  const agente = _getAgenteSeleccionado();
  const agenteLabel = agente ? `Agente: ${agente.nombre}` : 'Todos los agentes';

  doc.setFont('helvetica','bold');
  doc.setFontSize(13);
  setTextC(C.white);
  doc.text(`Memoria — ${mesLabel}`, W/2, 10, { align:'center' });
  doc.setFontSize(7);
  setTextC(C.text2);
  doc.text(`Filtro: ${filtroLabel} · ${agenteLabel}`, W/2, 16, { align:'center' });

  doc.setFontSize(7);
  setTextC(C.text2);
  doc.text(`Generado: ${new Date().toLocaleString('es-BO')}`, W-6, 10, { align:'right' });

  const ventasUnicas  = new Set(filtrados.map(r => r.venta_id)).size;
  const totalUnidades = filtrados.reduce((s,r) => s+(parseInt(r.cantidad)||0), 0);
  const montoTotal    = [...new Set(filtrados.map(r=>r.venta_id))]
    .filter(id => filtrados.find(r=>r.venta_id===id)?.estado==='vendido')
    .reduce((s,id) => s+(parseFloat(filtrados.find(r=>r.venta_id===id)?.monto_total)||0), 0);
  const tieneVendidos = filtrados.some(r => r.estado==='vendido');

  const stats = [
    { label:'REGISTROS', value: ventasUnicas, color: C.accent },
    { label:'UNIDADES',  value: totalUnidades,  color: C.blue  },
    ...(tieneVendidos ? [{ label:'MONTO VENDIDO', value:`Bs.${montoTotal.toFixed(0)}`, color:C.green }] : []),
    { label:'FILAS CSV', value: filtrados.length, color: C.text2 },
  ];

  const cardW = 40, cardH = 18, cardGap = 6;
  const statsStartX = 6;
  let sx = statsStartX;
  const sy = 26;

  stats.forEach(st => {
    setFill(C.surface); doc.roundedRect(sx, sy, cardW, cardH, 2, 2, 'F');
    setFill(st.color);  doc.roundedRect(sx, sy, 3, cardH, 1, 1, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    setTextC(st.color);
    doc.text(String(st.value), sx + 7, sy + 11);
    doc.setFontSize(6);
    setTextC(C.text2);
    doc.text(st.label, sx + 7, sy + 16);
    sx += cardW + cardGap;
  });

  const tableTop = sy + cardH + 6;
  const cols = ['Fecha','Cliente','Celular','Ubicación','Producto','Cant.','Monto','Estado','Agente','Notas'];
  const keys = ['fecha_registro','cliente','celular','ubicacion','producto','cantidad','monto_total','estado','agente','notas'];
  const colW = [18, 32, 22, 30, 28, 10, 18, 22, 22, 50];
  const rowH  = 7;
  const thH   = 8;

  setFill(C.surface);
  rect(6, tableTop, W-12, thH);
  setFill(C.accent);
  rect(6, tableTop, W-12, 1.2);

  let cx = 6;
  doc.setFont('helvetica','bold');
  doc.setFontSize(6.5);
  setTextC(C.accent);
  cols.forEach((c, i) => {
    doc.text(c.toUpperCase(), cx + 2, tableTop + 5.5);
    cx += colW[i];
  });

  let y = tableTop + thH;
  let page = 1;

  filtrados.forEach((row, ri) => {
    if (y + rowH > H - 10) {
      doc.addPage();
      setFill(C.bg); rect(0, 0, W, H);
      setFill(C.surface); rect(0,0,W,10);
      setFill(C.accent);  rect(0,0,4,10);
      doc.setFont('helvetica','bold'); doc.setFontSize(7); setTextC(C.text2);
      doc.text(`LIT CRM · Memoria ${mesLabel} · ${agenteLabel} · pág. ${++page}`, W/2, 7, {align:'center'});
      y = 14;
    }

    const isEven = ri % 2 === 0;
    setFill(isEven ? C.surface : C.bg);
    rect(6, y, W-12, rowH);

    const ec = estadoColor[row.estado] || C.text2;
    setFill(ec); rect(6, y, 1.5, rowH);

    cx = 6;
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.2);
    keys.forEach((k, i) => {
      let val = String(row[k] ?? '');
      if (k === 'monto_total' && val) val = `Bs.${parseFloat(val).toFixed(0)}`;
      if (k === 'estado') {
        setTextC(ec);
        const eLabel = _ESTADOS_LABELS[val]?.label || val;
        doc.text(_truncate(eLabel, colW[i]-3), cx + 3, y + 5);
        setTextC(C.text);
      } else {
        setTextC(C.text);
        doc.text(_truncate(val, colW[i]-3), cx + 3, y + 5);
      }
      cx += colW[i];
    });

    setStroke(C.border);
    doc.setLineWidth(0.1);
    doc.line(6, y + rowH, W-6, y + rowH);

    y += rowH;
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setFill(C.surface); rect(0, H-8, W, 8);
    setFill(C.accent);  rect(0, H-1, W, 1);
    doc.setFont('helvetica','normal'); doc.setFontSize(6); setTextC(C.text2);
    doc.text(`LIT CRM · ${mesLabel} · ${filtroLabel} · ${agenteLabel}`, 8, H-3);
    doc.text(`Pág. ${p} / ${totalPages}`, W-8, H-3, {align:'right'});
  }

  return doc;
}

function _truncate(str, maxMm) {
  const max = Math.floor(maxMm / 0.42);
  if (!str) return '';
  return str.length > max ? str.slice(0, max-1) + '…' : str;
}

async function _exportarPDFLocal() {
  const btn = document.getElementById('mem-btn-pdf-local');
  btn.textContent = '⏳ Generando...'; btn.disabled = true;
  try {
    const doc = await _construirPDF();
    if (!doc) return;
    doc.save(`memoria_${_memoriaMes}${_sufijoDeFiltro()}.pdf`);
    toast('🖨️ PDF descargado', 'success');
  } catch(e) {
    toast('❌ Error PDF: ' + e.message, 'error'); console.error(e);
  } finally {
    btn.textContent = '🖨️ PDF — PC'; btn.disabled = false;
  }
}

async function _exportarPDFStorage() {
  const btn = document.getElementById('mem-btn-pdf-storage');
  btn.textContent = '⏳ Subiendo...'; btn.disabled = true;
  try {
    const doc = await _construirPDF();
    if (!doc) return;
    const pdfBytes = doc.output('arraybuffer');
    const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
    const path     = _buildStoragePath('pdf');
    const { error } = await db.storage.from(MEMORIAS_BUCKET).upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (error) throw error;
    toast(`☁️ PDF guardado → ${path}`, 'success');
    await _cargarRespaldosStorage();
  } catch(e) {
    toast('❌ Error subiendo PDF: ' + e.message, 'error'); console.error(e);
  } finally {
    btn.textContent = '☁️ PDF — Supabase'; btn.disabled = false;
  }
}

// ── STORAGE LIST (Admin) ──────────────────────────────────────────────────────
async function _cargarRespaldosStorage() {
  const listEl = document.getElementById('mem-storage-list');
  if (!listEl) return;

  const filtroAgente = document.getElementById('mem-storage-agente-filtro')?.value || 'todos';

  try {
    let archivos = [];

    if (filtroAgente === 'todos') {
      // Cargar raíz + todas las carpetas de agentes
      const [{ data: raizData }, { data: carpetasData }] = await Promise.all([
        db.storage.from(MEMORIAS_BUCKET).list('', { sortBy: { column: 'name', order: 'desc' } }),
        db.storage.from(MEMORIAS_BUCKET).list('agentes', { sortBy: { column: 'name', order: 'asc' } }),
      ]);

      // Archivos en raíz
      const raizArchivos = (raizData || [])
        .filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'))
        .map(f => ({ ...f, _path: f.name, _agenteLabel: '📁 Raíz' }));

      // Archivos dentro de agentes/
      const carpetas = (carpetasData || []).filter(f => !f.name.includes('.'));
      const carpetaPromises = carpetas.map(c =>
        db.storage.from(MEMORIAS_BUCKET).list(`agentes/${c.name}`, { sortBy: { column: 'name', order: 'desc' } })
          .then(({ data }) => (data || [])
            .filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'))
            .map(f => ({ ...f, _path: `agentes/${c.name}/${f.name}`, _agenteLabel: `👤 ${c.name}` }))
          )
      );
      const carpetaResults = await Promise.all(carpetaPromises);
      const agentesArchivos = carpetaResults.flat();

      archivos = [...agentesArchivos.sort((a,b) => b.name.localeCompare(a.name)), ...raizArchivos];

    } else if (filtroAgente === '_raiz') {
      const { data } = await db.storage.from(MEMORIAS_BUCKET).list('', { sortBy: { column: 'name', order: 'desc' } });
      archivos = (data || [])
        .filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'))
        .map(f => ({ ...f, _path: f.name, _agenteLabel: '📁 Raíz' }));
    } else {
      // Agente específico
      const { data } = await db.storage.from(MEMORIAS_BUCKET)
        .list(`agentes/${filtroAgente}`, { sortBy: { column: 'name', order: 'desc' } });
      archivos = (data || [])
        .filter(f => f.name.endsWith('.csv') || f.name.endsWith('.pdf'))
        .map(f => ({ ...f, _path: `agentes/${filtroAgente}/${f.name}`, _agenteLabel: `👤 ${filtroAgente}` }));
    }

    if (archivos.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;">Sin respaldos guardados aún.</p>';
      return;
    }

    listEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${archivos.map(f => {
          const isPdf = f.name.endsWith('.pdf');
          const base  = f.name.replace(/\.(csv|pdf)$/, '');
          const [yr, mo] = base.split('_')[0].split('-');
          const fechaLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo)-1, 1)
            .toLocaleDateString('es-BO',{month:'long',year:'numeric'})
            .replace(/^\w/,c=>c.toUpperCase()) : base;
          const size = f.metadata?.size ? `${(f.metadata.size/1024).toFixed(1)} KB` : '';
          const icon = isPdf ? '📄' : '📊';
          const badge = isPdf
            ? `<span style="background:rgba(99,102,241,0.15);border:1px solid #6366f1;color:#a5b4fc;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;">PDF</span>`
            : `<span style="background:rgba(34,211,164,0.15);border:1px solid var(--green);color:var(--green);font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;">CSV</span>`;
          const agenteBadge = f._agenteLabel
            ? `<span style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:10px;padding:2px 7px;border-radius:10px;">${f._agenteLabel}</span>`
            : '';
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:20px;">${icon}</span>
              <div>
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap;">
                  <span style="font-weight:600;font-size:14px;">${fechaLabel}</span>
                  ${badge}
                  ${agenteBadge}
                </div>
                <div style="font-size:11px;color:var(--text3);">${f._path}${size ? ' · ' + size : ''}</div>
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              ${isPdf
                ? `<button class="icon-btn" onclick="_verPDFStorage('${f._path}')" title="Ver">👁️</button>`
                : `<button class="icon-btn" onclick="_verRespaldoStorage('${f._path}')" title="Ver">👁️</button>`}
              <button class="icon-btn" onclick="_descargarRespaldoStorage('${f._path}','${f.name}')" title="Descargar">💾</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {
    listEl.innerHTML = `<p style="color:var(--text3);font-size:13px;">Sin respaldos aún.</p>`;
  }
}

async function _verRespaldoStorage(path) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const text = await data.text();
    _mostrarCSVEnModal(text, path.split('/').pop());
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

async function _verPDFStorage(path) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

async function _descargarRespaldoStorage(path, nombre) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(path);
    if (error) throw error;
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(data);
    a.download = nombre || path.split('/').pop();
    a.click();
    toast('💾 Descargado', 'success');
  } catch(e) { toast('❌ Error: ' + e.message, 'error'); }
}

function _importarCSVLocal(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => _mostrarCSVEnModal(e.target.result, file.name);
  reader.readAsText(file, 'UTF-8');
  input.value = '';
}

function _mostrarCSVEnModal(csvText, titulo) {
  const lines = csvText.replace(/^\uFEFF/, '').trim().split('\n');
  if (lines.length < 2) { toast('⚠️ CSV vacío', 'error'); return; }
  const parseRow = line => {
    const result = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += ch;
    }
    result.push(cur);
    return result.map(v => v.replace(/^"|"$/g,'').replace(/""/g,'"'));
  };
  const headers = parseRow(lines[0]);
  const rows    = lines.slice(1).map(parseRow);
  document.getElementById('mem-csv-modal-title').textContent = `📋 ${titulo} — ${rows.length} filas`;
  document.getElementById('mem-csv-modal-body').innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>${headers.map(h=>`<th style="background:var(--surface2);padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r=>`<tr style="border-bottom:1px solid var(--border);">${r.map(v=>`<td style="padding:6px 10px;color:var(--text2);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${v}">${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
  document.getElementById('mem-csv-modal').classList.add('open');
}

// ── LIMPIAR ───────────────────────────────────────────────────────────────────
function _confirmarLimpieza() {
  if (!_memoriaMes) return;
  const [d1, d2] = _getRangoMes(_memoriaMes);
  const label = d1.toLocaleDateString('es-BO', { month:'long', year:'numeric' }).replace(/^\w/,c=>c.toUpperCase());
  document.getElementById('mem-confirm-detalle').innerHTML = `
    Estás por eliminar <b style="color:var(--red);">permanentemente</b> todos los registros de ventas,
    items y leads creados en <b>${label}</b>
    (del ${d1.toLocaleDateString('es-BO')} al ${new Date(d2.getTime()-1).toLocaleDateString('es-BO')}).<br><br>
    <b style="color:var(--text);">La tabla de clientes NO se toca.</b><br>
    Esta acción no se puede deshacer.
  `;
  document.getElementById('mem-confirm-input').value = '';
  document.getElementById('mem-confirm-error').style.display = 'none';
  document.getElementById('mem-confirm-modal').classList.add('open');
  document.getElementById('mem-confirm-btn').onclick = async () => {
    const typed = document.getElementById('mem-confirm-input').value.trim();
    if (typed !== _memoriaMes) { document.getElementById('mem-confirm-error').style.display = ''; return; }
    document.getElementById('mem-confirm-modal').classList.remove('open');
    await _ejecutarLimpieza();
  };
}

async function _ejecutarLimpieza() {
  const [desde, hasta] = _getRangoMes(_memoriaMes);
  const desdeStr = `${desde.getFullYear()}-${String(desde.getMonth()+1).padStart(2,'0')}-01`;
  const hastaStr = `${hasta.getFullYear()}-${String(hasta.getMonth()+1).padStart(2,'0')}-01`;

  const btn = document.getElementById('mem-btn-limpiar');
  btn.textContent = '⏳ Limpiando...'; btn.disabled = true;

  try {
    const { data: ventasDelMes, error: e1 } = await db.from('ventas')
      .select('id').gte('fecha', desdeStr).lt('fecha', hastaStr);
    if (e1) throw e1;
    const ids = (ventasDelMes || []).map(v => v.id);

    if (ids.length > 0) {
      const { error: e2 } = await db.from('venta_items').delete().in('venta_id', ids);
      if (e2) throw e2;
      const { error: e3 } = await db.from('ventas').delete().in('id', ids);
      if (e3) throw e3;
    }

    const { error: e4 } = await db.from('leads')
      .delete().gte('created_at', desde.toISOString()).lt('created_at', hasta.toISOString());
    if (e4) throw e4;

    toast(`✅ Limpieza completada — ${ids.length} registros eliminados`, 'success');

    _memoriaData = []; _memoriaMes = '';
    document.getElementById('mem-preview-wrap').style.display = 'none';
    document.getElementById('mem-limpiar-info').innerHTML = 'Primero previsualiza un mes para habilitar la limpieza.';
    btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed';
    btn.textContent = '🗑️ Limpiar mes';

    if (typeof loadVentas === 'function') { await loadVentas(); renderDashboard(); renderVentas(); }
    if (typeof _cargarLeadsPendientes === 'function') await _cargarLeadsPendientes();

  } catch(e) {
    toast('❌ Error en limpieza: ' + e.message, 'error');
    btn.textContent = '🗑️ Limpiar mes'; btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = '';
  }
}