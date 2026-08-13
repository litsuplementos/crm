// clientes.js — VERSIÓN FINAL
// Fix crítico: paginación completa para superar el límite de 1000 de Supabase.
// load() hace fetch paginado de clientes (range de 1000 en 1000) hasta traer todos.
// Los totales (unidades/monto) se calculan desde ventas en memoria para evitar
// el join masivo que también sufre el límite de 1000.

const ClientesView = (() => {
  let _data = [];
  let _currentPage = 1;
  const PAGE_SIZE = 20;
  let _searchTimer = null;
  let _loaded = false;

  function invalidate() {
    _loaded = false;
    _data = [];
  }

  // Calcular totales desde ventas en memoria (solo vendidas)
  function _buildTotalesIndex() {
    const idx = {};
    for (const v of (ventas || [])) {
      if (!v.cliente_id || v.estado !== 'vendido') continue;
      if (!idx[v.cliente_id]) idx[v.cliente_id] = { unidades: 0, monto: 0 };
      for (const it of (v.venta_items || [])) {
        idx[v.cliente_id].unidades += it.cantidad || 1;
      }
      idx[v.cliente_id].monto += parseFloat(v.monto_total || 0);
    }
    return idx;
  }

  // Última actualización desde ventas en memoria
  function _buildLastUpdatedIndex() {
    const idx = {};
    for (const v of (ventas || [])) {
      if (!v.cliente_id) continue;
      const t = v.updated_at || v.fecha;
      if (!idx[v.cliente_id] || t > idx[v.cliente_id]) idx[v.cliente_id] = t;
    }
    return idx;
  }

  // Para agentes: set de cliente_ids que este agente ha atendido
  // (desde ventas en memoria, que ya están filtradas por agente_id)
  function _buildClientesVisiblesAgente() {
    return new Set((ventas || []).map(v => v.cliente_id).filter(Boolean));
  }

  async function load() {
    if (!document.getElementById('clientes-filter-estado')?.dataset.csel) {
      _buildCSelect('clientes-filter-estado',
        [{ value: '', label: 'Todos los estados' }].concat(Object.keys(ESTADOS).map(v => ({ value: v, label: ESTADOS[v].label, icon: ESTADOS[v].icon }))),
        onClientesFilterEstadoChange);
      document.getElementById('clientes-filter-estado').dataset.csel = '1';
    }
    if (_loaded && _data.length > 0) {
      _aplicarFiltroGuardado();
      render();
      document.getElementById('clientes-count').textContent =
        `${_data.length} clientes registrados`;
      return;
    }

    const isAgente = currentUser?.rol === 'agente';

    // ── Fetch paginado para superar el límite de 1000 filas de Supabase ──
    // Supabase devuelve máximo 1000 filas por request por defecto.
    // Usamos .range(from, to) iterando hasta que no haya más datos.
    let allClientes = [];
    const BATCH = 1000;
    let from = 0;
    let keepGoing = true;

    while (keepGoing) {
      const { data: batch, error: errC } = await db
        .from('clientes')
        .select('id, celular, nombre, ubicacion, faltas, sin_respuesta, flag, created_at')
        .order('id', { ascending: false })
        .range(from, from + BATCH - 1);

      if (errC) { toast(_ic('circle-x', 15) + ' Error cargando clientes: ' + esc(errC.message), 'error'); return; }

      if (!batch || batch.length === 0) {
        keepGoing = false;
      } else {
        allClientes = allClientes.concat(batch);
        if (batch.length < BATCH) {
          keepGoing = false; // última página
        } else {
          from += BATCH;
        }
      }
    }

    // Índices desde ventas en memoria
    const totalesIdx    = _buildTotalesIndex();
    const lastUpdIdx    = _buildLastUpdatedIndex();
    const clientesVis   = isAgente ? _buildClientesVisiblesAgente() : null;

    _data = allClientes
      .filter(c => !clientesVis || clientesVis.has(c.id))
      .map(c => ({
        id:            c.id,
        celular:       c.celular,
        nombre:        c.nombre,
        ubicacion:     c.ubicacion,
        faltas:        c.faltas,
        sin_respuesta: c.sin_respuesta,
        flag:          c.flag,
        created_at:    c.created_at,
        hist_unidades: totalesIdx[c.id]?.unidades || 0,
        hist_monto:    totalesIdx[c.id]?.monto    || 0,
        last_updated:  lastUpdIdx[c.id] || null,
      }));

    _loaded = true;
    _aplicarFiltroGuardado();
    render();
    document.getElementById('clientes-count').textContent =
      `${_data.length} clientes registrados`;
  }

  function _getFiltered() {
    const search = (document.getElementById('clientes-search')?.value || '').toLowerCase();
    const flag   = document.getElementById('clientes-filter-flag')?.value   || '';
    const estado = getCSelectValue('clientes-filter-estado') || '';

    let estadosIdx = null;
    if (estado) {
      estadosIdx = {};
      for (const v of (ventas || [])) {
        if (!v.cliente_id) continue;
        if (!estadosIdx[v.cliente_id]) estadosIdx[v.cliente_id] = new Set();
        estadosIdx[v.cliente_id].add(v.estado);
      }
    }

    return _data.filter(c => {
      if (flag   && c.flag !== flag)                                  return false;
      if (estado && estadosIdx && !estadosIdx[c.id]?.has(estado))     return false;
      if (search) {
        const hay = `${c.nombre || ''} ${c.celular || ''} ${c.ubicacion || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function render() {
    const filtered   = _getFiltered();
    const total      = filtered.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (_currentPage > totalPages) _currentPage = 1;

    const page = filtered.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);

    document.getElementById('clientes-table-count').textContent = `${total} clientes`;

    const tbody = document.getElementById('clientes-tbody');
    if (!tbody) return;

    if (page.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10"
        style="text-align:center;padding:40px;color:var(--text2);">Sin resultados</td></tr>`;
      document.getElementById('clientes-pagination').innerHTML = '';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const c of page) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      const flagBadgeHtml = c.flag === 'spam'
        ? `<span class="badge badge-spam">${_ic('ban', 12)} SPAM</span>`
        : c.faltas >= 1
          ? `<span class="badge badge-cancelado">${_ic('triangle-alert', 12)} ${c.faltas} falta${c.faltas > 1 ? 's' : ''}</span>`
          : `<span class="badge" style="background:var(--green-bg);color:var(--green);border:1px solid var(--green);">${_ic('circle-check', 12)} OK</span>`;

      const fechaReg = c.created_at
        ? new Date(c.created_at).toLocaleDateString('es-BO',
            { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—';

      const montoFmt = c.hist_monto > 0
        ? `<span style="color:var(--green);font-weight:700;">Bs.${c.hist_monto.toFixed(0)}</span>`
        : '—';

      const lastUpdFmt = c.last_updated
        ? new Date(c.last_updated).toLocaleDateString('es-BO',
            { day:'2-digit', month:'2-digit', year:'2-digit',
              hour:'2-digit', minute:'2-digit' })
        : '—';

      tr.innerHTML = `
        <td class="td-name">${c.nombre || '<span style="color:var(--text3)">s/n</span>'}</td>
        <td class="td-phone">
          <a href="tel:${c.celular}" onclick="event.stopPropagation()"
            style="color:var(--accent2);text-decoration:none;">${c.celular || ''}</a>
        </td>
        <td>${c.ubicacion || '—'}</td>
        <td style="font-weight:700;color:${c.hist_unidades > 0 ? 'var(--blue)' : 'var(--text3)'};">
          ${c.hist_unidades > 0 ? c.hist_unidades + ' und.' : '—'}
        </td>
        <td>${montoFmt}</td>
        <td style="color:${c.faltas > 0 ? 'var(--red)' : 'var(--text3)'};
                   font-weight:${c.faltas > 0 ? '700' : '400'};">
          ${c.faltas || 0}
        </td>
        <td style="color:${c.sin_respuesta > 0 ? 'var(--orange)' : 'var(--text3)'};">
          ${c.sin_respuesta || 0}
        </td>
        <td>${flagBadgeHtml}</td>
        <td style="font-size:11px;color:var(--text3);white-space:nowrap;">${lastUpdFmt}</td>
        <td style="font-size:12px;color:var(--text3);">${fechaReg}</td>
      `;

      tr.addEventListener('click', () => openClienteHistorial(c));
      fragment.appendChild(tr);
    }

    tbody.replaceChildren(fragment);
    _renderPagination(totalPages);
  }

  function _renderPagination(totalPages) {
    const el = document.getElementById('clientes-pagination');
    if (!el) return;
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="ClientesView.goPage(${_currentPage - 1})"
      ${_currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - _currentPage) <= 1)
        html += `<button class="page-btn ${i === _currentPage ? 'active' : ''}"
          onclick="ClientesView.goPage(${i})">${i}</button>`;
      else if (Math.abs(i - _currentPage) === 2)
        html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
    }
    html += `<button class="page-btn" onclick="ClientesView.goPage(${_currentPage + 1})"
      ${_currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    el.innerHTML = html;
  }

  function goPage(p) {
    _currentPage = p;
    render();
    document.getElementById('view-clientes')?.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function openClienteHistorial(c) {
    const { data: ventasCliente, error } = await db
      .from('ventas')
      .select(`
        id, fecha, updated_at, estado, monto_total, notas,
        agente:agente_id(nombre),
        venta_items(cantidad, subtotal, productos(nombre))
      `)
      .eq('cliente_id', c.id)
      .order('id', { ascending: false });

    if (error) { toast(_ic('circle-x', 15) + ' Error cargando historial: ' + esc(error.message), 'error'); return; }

    const vendidas = (ventasCliente || []).filter(v => v.estado === 'vendido');
    const totalUnid  = vendidas.reduce(
      (s, v) => s + (v.venta_items || []).reduce((si, it) => si + (it.cantidad || 1), 0), 0
    );
    const totalMonto = vendidas.reduce((s, v) => s + parseFloat(v.monto_total || 0), 0);

    const histRows = vendidas.length
      ? vendidas.map(v => {
          const prods = (v.venta_items || []).map(it => it.productos?.nombre).filter(Boolean);
          const updFecha = v.updated_at
            ? new Date(v.updated_at).toLocaleDateString('es-BO',
                { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
            : v.fecha;
          return `
            <tr onclick="closeClienteHistorialModal();setTimeout(()=>showNuevoRegistro(${v.id}),50)"
              style="cursor:pointer;border-bottom:1px solid var(--border);"
              onmouseover="this.style.background='var(--surface2)'"
              onmouseout="this.style.background=''">
              <td style="padding:8px 12px;font-size:12px;color:var(--text3);">${v.fecha}</td>
              <td style="padding:8px 12px;font-size:12px;">
                ${prods.map(n => prodChip(n)).join(' ') || '—'}
              </td>
              <td style="padding:8px 12px;font-size:12px;color:var(--green);font-weight:700;">
                ${v.monto_total ? 'Bs.' + parseFloat(v.monto_total).toFixed(0) : '—'}
              </td>
              <td style="padding:8px 12px;font-size:11px;color:var(--text3);">${updFecha}</td>
              <td style="padding:8px 12px;font-size:11px;color:var(--accent2);">${v.agente?.nombre || '—'}</td>
            </tr>`;
        }).join('')
      : `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text3);">Sin compras registradas</td></tr>`;

    document.getElementById('stat-modal-title').innerHTML =
      `${_ic('user', 15)} ${esc(c.nombre || 'Cliente')} — ${esc(c.celular)}`;

    document.getElementById('stat-modal-body').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div class="stat-card" style="flex:1;min-width:160px;padding:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Unidades Compradas</div>
          <div style="font-size:24px;font-weight:800;color:var(--blue);font-family:'Syne',sans-serif;">${totalUnid} und · <span style="color:var(--green);font-size:18px;">Bs.${totalMonto.toFixed(0)}</span></div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Faltas / Sin resp.</div>
          <div style="font-size:24px;font-weight:800;color:${c.faltas > 0 ? 'var(--red)' : 'var(--text3)'};font-family:'Syne',sans-serif;">${c.faltas} / ${c.sin_respuesta}</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Ubicación</div>
          <div style="font-size:14px;font-weight:600;color:var(--text);">${c.ubicacion || '—'}</div>
        </div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${_ic('clipboard-list', 13)} Historial de compras</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Fecha</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Productos</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Monto</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Actualización</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Agente</th>
          </tr></thead>
          <tbody>${histRows}</tbody>
        </table>
      </div>
    `;

    document.getElementById('stat-modal').classList.add('open');
  }

  function closeClienteHistorialModal() {
    document.getElementById('stat-modal').classList.remove('open');
  }

  function debouncedRender() {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(render, 280);
  }

  function _aplicarFiltroGuardado() {
    const el = document.getElementById('clientes-filter-estado');
    if (el && _savedFiltroEstadoClientes) {
      setCSelectValue('clientes-filter-estado', _savedFiltroEstadoClientes);
    }
  }

  return { load, render, goPage, debouncedRender, openClienteHistorial, invalidate, getFiltered: _getFiltered };
})();

function renderClientes() { ClientesView.render(); }
function debouncedRenderClientes() { ClientesView.debouncedRender(); }