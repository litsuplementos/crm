// muestras.js — Módulo de Muestras (solo admin)
// Entrega de muestras: descuenta n unidades de uno o varios productos del
// almacén (ubicación física) elegido y registra la traza en la tabla `muestras`.
// El stock general sigue automáticamente porque SUM(almacen_stock) ===
// inventario_stock.stock_inicial (trigger almacen_stock_sync_total +
// respaldo _syncStockInicial). NO escribe en inventario_movimientos.

const Muestras = (() => {
  let _tab = 'nueva';
  let _productos = [];
  let _ubicaciones = [];
  let _almacenStock = [];
  let _historial = [];
  let _loadError = null;
  let _currentPage = 1;
  const PAGE_SIZE = 20;
  let _filas = [{ pid: '', cant: '' }];

  async function render() {
    const wrap = document.getElementById('muestras-wrap');
    if (!wrap) return;
    await _loadData();
    _renderContent(wrap);
  }

  async function _loadData() {
    await DataStore.ensure('almacen', 'muestras');
    _loadError = DataStore._errors.almacen || DataStore._errors.muestras || null;

    // Nombres de producto resueltos desde allProductos (misma fuente que Inventario/Almacén).
    const nombreDe = (pid) => allProductos.find(p => p.id === pid)?.nombre || ('Producto ' + pid);

    _productos = (DataStore.inventarioStock || [])
      .map(r => ({ producto_id: r.producto_id, nombre: nombreDe(r.producto_id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    _ubicaciones = DataStore.ubicaciones || [];
    _almacenStock = DataStore.almacenStock || [];
    _historial = (DataStore.muestras || [])
      .map(m => ({ ...m, productos: { id: m.producto_id, nombre: nombreDe(m.producto_id) } }));
  }

  function _locLabel(u) {
    if (!u) return '—';
    return [u.departamento, u.lugar, u.ubicacion].filter(Boolean).join(' · ');
  }

  function _shortLoc(u) {
    if (!u) return '—';
    return [u.departamento, u.lugar].filter(Boolean).join(' / ');
  }

  function _stockAt(productoId, ubicacionId) {
    const s = _almacenStock.find(r => r.producto_id === productoId && r.ubicacion_id === ubicacionId);
    return s ? s.stock : 0;
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: NUEVA MUESTRA
  // ═══════════════════════════════════════════════
  function _renderNueva(content) {
    if (_loadError) {
      content.innerHTML = `<div style="border:1px solid #d64545;background:#d6454518;color:#ff8a8a;font-size:12px;padding:14px;border-radius:8px;margin-bottom:14px;">
        <b>${_ic('triangle-alert', 13)} Error consultando la base de datos:</b><br>
        <code style="word-break:break-all;">${_loadError}</code>
      </div>`;
      return;
    }
    if (_productos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">No hay productos con stock configurado. Configúralo en <b>Inventario → Ajustes</b>.</div>';
      return;
    }
    if (_ubicaciones.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Primero crea ubicaciones en <b>' + _ic('truck', 13) + ' Almacén → Ubicaciones</b>.</div>';
      return;
    }

    content.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;">${_ic('flask-conical', 16)} Registrar entrega de muestras</div>

        <div class="ms-field">
          <label>Almacén (ubicación)</label>
          <select id="ms-ubicacion" onchange="Muestras.onUbicacionChange()">
            <option value="">— Seleccionar almacén —</option>
            ${_ubicaciones.map(u => `<option value="${u.id}">${_locLabel(u)}</option>`).join('')}
          </select>
        </div>

        <div class="ms-field">
          <label>Productos</label>
          <div id="ms-filas" style="display:flex;flex-direction:column;gap:8px;"></div>
          <button type="button" onclick="Muestras.addFila()"
            style="background:var(--surface2);border:1px dashed var(--border);border-radius:8px;padding:8px 16px;color:var(--text2);font-size:13px;cursor:pointer;width:100%;margin-top:8px;transition:all 0.2s;"
            onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text2)'">
            ${_ic('plus', 14)} Agregar producto
          </button>
        </div>

        <div class="ms-field">
          <label>Notas <span style="color:var(--text3);font-weight:400;">(opcional)</span></label>
          <textarea id="ms-notas" rows="2" placeholder="Observaciones..."></textarea>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
          <div style="font-size:12px;color:var(--text3);">Responsable: <b style="color:var(--accent2);">${currentUser?.nombre || '—'}</b></div>
          <button onclick="Muestras.saveMuestras()" class="ms-btn ms-btn-primary" style="padding:8px 20px;font-size:13px;">Descontar y registrar</button>
        </div>
      </div>
    `;
    _renderFilas();
  }

  function _renderFilas() {
    const wrap = document.getElementById('ms-filas');
    if (!wrap) return;
    if (_filas.length === 0) _filas = [{ pid: '', cant: '' }];
    const elegidos = new Set(_filas.map(f => f.pid).filter(Boolean));
    wrap.innerHTML = _filas.map((f, i) => {
      const disponibles = _productos.filter(p => !elegidos.has(p.producto_id) || p.producto_id === f.pid);
      const stock = (f.pid && _getUbiId()) ? _stockAt(f.pid, _getUbiId()) : null;
      return `
        <div style="display:grid;grid-template-columns:1fr 90px auto;gap:8px;align-items:start;">
          <div>
            <select onchange="Muestras.onFilaProducto(${i}, this.value)">
              <option value="">— Seleccionar producto —</option>
              ${disponibles.map(p => `<option value="${p.producto_id}" ${p.producto_id === f.pid ? 'selected' : ''}>${p.nombre}</option>`).join('')}
            </select>
            <div class="ms-stock-hint" id="ms-stock-${i}">${stock !== null ? `Disponible en el almacén: <b>${stock}</b>` : '&nbsp;'}</div>
          </div>
          <input type="number" min="1" placeholder="Cant." value="${f.cant}" onchange="Muestras.onFilaCant(${i}, this.value)">
          <button type="button" onclick="Muestras.removeFila(${i})" title="Quitar"
            style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:7px 9px;color:var(--red);cursor:pointer;">${_ic('x', 14)}</button>
        </div>`;
    }).join('');
  }

  function _getUbiId() {
    return parseInt(document.getElementById('ms-ubicacion')?.value) || '';
  }

  function addFila() {
    _filas.push({ pid: '', cant: '' });
    _renderFilas();
  }

  function removeFila(i) {
    _filas.splice(i, 1);
    if (_filas.length === 0) _filas.push({ pid: '', cant: '' });
    _renderFilas();
  }

  function onFilaProducto(i, val) {
    _filas[i].pid = parseInt(val) || '';
    _renderFilas();
  }

  function onFilaCant(i, val) {
    _filas[i].cant = val;
  }

  function onUbicacionChange() {
    _renderFilas();
  }

  async function saveMuestras() {
    const ubiId = _getUbiId();
    if (!ubiId) { toast(_ic('triangle-alert', 15) + ' Selecciona el almacén (ubicación)', 'error'); return; }
    if (!_filas.some(f => f.pid)) { toast(_ic('triangle-alert', 15) + ' Agrega al menos un producto', 'error'); return; }

    const items = [];
    for (const f of _filas) {
      if (!f.pid && !f.cant) continue;
      const cant = parseInt(f.cant);
      if (!f.pid) { toast(_ic('triangle-alert', 15) + ' Hay una fila sin producto seleccionado', 'error'); return; }
      if (isNaN(cant) || cant <= 0) { toast(_ic('triangle-alert', 15) + ' Las cantidades deben ser mayores a 0', 'error'); return; }
      if (items.some(it => it.pid === f.pid)) { toast(_ic('triangle-alert', 15) + ' No repitas el mismo producto: une las cantidades en una sola fila', 'error'); return; }
      items.push({ pid: f.pid, cant });
    }
    if (!items.length) { toast(_ic('triangle-alert', 15) + ' Agrega al menos un producto', 'error'); return; }

    const notas = document.getElementById('ms-notas')?.value?.trim() || null;

    // Validar stock disponible por producto en la ubicación elegida
    for (const it of items) {
      const disp = _stockAt(it.pid, ubiId);
      if (disp < it.cant) {
        const nombre = _productos.find(p => p.producto_id === it.pid)?.nombre || ('Producto ' + it.pid);
        toast(_ic('triangle-alert', 15) + ' Stock insuficiente de ' + esc(nombre) + '. Disponible: ' + disp, 'error');
        return;
      }
    }

    // Descuento + registro por producto (lectura fresca para evitar condiciones de carrera)
    for (const it of items) {
      const { data: rows, error: errSt } = await db.from('almacen_stock')
        .select('id, stock')
        .eq('producto_id', it.pid)
        .eq('ubicacion_id', ubiId)
        .limit(1);
      if (errSt) { toast(_ic('circle-x', 15) + ' ' + errSt.message, 'error'); return; }
      const row = (rows || [])[0];
      const anterior = row ? (row.stock || 0) : 0;
      if (anterior < it.cant) { toast(_ic('triangle-alert', 15) + ' Stock insuficiente (cambió durante la operación)', 'error'); await render(); return; }
      const posterior = anterior - it.cant;

      if (row) {
        const { error } = await db.from('almacen_stock')
          .update({ stock: posterior, usuario_id: currentUser.id })
          .eq('id', row.id);
        if (error) { toast(_ic('circle-x', 15) + ' ' + error.message, 'error'); return; }
      }

      const { error: errMov } = await db.from('muestras').insert({
        producto_id: it.pid,
        ubicacion_id: ubiId,
        cantidad: it.cant,
        stock_anterior: anterior,
        stock_posterior: posterior,
        notas: notas,
        usuario_id: currentUser.id
      });
      if (errMov) { toast(_ic('circle-x', 15) + ' ' + errMov.message, 'error'); return; }

      // Respaldo defensivo del trigger SQL: total maestro sigue a lo físico.
      await _syncStockInicial(it.pid);
    }

    toast(_ic('circle-check', 15) + ' Muestra registrada: ' + items.length + ' producto(s) descontados del almacén', 'success');
    _filas = [{ pid: '', cant: '' }];
    _tab = 'historial';
    await DataStore.refresh('almacen', 'muestras', 'inventario');
    await render();
    if (window._checkStockAlerts) window._checkStockAlerts();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: HISTORIAL DE MUESTRAS
  // ═══════════════════════════════════════════════
  function _renderHistorial(content) {
    if (_loadError) {
      content.innerHTML = `<div style="border:1px solid #d64545;background:#d6454518;color:#ff8a8a;font-size:12px;padding:14px;border-radius:8px;margin-bottom:14px;">
        <b>${_ic('triangle-alert', 13)} Error consultando la base de datos:</b><br>
        <code style="word-break:break-all;">${_loadError}</code>
      </div>`;
      return;
    }
    if (_historial.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Sin muestras registradas</div>';
      return;
    }

    const totalPages = Math.ceil(_historial.length / PAGE_SIZE);
    if (_currentPage > totalPages) _currentPage = 1;
    const page = _historial.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);

    content.innerHTML = `
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">${_historial.length} muestras registradas</div>
      <div style="overflow-x:auto;">
        <table class="ms-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Almacén</th>
              <th>Cantidad</th>
              <th>Stock</th>
              <th>Responsable</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${page.map(m => {
              const fecha = m.created_at
                ? new Date(m.created_at).toLocaleDateString('es-BO', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
                : '—';
              return `<tr>
                <td style="white-space:nowrap;color:var(--text3);">${fecha}</td>
                <td style="font-weight:600;">${m.productos?.nombre || '—'}</td>
                <td style="font-size:11px;color:var(--text2);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_locLabel(m.ubicacion)}">${_shortLoc(m.ubicacion)}</td>
                <td style="text-align:center;font-weight:600;color:var(--blue);">${m.cantidad}</td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_anterior} → ${m.stock_posterior}</td>
                <td style="font-size:11px;color:var(--accent2);">${m.usuarios?.nombre || '—'}</td>
                <td style="font-size:11px;color:var(--text3);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${m.notas || ''}">${m.notas || ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${totalPages > 1 ? _renderPagination(totalPages) : ''}
    `;
  }

  function _renderPagination(totalPages) {
    let html = `<div style="display:flex;justify-content:center;gap:4px;margin-top:14px;">`;
    html += `<button class="page-btn" onclick="Muestras.goPage(${_currentPage - 1})" ${_currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - _currentPage) <= 1)
        html += `<button class="page-btn ${i === _currentPage ? 'active' : ''}" onclick="Muestras.goPage(${i})">${i}</button>`;
      else if (Math.abs(i - _currentPage) === 2)
        html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
    }
    html += `<button class="page-btn" onclick="Muestras.goPage(${_currentPage + 1})" ${_currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `</div>`;
    return html;
  }

  // ═══════════════════════════════════════════════
  //  RENDER PRINCIPAL Y NAVEGACIÓN
  // ═══════════════════════════════════════════════
  function _renderContent(wrap) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="ms-tab-btn ${_tab === 'nueva' ? 'active' : ''}" onclick="Muestras.switchTab('nueva')">${_ic('gift', 14)} Nueva Muestra</button>
        <button class="ms-tab-btn ${_tab === 'historial' ? 'active' : ''}" onclick="Muestras.switchTab('historial')">${_ic('history', 14)} Historial</button>
        <div style="flex:1;"></div>
      </div>
      <div id="muestras-tab-content"></div>
      <style>
        .ms-tab-btn{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;color:var(--text2);cursor:pointer;transition:all 0.2s;}
        .ms-tab-btn.active{background:var(--accent);color:white;border-color:var(--accent);}
        .ms-tab-btn:hover:not(.active){background:var(--surface);border-color:var(--accent2);}
        .ms-field{margin-bottom:12px;}
        .ms-field label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px;}
        .ms-field input,.ms-field select,.ms-field textarea{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text);}
        #ms-filas select,#ms-filas input{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text);}
        #ms-filas button{margin-top:0;}
        .ms-stock-hint{font-size:11px;color:var(--text3);margin-top:4px;min-height:15px;}
        .ms-table{width:100%;border-collapse:collapse;font-size:12px;}
        .ms-table th{background:var(--surface2);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);}
        .ms-table td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text);}
        .ms-table tr:hover td{background:var(--surface2);}
        .ms-btn{border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .ms-btn-primary{background:var(--accent);color:white;}
        .ms-btn-primary:hover{opacity:0.85;}
      </style>
    `;
    const content = document.getElementById('muestras-tab-content');
    if (_tab === 'nueva') _renderNueva(content);
    else _renderHistorial(content);
  }

  function switchTab(name) {
    _tab = name;
    _currentPage = 1;
    const wrap = document.getElementById('muestras-wrap');
    if (wrap) _renderContent(wrap);
  }

  function goPage(p) {
    _currentPage = p;
    const wrap = document.getElementById('muestras-wrap');
    if (wrap) _renderContent(wrap);
  }

  function reset() {
    _tab = 'nueva';
    _productos = [];
    _ubicaciones = [];
    _almacenStock = [];
    _historial = [];
    _filas = [{ pid: '', cant: '' }];
    _currentPage = 1;
    _loadError = null;
  }

  return { render, switchTab, goPage, addFila, removeFila, onFilaProducto, onFilaCant, onUbicacionChange, saveMuestras, reset };
})();
