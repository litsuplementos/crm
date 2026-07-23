// inventario.js — Módulo de Inventario
// 3 pestañas: Ajustes (stock_inicial por producto), Movimiento de Stock (ventas/reposiciones), Historial

const Inventario = (() => {
  let _tab = 'movimiento';
  let _productos = [];
  let _stockMap = {};        // { producto_id: { stock_inicial, notas, usuario_id, updated_at } }
  let _movimientos = [];
  let _currentPage = 1;
  const PAGE_SIZE = 20;

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
    _productos = (allProductos || []).filter(p => p.activo);

    const [stockRes, movRes] = await Promise.allSettled([
      db.from('inventario_stock').select('*, usuarios:usuario_id (id, nombre)'),
      db.from('inventario_movimientos')
        .select(`
          id, producto_id, tipo, cantidad, stock_anterior, stock_posterior, ubicacion, notas, usuario_id, created_at,
          productos:producto_id (id, nombre),
          usuarios:usuario_id (id, nombre)
        `)
        .order('created_at', { ascending: false })
    ]);

    const stockRows = stockRes.status === 'fulfilled' ? (stockRes.value.data || []) : [];
    _stockMap = {};
    stockRows.forEach(r => { _stockMap[r.producto_id] = r; });

    _movimientos = movRes.status === 'fulfilled' ? (movRes.value.data || []) : [];
  }

  function _calcStockActual(productId) {
    const stock = _stockMap[productId];
    const base = stock ? stock.stock_inicial : 0;
    const movs = _movimientos.filter(m => m.producto_id === productId);
    let restante = base;
    for (const m of movs) {
      if (m.tipo === 'reposicion') restante += m.cantidad;
      else if (m.tipo === 'venta') restante -= m.cantidad;
    }
    return restante;
  }

  function _renderContent(wrap) {
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="inv-tab-btn ${_tab === 'movimiento' ? 'active' : ''}" onclick="Inventario.switchTab('movimiento')">📦 Movimiento de Stock</button>
        <button class="inv-tab-btn ${_tab === 'historial' ? 'active' : ''}" onclick="Inventario.switchTab('historial')">📋 Historial</button>
        <button class="inv-tab-btn ${_tab === 'ajustes' ? 'active' : ''}" onclick="Inventario.switchTab('ajustes')">⚙️ Ajustes</button>
        <div style="flex:1;"></div>
        ${_tab === 'ajustes' ? '<button class="inv-btn inv-btn-primary" onclick="Inventario.saveAllAjustes()" style="padding:8px 16px;font-size:12px;">💾 Guardar Todos</button>' : ''}
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
      </style>
    `;
    const content = document.getElementById('inv-tab-content');
    if (_tab === 'ajustes') _renderAjustes(content);
    else if (_tab === 'movimiento') _renderMovimiento(content);
    else _renderHistorial(content);
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: AJUSTES (stock inicial por producto)
  // ═══════════════════════════════════════════════
  function _renderAjustes(content) {
    if (_productos.length === 0) {
      content.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:40px;text-align:center;">No hay productos activos</div>';
      return;
    }

    content.innerHTML = `
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">Configura el stock inicial de cada producto. Este valor es el punto de partida para calcular el stock actual.</div>
      <div style="overflow-x:auto;">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style="width:160px;">Stock Inicial</th>
              <th style="width:140px;">Stock Actual</th>
              <th style="width:120px;">Último Ajuste</th>
              <th style="width:120px;">Responsable</th>
              <th style="width:80px;">Acción</th>
            </tr>
          </thead>
          <tbody>
            ${_productos.map(p => {
              const s = _stockMap[p.id];
              const stockActual = _calcStockActual(p.id);
              const fecha = s?.updated_at
                ? new Date(s.updated_at).toLocaleDateString('es-BO', { day:'2-digit', month:'2-digit', year:'2-digit' })
                : '—';
              const responsable = s?.usuarios?.nombre || '—';
              return `<tr>
                <td style="font-weight:600;">${p.nombre}</td>
                <td><input type="number" min="0" class="inv-ajuste-input" data-producto-id="${p.id}" value="${s?.stock_inicial ?? 0}" style="width:120px;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px;background:var(--surface);color:var(--text);"></td>
                <td style="text-align:center;font-weight:700;color:${stockActual > 0 ? 'var(--green)' : stockActual < 0 ? 'var(--red)' : 'var(--text3)'};">${stockActual}</td>
                <td style="font-size:11px;color:var(--text3);">${fecha}</td>
                <td style="font-size:11px;color:var(--accent2);">${responsable}</td>
                <td><button class="inv-btn inv-btn-sm" onclick="Inventario.saveAjuste(${p.id})">Guardar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function saveAjuste(productoId) {
    const input = document.querySelector(`.inv-ajuste-input[data-producto-id="${productoId}"]`);
    if (!input) return;
    const stockInicial = parseInt(input.value) || 0;
    const existing = _stockMap[productoId];

    if (existing) {
      const { error } = await db.from('inventario_stock')
        .update({ stock_inicial: stockInicial, usuario_id: currentUser.id })
        .eq('producto_id', productoId);
      if (error) { toast('❌ Error: ' + error.message, 'error'); return; }
    } else {
      const { error } = await db.from('inventario_stock').insert({
        producto_id: productoId,
        stock_inicial: stockInicial,
        usuario_id: currentUser.id
      });
      if (error) { toast('❌ Error: ' + error.message, 'error'); return; }
    }

    toast('✅ Stock inicial guardado', 'success');
    await render();
  }

  async function saveAllAjustes() {
    const inputs = document.querySelectorAll('.inv-ajuste-input');
    if (!inputs.length) { toast('No hay productos', 'error'); return; }

    let ok = 0, fail = 0;
    for (const input of inputs) {
      const pid = input.dataset.productoId;
      const stockInicial = parseInt(input.value) || 0;
      const existing = _stockMap[pid];

      try {
        if (existing) {
          const { error } = await db.from('inventario_stock')
            .update({ stock_inicial: stockInicial, usuario_id: currentUser.id })
            .eq('producto_id', pid);
          if (error) { fail++; continue; }
        } else {
          const { error } = await db.from('inventario_stock').insert({
            producto_id: pid, stock_inicial: stockInicial, usuario_id: currentUser.id
          });
          if (error) { fail++; continue; }
        }
        ok++;
      } catch { fail++; }
    }

    if (fail) toast(`⚠️ ${ok} guardados, ${fail} fallidos`, 'warning');
    else toast(`✅ ${ok} ajustes guardados`, 'success');
    await render();
  }

  // ═══════════════════════════════════════════════
  //  PESTAÑA: MOVIMIENTO DE STOCK (ventas/reposiciones)
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
          <span style="color:var(--text3);">Stock actual: </span>
          <span id="inv-stock-actual" style="font-weight:700;font-size:16px;"></span>
        </div>

        <div class="inv-field">
          <label>Tipo de movimiento</label>
          <div style="display:flex;gap:12px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text);">
              <input type="radio" name="inv-tipo" value="venta" checked> Venta
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text);">
              <input type="radio" name="inv-tipo" value="reposicion"> Reposición
            </label>
          </div>
        </div>

        <div class="inv-field">
          <label>Cantidad</label>
          <input type="number" id="inv-cantidad" min="1" value="1" placeholder="Cantidad...">
        </div>

        <div class="inv-field">
          <label>Ubicación <span style="color:var(--text3);font-weight:400;font-size:10px;">(selecciona o escribe)</span></label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <select class="inv-geo-dep" style="font-size:12px;"><option value="">— Departamento —</option></select>
            <select class="inv-geo-prov" disabled style="font-size:12px;"><option value="">— Provincia —</option></select>
            <select class="inv-geo-mun" disabled style="font-size:12px;"><option value="">— Municipio —</option></select>
          </div>
          <input id="inv-ubicacion" placeholder="O escribe la ubicación directamente...">
        </div>

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
    if (!productoId || !info || !stockEl) { if (info) info.style.display = 'none'; return; }

    const stockActual = _calcStockActual(productoId);
    stockEl.textContent = stockActual;
    stockEl.style.color = stockActual > 0 ? 'var(--green)' : stockActual < 0 ? 'var(--red)' : 'var(--text3)';
    info.style.display = 'block';
  }

  async function saveMovimiento() {
    const productoId = parseInt(document.getElementById('inv-producto')?.value);
    const tipo = document.querySelector('input[name="inv-tipo"]:checked')?.value;
    const cantidad = parseInt(document.getElementById('inv-cantidad')?.value) || 0;
    const ubicacion = document.getElementById('inv-ubicacion')?.value?.trim();
    const notas = document.getElementById('inv-notas')?.value?.trim();

    if (!productoId) { toast('⚠️ Selecciona un producto', 'error'); return; }
    if (cantidad <= 0) { toast('⚠️ La cantidad debe ser mayor a 0', 'error'); return; }

    const stockActual = _calcStockActual(productoId);

    if (tipo === 'venta' && cantidad > stockActual) {
      toast(`⚠️ Stock insuficiente. Disponible: ${stockActual}`, 'error');
      return;
    }

    const stockPosterior = tipo === 'venta' ? stockActual - cantidad : stockActual + cantidad;

    const { error } = await db.from('inventario_movimientos').insert({
      producto_id: productoId,
      tipo: tipo,
      cantidad: cantidad,
      stock_anterior: stockActual,
      stock_posterior: stockPosterior,
      ubicacion: ubicacion || null,
      notas: notas || null,
      usuario_id: currentUser.id
    });

    if (error) { toast('❌ Error: ' + error.message, 'error'); return; }

    const label = tipo === 'venta' ? 'Venta' : 'Reposición';
    toast(`✅ ${label} registrada: ${stockActual} → ${stockPosterior}`, 'success');
    await render();
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
                : '<span class="inv-badge-reposicion">Reposición</span>';
              return `<tr>
                <td style="white-space:nowrap;color:var(--text3);">${fecha}</td>
                <td style="font-weight:600;">${m.productos?.nombre || '—'}</td>
                <td>${badge}</td>
                <td style="text-align:center;font-weight:600;color:${m.tipo === 'venta' ? 'var(--red)' : 'var(--green)'};">
                  ${m.tipo === 'venta' ? '-' : '+'}${m.cantidad}
                </td>
                <td style="text-align:center;font-size:12px;color:var(--text2);">${m.stock_anterior} → ${m.stock_posterior}</td>
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
  //  VISTA AGENTE: Solo stock actual por producto
  // ═══════════════════════════════════════════════
  function _renderAgentView(wrap) {
    const stockHtml = _productos.map(p => {
      const stock = _calcStockActual(p.id);
      const color = stock > 0 ? 'var(--green)' : stock < 0 ? 'var(--red)' : 'var(--text3)';
      return `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;min-width:160px;max-width:220px;">
          <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">${p.nombre}</div>
          <div style="font-size:32px;font-weight:800;color:${color};line-height:1;">${stock}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:6px;">Stock actual</div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:18px;">📦 Stock de Productos</div>
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

  function reset() {
    _tab = 'movimiento';
    _productos = [];
    _stockMap = {};
    _movimientos = [];
    _currentPage = 1;
  }

  return { render, switchTab, goPage, saveAjuste, saveAllAjustes, onProductoChange, saveMovimiento, reset };
})();
