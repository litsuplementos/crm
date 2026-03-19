// ═══════════════════════════════════════════════
// GUÍA DE ATENCIÓN AL CLIENTE
// Módulo independiente - no toca app.js
// ═══════════════════════════════════════════════

// El contenido se guarda como:
// { col1: [...items], col2: [...items] }
// Compatibilidad: si viene array plano legacy, se trata como col1

function _normalizeContenido(contenido) {
  if (!contenido) return { col1: [], col2: [] };
  if (Array.isArray(contenido)) return { col1: contenido, col2: [] };
  return { col1: contenido.col1 || [], col2: contenido.col2 || [] };
}

// ── RENDER PRINCIPAL ────────────────────────────
async function renderGuia() {
  try {
    const [{ data: prods, error: errProds }, { data: guiaData, error: errGuia }] =
      await Promise.all([
        db.from('productos').select('id,nombre').eq('activo', true).order('nombre'),
        db.from('guia_atencion').select('producto_id,contenido'),
      ]);
    if (errProds) throw errProds;
    if (errGuia) throw errGuia;

    const guiaMap = Object.fromEntries((guiaData || []).map(g => [g.producto_id, g]));
    const wrap = document.getElementById('guia-productos-wrap');

    wrap.innerHTML = prods.map(prod => {
      const norm = _normalizeContenido(guiaMap[prod.id]?.contenido);
      const total = norm.col1.length + norm.col2.length;
      return `
      <div class="dash-card" style="padding:18px;cursor:pointer;transition:all 0.2s;"
           onclick="openGuiaProductoModal(${prod.id},'${prod.nombre}')"
           onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface2)'"
           onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-family:'Syne','Noto Color Emoji',sans-serif;font-weight:700;font-size:16px;">${prod.nombre}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:3px;">
              ${total} elemento${total !== 1 ? 's' : ''}
            </div>
          </div>
          <div style="font-size:24px;">→</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
}

// ── MODAL GUÍA ──────────────────────────────────
function closeGuiaModal() {
  document.getElementById('guia-modal').classList.remove('open');
}

let _guiaActiveProdId = null;
let _guiaActiveProdNombre = null;

function _renderColumna(items) {
  if (!items || items.length === 0) return '';
  return items.map(item => `
    <div class="guia-item-expandible" style="border-bottom:1px solid var(--border);">
      <div onclick="toggleGuiaItemExpand(this)"
           style="padding:16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;"
           onmouseover="this.style.background='var(--surface2)'"
           onmouseout="this.style.background=''">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${item.titulo || ''}</div>
          <div style="font-size:11px;color:var(--text3);">${item.subtitulo || ''}</div>
        </div>
        <div style="font-size:18px;transition:transform 0.3s;margin-left:12px;" class="guia-expand-icon">▼</div>
      </div>
      <div class="guia-item-content" style="display:none;padding:12px 16px;background:var(--surface);border-top:1px solid var(--border);">
        ${item.imagen ? `<img src="${item.imagen}" style="width:100%;max-height:200px;border-radius:8px;margin-bottom:12px;object-fit:cover;">` : ''}
        <div style="font-size:13px;color:var(--text2);line-height:1.8;word-wrap:break-word;white-space:pre-line;">
          ${item.contenido || ''}
        </div>
      </div>
    </div>`).join('');
}

function openGuiaProductoModal(prodId, prodNombre) {
  const isAdmin = currentUser?.rol === 'admin';
  _guiaActiveProdId = prodId;
  _guiaActiveProdNombre = prodNombre;

  db.from('guia_atencion')
    .select('*').eq('producto_id', prodId).maybeSingle()
    .then(({ data: guia }) => {
      const norm = _normalizeContenido(guia?.contenido);

      document.getElementById('guia-modal-title').textContent = prodNombre;

      const editBtn = document.getElementById('guia-edit-btn');
      editBtn.style.display = isAdmin ? '' : 'none';
      editBtn.onclick = () => {
        closeGuiaModal();
        setTimeout(() => openGuiaEditor(prodId, prodNombre), 50);
      };

      const col1Html = _renderColumna(norm.col1);
      const col2Html = _renderColumna(norm.col2);
      const emptyMsg = '<div style="color:var(--text3);font-size:13px;padding:24px;text-align:center;">Sin contenido</div>';

      document.getElementById('guia-modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:70% 30%;min-height:200px;">
          <div style="border-right:1px solid var(--border);overflow-y:auto;max-height:calc(90vh - 140px);">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Principal</div>
            ${col1Html || emptyMsg}
          </div>
          <div style="overflow-y:auto;max-height:calc(90vh - 140px);">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Complementaria</div>
            ${col2Html || emptyMsg}
          </div>
        </div>`;

      document.getElementById('guia-modal').classList.add('open');
    });
}

function toggleGuiaItemExpand(element) {
  const itemDiv = element.closest('.guia-item-expandible');
  const content = itemDiv.querySelector('.guia-item-content');
  const icon = itemDiv.querySelector('.guia-expand-icon');
  const isOpen = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : '';
  icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ── EDITOR (admin) ───────────────────────────────
let _guiaEditorModal = null;

function _closeGuiaEditor() {
  if (_guiaEditorModal) {
    _guiaEditorModal.remove();
    _guiaEditorModal = null;
  }
}

function _closeGuiaEditorAndReturn() {
  _closeGuiaEditor();
  if (_guiaActiveProdId !== null) {
    setTimeout(() => openGuiaProductoModal(_guiaActiveProdId, _guiaActiveProdNombre), 50);
  }
}

async function openGuiaEditor(prodId, prodNombre) {
  const { data: guia, error } = await db.from('guia_atencion')
    .select('*').eq('producto_id', prodId).maybeSingle();

  if (error && error.code !== 'PGRST116') {
    toast('❌ Error: ' + error.message, 'error');
    return;
  }

  const norm = _normalizeContenido(guia?.contenido);
  const guiaId = guia?.id || null;

  _closeGuiaEditor();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:1100px;">
      <div class="modal-header">
        <div class="modal-title">Editar: ${prodNombre}</div>
        <button class="modal-close" onclick="_closeGuiaEditorAndReturn()">×</button>
      </div>
      <div class="modal-body" style="padding:0;">
        <div style="display:grid;grid-template-columns:70% 30%;min-height:400px;">

          <!-- COLUMNA 1 -->
          <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;">
            <div style="padding:12px 16px;font-size:11px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Principal</div>
            <div id="guia-editor-col1" style="display:flex;flex-direction:column;gap:10px;padding:14px;flex:1;"></div>
            <div style="padding:0 14px 14px;">
              <button type="button" onclick="addGuiaItemRow('col1')"
                style="background:var(--surface2);border:1px dashed var(--border);border-radius:8px;
                       padding:8px 14px;color:var(--text2);font-size:13px;cursor:pointer;width:100%;transition:all 0.2s;"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">
                + Añadir elemento
              </button>
            </div>
          </div>

          <!-- COLUMNA 2 -->
          <div style="display:flex;flex-direction:column;">
            <div style="padding:12px 16px;font-size:11px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Complementaria</div>
            <div id="guia-editor-col2" style="display:flex;flex-direction:column;gap:10px;padding:14px;flex:1;"></div>
            <div style="padding:0 14px 14px;">
              <button type="button" onclick="addGuiaItemRow('col2')"
                style="background:var(--surface2);border:1px dashed var(--border);border-radius:8px;
                       padding:8px 14px;color:var(--text2);font-size:13px;cursor:pointer;width:100%;transition:all 0.2s;"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">
                + Añadir elemento
              </button>
            </div>
          </div>

        </div>
        <div class="modal-actions" style="padding:14px 16px;border-top:1px solid var(--border);">
          <button class="btn-secondary" onclick="_closeGuiaEditorAndReturn()">Cancelar</button>
          <button class="btn-save" onclick="saveGuiaContenido(${prodId},${guiaId})">💾 Guardar</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  _guiaEditorModal = modal;

  // Cargar items existentes en cada columna
  norm.col1.forEach(item => addGuiaItemRow('col1', item));
  norm.col2.forEach(item => addGuiaItemRow('col2', item));
}

function addGuiaItemRow(col, data) {
  const containerId = col === 'col1' ? 'guia-editor-col1' : 'guia-editor-col2';
  const container = document.getElementById(containerId);
  if (!container) return;

  const div = document.createElement('div');
  div.className = `guia-item-row guia-item-${col}`;
  div.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px;';

  div.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button type="button" onclick="this.closest('.guia-item-row').remove()"
        style="background:var(--red-bg);border:1px solid var(--red);border-radius:5px;
               padding:3px 8px;color:var(--red);cursor:pointer;font-size:11px;">✕</button>
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Imagen (URL)</div>
      <input class="smart-input guia-imagen" type="url" placeholder="https://..." value="${data?.imagen || ''}" style="font-size:12px;">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Título</div>
      <input class="smart-input guia-titulo" type="text" placeholder="Ej: Dosis recomendada" value="${data?.titulo || ''}" style="font-size:12px;">
    </div>
    <div style="margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Subtítulo</div>
      <input class="smart-input guia-subtitulo" type="text" placeholder="Ej: Para adultos" value="${data?.subtitulo || ''}" style="font-size:12px;">
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Contenido</div>
      <textarea class="textarea guia-contenido" placeholder="Descripción detallada..." style="min-height:60px;font-size:12px;">${data?.contenido || ''}</textarea>
    </div>`;

  container.appendChild(div);
}

function _recogerColumna(col) {
  const items = [];
  document.querySelectorAll(`.guia-item-${col}`).forEach(row => {
    items.push({
      imagen:    row.querySelector('.guia-imagen')?.value?.trim()    || null,
      titulo:    row.querySelector('.guia-titulo')?.value?.trim()    || '',
      subtitulo: row.querySelector('.guia-subtitulo')?.value?.trim() || '',
      contenido: row.querySelector('.guia-contenido')?.value?.trim() || '',
    });
  });
  return items;
}

async function saveGuiaContenido(prodId, guiaId) {
  const contenido = {
    col1: _recogerColumna('col1'),
    col2: _recogerColumna('col2'),
  };

  try {
    if (guiaId) {
      const { error } = await db.from('guia_atencion')
        .update({ contenido }).eq('id', guiaId);
      if (error) throw error;
    } else {
      const { error } = await db.from('guia_atencion')
        .insert({ producto_id: prodId, contenido });
      if (error) throw error;
    }
    toast('✅ Guía actualizada', 'success');
    _closeGuiaEditor();
    renderGuia();
    setTimeout(() => openGuiaProductoModal(prodId, _guiaActiveProdNombre), 100);
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
}