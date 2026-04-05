// memorias.js — Componente de respaldo mensual

const MEMORIAS_BUCKET = 'memorias';

// ── INIT ─────────────────────────────────────────────────────────────────────
async function renderMemorias() {
  await _ensureBucket();
  _renderMemoriasUI();
  await _cargarRespaldosStorage();
}

async function _ensureBucket() {
  // Solo verificar acceso — no intentar crear el bucket
  try {
    await db.storage.from(MEMORIAS_BUCKET).list('', { limit: 1 });
  } catch(e) {
    console.warn('Bucket memorias no accesible:', e.message);
  }
}

// ── UI PRINCIPAL ──────────────────────────────────────────────────────────────
function _renderMemoriasUI() {
  const wrap = document.getElementById('memorias-wrap');
  if (!wrap) return;

  const hoy = new Date();
  const meses = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    // Solo incluir desde Enero 2026
    if (d < new Date(2026, 0, 1)) break;
    meses.push({
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
        .replace(/^\w/, c => c.toUpperCase()),
    });
  }

  wrap.innerHTML = `
    <!-- SECCIÓN 1: CREAR RESPALDO -->
    <div class="config-card" id="memoria-seccion-crear">
      <div class="config-card-title">📦 Crear respaldo mensual</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:16px;">
        Selecciona el mes a respaldar. Se exportarán todos los registros creados en ese período.
      </div>
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div>
          <label style="display:block;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Mes</label>
          <select class="filter-select" id="mem-mes-selector" style="min-width:220px;font-size:14px;" onchange="_onMemMesChange()">
            ${meses.map(m => `<option value="${m.valor}">${m.label}</option>`).join('')}
          </select>
        </div>
        <button class="btn-save" onclick="_generarPreviewMemoria()" id="mem-btn-preview">
          🔍 Previsualizar
        </button>
      </div>

      <!-- Preview -->
      <div id="mem-preview-wrap" style="display:none;margin-top:20px;">
        <div id="mem-preview-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-save" onclick="_exportarCSVLocal()" id="mem-btn-local" style="background:var(--green);">
            💾 Descargar en PC
          </button>
          <button class="btn-save" onclick="_exportarCSVStorage()" id="mem-btn-storage">
            ☁️ Guardar en Supabase
          </button>
        </div>
        <div id="mem-preview-table-wrap" style="margin-top:16px;overflow-x:auto;max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);">
        </div>
      </div>
    </div>

    <!-- SECCIÓN 2: RESPALDOS GUARDADOS -->
    <div class="config-card" id="memoria-seccion-storage">
      <div class="config-card-title">🗄️ Respaldos guardados</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="_cargarRespaldosStorage()">🔄 Actualizar lista</button>
        <label class="btn-secondary" style="cursor:pointer;">
          📂 Importar desde PC
          <input type="file" accept=".csv" style="display:none;" onchange="_importarCSVLocal(this)">
        </label>
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
        <code style="background:var(--surface2);padding:2px 6px;border-radius:4px;">leads</code> del mes seleccionado arriba.<br>
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

// ── ESTADO INTERNO ────────────────────────────────────────────────────────────
let _memoriaData = []; // filas del mes actual
let _memoriaMes = '';  // "2026-03"

function _onMemMesChange() {
  // Al cambiar mes, limpiar preview y deshabilitar limpiar
  document.getElementById('mem-preview-wrap').style.display = 'none';
  _memoriaData = [];
  const btn = document.getElementById('mem-btn-limpiar');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
  document.getElementById('mem-limpiar-info').innerHTML =
    'Primero previsualiza un mes para habilitar la limpieza.';
}

// ── GENERAR PREVIEW ───────────────────────────────────────────────────────────
async function _generarPreviewMemoria() {
  const mes = document.getElementById('mem-mes-selector').value;
  if (!mes) return;
  _memoriaMes = mes;

  const btn = document.getElementById('mem-btn-preview');
  btn.textContent = '⏳ Cargando...';
  btn.disabled = true;

  try {
    const [year, month] = mes.split('-').map(Number);
    // Usar fechas locales para evitar desfase de zona horaria
    const desdeStr = `${year}-${String(month).padStart(2,'0')}-01`;
    const hasta = new Date(year, month, 1); // primer día del mes siguiente
    const hastaStr = `${hasta.getFullYear()}-${String(hasta.getMonth()+1).padStart(2,'0')}-01`;

    const { data: ventasData, error } = await db.from('ventas')
      .select(`
        id, created_at, fecha, estado, intentos, notas,
        monto_total, descuento_pct, archivado,
        cliente:cliente_id ( celular, nombre, ubicacion ),
        agente:agente_id ( nombre ),
        venta_items ( id, cantidad, subtotal, producto_id,
          productos ( nombre )
        )
      `)
      .gte('fecha', desdeStr)
      .lt('fecha', hastaStr)
      .order('fecha', { ascending: true });

    if (error) throw error;

    // Aplanar: una fila por venta_item
    _memoriaData = [];
    for (const v of (ventasData || [])) {
      const items = v.venta_items?.length > 0 ? v.venta_items : [null];
      for (const it of items) {
        _memoriaData.push({
          fecha_creacion:  v.created_at ? v.created_at.slice(0, 10) : '',
          fecha_registro:  v.fecha || '',
          cliente:         v.cliente?.nombre || 's/n',
          celular:         v.cliente?.celular || '',
          ubicacion:       v.cliente?.ubicacion || '',
          producto:        it?.productos?.nombre || '—',
          cantidad:        it?.cantidad ?? '',
          subtotal:        it?.subtotal ?? '',
          monto_total:     v.monto_total ?? '',
          descuento_pct:   v.descuento_pct ?? 0,
          estado:          v.estado || '',
          archivado:       v.archivado ? 'Sí' : 'No',
          notas:           v.notas || '',
          agente:          v.agente?.nombre || '',
          venta_id:        v.id,
        });
      }
    }

    if (_memoriaData.length === 0) {
      document.getElementById('mem-preview-stats').innerHTML = `
        <div style="color:var(--text3);font-size:13px;padding:8px 0;">
          Sin registros en este período.
        </div>`;
      document.getElementById('mem-preview-table-wrap').innerHTML = '';
      document.getElementById('mem-preview-wrap').style.display = '';
      // Deshabilitar botones de exportar
      document.getElementById('mem-btn-local').disabled = true;
      document.getElementById('mem-btn-storage').disabled = true;
      document.getElementById('mem-btn-local').style.opacity = '0.4';
      document.getElementById('mem-btn-storage').style.opacity = '0.4';
      return;
    }

    // Habilitar botones
    document.getElementById('mem-btn-local').disabled = false;
    document.getElementById('mem-btn-storage').disabled = false;
    document.getElementById('mem-btn-local').style.opacity = '';
    document.getElementById('mem-btn-storage').style.opacity = '';

    // Stats
    const ventasUnicas = new Set(_memoriaData.map(r => r.venta_id)).size;
    const totalUnidades = _memoriaData.reduce((s, r) => s + (parseInt(r.cantidad) || 0), 0);
    const montoTotal = [...new Set(_memoriaData.map(r => r.venta_id))]
      .filter(id => _memoriaData.find(r => r.venta_id === id)?.estado === 'vendido')
      .reduce((s, id) => {
        const row = _memoriaData.find(r => r.venta_id === id);
        return s + (parseFloat(row?.monto_total) || 0);
      }, 0);

    document.getElementById('mem-preview-stats').innerHTML = `
      <div class="stat-card" style="flex:1;min-width:120px;padding:12px 16px;">
        <div class="stat-value" style="font-size:24px;color:var(--accent2);">${ventasUnicas}</div>
        <div class="stat-label">REGISTROS</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:120px;padding:12px 16px;">
        <div class="stat-value" style="font-size:24px;color:var(--blue);">${totalUnidades}</div>
        <div class="stat-label">UNIDADES</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:120px;padding:12px 16px;">
        <div class="stat-value" style="font-size:24px;color:var(--green);">Bs.${montoTotal.toFixed(0)}</div>
        <div class="stat-label">MONTO TOTAL</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:120px;padding:12px 16px;">
        <div class="stat-value" style="font-size:24px;color:var(--text2);">${_memoriaData.length}</div>
        <div class="stat-label">FILAS CSV</div>
      </div>
    `;

    document.getElementById('mem-preview-table-wrap').innerHTML =
      _buildPreviewTable(_memoriaData.slice(0, 20), _memoriaData.length > 20);
    document.getElementById('mem-preview-wrap').style.display = '';

    // Habilitar limpieza
    const [d1, d2] = _getRangoMes(mes);
    document.getElementById('mem-limpiar-info').innerHTML = `
      <b style="color:var(--red);">Se eliminarán ${ventasUnicas} registros de ventas</b> creados entre 
      <b>${d1.toLocaleDateString('es-BO')}</b> y 
      <b>${new Date(d2.getTime()-1).toLocaleDateString('es-BO')}</b>.
      También se limpiarán sus items y los leads del mismo período.
    `;
    const btnL = document.getElementById('mem-btn-limpiar');
    btnL.disabled = false;
    btnL.style.opacity = '';
    btnL.style.cursor = '';

  } catch(e) {
    toast('❌ Error generando preview: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.textContent = '🔍 Previsualizar';
    btn.disabled = false;
  }
}

function _getRangoMes(mes) {
  const [year, month] = mes.split('-').map(Number);
  const desde = new Date(year, month - 1, 1);
  const hasta = new Date(year, month, 1);
  return [desde, hasta];
}

function _buildPreviewTable(rows, truncated) {
  if (rows.length === 0) return '<p style="color:var(--text3);padding:16px;font-size:13px;">Sin registros en este período.</p>';
  const cols = ['fecha_creacion','fecha_registro','cliente','celular','ubicacion','producto','cantidad','subtotal','monto_total','descuento_pct','estado','archivado','notas','agente'];
  const headers = ['Creado','Fecha','Cliente','Celular','Ubicación','Producto','Cant.','Subtotal','Monto','Desc.%','Estado','Archivado','Notas','Agente'];
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr>${headers.map(h => `<th style="background:var(--surface2);padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;">${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr style="border-bottom:1px solid var(--border);">
          ${cols.map(c => `<td style="padding:6px 10px;color:var(--text2);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;" title="${r[c]||''}">${r[c]??''}</td>`).join('')}
        </tr>`).join('')}
        ${truncated ? `<tr><td colspan="${cols.length}" style="padding:10px;text-align:center;color:var(--text3);font-size:12px;">… mostrando primeras 20 filas. El CSV tendrá todas.</td></tr>` : ''}
      </tbody>
    </table>`;
}

