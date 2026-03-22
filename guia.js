// Módulo independiente - no toca app.js

// PALETAS DE COLOR
const GUIA_COLORS = [
  { hex: null,      label: 'Quitar color' },
  { hex: '#5c4d8a', label: 'Lavanda'      },
  { hex: '#1a6b55', label: 'Menta'        },
  { hex: '#8b4a2b', label: 'Durazno'      },
  { hex: '#1a4f8a', label: 'Celeste'      },
  { hex: '#8b3055', label: 'Rosa'         },
  { hex: '#3a5c2a', label: 'Salvia'       },
  { hex: '#7a5a0a', label: 'Mantequilla'  },
  { hex: '#6a3a8a', label: 'Lila'         },
  { hex: '#2a3f5f', label: 'Pizarra'      },
  { hex: '#b91c1c', label: 'Rojo'         },
  { hex: '#166534', label: 'Verde'        },
];

const GUIA_BG_COLORS = [
  { hex: null,      label: 'Quitar fondo' },
  { hex: '#ede9f8', label: 'Lavanda'      },
  { hex: '#d6f5ec', label: 'Menta'        },
  { hex: '#fde8d8', label: 'Durazno'      },
  { hex: '#daeaf8', label: 'Celeste'      },
  { hex: '#fce0eb', label: 'Rosa'         },
  { hex: '#dff0d6', label: 'Salvia'       },
  { hex: '#fef5c8', label: 'Mantequilla'  },
  { hex: '#f0e2fa', label: 'Lila'         },
  { hex: '#dce6f4', label: 'Pizarra'      },
  { hex: '#fee2e2', label: 'Rojo suave'   },
  { hex: '#dcfce7', label: 'Verde suave'  },
];

// NORMALIZAR CONTENIDO
function _normalizeContenido(contenido) {
  if (!contenido) return { col1: [], col2: [] };
  if (Array.isArray(contenido)) return { col1: contenido, col2: [] };
  return { col1: contenido.col1 || [], col2: contenido.col2 || [] };
}

