// inventario.js — Módulo de Inventario
// 3 pestañas: Ajustes (stock_inicial + umbrales), Movimiento de Stock, Historial
// Movimientos: Reposición (suma) y Corrección (ajusta a un valor absoluto).
// Las ventas se descuentan automáticamente desde nuevo-registro.js.

const Inventario = (() => {
  let _tab = 'ajustes';
  let _productos = [];
  let _stockMap = {};        // { producto_id: { stock_inicial, umbral_bajo, umbral_moderado, notas, usuario_id, updated_at } }
  let _movimientos = [];
  let _currentPage = 1;
  const PAGE_SIZE = 20;

  function _getStockStatus(stockActual, umbralBajo, umbralModerado) {
    if (umbralBajo > 0 && stockActual <= umbralBajo) return { level: 'bajo', color: 'var(--red)', label: 'Bajo' };
    if (umbralModerado > 0 && stockActual <= umbralModerado) return { level: 'medio', color: 'var(--orange)', label: 'Moderado' };
    return { level: 'alto', color: 'var(--green)', label: 'Alto' };
  }

  async function render() {
    const wrap = document.getElementById('inventario-wrap');
    if (!wrap) return;
    await _loadData();
    if (currentUser.rol === 'agente') {
      _renderAgentView(wrap);
    } else {
      _renderContent(wrap);
    }
  }

  async function _loadData() {
    await DataStore.ensure('inventario');
    _productos = (allProductos || []).filter(p => p.activo);
    _stockMap = {};
    (DataStore.inventarioStock || []).forEach(r => { _stockMap[r.producto_id] = r; });
    _movimientos = DataStore.inventarioMovimientos || [];
  }

  function _calcStockActual(productId) {
    const stock = _stockMap[productId];
    return stock ? stock.stock_inicial : 0;
  }

  // Redistribuye TODAS las ubicaciones de almacen_stock de un producto para que
  // SUM(almacen_stock) == nuevoTotal (modelo: stock_inicial es el total maestro).
  async function _repartirAlmacen(productoId, nuevoTotal) {
    try {
      const { data: filas } = await db.from('almacen_stock')
        .select('id, stock').eq('producto_id', productoId);
      const rows = filas || [];
      if (!rows.length) return;
      const cortes = _repartirTotal(rows.map(r => r.stock || 0), nuevoTotal);
      const res = await Promise.all(rows.map((r, i) =>
        db.from('almacen_stock')
          .update({ stock: cortes[i], usuario_id: currentUser.id })
          .eq('id', r.id)
      ));
      const err = res.find(r => r.error);
      if (err) console.error('inventario: repartir almacén', err.error);
    } catch (e) {
      console.error('inventario: repartir almacén', e);
    }
  }

  // Ubicación por defecto de un departamento desde DataStore (solo lectura):
  // 'Principal' (sin dirección) o, si no existe, la primera del departamento.
  function _nrUbicacionDept(dep) {
    const ubs = DataStore.ubicaciones || [];
    return ubs.find(u => u.departamento === dep && u.lugar === 'Principal' && !u.ubicacion) ||
           ubs.find(u => u.departamento === dep) || null;
  }

  // Stock actual de un producto en el departamento indicado (solo lectura).
  function _nrStockDeptActual(productoId, dep) {
    const ub = _nrUbicacionDept(dep);
    if (!ub) return 0;
    const r = (DataStore.almacenStock || []).find(x => x.producto_id === productoId && x.ubicacion_id === ub.id);
    return r ? r.stock : 0;
  }

  // En modo Corrección, precarga el campo "Nuevo stock" con el stock actual
  // del departamento seleccionado (no el general).
  function _updateCorreccionPrefill() {
    const tipo = document.querySelector('input[name="inv-tipo"]:checked')?.value;
    if (tipo !== 'correccion') return;
    const productoId = parseInt(document.getElementById('inv-producto')?.value);
    const dep = document.querySelector('.inv-geo-dep')?.value?.trim();
    const input = document.getElementById('inv-cantidad');
    if (!input) return;
    input.value = productoId && dep ? _nrStockDeptActual(productoId, dep) : 0;
    input.min = '0';
  }

  function _renderContent(wrap) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="inv-tab-btn ${_tab === 'ajustes' ? 'active' : ''}" onclick="Inventario.switchTab('ajustes')">${_ic('settings', 14)} Ajustes</button>
        <button class="inv-tab-btn ${_tab === 'movimiento' ? 'active' : ''}" onclick="Inventario.switchTab('movimiento')">${_ic('package', 14)} Movimiento de Stock</button>
        <button class="inv-tab-btn ${_tab === 'historial' ? 'active' : ''}" onclick="Inventario.switchTab('historial')">${_ic('clipboard-list', 14)} Historial</button>
        <span style="color:var(--green); font-size:13px;display:inline-flex;align-items:center;gap:5px;">${_ic('circle', 10, { fill: 'var(--green)', stroke: 'var(--green)' })} Alto</span>
        <span style="color:var(--orange); font-size:13px;display:inline-flex;align-items:center;gap:5px;">${_ic('circle', 10, { fill: 'var(--orange)', stroke: 'var(--orange)' })} Moderado</span>
        <span style="color:var(--red); font-size:13px;display:inline-flex;align-items:center;gap:5px;">${_ic('circle', 10, { fill: 'var(--red)', stroke: 'var(--red)' })} Bajo</span>
        <div style="flex:1;"></div>
        ${_tab === 'ajustes' ? '<button class="inv-btn inv-btn-primary" onclick="Inventario.saveAllAjustes()" style="padding:8px 16px;font-size:12px;">' + _ic('save', 14) + ' Guardar Todos</button>' : ''}
      </div>
      <div id="inv-tab-content"></div>
      <style>
        .inv-tab-btn{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;color:var(--text2);cursor:pointer;transition:all 0.2s;}
        .inv-tab-btn.active{background:var(--accent);color:white;border-color:var(--accent);}
        .inv-tab-btn:hover:not(.active){background:var(--surface);border-color:var(--accent2);}
        .inv-field{margin-bottom:12px;}
        .inv-field label{display:block;font-size:12px;font-weight:600;color:var(--text2);margin-bottom:4px;}
        .inv-field input,.inv-field select,.inv-field textarea{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface);color:var(--text);}
        .inv-field input:read-only{background:var(--surface2);color:var(--text3);font-weight:700;}
        .inv-table{width:100%;border-collapse:collapse;font-size:12px;}
        .inv-table th{background:var(--surface2);padding:8px 10px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);}
        .inv-table td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text);}
        .inv-table tr:hover td{background:var(--surface2);}
        .inv-btn{border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;}
        .inv-btn-primary{background:var(--accent);color:white;}
        .inv-btn-primary:hover{opacity:0.85;}
        .inv-btn-sm{background:var(--surface2);color:var(--accent2);border:1px solid var(--border);}
        .inv-btn-sm:hover{border-color:var(--accent2);}
        .inv-badge-venta{background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;}
        .inv-badge-reposicion{background:rgba(16,185,129,0.1);color:var(--green);border:1px solid rgba(16,185,129,0.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;}
        .inv-badge-correccion{background:rgba(59,130,246,0.1);color:var(--blue);border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;}
        .stock-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.3px;}
        .stock-badge.alto{background:rgba(16,185,129,0.12);color:var(--green);border:1px solid rgba(16,185,129,0.3);}
        .stock-badge.medio{background:rgba(249,115,22,0.12);color:var(--orange);border:1px solid rgba(249,115,22,0.3);}
        .stock-badge.bajo{background:rgba(239,68,68,0.12);color:var(--red);border:1px solid rgba(239,68,68,0.3);}
      </style>
    `;
    const content = document.getElementById('inv-tab-content');
    if (_tab === 'ajustes') _renderAjustes(content);
    else if (_tab === 'movimiento') _renderMovimiento(content);
    else _renderHistorial(content);
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: AJUSTES (stock inicial + umbrales por producto)
  // ═══════════════════════════════════════════════
  function _renderAjustes(content) {
    if (_productos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">No hay productos activos</div>';
      return;
    }

    content.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="width:100px;">Stock Inicial</th>
              <th style="width:90px;">Stock Actual</th>
              <th style="width:80px;">Umbral Bajo</th>
              <th style="width:100px;">Umbral Moderado</th>
              <th style="width:100px;">Estado</th>
              <th style="width:80px;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${_productos.map(p => {
              const s = _stockMap[p.id];
              const stockActual = _calcStockActual(p.id);
              const umbralBajo = s?.umbral_bajo ?? 0;
              const umbralModerado = s?.umbral_moderado ?? 0;
              const st = _getStockStatus(stockActual, umbralBajo, umbralModerado);
              return `<tr>
                <td style="font-weight:600;">${p.nombre}</td>
                <td><input type="number" min="0" class="inv-ajuste-input-stock" data-producto-id="${p.id}" value="${s?.stock_inicial ?? 0}" style="width:80px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);"></td>
                <td style="text-align:center;font-weight:700;color:${st.color};">${stockActual}</td>
                <td><input type="number" min="0" class="inv-ajuste-input-bajo" data-producto-id="${p.id}" value="${umbralBajo}" style="width:60px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);"></td>
                <td><input type="number" min="0" class="inv-ajuste-input-moderado" data-producto-id="${p.id}" value="${umbralModerado}" style="width:80px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);"></td>
                <td><span class="stock-badge ${st.level}">${st.label}</span></td>
                <td><button class="inv-btn inv-btn-sm" onclick="Inventario.saveAjuste(${p.id})">Guardar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function saveAjuste(productoId) {
    const inputStock = document.querySelector(`.inv-ajuste-input-stock[data-producto-id="${productoId}"]`);
    const inputBajo = document.querySelector(`.inv-ajuste-input-bajo[data-producto-id="${productoId}"]`);
    const inputModerado = document.querySelector(`.inv-ajuste-input-moderado[data-producto-id="${productoId}"]`);
    if (!inputStock) return;
    const stockInicial = parseInt(inputStock.value) || 0;
    const umbralBajo = parseInt(inputBajo?.value) || 0;
    const umbralModerado = parseInt(inputModerado?.value) || 0;
    const existing = _stockMap[productoId];

    if (existing) {
      const { error } = await db.from('inventario_stock')
        .update({ stock_inicial: stockInicial, umbral_bajo: umbralBajo, umbral_moderado: umbralModerado, usuario_id: currentUser.id })
        .eq('producto_id', productoId);
      if (error) { toast(_ic('circle-x', 15) + ' Error: ' + esc(error.message), 'error'); return; }
    } else {
      const { error } = await db.from('inventario_stock').insert({
        producto_id: productoId,
        stock_inicial: stockInicial,
        umbral_bajo: umbralBajo,
        umbral_moderado: umbralModerado,
        usuario_id: currentUser.id
      });
      if (error) { toast(_ic('circle-x', 15) + ' Error: ' + esc(error.message), 'error'); return; }
    }

    // Mantener el invariante: SUM(almacen_stock) === stock_inicial (reparto proporcional).
    await _repartirAlmacen(productoId, stockInicial);

    toast(_ic('circle-check', 15) + ' Ajuste guardado', 'success');
    await DataStore.refresh('inventario', 'almacen');
    await render();
    if (window._checkStockAlerts) window._checkStockAlerts();
  }

  async function saveAllAjustes() {
    const stockInputs = document.querySelectorAll('.inv-ajuste-input-stock');
    if (!stockInputs.length) { toast('No hay productos', 'error'); return; }

    let ok = 0, fail = 0;
    for (const input of stockInputs) {
      const pid = input.dataset.productoId;
      const stockInicial = parseInt(input.value) || 0;
      const umbralBajo = parseInt(document.querySelector(`.inv-ajuste-input-bajo[data-producto-id="${pid}"]`)?.value) || 0;
      const umbralModerado = parseInt(document.querySelector(`.inv-ajuste-input-moderado[data-producto-id="${pid}"]`)?.value) || 0;
      const existing = _stockMap[pid];

      try {
        if (existing) {
          const { error } = await db.from('inventario_stock')
            .update({ stock_inicial: stockInicial, umbral_bajo: umbralBajo, umbral_moderado: umbralModerado, usuario_id: currentUser.id })
            .eq('producto_id', pid);
          if (error) { fail++; continue; }
        } else {
          const { error } = await db.from('inventario_stock').insert({
            producto_id: pid, stock_inicial: stockInicial, umbral_bajo: umbralBajo, umbral_moderado: umbralModerado, usuario_id: currentUser.id
          });
          if (error) { fail++; continue; }
        }
        // Mantener el invariante: SUM(almacen_stock) === stock_inicial.
        await _repartirAlmacen(pid, stockInicial);
        ok++;
      } catch { fail++; }
    }

    if (fail) toast(_ic('triangle-alert', 15) + ' ' + ok + ' guardados, ' + fail + ' fallidos', 'warning');
    else toast(_ic('circle-check', 15) + ' ' + ok + ' ajustes guardados', 'success');
    await DataStore.refresh('inventario', 'almacen');
    await render();
    if (window._checkStockAlerts) window._checkStockAlerts();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: MOVIMIENTO DE STOCK
  // ═══════════════════════════════════════════════
  function _renderMovimiento(content) {
    const usuario = currentUser;
    content.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;width:100%;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;">Registrar Movimiento de Stock</div>

        <div class="inv-field">
          <label>Producto</label>
          <select id="inv-producto" onchange="Inventario.onProductoChange()">
            <option value="">— Seleccionar producto —</option>
            ${_productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
          </select>
        </div>

        <div id="inv-stock-info" style="display:none;margin-bottom:12px;padding:10px 14px;background:var(--surface2);border-radius:8px;font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--text3);">Stock actual: </span>
            <span id="inv-stock-actual" style="font-weight:700;font-size:16px;"></span>
            <span id="inv-stock-status"></span>
          </div>
        </div>

        <div class="inv-field">
          <label>Tipo de movimiento</label>
          <div style="display:flex;gap:12px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text);">
              <input type="radio" name="inv-tipo" value="reposicion" checked onchange="Inventario.onTipoChange()"> Reposición
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text);">
              <input type="radio" name="inv-tipo" value="correccion" onchange="Inventario.onTipoChange()"> Corrección
            </label>
          </div>
        </div>

        <div class="inv-field">
          <label id="inv-cantidad-label">Cantidad a agregar</label>
          <input type="number" id="inv-cantidad" min="0" value="1" placeholder="Cantidad...">
        </div>

        <div class="inv-field">
          <label>Ubicación <span style="color:var(--text3);font-weight:400;font-size:10px;">(selecciona el departamento o escribe)</span></label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <select class="inv-geo-dep" style="font-size:12px;"><option value="">— Departamento —</option></select>
            <select class="inv-geo-prov" disabled style="font-size:12px;"><option value="">— Provincia —</option></select>
            <select class="inv-geo-mun" disabled style="font-size:12px;"><option value="">— Municipio —</option></select>
          </div>
          <input id="inv-ubicacion" placeholder="O escribe la ubicación directamente...">
        </div>

        <div style="font-size:11px;color:var(--text3);margin-bottom:12px;">${_ic('lightbulb', 13)} Al guardar una <b>Reposición</b> o <b>Corrección</b> se crea o actualiza la ubicación del <b>Almacén</b> por <b>Departamento</b>. Lugar y Ubicación se editan luego en <b>Almacén → ${_ic('map-pin', 13)} Ubicaciones</b>.</div>

        <div class="inv-field">
          <label>Notas <span style="color:var(--text3);font-weight:400;">(opcional)</span></label>
          <textarea id="inv-notas" rows="2" placeholder="Observaciones..."></textarea>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;">
          <div style="font-size:12px;color:var(--text3);">Responsable: <b style="color:var(--accent2);">${usuario?.nombre || '—'}</b></div>
          <button onclick="Inventario.saveMovimiento()" class="inv-btn inv-btn-primary" style="padding:8px 20px;font-size:13px;">Registrar</button>
        </div>
      </div>
    `;
    _initGeoSelectors();
  }

  function onProductoChange() {
    const productoId = parseInt(document.getElementById('inv-producto')?.value);
    const info = document.getElementById('inv-stock-info');
    const stockEl = document.getElementById('inv-stock-actual');
    const statusEl = document.getElementById('inv-stock-status');
    if (!productoId || !info || !stockEl) { if (info) info.style.display = 'none'; return; }

    const stockActual = _calcStockActual(productoId);
    const s = _stockMap[productoId];
    const st = _getStockStatus(stockActual, s?.umbral_bajo ?? 0, s?.umbral_moderado ?? 0);

    stockEl.textContent = stockActual;
    stockEl.style.color = st.color;
    if (statusEl) statusEl.innerHTML = `<span class="stock-badge ${st.level}" style="font-size:12px;">${st.label}</span>`;
    info.style.display = 'block';

    const tipo = document.querySelector('input[name="inv-tipo"]:checked')?.value;
    if (tipo === 'correccion') _updateCorreccionPrefill();
  }

  function onTipoChange() {
    const tipo = document.querySelector('input[name="inv-tipo"]:checked')?.value;
    const label = document.getElementById('inv-cantidad-label');
    const input = document.getElementById('inv-cantidad');
    if (!label || !input) return;
    if (tipo === 'correccion') {
      label.textContent = 'Nuevo stock (valor absoluto del departamento)';
      input.min = '0';
      _updateCorreccionPrefill();
    } else {
      label.textContent = 'Cantidad a agregar';
      input.min = '1';
      input.value = '1';
    }
  }

  async function saveMovimiento() {
    const productoId = parseInt(document.getElementById('inv-producto')?.value);
    const tipo = document.querySelector('input[name="inv-tipo"]:checked')?.value;
    const cantidad = parseInt(document.getElementById('inv-cantidad')?.value);
    const ubicacion = document.getElementById('inv-ubicacion')?.value?.trim();
    const notas = document.getElementById('inv-notas')?.value?.trim();
    const dep = document.querySelector('.inv-geo-dep')?.value?.trim();

    if (!productoId) { toast(_ic('triangle-alert', 15) + ' Selecciona un producto', 'error'); return; }
    if (isNaN(cantidad) || cantidad < 0) { toast(_ic('triangle-alert', 15) + ' Ingresa una cantidad válida', 'error'); return; }
    if (tipo === 'reposicion' && cantidad <= 0) { toast(_ic('triangle-alert', 15) + ' La cantidad a agregar debe ser mayor a 0', 'error'); return; }
    if ((tipo === 'reposicion' || tipo === 'correccion') && !dep) {
      toast(_ic('triangle-alert', 15) + ' Selecciona el Departamento (necesario para actualizar el Almacén)', 'error'); return;
    }

    const stockActual = _calcStockActual(productoId);

    // Ubicación del departamento y su stock actual (la corrección actúa sobre esta).
    let ubicacionId = null;
    let stockUbiActual = 0;
    try {
      ubicacionId = await _nrGetOrCreateUbicacion(dep);
      if (ubicacionId) {
        const { data: filas } = await db.from('almacen_stock')
          .select('stock').eq('producto_id', productoId).eq('ubicacion_id', ubicacionId);
        stockUbiActual = filas?.[0]?.stock ?? 0;
      }
    } catch (e) {
      console.error('almacen: ubicación movimiento', e);
    }

    // Corrección: la ubicación del departamento queda con `cantidad` (absoluto), las demás
    // NO cambian y el stock general se recalcula a la nueva suma real.
    // Reposición: suma `cantidad` a la ubicación del departamento y al stock general.
    let stockPosterior;
    if (tipo === 'correccion') {
      try {
        const { data: sumRows } = await db.from('almacen_stock')
          .select('stock').eq('producto_id', productoId);
        const sumActual = (sumRows || []).reduce((a, r) => a + (r.stock || 0), 0);
        stockPosterior = sumActual - stockUbiActual + cantidad;
      } catch (e) {
        console.error('almacen: suma corrección', e);
        stockPosterior = stockActual - stockUbiActual + cantidad;
      }
    } else {
      stockPosterior = stockActual + cantidad;
    }

    // El historial muestra el stock del departamento en corrección; stock general en el resto.
    const logAnterior = tipo === 'correccion' ? stockUbiActual : stockActual;
    const logPosterior = tipo === 'correccion' ? cantidad : stockPosterior;

    const { error } = await db.from('inventario_movimientos').insert({
      producto_id: productoId,
      tipo: tipo,
      cantidad: cantidad,
      stock_anterior: logAnterior,
      stock_posterior: logPosterior,
      ubicacion: ubicacion || null,
      notas: notas || null,
      usuario_id: currentUser.id
    });

    if (error) { toast(_ic('circle-x', 15) + ' Error: ' + esc(error.message), 'error'); return; }

    // Asegurar la fila de inventario_stock (upsert conserva umbrales y crea si falta)
    const s = _stockMap[productoId];
    const { error: errUpd } = await db.from('inventario_stock').upsert({
      producto_id: productoId,
      stock_inicial: stockPosterior,
      umbral_bajo: s?.umbral_bajo ?? 0,
      umbral_moderado: s?.umbral_moderado ?? 0,
      usuario_id: currentUser.id
    }, { onConflict: 'producto_id' });
    if (errUpd) { toast(_ic('circle-x', 15) + ' Error: ' + esc(errUpd.message), 'error'); return; }

    // ── Sincronizar el stock del Almacén (SUM(almacen_stock) === stock_inicial) ──
    let almMsg = null;
    try {
      if (ubicacionId) {
        if (tipo === 'correccion') {
          // La ubicación del departamento queda con el valor escrito (absoluto).
          // El trigger SQL sync_stock_inicial_from_almacen recalcula el total general.
          const { error: errAlm } = await db.from('almacen_stock').upsert({
            producto_id: productoId,
            ubicacion_id: ubicacionId,
            stock: cantidad,
            usuario_id: currentUser.id
          }, { onConflict: 'producto_id,ubicacion_id' });
          if (errAlm) { console.error('almacen: sync corrección', errAlm); }
          else almMsg = dep + ': ' + stockUbiActual + ' → ' + cantidad;
        } else {
          // Reposición: suma la cantidad a la ubicación del departamento (resto igual).
          const stockUbiNuevo = stockUbiActual + cantidad;
          const { error: errAlm } = await db.from('almacen_stock').upsert({
            producto_id: productoId,
            ubicacion_id: ubicacionId,
            stock: stockUbiNuevo,
            usuario_id: currentUser.id
          }, { onConflict: 'producto_id,ubicacion_id' });
          if (errAlm) { console.error('almacen: sync movimiento', errAlm); }
          else almMsg = 'Almacén sumado en ' + dep + ': ' + stockUbiActual + ' → ' + stockUbiNuevo;
        }
      }
    } catch (e) {
      console.error('almacen: sync movimiento', e);
    }

    const label = tipo === 'correccion' ? 'Corrección aplicada' : 'Reposición registrada';
    toast(_ic('circle-check', 15) + ' ' + label + ': Stock general ' + stockActual + ' → ' + stockPosterior + ' · ' + (almMsg || 'Almacén sin cambio'), 'success');
    await DataStore.refresh('inventario', 'almacen');
    await render();
    if (window._checkStockAlerts) window._checkStockAlerts();
  }

  // Encuentra la ubicación por defecto del departamento (lugar='Principal'); si no existe
  // usa la primera del departamento; si no hay ninguna, la crea automáticamente.
  async function _nrGetOrCreateUbicacion(dep) {
    const { data: def } = await db.from('almacen_ubicaciones')
      .select('id').eq('departamento', dep).eq('lugar', 'Principal').is('ubicacion', null).maybeSingle();
    if (def) return def.id;

    const { data: primera } = await db.from('almacen_ubicaciones')
      .select('id').eq('departamento', dep).order('id').limit(1).maybeSingle();
    if (primera) return primera.id;

    const { data: nueva, error } = await db.from('almacen_ubicaciones')
      .insert({ departamento: dep, lugar: 'Principal', ubicacion: null }).select('id').single();
    if (error) { console.error('almacen: crear ubicación', error); return null; }
    return nueva.id;
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: HISTORIAL
  // ═══════════════════════════════════════════════
  function _renderHistorial(content) {
    if (_movimientos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">Sin movimientos registrados</div>';
      return;
    }

    const totalPages = Math.ceil(_movimientos.length / PAGE_SIZE);
    if (_currentPage > totalPages) _currentPage = 1;
    const page = _movimientos.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);

    content.innerHTML = `
      <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">${_movimientos.length} movimientos registrados</div>
      <div style="overflow-x:auto;">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Stock</th>
              <th>Estado</th>
              <th>Ubicación</th>
              <th>Responsable</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            ${page.map(m => {
              const fecha = m.created_at
                ? new Date(m.created_at).toLocaleDateString('es-BO', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
                : '—';
              const badge = m.tipo === 'venta'
                ? '<span class="inv-badge-venta">Venta</span>'
                : m.tipo === 'correccion'
                  ? '<span class="inv-badge-correccion">Corrección</span>'
                  : '<span class="inv-badge-reposicion">Reposición</span>';
              const st = _getStockStatus(m.stock_posterior, _stockMap[m.producto_id]?.umbral_bajo ?? 0, _stockMap[m.producto_id]?.umbral_moderado ?? 0);
              return `<tr>
                <td style="white-space:nowrap;color:var(--text3);">${fecha}</td>
                <td style="font-weight:600;">${m.productos?.nombre || '—'}</td>
                <td>${badge}</td>
                <td style="text-align:center;font-weight:600;color:${m.tipo === 'venta' ? 'var(--red)' : m.tipo === 'correccion' ? 'var(--blue)' : 'var(--green)'};">
                  ${m.tipo === 'venta' ? '-' + m.cantidad : m.tipo === 'correccion' ? '→ ' + m.stock_posterior : '+' + m.cantidad}
                </td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_anterior} → ${m.stock_posterior}</td>
                <td><span class="stock-badge ${st.level}" style="font-size:10px;">${st.label}</span></td>
                <td style="font-size:11px;color:var(--text2);max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${m.ubicacion || ''}">${m.ubicacion || '—'}</td>
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
    html += `<button class="page-btn" onclick="Inventario.goPage(${_currentPage - 1})" ${_currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - _currentPage) <= 1)
        html += `<button class="page-btn ${i === _currentPage ? 'active' : ''}" onclick="Inventario.goPage(${i})">${i}</button>`;
      else if (Math.abs(i - _currentPage) === 2)
        html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
    }
    html += `<button class="page-btn" onclick="Inventario.goPage(${_currentPage + 1})" ${_currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `</div>`;
    return html;
  }

  // ═══════════════════════════════════════════════
  //  GEO SELECTORS (BOLIVIA_GEO cascada)
  // ═══════════════════════════════════════════════
  function _initGeoSelectors() {
    const selDep = document.querySelector('.inv-geo-dep');
    const selProv = document.querySelector('.inv-geo-prov');
    const selMun = document.querySelector('.inv-geo-mun');
    if (!selDep) return;

    Object.keys(BOLIVIA_GEO).sort().forEach(dep => {
      const o = document.createElement('option'); o.value = dep; o.textContent = dep;
      selDep.appendChild(o);
    });

    function upd() {
      const inp = document.getElementById('inv-ubicacion'); if (!inp) return;
      const dep = selDep.value, prov = selProv.value, mun = selMun.value;
      if (mun) inp.value = `${dep} - ${prov} - ${mun}`;
      else if (prov) inp.value = `${dep} - ${prov}`;
      else if (dep) inp.value = dep;
      else inp.value = '';
      _updateCorreccionPrefill();
    }

    selDep.onchange = () => {
      const dep = selDep.value;
      selProv.innerHTML = '<option value="">— Provincia —</option>';
      selMun.innerHTML = '<option value="">— Municipio —</option>';
      selProv.disabled = !dep; selMun.disabled = true; upd();
      if (!dep) return;
      Object.keys(BOLIVIA_GEO[dep].provincias).sort().forEach(p => {
        const o = document.createElement('option'); o.value = p; o.textContent = p; selProv.appendChild(o);
      });
    };
    selProv.onchange = () => {
      const dep = selDep.value, prov = selProv.value;
      selMun.innerHTML = '<option value="">— Municipio —</option>';
      selMun.disabled = !prov; upd();
      if (!dep || !prov) return;
      const pd = BOLIVIA_GEO[dep].provincias[prov], cap = BOLIVIA_GEO[dep].capital;
      pd.municipios.forEach(m => {
        const o = document.createElement('option'); o.value = m;
        o.textContent = m === cap ? m + ' ★ (cap. departamental)' : m === pd.capital ? m + ' · (cap. provincial)' : m;
        selMun.appendChild(o);
      });
    };
    selMun.onchange = upd;
  }

  // ═══════════════════════════════════════════════
  //  VISTA AGENTE: Stock por producto con estado
  // ═══════════════════════════════════════════════
  function _renderAgentView(wrap) {
    const stockHtml = _productos.map(p => {
      const stock = _calcStockActual(p.id);
      const s = _stockMap[p.id];
      const st = _getStockStatus(stock, s?.umbral_bajo ?? 0, s?.umbral_moderado ?? 0);
      return `
        <div style="background:var(--surface);border:1px solid ${st.color}40;border-radius:10px;padding:20px;text-align:center;min-width:160px;max-width:220px;">
          <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">${p.nombre}</div>
          <div style="font-size:32px;font-weight:800;color:${st.color};line-height:1;">${stock}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px;">Stock actual</div>
          <div style="margin-top:8px;"><span class="stock-badge ${st.level}">${st.label}</span></div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:18px;">${_ic('package', 16)} Stock de Productos</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:16px;">
        ${stockHtml}
      </div>
    `;
  }

  // ═══════════════════════════════════════════════
  //  NAVEGACIÓN
  // ═══════════════════════════════════════════════
  function switchTab(name) {
    _tab = name;
    _currentPage = 1;
    const wrap = document.getElementById('inventario-wrap');
    if (wrap) _renderContent(wrap);
  }

  function goPage(p) {
    _currentPage = p;
    const wrap = document.getElementById('inventario-wrap');
    if (wrap) _renderContent(wrap);
  }

  async function loadStockData(forceRefresh = true) {
    if (forceRefresh) await DataStore.refresh('inventario', 'almacen');
    await _loadData();
  }

  function reset() {
    _tab = 'ajustes';
    _productos = [];
    _stockMap = {};
    _movimientos = [];
    _currentPage = 1;
  }

  function getAllStock() {
    return _productos.map(p => {
      const s = _stockMap[p.id];
      const stockActual = s?.stock_inicial || 0;
      const status = _getStockStatus(stockActual, s?.umbral_bajo ?? 0, s?.umbral_moderado ?? 0);
      return {
        productId: p.id,
        productName: p.nombre,
        stockActual,
        level: status.level,
        color: status.color,
      };
    }).sort((a, b) => a.stockActual - b.stockActual);
  }

  function getStockAlerts() {
    const items = [];
    for (const p of _productos) {
      const s = _stockMap[p.id];
      if (!s) continue;
      const stockActual = s.stock_inicial || 0;
      const status = _getStockStatus(stockActual, s.umbral_bajo, s.umbral_moderado);
      if (status.level !== 'alto') {
        items.push({
          productId: p.id,
          productName: p.nombre,
          stockActual,
          level: status.level,
          label: status.label,
        });
      }
    }
    items.sort((a, b) => a.level === 'bajo' ? -1 : b.level === 'bajo' ? 1 : 0);
    return items;
  }

  return { render, switchTab, goPage, saveAjuste, saveAllAjustes, onProductoChange, onTipoChange, saveMovimiento, reset, getStockAlerts, getAllStock, loadStockData };
})();