// ── EXPORTAR CSV ──────────────────────────────────────────────────────────────
function _buildCSV(rows) {
  const cols = ['fecha_creacion','fecha_registro','cliente','celular','ubicacion','producto','cantidad','subtotal','monto_total','descuento_pct','estado','archivado','notas','agente'];
  const headers = ['Fecha Creacion','Fecha Registro','Cliente','Celular','Ubicacion','Producto','Cantidad','Subtotal','Monto Total','Descuento %','Estado','Archivado','Notas','Agente'];
  const escape = v => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  return [
    headers.join(','),
    ...rows.map(r => cols.map(c => escape(r[c])).join(','))
  ].join('\n');
}

function _exportarCSVLocal() {
  if (_memoriaData.length === 0) { toast('⚠️ Primero genera el preview', 'error'); return; }
  const csv = _buildCSV(_memoriaData);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `memoria_${_memoriaMes}.csv`;
  a.click();
  toast('💾 CSV descargado', 'success');
}

async function _exportarCSVStorage() {
  if (_memoriaData.length === 0) { toast('⚠️ Primero genera el preview', 'error'); return; }
  const btn = document.getElementById('mem-btn-storage');
  btn.textContent = '⏳ Subiendo...';
  btn.disabled = true;
  try {
    const csv = _buildCSV(_memoriaData);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const path = `${_memoriaMes}.csv`;
    const { error } = await db.storage.from(MEMORIAS_BUCKET).upload(path, blob, { upsert: true, contentType: 'text/csv' });
    if (error) throw error;
    toast('☁️ Guardado en Supabase Storage', 'success');
    await _cargarRespaldosStorage();
  } catch(e) {
    toast('❌ Error subiendo: ' + e.message, 'error');
  } finally {
    btn.textContent = '☁️ Guardar en Supabase';
    btn.disabled = false;
  }
}