// CSS DEL EDITOR (inyectado una sola vez)
function _injectGuiaEditorCSS() {
  if (document.getElementById('guia-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'guia-editor-styles';
  style.textContent = `
    .guia-view-content {
      font-size: 13px;
      color: var(--text2);
      line-height: 1.7;
      word-wrap: break-word;
    }
    .guia-view-content ul {
      margin: 4px 0 4px 20px;    
      list-style: disc;
    }
    .guia-view-content ol {
      margin: 4px 0 4px 20px;
      list-style: decimal;
    }
    .guia-view-content li { margin-bottom: 3px; }
    .guia-view-content h2 { font-size: 15px; font-weight: 700; margin: 6px 0 4px; color: var(--text); }
    .guia-view-content h3 { font-size: 13px; font-weight: 700; margin: 4px 0 3px; color: var(--text); }
    .guia-view-content table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
    .guia-view-content td,
    .guia-view-content th { border: 1px solid var(--border); padding: 6px 10px; vertical-align: top; }
    .guia-view-content th { background: var(--surface2); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }

    .guia-rich-editor {
      min-height: 130px;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.7;
      color: var(--text);
      background: var(--surface);
      border-radius: 0 0 8px 8px;
      outline: none;
      word-wrap: break-word;
    }
    .guia-rich-editor:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    .guia-rich-editor table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 12px;
    }
    .guia-rich-editor td,
    .guia-rich-editor th {
      border: 1px solid var(--border);
      padding: 6px 10px;
      min-width: 60px;
      vertical-align: top;
    }
    .guia-rich-editor th {
      background: var(--surface2);
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .guia-rich-editor ul,
    .guia-rich-editor ol { margin: 4px 0 4px 20px; padding: 0; }
    .guia-rich-editor li { margin-bottom: 2px; }
    .guia-rich-editor p  { margin: 0 0 4px; }
    .guia-rich-editor h2 { font-size: 16px; font-weight: 700; margin: 6px 0 4px; }
    .guia-rich-editor h3 { font-size: 14px; font-weight: 700; margin: 4px 0 3px; }

    .guia-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      padding: 5px 8px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-bottom: none;
      border-radius: 0;
    }
    .gtb-btn {
      min-width: 26px;
      height: 26px;
      border-radius: 4px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text2);
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      padding: 0 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s;
      flex-shrink: 0;
      font-family: 'DM Sans', sans-serif;
    }
    .gtb-btn:hover {
      background: var(--surface);
      border-color: var(--border);
      color: var(--text);
    }
    .gtb-sep {
      width: 1px;
      height: 18px;
      background: var(--border);
      margin: 0 3px;
      flex-shrink: 0;
    }

    .guia-color-popup {
      position: fixed;
      z-index: 9999;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.18);
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      width: 200px;
    }
    .gcol-swatch {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: border-color 0.12s, transform 0.1s;
      flex-shrink: 0;
    }
    .gcol-swatch:hover {
      border-color: var(--text);
      transform: scale(1.18);
    }
    .gcol-none {
      background: var(--surface3);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--red);
      font-size: 13px;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

// ── RENDER PRINCIPAL ────────────────────────────
async function renderGuia() {
  _injectGuiaEditorCSS();
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
      const norm  = _normalizeContenido(guiaMap[prod.id]?.contenido);
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

// RENDER COLUMNA (VISTA)
function _renderColumna(items) {
  if (!items || items.length === 0) return '';
  return items.map(item => {
    let html = item.contenido || '';
    // Legado: texto plano sin etiquetas
    if (html && !/<[a-z]/i.test(html)) {
      html = html.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
    }
    return `
    <div class="guia-item-expandible" style="border-bottom:1px solid var(--border);">
      <div onclick="toggleGuiaItemExpand(this)"
           style="padding-left:16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;"
           onmouseover="this.style.background='var(--surface2)'"
           onmouseout="this.style.background=''">
        <div style="flex:1;">
          <div style="font-weight:600;font-size:14px;">${item.titulo || ''}</div>
          <div style="font-size:11px;color:var(--text3);">${item.subtitulo || ''}</div>
        </div>
        <div style="font-size:18px;transition:transform 0.3s;margin-left:12px;" class="guia-expand-icon">▼</div>
      </div>
      <div class="guia-item-content" style="display:none;padding:12px 16px;background:var(--surface);border-top:1px solid var(--border);">
        ${item.imagen ? `<img src="${item.imagen}" style="width:100%;max-height:200px;border-radius:8px;margin-bottom:12px;object-fit:cover;">` : ''}
        <div class="guia-view-content">${html}</div>
      </div>
    </div>`;
  }).join('');
}

// MODAL GUÍA (vista)
function closeGuiaModal() {
  document.getElementById('guia-modal').classList.remove('open');
}

let _guiaActiveProdId    = null;
let _guiaActiveProdNombre = null;

function openGuiaProductoModal(prodId, prodNombre) {
  const isAdmin = currentUser?.rol === 'admin';
  _guiaActiveProdId     = prodId;
  _guiaActiveProdNombre = prodNombre;

  db.from('guia_atencion').select('*').eq('producto_id', prodId).maybeSingle()
    .then(({ data: guia }) => {
      const norm    = _normalizeContenido(guia?.contenido);
      const emptyMsg = '<div style="color:var(--text3);font-size:13px;padding:24px;text-align:center;">Sin contenido</div>';

      document.getElementById('guia-modal-title').textContent = prodNombre;

      const editBtn = document.getElementById('guia-edit-btn');
      editBtn.style.display = isAdmin ? '' : 'none';
      editBtn.onclick = () => {
        closeGuiaModal();
        setTimeout(() => openGuiaEditor(prodId, prodNombre), 50);
      };

      document.getElementById('guia-modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:60% 40%;">
          <div style="overflow-y:auto;max-height:calc(80vh - 140px);">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Principal</div>
            ${_renderColumna(norm.col1) || emptyMsg}
          </div>
          <div style="border-left:1px solid var(--border);overflow-y:auto;max-height:calc(80vh - 140px);">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Complementaria</div>
            ${_renderColumna(norm.col2) || emptyMsg}
          </div>
        </div>`;

      document.getElementById('guia-modal').classList.add('open');
    });
}

