// clientes.js
const ClientesView = (() => {
  let _data = [];
  let _currentPage = 1;
  const PAGE_SIZE = 20;
  let _searchTimer = null;
  let _loaded = false;

  // Índice: cliente_id → Set de estados de sus ventas (construido desde ventas en memoria)
  function _buildEstadosIndex() {
    const idx = {};
    for (const v of (ventas || [])) {
      if (!v.cliente_id) continue;
      if (!idx[v.cliente_id]) idx[v.cliente_id] = new Set();
      idx[v.cliente_id].add(v.estado);
    }
    return idx;
  }

  // Invalidar caché cuando se sincronicen datos externos
  function invalidate() {
    _loaded = false;
    _data = [];
  }

  async function load() {
    // Solo recargar si los datos fueron invalidados o es la primera vez
    if (_loaded && _data.length > 0) {
      render();
      document.getElementById('clientes-count').textContent =
        `${_data.length} clientes registrados`;
      return;
    }

    const [
      { data: clientes, error: errC },
      { data: historial }
    ] = await Promise.all([
      db.from('clientes')
        .select('id, celular, nombre, ubicacion, faltas, sin_respuesta, flag, created_at')
        .order('id', { ascending: false }),
      db.from('clientes_historial')
        .select('cliente_id, unidades, monto_total')
    ]);

    if (errC) { toast('❌ Error cargando clientes: ' + errC.message, 'error'); return; }

    // Agrupar historial por cliente en un solo pass
    const histMap = {};
    for (const h of (historial || [])) {
      if (!histMap[h.cliente_id]) histMap[h.cliente_id] = { unidades: 0, monto: 0 };
      histMap[h.cliente_id].unidades += h.unidades || 0;
      histMap[h.cliente_id].monto += parseFloat(h.monto_total || 0);
    }

    const clientesVisibles = new Set((ventas || []).map(v => v.cliente_id));
    const isAgente = currentUser?.rol === 'agente';

    const lastUpdatedMap = {};
    for (const v of (ventas || [])) {
      if (!v.cliente_id) continue;
      const t = v.updated_at || v.fecha;
      if (!lastUpdatedMap[v.cliente_id] || t > lastUpdatedMap[v.cliente_id]) {
        lastUpdatedMap[v.cliente_id] = t;
      }
    }

    _data = (clientes || [])
      .filter(c => !isAgente || clientesVisibles.has(c.id))
      .map(c => ({
        ...c,
        hist_unidades: histMap[c.id]?.unidades || 0,
        hist_monto: histMap[c.id]?.monto || 0,
        last_updated: lastUpdatedMap[c.id] || null, 
      }));

    _loaded = true;
    render();
    document.getElementById('clientes-count').textContent =
      `${_data.length} clientes registrados`;
  }

  // Filtrar — usa ventas en memoria para el filtro de estado (sin query extra)
  function _getFiltered() {
    const search = (document.getElementById('clientes-search')?.value || '').toLowerCase();
    const flag = document.getElementById('clientes-filter-flag')?.value || '';
    const estado = document.getElementById('clientes-filter-estado')?.value || '';

    // Solo construir el índice si se necesita filtrar por estado
    const estadosIdx = estado ? _buildEstadosIndex() : null;

    return _data.filter(c => {
      if (flag && c.flag !== flag) return false;
      if (estado && estadosIdx && !estadosIdx[c.id]?.has(estado)) return false;
      if (search) {
        const hay = `${c.nombre || ''} ${c.celular || ''} ${c.ubicacion || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function render() {
    const filtered = _getFiltered();
    const total = filtered.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (_currentPage > totalPages) _currentPage = 1;

    const page = filtered.slice((_currentPage - 1) * PAGE_SIZE, _currentPage * PAGE_SIZE);

    document.getElementById('clientes-table-count').textContent = `${total} clientes`;

    const tbody = document.getElementById('clientes-tbody');
    if (!tbody) return;

    if (page.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9"
        style="text-align:center;padding:40px;color:var(--text2);">Sin resultados</td></tr>`;
      document.getElementById('clientes-pagination').innerHTML = '';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const c of page) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';

      const flagBadgeHtml = c.flag === 'spam'
        ? `<span class="badge badge-spam">🚫 SPAM</span>`
        : c.faltas >= 1
          ? `<span class="badge badge-cancelado">⚠️ ${c.faltas} falta${c.faltas > 1 ? 's' : ''}</span>`
          : `<span class="badge" style="background:var(--green-bg);color:var(--green);border:1px solid var(--green);">✅ OK</span>`;

      const fechaReg = c.created_at
        ? new Date(c.created_at).toLocaleDateString('es-BO',
            { day: '2-digit', month: '2-digit', year: '2-digit' })
        : '—';

      const montoFmt = c.hist_monto > 0
        ? `<span style="color:var(--green);font-weight:700;">Bs.${c.hist_monto.toFixed(0)}</span>`
        : '—';

      tr.innerHTML = `
        <td class="td-name">${c.nombre || '<span style="color:var(--text3)">s/n</span>'}</td>
        <td class="td-phone">
          <a href="tel:${c.celular}" onclick="event.stopPropagation()"
            style="color:var(--accent2);text-decoration:none;">${c.celular || ''}</a>
        </td>
        <td class="td-ciudad">${c.ubicacion || '—'}</td>
        <td style="font-weight:700;color:${c.hist_unidades > 0 ? 'var(--blue)' : 'var(--text3)'};">
          ${c.hist_unidades > 0 ? c.hist_unidades + ' und.' : '—'}
        </td>
        <td>${montoFmt}</td>
        <td style="color:${c.faltas > 0 ? 'var(--red)' : 'var(--text3)'};font-weight:${c.faltas > 0 ? '700' : '400'};">
          ${c.faltas || 0}
        </td>
        <td style="color:${c.sin_respuesta > 0 ? 'var(--orange)' : 'var(--text3)'};">
          ${c.sin_respuesta || 0}
        </td>
        <td>${flagBadgeHtml}</td>
        <td style="font-size:11px;color:var(--text3);white-space:nowrap;">
          ${c.last_updated
          ? new Date(c.last_updated).toLocaleDateString('es-BO',
          {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
          : '—'}
        </td>
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
    const [
      { data: hist },
      { data: ventasCliente }
    ] = await Promise.all([
      db.from('clientes_historial')
        .select('mes, unidades, monto_total, ventas_count')
        .eq('cliente_id', c.id)
        .order('mes', { ascending: false }),
      db.from('ventas')
        .select(`id, fecha, updated_at, estado, monto_total, notas,
                 agente:agente_id(nombre),
                 venta_items(cantidad, subtotal, productos(nombre))`)
        .eq('cliente_id', c.id)
        .order('id', { ascending: false })
        .limit(30)
    ]);

    const totalUnid = (hist || []).reduce((s, h) => s + (h.unidades || 0), 0);
    const totalMonto = (hist || []).reduce((s, h) => s + parseFloat(h.monto_total || 0), 0);

    const histRows = (hist || []).map(h => `
      <tr>
        <td style="padding:7px 12px;font-size:13px;color:var(--text2);">${h.mes}</td>
        <td style="padding:7px 12px;font-size:13px;font-weight:700;color:var(--blue);">${h.unidades}</td>
        <td style="padding:7px 12px;font-size:13px;color:var(--green);font-weight:700;">Bs.${parseFloat(h.monto_total).toFixed(0)}</td>
        <td style="padding:7px 12px;font-size:12px;color:var(--text3);">${h.ventas_count} transac.</td>
      </tr>`).join('') || `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--text3);">Sin historial</td></tr>`;

    const ventasRows = (ventasCliente || []).map(v => {
      const prods = (v.venta_items || []).map(it => it.productos?.nombre).filter(Boolean);
      const updFecha = v.updated_at
        ? new Date(v.updated_at).toLocaleDateString('es-BO',
            { day: '2-digit', month: '2-digit', year: '2-digit',
              hour: '2-digit', minute: '2-digit' })
        : v.fecha;
      return `
        <tr onclick="closeClienteHistorialModal();setTimeout(()=>showNuevoRegistro(${v.id}),50)"
          style="cursor:pointer;border-bottom:1px solid var(--border);"
          onmouseover="this.style.background='var(--surface2)'"
          onmouseout="this.style.background=''">
          <td style="padding:8px 12px;font-size:12px;color:var(--text3);">${v.fecha}</td>
          <td style="padding:8px 12px;">${statusBadge(v.estado)}</td>
          <td style="padding:8px 12px;font-size:12px;">
            ${prods.map(n => prodChip(n)).join(' ') || '—'}
          </td>
          <td style="padding:8px 12px;font-size:12px;color:var(--green);font-weight:700;">
            ${v.monto_total ? 'Bs.' + parseFloat(v.monto_total).toFixed(0) : '—'}
          </td>
          <td style="padding:8px 12px;font-size:11px;color:var(--text3);">${updFecha}</td>
          <td style="padding:8px 12px;font-size:11px;color:var(--accent2);">${v.agente?.nombre || '—'}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text3);">Sin registros</td></tr>`;

    document.getElementById('stat-modal-title').textContent =
      `👤 ${c.nombre || 'Cliente'} — ${c.celular}`;

    document.getElementById('stat-modal-body').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div class="stat-card" style="flex:1;min-width:120px;padding:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Unidades totales</div>
          <div style="font-size:24px;font-weight:800;color:var(--blue);font-family:'Syne',sans-serif;">${totalUnid}</div>
        </div>
        <div class="stat-card" style="flex:1;min-width:120px;padding:12px;">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:4px;">Monto total</div>
          <div style="font-size:24px;font-weight:800;color:var(--green);font-family:'Syne',sans-serif;">Bs.${totalMonto.toFixed(0)}</div>
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

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📅 Historial mensual</div>
      <div style="overflow-x:auto;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Mes</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Unidades</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Monto</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Transacciones</th>
          </tr></thead>
          <tbody>${histRows}</tbody>
        </table>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📋 Registros recientes (máx. 30)</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Fecha</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Estado</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Productos</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Monto</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Actualización</th>
            <th style="background:var(--surface2);padding:7px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Agente</th>
          </tr></thead>
          <tbody>${ventasRows}</tbody>
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

  return { load, render, goPage, debouncedRender, openClienteHistorial, invalidate };
})();

function renderClientes() { ClientesView.render(); }
function debouncedRenderClientes() { ClientesView.debouncedRender(); }