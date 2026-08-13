// almacen.js — Módulo de Almacén (solo admin)
// Distribución física del stock por departamento / lugar / ubicación.
// inventario_stock.stock_inicial es el ÚNICO total maestro y siempre cumple
// stock_inicial === SUM(almacen_stock). Al editar una ubicación el total sigue
// a la nueva suma (trigger SQL almacen_stock_sync_total + respaldo _syncStockInicial).
// Los envíos entre ubicaciones NO cambian el stock general: descuentan el
// origen, suman el destino.

const Almacen = (() => {
  let _tab = 'stock';
  let _productos = [];
  let _ubicaciones = [];
  let _almacenStock = [];
  let _movimientos = [];
  let _loadError = null;
  let _currentPage = 1;
  const PAGE_SIZE = 20;

  async function render() {
    const wrap = document.getElementById('almacen-wrap');
    if (!wrap) return;
    await _loadData();
    _renderContent(wrap);
  }

  async function _loadData() {
    await DataStore.ensure('almacen');
    _loadError = DataStore._errors.almacen || null;

    // Nombres de producto resueltos desde allProductos (misma fuente que Inventario → Ajustes).
    // No se usan JOINs a productos porque inventario_stock/almacen_movimientos pueden no
    // tener relación directa resuelta por PostgREST (producto_id no apunta directo a productos).
    const nombreDe = (pid) => allProductos.find(p => p.id === pid)?.nombre || ('Producto ' + pid);

    _productos = (DataStore.inventarioStock || [])
      .map(r => ({ ...r, productos: { id: r.producto_id, nombre: nombreDe(r.producto_id) } }));
    _ubicaciones = DataStore.ubicaciones || [];
    _almacenStock = DataStore.almacenStock || [];
    _movimientos = (DataStore.almacenMovimientos || [])
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

  function _stockGeneral(productoId) {
    return _almacenStock
      .filter(r => r.producto_id === productoId)
      .reduce((sum, r) => sum + (r.stock || 0), 0);
  }

  // Reparte `cantidad` unidades a descontar de forma proporcional al stock de cada
  // ubicación (método del mayor residuo). Nunca deja stock negativo.
  function _repartirDescuento(stocks, cantidad) {
    const total = stocks.reduce((a, b) => a + b, 0);
    if (total <= 0) return stocks.map(() => 0);
    const n = stocks.length;
    const cuts = stocks.map(s => Math.floor(cantidad * s / total));
    let resto = cantidad - cuts.reduce((a, b) => a + b, 0);
    const cola = stocks
      .map((s, i) => ({ i, frac: (cantidad * s / total) - cuts[i] }))
      .sort((a, b) => b.frac - a.frac);
    let k = 0;
    while (resto > 0 && k < n * 3) {
      const i = cola[k % n].i;
      if (cuts[i] < stocks[i]) { cuts[i]++; resto--; }
      k++;
    }
    if (resto > 0) {
      for (let j = 0; j < n && resto > 0; j++) {
        const libre = stocks[j] - cuts[j];
        if (libre > 0) { const d = Math.min(resto, libre); cuts[j] += d; resto -= d; }
      }
    }
    return cuts;
  }

  // Descuenta stock físico (almacen_stock) del departamento indicado al vender.
  // Proporcional entre las ubicaciones del departamento. Si no hay tablas de
  // almacén o no hay stock, es no-op (no bloquea la venta).
  async function descontarVenta(productoId, cantidad, departamento) {
    try {
      const { data: ubRows, error: errUb } = await db.from('almacen_ubicaciones')
        .select('id').eq('departamento', departamento);
      if (errUb) { console.error('almacen: descontarVenta ubicaciones', errUb); return { error: null }; }
      const ubIds = (ubRows || []).map(u => u.id);
      if (!ubIds.length) return { error: null };

      const { data: rows, error: errSt } = await db.from('almacen_stock')
        .select('id, stock')
        .eq('producto_id', productoId)
        .in('ubicacion_id', ubIds);
      if (errSt) { console.error('almacen: descontarVenta stock', errSt); return { error: null }; }
      const filas = rows || [];
      if (!filas.length) return { error: null };

      const stocks = filas.map(r => r.stock || 0);
      const total = stocks.reduce((a, b) => a + b, 0);
      if (total <= 0) return { error: null };

      const cortes = _repartirDescuento(stocks, Math.min(cantidad, total));
      const res = await Promise.all(filas.map((r, i) =>
        db.from('almacen_stock')
          .update({ stock: (r.stock || 0) - cortes[i], usuario_id: currentUser.id })
          .eq('id', r.id)
      ));
      const err = res.find(r => r.error);
      if (err) return { error: err.error };
      return { error: null };
    } catch (e) {
      console.error('almacen: descontarVenta', e);
      return { error: null };
    }
  }

  function _renderContent(wrap) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="alm-tab-btn ${_tab === 'stock' ? 'active' : ''}" onclick="Almacen.switchTab('stock')">${_ic('package', 14)} Stock por Ubicación</button>
        <button class="alm-tab-btn ${_tab === 'enviar' ? 'active' : ''}" onclick="Almacen.switchTab('enviar')">${_ic('truck', 14)} Enviar Stock</button>
        <button class="alm-tab-btn ${_tab === 'historial' ? 'active' : ''}" onclick="Almacen.switchTab('historial')">${_ic('history', 14)} Historial de Envíos</button>
        <button class="alm-tab-btn ${_tab === 'ubicaciones' ? 'active' : ''}" onclick="Almacen.switchTab('ubicaciones')">${_ic('map-pin', 14)} Ubicaciones</button>
        <div style="flex:1;"></div>
      </div>
      <div id="almacen-tab-content"></div>
      <style>
        .alm-tab-btn{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;color:var(--text2);cursor:pointer;transition:all 0.2s;}
        .alm-tab-btn.active{background:var(--accent);color:white;border-color:var(--accent);}
        .alm-tab-btn:hover:not(.active){background:var(--surface);border-color:var(--accent2);}
        .alm-field{margin-bottom:12px;}
        .alm-field label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px;}
        .alm-field input,.alm-field select,.alm-field textarea{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text);}
        .alm-table{width:100%;border-collapse:collapse;font-size:12px;}
        .alm-table th{background:var(--surface2);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);}
        .alm-table td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text);}
        .alm-table tr:hover td{background:var(--surface2);}
        .alm-btn{border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .alm-btn-primary{background:var(--accent);color:white;}
        .alm-btn-primary:hover{opacity:0.85;}
        .alm-btn-sm{background:var(--surface2);color:var(--accent2);border:1px solid var(--border);}
        .alm-btn-sm:hover{border-color:var(--accent2);}
        .alm-badge-envio{background:rgba(59,130,246,0.1);color:var(--blue);border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;}
      </style>
    `;
    const content = document.getElementById('almacen-tab-content');
    if (_tab === 'ubicaciones') _renderUbicaciones(content);
    else if (_tab === 'stock') _renderStock(content);
    else if (_tab === 'enviar') _renderEnviar(content);
    else _renderHistorial(content);
  }

  function _stockTotalUbi(id) {
    return _almacenStock.filter(s => s.ubicacion_id === id).reduce((a, s) => a + (s.stock || 0), 0);
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: UBICACIONES (CRUD)
  // ═══════════════════════════════════════════════
  function _renderUbicaciones(content) {
    content.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:14px;">${_ic('plus', 14)} Nueva ubicación</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
          <div class="alm-field">
            <label>Departamento</label>
            <select id="alm-dep"><option value="">— Seleccionar —</option>${Object.keys(BOLIVIA_GEO).sort().map(d => `<option>${d}</option>`).join('')}</select>
          </div>
          <div class="alm-field">
            <label>Lugar</label>
            <input id="alm-lugar" placeholder="Ej: La Ceja">
          </div>
          <div class="alm-field">
            <label>Ubicación / Dirección</label>
            <input id="alm-ubicacion" placeholder="Ej: Av. Sin Retorno, manzano 2">
          </div>
        </div>
        <button class="alm-btn alm-btn-primary" onclick="Almacen.saveUbicacion()">Guardar ubicación</button>
      </div>
      ${_ubicaciones.length === 0
        ? '<div style="color:var(--text3);font-size:13px;padding:30px;text-align:center;">Aún no hay ubicaciones registradas</div>'
        : `<div style="overflow-x:auto;">
            <table class="alm-table">
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Lugar</th>
                  <th>Ubicación</th>
                  <th style="width:90px;">Stock asignado</th>
                  <th style="width:130px;">Acción</th>
                </tr>
              </thead>
              <tbody>
                ${_ubicaciones.map(u => `
                  <tr data-ubi-id="${u.id}">
                    <td style="font-weight:600;">${u.departamento}</td>
                    <td>${u.lugar}</td>
                    <td style="font-size:11px;color:var(--text2);">${u.ubicacion || '—'}</td>
                    <td style="text-align:center;font-weight:700;color:var(--accent2);">${_stockTotalUbi(u.id)}</td>
                    <td>
                      <button class="alm-btn alm-btn-sm" onclick="Almacen.editUbicacion(${u.id})">Editar</button>
                      <button class="alm-btn alm-btn-sm" onclick="Almacen.deleteUbicacion(${u.id})">Eliminar</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
    `;
  }

  async function editUbicacion(id) {
    const u = _ubicaciones.find(x => x.id === id);
    if (!u) return;
    const row = document.querySelector(`#almacen-tab-content tr[data-ubi-id="${id}"]`);
    if (!row) return;
    const style = 'width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface);color:var(--text);';
    row.innerHTML = `
      <td>
        <select id="ub-edit-dep" style="${style}">
          <option value="">— Seleccionar —</option>
          ${Object.keys(BOLIVIA_GEO).sort().map(d => `<option ${d === u.departamento ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </td>
      <td><input id="ub-edit-lugar" value="${u.lugar}" style="${style}"></td>
      <td><input id="ub-edit-ubicacion" value="${u.ubicacion || ''}" placeholder="Opcional" style="${style}"></td>
      <td style="text-align:center;font-weight:700;color:var(--accent2);">${_stockTotalUbi(id)}</td>
      <td>
        <button class="alm-btn alm-btn-sm" onclick="Almacen.saveUbicacionEdit(${id})">Guardar</button>
        <button class="alm-btn alm-btn-sm" onclick="Almacen.cancelUbicacionEdit(${id})">Cancelar</button>
      </td>
    `;
  }

  async function saveUbicacionEdit(id) {
    const dep = document.getElementById('ub-edit-dep')?.value?.trim();
    const lugar = document.getElementById('ub-edit-lugar')?.value?.trim();
    const ubicacion = document.getElementById('ub-edit-ubicacion')?.value?.trim();
    if (!dep || !lugar) { toast(_ic('triangle-alert', 15) + ' Departamento y Lugar son obligatorios', 'error'); return; }
    const { error } = await db.from('almacen_ubicaciones')
      .update({ departamento: dep, lugar, ubicacion: ubicacion || null })
      .eq('id', id);
    if (error) { toast(_ic('circle-x', 15) + ' ' + error.message, 'error'); return; }
    toast(_ic('circle-check', 15) + ' Ubicación actualizada', 'success');
    await DataStore.refresh('almacen');
    await render();
  }

  async function cancelUbicacionEdit() {
    await render();
  }

  async function saveUbicacion() {
    const dep = document.getElementById('alm-dep')?.value?.trim();
    const lugar = document.getElementById('alm-lugar')?.value?.trim();
    const ubicacion = document.getElementById('alm-ubicacion')?.value?.trim();
    if (!dep || !lugar) { toast(_ic('triangle-alert', 15) + ' Departamento y Lugar son obligatorios', 'error'); return; }
    const { error } = await db.from('almacen_ubicaciones').insert({ departamento: dep, lugar, ubicacion: ubicacion || null });
    if (error) { toast(_ic('circle-x', 15) + ' ' + error.message, 'error'); return; }
    toast(_ic('circle-check', 15) + ' Ubicación agregada', 'success');
    await DataStore.refresh('almacen');
    await render();
  }

  async function deleteUbicacion(id) {
    if (!confirm('¿Eliminar esta ubicación y su stock asignado?')) return;
    const { error } = await db.from('almacen_ubicaciones').delete().eq('id', id);
    if (error) { toast(_ic('circle-x', 15) + ' No se puede eliminar: ' + error.message, 'error'); return; }
    toast(_ic('trash-2', 15) + ' Ubicación eliminada', 'success');
    await DataStore.refresh('almacen');
    await render();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: STOCK POR UBICACIÓN (distribución física)
  // ═══════════════════════════════════════════════
  function _renderStock(content) {
    if (_loadError) {
      content.innerHTML = `<div style="border:1px solid #d64545;background:#d6454518;color:#ff8a8a;font-size:12px;padding:14px;border-radius:8px;margin-bottom:14px;">
        <b>${_ic('triangle-alert', 13)} Error consultando la base de datos:</b><br>
        <code style="word-break:break-all;">${_loadError}</code>
      </div>`;
      return;
    }
    if (_productos.length === 0) {
      content.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">No hay stock guardado en <b>Inventario → Ajustes</b> todavía.<br><span style="color:var(--text3);font-size:12px;">Guarda el stock de al menos un producto y el módulo de Almacén mostrará cómo distribuirlo por ubicación.</span></div>`;
      return;
    }
    if (_ubicaciones.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Aún no hay ubicaciones. Crea una en la pestaña <b>' + _ic('map-pin', 13) + ' Ubicaciones</b>.</div>';
      return;
    }

    content.innerHTML = `
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
        El <b>General</b> es la suma del stock de todas las ubicaciones. Edita un valor de ubicación y pulsa <b>Enter</b> o sal del campo para guardar.
      </div>
      <div style="overflow-x:auto;">
        <table class="alm-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align:center;">General</th>
              ${_ubicaciones.map(u => `<th style="text-align:center;" title="${_locLabel(u)}">${_shortLoc(u)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${_productos.map(p => `
              <tr>
                <td style="font-weight:600;">${p.productos?.nombre || 'Producto'}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent2);">${_stockGeneral(p.producto_id)}</td>
                ${_ubicaciones.map(u => `
                  <td style="text-align:center;">
                    <input type="number" min="0" value="${_stockAt(p.producto_id, u.id)}"
                      data-pid="${p.producto_id}" data-uid="${u.id}"
                      onchange="Almacen.saveDistribucion(${p.producto_id}, ${u.id}, this.value)"
                      style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);text-align:center;">
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function saveDistribucion(productoId, ubicacionId, valor) {
    const stock = parseInt(valor);
    if (isNaN(stock) || stock < 0) { toast(_ic('triangle-alert', 15) + ' Valor inválido', 'error'); await render(); return; }
    const { error } = await db.from('almacen_stock').upsert(
      { producto_id: productoId, ubicacion_id: ubicacionId, stock, usuario_id: currentUser.id },
      { onConflict: 'producto_id,ubicacion_id' }
    );
    if (error) { toast(_ic('circle-x', 15) + ' ' + error.message, 'error'); }
    else {
      // stock_inicial = SUM(almacen_stock): el total maestro sigue a lo físico.
      await _syncStockInicial(productoId);
      toast(_ic('circle-check', 15) + ' Distribución guardada', 'success');
    }
    await DataStore.refresh('almacen', 'inventario');
    await render();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: ENVIAR STOCK (origen → destino)
  // ═══════════════════════════════════════════════
  function _renderEnviar(content) {
    if (_loadError) {
      content.innerHTML = `<div style="border:1px solid #d64545;background:#d6454518;color:#ff8a8a;font-size:12px;padding:14px;border-radius:8px;margin-bottom:14px;">
        <b>${_ic('triangle-alert', 13)} Error consultando la base de datos:</b><br>
        <code style="word-break:break-all;">${_loadError}</code>
      </div>`;
      return;
    }
    if (_ubicaciones.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Primero crea ubicaciones en la pestaña <b>' + _ic('map-pin', 13) + ' Ubicaciones</b>.</div>';
      return;
    }
    if (_productos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">No hay productos con stock configurado. Configúralo en <b>Inventario → Ajustes</b>.</div>';
      return;
    }

    content.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;">${_ic('truck', 16)} Enviar stock entre ubicaciones</div>

        <div class="alm-field">
          <label>Origen</label>
          <select id="alm-origen" onchange="Almacen.onEnviarInfo()">
            <option value="">— Seleccionar origen —</option>
            ${_ubicaciones.map(u => `<option value="${u.id}">${_locLabel(u)}</option>`).join('')}
          </select>
        </div>

        <div class="alm-field">
          <label>Destino</label>
          <select id="alm-destino" onchange="Almacen.onDestinoChange()">
            <option value="">— Seleccionar destino —</option>
            ${_ubicaciones.map(u => `<option value="${u.id}">${_locLabel(u)}</option>`).join('')}
            <option value="nuevo">Nueva ubicación...</option>
          </select>
        </div>

        <div id="alm-nueva" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;">
          <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;">Nueva ubicación destino</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
            <div class="alm-field">
              <label>Departamento</label>
              <select id="alm-nueva-dep"><option value="">— Seleccionar —</option>${Object.keys(BOLIVIA_GEO).sort().map(d => `<option>${d}</option>`).join('')}</select>
            </div>
            <div class="alm-field">
              <label>Lugar</label>
              <input id="alm-nueva-lugar" placeholder="Ej: La Ceja">
            </div>
            <div class="alm-field">
              <label>Ubicación / Dirección</label>
              <input id="alm-nueva-ubicacion" placeholder="Ej: Av. Insurgencias">
            </div>
          </div>
        </div>

        <div class="alm-field">
          <label>Producto</label>
          <select id="alm-producto" onchange="Almacen.onEnviarInfo()">
            <option value="">— Seleccionar producto —</option>
            ${_productos.map(p => `<option value="${p.producto_id}">${p.productos?.nombre || 'Producto'} (General: ${_stockGeneral(p.producto_id)})</option>`).join('')}
          </select>
        </div>

        <div id="alm-stock-info" style="display:none;margin-bottom:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;font-size:13px;">
          <span style="color:var(--text3);">Stock en el origen: </span><b id="alm-stock-origen" style="color:var(--accent2);"></b>
          <span style="color:var(--text3);margin-left:14px;">Stock general: </span><b id="alm-stock-general" style="color:var(--accent2);"></b>
        </div>

        <div class="alm-field">
          <label>Cantidad</label>
          <input type="number" id="alm-cantidad" min="1" value="1" placeholder="Cantidad...">
        </div>

        <div class="alm-field">
          <label>Notas <span style="color:var(--text3);font-weight:400;">(opcional)</span></label>
          <textarea id="alm-notas" rows="2" placeholder="Observaciones..."></textarea>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
          <div style="font-size:12px;color:var(--text3);">Responsable: <b style="color:var(--accent2);">${currentUser?.nombre || '—'}</b></div>
          <button onclick="Almacen.saveEnvio()" class="alm-btn alm-btn-primary" style="padding:8px 20px;font-size:13px;">Enviar</button>
        </div>
      </div>
    `;
  }

  function onDestinoChange() {
    const nueva = document.getElementById('alm-nueva');
    if (nueva) nueva.style.display = document.getElementById('alm-destino')?.value === 'nuevo' ? 'block' : 'none';
  }

  function onEnviarInfo() {
    const origenId = parseInt(document.getElementById('alm-origen')?.value);
    const productoId = parseInt(document.getElementById('alm-producto')?.value);
    const info = document.getElementById('alm-stock-info');
    if (!info) return;
    if (!origenId || !productoId) { info.style.display = 'none'; return; }
    const stockOrigen = _stockAt(productoId, origenId);
    const stockGeneral = _stockGeneral(productoId);
    document.getElementById('alm-stock-origen').textContent = stockOrigen;
    document.getElementById('alm-stock-general').textContent = stockGeneral;
    info.style.display = 'block';
  }

  async function saveEnvio() {
    const origenId = parseInt(document.getElementById('alm-origen')?.value);
    const destSel = document.getElementById('alm-destino')?.value;
    const productoId = parseInt(document.getElementById('alm-producto')?.value);
    const cantidad = parseInt(document.getElementById('alm-cantidad')?.value);
    const notas = document.getElementById('alm-notas')?.value?.trim();

    if (!origenId) { toast(_ic('triangle-alert', 15) + ' Selecciona el origen', 'error'); return; }
    if (!destSel) { toast(_ic('triangle-alert', 15) + ' Selecciona el destino', 'error'); return; }
    if (!productoId) { toast(_ic('triangle-alert', 15) + ' Selecciona un producto', 'error'); return; }
    if (isNaN(cantidad) || cantidad <= 0) { toast(_ic('triangle-alert', 15) + ' La cantidad debe ser mayor a 0', 'error'); return; }

    // Resolver destino (puede ser una ubicación nueva creada al vuelo)
    let destinoId = parseInt(destSel);
    if (destSel === 'nuevo') {
      const dep = document.getElementById('alm-nueva-dep')?.value?.trim();
      const lugar = document.getElementById('alm-nueva-lugar')?.value?.trim();
      const ubicacion = document.getElementById('alm-nueva-ubicacion')?.value?.trim();
      if (!dep || !lugar) { toast(_ic('triangle-alert', 15) + ' Completa departamento y lugar del nuevo destino', 'error'); return; }
      const { data: newUb, error: errUb } = await db.from('almacen_ubicaciones').insert({ departamento: dep, lugar, ubicacion: ubicacion || null }).select().single();
      if (errUb) { toast(_ic('circle-x', 15) + ' ' + errUb.message, 'error'); return; }
      destinoId = newUb.id;
    }

    if (origenId === destinoId) { toast(_ic('triangle-alert', 15) + ' El origen y el destino no pueden ser iguales', 'error'); return; }

    const stockOrigenActual = _stockAt(productoId, origenId);
    if (stockOrigenActual < cantidad) {
      toast(_ic('triangle-alert', 15) + ' Stock insuficiente en el origen. Disponible: ' + stockOrigenActual, 'error');
      return;
    }

    const stockGeneralActual = _stockGeneral(productoId);
    if (stockGeneralActual < cantidad) {
      toast(_ic('triangle-alert', 15) + ' Stock general insuficiente. Disponible: ' + stockGeneralActual, 'error');
      return;
    }

    const stockDestinoActual = _stockAt(productoId, destinoId);
    const stockOrigenPosterior = stockOrigenActual - cantidad;
    const stockDestinoPosterior = stockDestinoActual + cantidad;
    const stockGeneralPosterior = stockGeneralActual;

    const ups = [
      db.from('almacen_stock').upsert({ producto_id: productoId, ubicacion_id: origenId, stock: stockOrigenPosterior, usuario_id: currentUser.id }, { onConflict: 'producto_id,ubicacion_id' }),
      db.from('almacen_stock').upsert({ producto_id: productoId, ubicacion_id: destinoId, stock: stockDestinoPosterior, usuario_id: currentUser.id }, { onConflict: 'producto_id,ubicacion_id' })
    ];
    const res = await Promise.all(ups);
    const err = res.find(r => r.error);
    if (err) { toast(_ic('circle-x', 15) + ' ' + err.error.message, 'error'); return; }

    const { error: errMov } = await db.from('almacen_movimientos').insert({
      producto_id: productoId,
      origen_id: origenId,
      destino_id: destinoId,
      cantidad: cantidad,
      stock_origen_anterior: stockOrigenActual,
      stock_origen_posterior: stockOrigenPosterior,
      stock_destino_anterior: stockDestinoActual,
      stock_destino_posterior: stockDestinoPosterior,
      stock_general_anterior: stockGeneralActual,
      stock_general_posterior: stockGeneralPosterior,
      notas: notas || null,
      usuario_id: currentUser.id
    });
    if (errMov) { toast(_ic('circle-x', 15) + ' ' + errMov.message, 'error'); return; }

    toast(_ic('circle-check', 15) + ' Envío registrado: origen ' + stockOrigenActual + ' → ' + stockOrigenPosterior + ', destino ' + stockDestinoActual + ' → ' + stockDestinoPosterior + ', general ' + stockGeneralActual + ' (sin cambio)', 'success');
    await DataStore.refresh('almacen');
    await render();
    if (window._checkStockAlerts) window._checkStockAlerts();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: HISTORIAL DE ENVÍOS
  // ═══════════════════════════════════════════════
  function _renderHistorial(content) {
    if (_movimientos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Sin envíos registrados</div>';
      return;
    }

    const totalPages = Math.ceil(_movimientos.length / PAGE_SIZE);
    if (_currentPage > totalPages) _currentPage = 1;
    const page = _movimientos.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);

    content.innerHTML = `
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">${_movimientos.length} envíos registrados</div>
      <div style="overflow-x:auto;">
        <table class="alm-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Origen</th>
              <th>Destino</th>
              <th>Cantidad</th>
              <th>Stock Origen</th>
              <th>Stock Destino</th>
              <th>Stock General</th>
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
                <td style="font-size:11px;color:var(--text2);max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_locLabel(m.origen)}">${_locLabel(m.origen)}</td>
                <td style="font-size:11px;color:var(--accent2);max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${_locLabel(m.destino)}">${_locLabel(m.destino)}</td>
                <td style="text-align:center;font-weight:600;color:var(--blue);">${m.cantidad}</td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_origen_anterior} → ${m.stock_origen_posterior}</td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_destino_anterior} → ${m.stock_destino_posterior}</td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_general_anterior} → ${m.stock_general_posterior}</td>
                <td style="font-size:11px;color:var(--accent2);">${m.usuarios?.nombre || '—'}</td>
                <td style="font-size:11px;color:var(--text3);max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${m.notas || ''}">${m.notas || ''}</td>
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
    html += `<button class="page-btn" onclick="Almacen.goPage(${_currentPage - 1})" ${_currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - _currentPage) <= 1)
        html += `<button class="page-btn ${i === _currentPage ? 'active' : ''}" onclick="Almacen.goPage(${i})">${i}</button>`;
      else if (Math.abs(i - _currentPage) === 2)
        html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
    }
    html += `<button class="page-btn" onclick="Almacen.goPage(${_currentPage + 1})" ${_currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `</div>`;
    return html;
  }

  // ═══════════════════════════════════════════════
  //  NAVEGACIÓN
  // ═══════════════════════════════════════════════
  function switchTab(name) {
    _tab = name;
    _currentPage = 1;
    const wrap = document.getElementById('almacen-wrap');
    if (wrap) _renderContent(wrap);
  }

  function goPage(p) {
    _currentPage = p;
    const wrap = document.getElementById('almacen-wrap');
    if (wrap) _renderContent(wrap);
  }

  function reset() {
    _tab = 'stock';
    _productos = [];
    _ubicaciones = [];
    _almacenStock = [];
    _movimientos = [];
    _currentPage = 1;
  }

  return { render, switchTab, goPage, saveUbicacion, editUbicacion, saveUbicacionEdit, cancelUbicacionEdit, deleteUbicacion, saveDistribucion, onDestinoChange, onEnviarInfo, saveEnvio, descontarVenta, reset };
})();