function toggleGuiaItemExpand(element) {
  const item    = element.closest('.guia-item-expandible');
  const content = item.querySelector('.guia-item-content');
  const icon    = item.querySelector('.guia-expand-icon');
  const isOpen  = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : '';
  icon.style.transform  = isOpen ? '' : 'rotate(180deg)';
}

// EDITOR MODAL
let _guiaEditorModal  = null;
let _guiaActiveEditor = null; // el editor (div) que tiene foco actualmente

function _closeGuiaEditor() {
  _closeAllColorPopups();
  const d = document.getElementById('guia-table-dialog');
  if (d) d.remove();
  if (_guiaEditorModal) { _guiaEditorModal.remove(); _guiaEditorModal = null; }
}

function _closeGuiaEditorAndReturn() {
  _closeGuiaEditor();
  if (_guiaActiveProdId !== null)
    setTimeout(() => openGuiaProductoModal(_guiaActiveProdId, _guiaActiveProdNombre), 50);
}

async function openGuiaEditor(prodId, prodNombre) {
  _injectGuiaEditorCSS();

  const { data: guia, error } = await db.from('guia_atencion')
    .select('*').eq('producto_id', prodId).maybeSingle();

  if (error && error.code !== 'PGRST116') {
    toast('❌ Error: ' + error.message, 'error');
    return;
  }

  const norm   = _normalizeContenido(guia?.contenido);
  const guiaId = guia?.id || null;

  _closeGuiaEditor();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="width:90vw; max-width:none; height:90vh; max-height:90vh; display:flex; flex-direction:column;">
      <div class="modal-header" style="flex-shrink:0;">
        <div class="modal-title">Editar: ${prodNombre}</div>
        <button class="modal-close" onclick="_closeGuiaEditorAndReturn()">×</button>
      </div>
      <div id="guia-shared-toolbar-wrap" style="flex-shrink:0;border-bottom:1px solid var(--border);padding-top:16px"></div>
      <div style="flex:1;overflow-y:auto;min-height:0;">
        <div style="display:grid;grid-template-columns:60% 40%;">

          <div style="border-right:1px solid var(--border);display:flex;flex-direction:column;">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Principal</div>
            <div id="guia-editor-col1" style="display:flex;flex-direction:column;gap:12px;padding:14px;"></div>
            <div style="padding:0 14px 14px;">
              <button type="button" onclick="addGuiaItemRow('col1')"
                style="background:var(--surface2);border:1px dashed var(--border);border-radius:8px;
                       padding:8px 14px;color:var(--text2);font-size:13px;cursor:pointer;width:100%;transition:all 0.2s;"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">+ Añadir elemento</button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;">
            <div style="padding:10px 16px;font-size:10px;font-weight:700;color:var(--text3);
                        text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);
                        background:var(--surface2);">Información Complementaria</div>
            <div id="guia-editor-col2" style="display:flex;flex-direction:column;gap:12px;padding:14px;"></div>
            <div style="padding:0 14px 14px;">
              <button type="button" onclick="addGuiaItemRow('col2')"
                style="background:var(--surface2);border:1px dashed var(--border);border-radius:8px;
                       padding:8px 14px;color:var(--text2);font-size:13px;cursor:pointer;width:100%;transition:all 0.2s;"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">+ Añadir elemento</button>
            </div>
          </div>

        </div>
      </div>
      <div class="modal-actions" style="padding:14px 16px;border-top:1px solid var(--border);flex-shrink:0;">
        <button class="btn-secondary" onclick="_closeGuiaEditorAndReturn()">Cancelar</button>
        <button class="btn-save" onclick="saveGuiaContenido(${prodId},${guiaId ? guiaId : 'null'})">💾 Guardar</button>
      </div>
    </div>`;

  modal.addEventListener('mousedown', e => {
    if (!e.target.closest('.guia-color-popup') && !e.target.closest('[data-cpop]'))
      _closeAllColorPopups();
  });

  document.body.appendChild(modal);
  _guiaEditorModal = modal;

  // Inyectar toolbar global (una sola, compartida)
  const tbWrap = modal.querySelector('#guia-shared-toolbar-wrap');
  tbWrap.appendChild(_buildRichToolbar('__shared__'));

  norm.col1.forEach(item => addGuiaItemRow('col1', item));
  norm.col2.forEach(item => addGuiaItemRow('col2', item));
}

// CONSTRUIR TOOLBAR (única, global)
// Recibe uid='__shared__'; los comandos actúan sobre _guiaActiveEditor
function _buildRichToolbar(_uid) {
  const tb = document.createElement('div');
  tb.className = 'guia-toolbar';
  tb.style.borderRadius = '0';

  // Ejecutar comando sobre el editor activo
  const exec = (cmd, val) => {
    if (!_guiaActiveEditor) return;
    _guiaActiveEditor.focus();
    document.execCommand(cmd, false, val || null);
  };

  const B = (html, title, cmd, val) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gtb-btn'; b.title = title; b.innerHTML = html;
    b.onmousedown = e => { e.preventDefault(); exec(cmd, val); };
    return b;
  };

  const Sep = () => { const s = document.createElement('div'); s.className = 'gtb-sep'; return s; };

  // Formato texto
  tb.appendChild(B('<b>N</b>', 'Negrita',   'bold'));
  tb.appendChild(B('<i>C</i>', 'Cursiva',   'italic'));
  tb.appendChild(B('<u>S</u>', 'Subrayado', 'underline'));
  tb.appendChild(B('<s>T</s>', 'Tachado',   'strikeThrough'));
  tb.appendChild(Sep());

  // Encabezados / párrafo
  const mkBlock = (label, title, tag) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gtb-btn'; b.title = title;
    b.innerHTML = label; b.style.fontSize = '10px';
    b.onmousedown = e => { e.preventDefault(); if (_guiaActiveEditor) { _guiaActiveEditor.focus(); document.execCommand('formatBlock', false, tag); } };
    return b;
  };
  tb.appendChild(mkBlock('H1', 'Título grande',   'h2'));
  tb.appendChild(mkBlock('H2', 'Título pequeño',  'h3'));
  tb.appendChild(mkBlock('¶',  'Párrafo',         'p'));
  tb.appendChild(Sep());

 // Alineación
const alignB = (title, cmd, svg) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'gtb-btn'; b.title = title;
  b.innerHTML = svg;
  b.onmousedown = e => { e.preventDefault(); exec(cmd); };
  return b;
};

tb.appendChild(alignB('Izquierda', 'justifyLeft',   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`));
tb.appendChild(alignB('Centro', 'justifyCenter', `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`));
tb.appendChild(alignB('Derecha', 'justifyRight', `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>`));
tb.appendChild(alignB('Justificar', 'justifyFull', `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`));
tb.appendChild(Sep());

  // Listas
  tb.appendChild(B('•≡', 'Viñetas',  'insertUnorderedList'));
  tb.appendChild(B('1≡', 'Numerada', 'insertOrderedList'));
  tb.appendChild(Sep());

  // Color de texto
  const btnFg = document.createElement('button');
  btnFg.type = 'button'; btnFg.className = 'gtb-btn';
  btnFg.title = 'Color de texto'; btnFg.setAttribute('data-cpop', '1');
  btnFg.style.cssText = 'position:relative;width:30px;font-size:12px;font-weight:700;';
  btnFg.innerHTML = `A<span id="guia-fgi" style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:14px;height:3px;border-radius:2px;background:#5c4d8a;"></span>`;
  btnFg.onmousedown = e => { e.preventDefault(); _toggleColorPopup(btnFg, 'fg'); };
  tb.appendChild(btnFg);

  // Color de fondo
  const btnBg = document.createElement('button');
  btnBg.type = 'button'; btnBg.className = 'gtb-btn';
  btnBg.title = 'Resaltar (fondo)'; btnBg.setAttribute('data-cpop', '1');
  btnBg.style.cssText = 'position:relative;width:30px;font-size:12px;';
  btnBg.innerHTML = `▣<span id="guia-bgi" style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:14px;height:3px;border-radius:2px;background:#ede9f8;"></span>`;
  btnBg.onmousedown = e => { e.preventDefault(); _toggleColorPopup(btnBg, 'bg'); };
  tb.appendChild(btnBg);
  tb.appendChild(Sep());

  // Tabla
  const btnTable = document.createElement('button');
  btnTable.type = 'button'; btnTable.className = 'gtb-btn';
  btnTable.title = 'Insertar tabla'; btnTable.style.cssText = 'font-size:11px;padding:0 6px;width:auto;';
  btnTable.innerHTML = '⊞ Tabla';
  btnTable.onmousedown = e => { e.preventDefault(); _openTableDialog(); };
  tb.appendChild(btnTable);

  // Limpiar formato
  tb.appendChild(Sep());
  tb.appendChild(B('✕f', 'Limpiar formato', 'removeFormat'));

  return tb;
}