// ── STORAGE LIST ──────────────────────────────────────────────────────────────
async function _cargarRespaldosStorage() {
  const listEl = document.getElementById('mem-storage-list');
  if (!listEl) return;
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).list('', { sortBy: { column: 'name', order: 'desc' } });
    if (error) throw error;
    const archivos = (data || []).filter(f => f.name.endsWith('.csv'));
    if (archivos.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text3);font-size:13px;">Sin respaldos guardados aún.</p>';
      return;
    }
    listEl.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${archivos.map(f => {
          const label = f.name.replace('.csv', '');
          const [yr, mo] = label.split('-');
          const fecha = yr && mo ? new Date(parseInt(yr), parseInt(mo)-1, 1).toLocaleDateString('es-BO',{month:'long',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase()) : label;
          const size = f.metadata?.size ? `${(f.metadata.size/1024).toFixed(1)} KB` : '';
          return `
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;">
            <div>
              <div style="font-weight:600;font-size:14px;">📅 ${fecha}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px;">${f.name} ${size ? '· ' + size : ''}</div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="icon-btn" onclick="_verRespaldoStorage('${f.name}')" title="Ver">👁️</button>
              <button class="icon-btn" onclick="_descargarRespaldoStorage('${f.name}')" title="Descargar">💾</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  } catch(e) {
    listEl.innerHTML = `<p style="color:var(--red);font-size:13px;">Error cargando lista: ${e.message}</p>`;
  }
}

async function _verRespaldoStorage(nombre) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(nombre);
    if (error) throw error;
    const text = await data.text();
    _mostrarCSVEnModal(text, nombre);
  } catch(e) {
    toast('❌ Error descargando: ' + e.message, 'error');
  }
}

async function _descargarRespaldoStorage(nombre) {
  try {
    const { data, error } = await db.storage.from(MEMORIAS_BUCKET).download(nombre);
    if (error) throw error;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(data);
    a.download = nombre;
    a.click();
    toast('💾 Descargado', 'success');
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
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
    const result = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += ch;
    }
    result.push(cur);
    return result.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
  };
  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  document.getElementById('mem-csv-modal-title').textContent = `📋 ${titulo} — ${rows.length} filas`;
  document.getElementById('mem-csv-modal-body').innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>${headers.map(h => `<th style="background:var(--surface2);padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);white-space:nowrap;">${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr style="border-bottom:1px solid var(--border);">
            ${r.map(v => `<td style="padding:6px 10px;color:var(--text2);white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${v}">${v}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  document.getElementById('mem-csv-modal').classList.add('open');
}

// ── LIMPIAR ───────────────────────────────────────────────────────────────────
function _confirmarLimpieza() {
  if (!_memoriaMes) return;
  const [d1, d2] = _getRangoMes(_memoriaMes);
  const label = d1.toLocaleDateString('es-BO', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

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
    if (typed !== _memoriaMes) {
      document.getElementById('mem-confirm-error').style.display = '';
      return;
    }
    document.getElementById('mem-confirm-modal').classList.remove('open');
    await _ejecutarLimpieza();
  };
}

async function _ejecutarLimpieza() {
  const [desde, hasta] = _getRangoMes(_memoriaMes);
  const desdeISO = desde.toISOString();
  const hastaISO = hasta.toISOString();

  const btn = document.getElementById('mem-btn-limpiar');
  btn.textContent = '⏳ Limpiando...';
  btn.disabled = true;

  try {
    // 1. Obtener IDs de ventas del mes
    const { data: ventasDelMes, error: e1 } = await db.from('ventas')
      .select('id')
      .gte('created_at', desdeISO)
      .lt('created_at', hastaISO);
    if (e1) throw e1;

    const ids = (ventasDelMes || []).map(v => v.id);

    if (ids.length > 0) {
      // 2. Eliminar venta_items
      const { error: e2 } = await db.from('venta_items').delete().in('venta_id', ids);
      if (e2) throw e2;

      // 3. Eliminar ventas
      const { error: e3 } = await db.from('ventas').delete().in('id', ids);
      if (e3) throw e3;
    }

    // 4. Eliminar leads del mismo período
    const { error: e4 } = await db.from('leads')
      .delete()
      .gte('created_at', desdeISO)
      .lt('created_at', hastaISO);
    if (e4) throw e4;

    toast(`✅ Limpieza completada — ${ids.length} registros eliminados`, 'success');

    // Recargar datos en memoria
    _memoriaData = [];
    _memoriaMes = '';
    document.getElementById('mem-preview-wrap').style.display = 'none';
    document.getElementById('mem-limpiar-info').innerHTML = 'Primero previsualiza un mes para habilitar la limpieza.';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.textContent = '🗑️ Limpiar mes';

    // Recargar ventas en app
    if (typeof loadVentas === 'function') {
      await loadVentas();
      renderDashboard();
      renderVentas();
    }
    if (typeof _cargarLeadsPendientes === 'function') {
      await _cargarLeadsPendientes();
    }

  } catch(e) {
    toast('❌ Error en limpieza: ' + e.message, 'error');
    btn.textContent = '🗑️ Limpiar mes';
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
  }
}