// COLOR POPUP
let _activeColorPopup = null;

function _closeAllColorPopups() {
  if (_activeColorPopup) { _activeColorPopup.remove(); _activeColorPopup = null; }
}

function _toggleColorPopup(triggerBtn, type) {
  const popupId = `cpop-${type}`;
  if (_activeColorPopup && _activeColorPopup.id === popupId) {
    _closeAllColorPopups();
    return;
  }
  _closeAllColorPopups();

  const palette = type === 'fg' ? GUIA_COLORS : GUIA_BG_COLORS;
  const popup   = document.createElement('div');
  popup.id        = popupId;
  popup.className = 'guia-color-popup';

  palette.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'gcol-swatch' + (c.hex ? '' : ' gcol-none');
    sw.title = c.label;
    if (c.hex) sw.style.background = c.hex;
    else       sw.textContent = '✕';

    sw.onmousedown = e => {
      e.preventDefault();
      _closeAllColorPopups();
      if (!_guiaActiveEditor) return;
      _guiaActiveEditor.focus();
      if (type === 'fg') {
        if (c.hex) document.execCommand('foreColor', false, c.hex);
        else       document.execCommand('removeFormat', false, null);
        const ind = document.getElementById('guia-fgi');
        if (ind) ind.style.background = c.hex || 'transparent';
      } else {
        if (c.hex) document.execCommand('hiliteColor', false, c.hex);
        else       document.execCommand('removeFormat', false, null);
        const ind = document.getElementById('guia-bgi');
        if (ind) ind.style.background = c.hex || 'transparent';
      }
    };
    popup.appendChild(sw);
  });

  const rect = triggerBtn.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 5) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 215) + 'px';

  // Separador
  const sep = document.createElement('div');
  sep.style.cssText = 'width:100%;height:1px;background:var(--border);margin:4px 0;';
  popup.appendChild(sep);

  let _savedRange = null;

  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = type === 'fg' ? '#5c4d8a' : '#ede9f8';
  picker.style.cssText = 'width:32px;height:22px;border:none;background:none;cursor:pointer;padding:0;border-radius:4px;';

  picker.onmousedown = e => {
    e.stopPropagation();
    // Guardar selección actual antes de perder el foco
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) _savedRange = sel.getRangeAt(0).cloneRange();
  };

  picker.onchange = e => {
    if (!_guiaActiveEditor) return;
    // Restaurar selección
    _guiaActiveEditor.focus();
    if (_savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedRange);
    }
    if (type === 'fg') {
      document.execCommand('foreColor', false, e.target.value);
      const ind = document.getElementById('guia-fgi');
      if (ind) ind.style.background = e.target.value;
    } else {
      document.execCommand('hiliteColor', false, e.target.value);
      const ind = document.getElementById('guia-bgi');
      if (ind) ind.style.background = e.target.value;
    }
  };

  const label = document.createElement('div');
  label.style.cssText = 'width:100%;display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text3);';
  label.textContent = type === 'fg' ? 'Personalizado:' : 'Fondo personalizado:';
  label.appendChild(picker);
  popup.appendChild(label);

  document.body.appendChild(popup);
  _activeColorPopup = popup;
}

// DIÁLOGO INSERTAR TABLA
function _openTableDialog() {
  const old = document.getElementById('guia-table-dialog');
  if (old) old.remove();

  const dlg = document.createElement('div');
  dlg.id = 'guia-table-dialog';
  dlg.style.cssText = `
    position:fixed;z-index:9999;top:50%;left:50%;transform:translate(-50%,-50%);
    background:var(--surface);border:1px solid var(--border);border-radius:12px;
    padding:18px;box-shadow:0 8px 30px rgba(0,0,0,0.18);
    font-size:13px;color:var(--text);width:230px;
    display:flex;flex-direction:column;gap:12px;`;

  dlg.innerHTML = `
    <div style="font-weight:700;">Insertar tabla</div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:var(--text2);width:70px;">Columnas</span>
      <input id="gtd-cols" type="number" value="3" min="1" max="10"
        class="smart-input" style="width:64px;padding:5px 8px;font-size:12px;">
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:var(--text2);width:70px;">Filas</span>
      <input id="gtd-rows" type="number" value="3" min="1" max="30"
        class="smart-input" style="width:64px;padding:5px 8px;font-size:12px;">
    </div>
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text2);cursor:pointer;">
      <input type="checkbox" id="gtd-header" checked> Primera fila como encabezado
    </label>
    <div style="display:flex;gap:7px;justify-content:flex-end;">
      <button type="button" class="btn-secondary" style="padding:7px 13px;font-size:12px;"
        onclick="document.getElementById('guia-table-dialog').remove()">Cancelar</button>
      <button type="button" class="btn-save" style="padding:7px 16px;font-size:12px;"
        onclick="_doInsertTable()">Insertar</button>
    </div>`;

  document.body.appendChild(dlg);
  document.getElementById('gtd-cols').focus();
}

function _doInsertTable() {
  const cols   = Math.max(1, Math.min(10, parseInt(document.getElementById('gtd-cols').value) || 3));
  const rows   = Math.max(1, Math.min(30, parseInt(document.getElementById('gtd-rows').value) || 3));
  const header = document.getElementById('gtd-header').checked;
  document.getElementById('guia-table-dialog').remove();

  if (!_guiaActiveEditor) return;
  _guiaActiveEditor.focus();

  const cellStyle = 'border:1px solid var(--border);padding:6px 10px;min-width:60px;height:32px;vertical-align:top;';
  const thStyle = cellStyle + 'background:var(--surface2);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;';

  let tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;">`;

  if (header) {
    tableHtml += '<thead><tr>';
    for (let c = 0; c < cols; c++)
      tableHtml += `<th style="${thStyle}">Col ${c + 1}</th>`;
    tableHtml += '</tr></thead>';
  }

  tableHtml += '<tbody>';
  const dataRows = header ? rows - 1 : rows;
  for (let r = 0; r < dataRows; r++) {
    tableHtml += '<tr>';
    for (let c = 0; c < cols; c++)
      tableHtml += `<td style="${cellStyle}"><br></td>`;
    tableHtml += '</tr>';
  }
  tableHtml += '</tbody></table><p><br></p>';

  document.execCommand('insertHTML', false, tableHtml);
}

// ADD ITEM ROW
let _guiaRowCounter = 0;

function addGuiaItemRow(col, data) {
  const container = document.getElementById(
    col === 'col1' ? 'guia-editor-col1' : 'guia-editor-col2'
  );
  if (!container) return;

  const uid     = `ged-${Date.now()}-${_guiaRowCounter++}`;
  const wrapper = document.createElement('div');
  wrapper.className = `guia-item-row guia-item-${col}`;
  wrapper.style.cssText = 'border:1px solid var(--border);border-radius:10px;background:var(--surface);overflow:visible;';

  // ── Cabecera: meta-campos + botón quitar
  const header = document.createElement('div');
  header.style.cssText = 'padding:10px 12px;background:var(--surface2);border-bottom:1px solid var(--border);border-radius:10px 10px 0 0;';
  header.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
        <input class="smart-input guia-imagen" type="url"
          placeholder="Imagen URL (opcional)" style="font-size:11px;padding:5px 9px;">
        <div style="display:flex;gap:6px;">
          <input class="smart-input guia-titulo" type="text"
            placeholder="Título" style="font-size:12px;padding:6px 9px;flex:1;">
        </div>
        <div style="display:flex;gap:6px;">
          <input class="smart-input guia-subtitulo" type="text"
            placeholder="Subtítulo" style="font-size:12px;padding:6px 9px;flex:1;">
        </div>
      </div>
      <button type="button" onclick="this.closest('.guia-item-row').remove()"
        style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;
               padding:7px 11px;color:var(--red);cursor:pointer;font-size:11px;font-weight:700;
               white-space:nowrap;flex-shrink:0;transition:all 0.15s;"
        onmouseover="this.style.background='var(--red)';this.style.color='#fff'"
        onmouseout="this.style.background='var(--red-bg)';this.style.color='var(--red)'">✕ Quitar</button>
    </div>`;

  wrapper.appendChild(header);

  // Valores meta — asignados con .value, nunca interpolados en innerHTML
  header.querySelector('.guia-imagen').value = data?.imagen || '';
  header.querySelector('.guia-titulo').value = data?.titulo || '';
  header.querySelector('.guia-subtitulo').value = data?.subtitulo || '';

  // ── Editor contenteditable (sin toolbar propia — la toolbar es global)
  const editor = document.createElement('div');
  editor.id = uid;
  editor.className = 'guia-rich-editor';
  editor.contentEditable = 'true';
  editor.spellcheck = true;

  // Al hacer focus, registrar como editor activo para la toolbar global
  editor.addEventListener('focus', () => { _guiaActiveEditor = editor; });

  // Convertir legado (texto plano) a HTML si es necesario
  let html = data?.contenido || '';
  if (html && !/<[a-z]/i.test(html)) {
    html = html.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('');
  }
  editor.innerHTML = html || '';

  wrapper.appendChild(editor);
  container.appendChild(wrapper);
}

// RECOGER COLUMNA
function _recogerColumna(col) {
  const items = [];
  document.querySelectorAll(`.guia-item-${col}`).forEach(row => {
    const editor = row.querySelector('.guia-rich-editor');
    let html = editor ? editor.innerHTML : '';
    if (html === '<br>' || html === '<p><br></p>') html = '';
    items.push({
      imagen: row.querySelector('.guia-imagen')?.value?.trim() || null,
      titulo: row.querySelector('.guia-titulo')?.value?.trim() || '',
      subtitulo: row.querySelector('.guia-subtitulo')?.value?.trim() || '',
      contenido: html,
    });
  });
  return items;
}

// GUARDAR
async function saveGuiaContenido(prodId, guiaId) {
  const contenido = {
    col1: _recogerColumna('col1'),
    col2: _recogerColumna('col2'),
  };

  try {
    if (guiaId) {
      const { error } = await db.from('guia_atencion').update({ contenido }).eq('id', guiaId);
      if (error) throw error;
    } else {
      const { error } = await db.from('guia_atencion').insert({ producto_id: prodId, contenido });
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