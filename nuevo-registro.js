// nuevo-registro.js

let _nrModoEdicion = false;      
let _nrVentaId = null;        
let _nrViewOrigen = 'ventas';   
let _nrCelTimer = null;       
let _nrGeoInit = false;       
let _nrGuiaProdId = null;     
let _nrReciboBlob = null; // Blob del recibo generado; se sube a storage al guardar la venta

function _fechaHoy() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
}

function openVentaModal(id) {
  showNuevoRegistro(id);
}
function closeVentaModal() {
  cerrarNuevoRegistro();
}

// Abrir página
function showNuevoRegistro(id) {
  // Guardar vista de origen para volver
  const vistaActual = document.querySelector('.view.active')?.id?.replace('view-', '') || 'ventas';
  _nrViewOrigen = (vistaActual === 'nuevo-registro') ? 'ventas' : vistaActual;

  // Activar vista
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-nuevo-registro').classList.add('active');

  _initNrGeoSelectors();
  _initNrAlmacenSelectors();
  _resetNuevoRegistro();

  if (id) {
    _nrModoEdicion = true;
    _nrVentaId     = id;
    _cargarVentaEnPagina(id);
  } else {
    _nrModoEdicion = false;
    _nrVentaId     = null;
    _configurarModoCreacion();
  }
}

function cerrarNuevoRegistro() {
  clearTimeout(_nrCelTimer);
  _nrCelTimer = null;
  showViewDirect('ventas');
  document.querySelector('[data-view="ventas"]')?.classList.add('active');
}

// Reset general
function _resetNuevoRegistro() {
  // Limpiar campos
  const campos = [
    'nr-edit-venta-id','nr-cliente-id','nr-fecha','nr-celular','nr-nombre',
    'nr-ubicacion','nr-notas','nr-direccion','nr-recordatorio','nr-monto',
  ];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.disabled = false; }
  });
  const montoEl = document.getElementById('nr-monto');
  if (montoEl) montoEl._baseValue = 0;

  document.getElementById('nr-descuento').value = '0';
  document.getElementById('nr-descuento-tag').textContent = '';
  document.getElementById('nr-monto-tag').textContent = '';
  document.getElementById('nr-comprobante').value = '';
  document.getElementById('nr-comprobante-preview').innerHTML = '';
  const reciboBtn = document.getElementById('nr-recibo-btn');
  if (reciboBtn) reciboBtn.style.display = 'none';
  const reciboPrev = document.getElementById('nr-recibo-preview');
  if (reciboPrev) reciboPrev.innerHTML = '';
  _nrReciboBlob = null;
  document.getElementById('nr-celular-suggestion').style.display = 'none';
  document.getElementById('nr-cliente-info-box').style.display = 'none';
  document.getElementById('nr-maps-preview').innerHTML = '';
  document.getElementById('nr-archived-banner').style.display = 'none';
  document.getElementById('nr-archived-banner').innerHTML = '';

  // Reset geo selectores
  ['nr-sel-departamento','nr-sel-provincia','nr-sel-municipio'].forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    el.value = '';
    if (sid !== 'nr-sel-departamento') el.disabled = true;
  });

  // Reset estado chips
  document.getElementById('nr-estado').value = 'interesado';
  document.querySelectorAll('#nr-quick-chips .quick-chip').forEach(c => {
    c.classList.remove('active');
    c.style.pointerEvents = '';
    c.style.opacity = '';
  });
  document.querySelector('#nr-quick-chips .quick-chip[data-estado="interesado"]')?.classList.add('active');

  // Reset intentos
  document.getElementById('nr-intentos-rellamada').value = 1;
  document.getElementById('nr-intentos-sinresp').value = 1;
  document.getElementById('nr-intentos').value = 1;
  document.getElementById('nr-intentos-rellamada-field').style.display = 'none';
  document.getElementById('nr-intentos-sinresp-field').style.display = 'none';
  const wR = document.getElementById('nr-intentos-rellamada-warning');
  const wS = document.getElementById('nr-intentos-sinresp-warning');
  if (wR) wR.style.display = 'none';
  if (wS) wS.style.display = 'none';

  // Reset items
  document.getElementById('nr-items-wrap').innerHTML = '';

  // Reset botones
  const saveBtn = document.getElementById('nr-save-btn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.style.opacity = '';
    saveBtn.style.cursor  = '';
    saveBtn.title = '';
    saveBtn.style.display = '';
  }
  const delBtn = document.getElementById('nr-delete-btn');
  if (delBtn) delBtn.style.display = 'none';

  // Reset comprobante file input
  const fileInp = document.getElementById('nr-comprobante');
  if (fileInp) { fileInp.disabled = false; fileInp.value = ''; }

  // Reset add-item btn
  const addBtn = document.getElementById('nr-btn-add-item');
  if (addBtn) addBtn.style.display = '';

  // Reset guía
  _limpiarGuiaNr();

  // Agente (admin)
  const af = document.getElementById('nr-agente-field');
  if (af) {
    af.style.display = currentUser?.rol === 'admin' ? '' : 'none';
    if (currentUser?.rol === 'admin') {
      document.getElementById('nr-agente').innerHTML =
        allAgents.filter(a => a.rol === 'agente')
          .map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');
    }
  }
}

function _configurarModoCreacion() {
  document.getElementById('nr-page-title').textContent = 'Nuevo Registro';
  document.getElementById('nr-page-subtitle').textContent = 'Completa los datos del cliente';
  document.getElementById('nr-fecha').value = _fechaHoy();

  if (currentUser?.rol === 'admin' && allAgents.length > 0) {
    const primerAgente = allAgents.find(a => a.rol === 'agente');
    if (primerAgente) document.getElementById('nr-agente').value = primerAgente.id;
  }

  addNrItem();
}

// Modo EDICIÓN
async function _cargarVentaEnPagina(id) {
  const v = ventasIndex[id];
  if (!v) { toast(_ic('circle-x', 15) + ' Registro no encontrado', 'error'); cerrarNuevoRegistro(); return; }

  document.getElementById('nr-page-title').textContent    = 'Editar Registro';
  document.getElementById('nr-page-subtitle').textContent = v.cliente?.celular || '';

  const isArchivado = !!v.archivado;
  const isAdmin = currentUser?.rol === 'admin';

  const vendidosEditables = await getVendidosEditables();
  const shouldLock = isArchivado && !isAdmin && !(v.estado === 'vendido' && vendidosEditables);

  // Banner archivado
  const banner = document.getElementById('nr-archived-banner');
  if (isArchivado) {
    banner.style.display = '';
    const msg = (v.estado === 'vendido' && vendidosEditables && !isAdmin)
      ? _ic('pencil', 14) + ' Registro archivado. Habilitado para hacer cambios.'
      : _ic('lock', 14) + ' Registro archivado. Este ciclo de venta está cerrado. Sólo el administrador puede editarlo.';
    banner.innerHTML = `<b style="color:var(--text);display:inline-flex;align-items:center;gap:6px;">${msg}</b>`;
  }

  // Título página
  if (isArchivado) { const t = document.getElementById('nr-page-title'); t.innerHTML = _ic('lock', 14) + ' Registro Archivado'; }

  // Campos básicos
  document.getElementById('nr-edit-venta-id').value  = id;
  document.getElementById('nr-cliente-id').value = v.cliente_id || '';
  document.getElementById('nr-fecha').value = _fechaHoy();
  document.getElementById('nr-celular').value = v.cliente?.celular || '';
  document.getElementById('nr-nombre').value = v.cliente?.nombre || '';
  document.getElementById('nr-ubicacion').value = v.cliente?.ubicacion || '';
  document.getElementById('nr-notas').value = v.notas || '';
  document.getElementById('nr-recordatorio').value = v.recordatorio ? v.recordatorio.slice(0,16) : '';
  document.getElementById('nr-direccion').value = v.cliente?.direccion_residencial || '';
  document.getElementById('nr-monto').value = v.monto_total || '';
  document.getElementById('nr-monto')._baseValue = parseFloat(v.monto_total) || 0;
  document.getElementById('nr-descuento').value = v.descuento_pct || 0;

  // Estado
  document.getElementById('nr-estado').value = v.estado || 'interesado';
  document.querySelectorAll('#nr-quick-chips .quick-chip').forEach(c => c.classList.remove('active'));
  document.querySelector(`#nr-quick-chips .quick-chip[data-estado="${v.estado}"]`)?.classList.add('active');
  _toggleNrIntentosField(v.estado);
  _loadNrIntentos(v.estado, v.intentos);
  _toggleNrReciboButton();

  // Agente
  if (currentUser?.rol === 'admin' && v.agente_id) {
    document.getElementById('nr-agente').value = v.agente_id;
  }

  // Items
  const items = v.venta_items || [];
  if (items.length > 0) {
    items.forEach(it => addNrItem({ producto_id: it.producto_id, cantidad: it.cantidad, subtotal: it.subtotal }));
  } else {
    addNrItem();
  }

  const montoGuardado = parseFloat(v.monto_total) || 0;
  if (montoGuardado > 0) {
    document.getElementById('nr-monto').value = montoGuardado.toFixed(2);
    document.getElementById('nr-monto')._baseValue = montoGuardado;
  }

  // Comprobante
  _renderNrComprobantePreview(v.comprobante_url || null, shouldLock);

  // Recibo (PDF generado en estado vendido)
  _renderNrReciboPreview(v.recibo_url || null);

  // Mapa dirección
  if (v.cliente?.direccion_residencial) {
    const q = encodeURIComponent(v.cliente.direccion_residencial + ', Bolivia');
    document.getElementById('nr-maps-preview').innerHTML =
      `<iframe src="https://maps.google.com/maps?q=${q}&output=embed&hl=es" width="100%" height="200"
        style="border:0;border-radius:8px;margin-top:8px;" allowfullscreen="" loading="lazy"></iframe>`;
  }

  // Bloquear si aplica
  if (shouldLock) {
    const lockIds = ['nr-fecha','nr-celular','nr-nombre','nr-ubicacion','nr-notas',
                     'nr-intentos-rellamada','nr-intentos-sinresp','nr-direccion','nr-monto','nr-recordatorio'];
    lockIds.forEach(fid => { const el = document.getElementById(fid); if (el) el.disabled = true; });
    document.getElementById('nr-comprobante').disabled = true;
    document.querySelectorAll('#nr-quick-chips .quick-chip').forEach(c => {
      c.style.pointerEvents = 'none'; c.style.opacity = '0.4';
    });
    document.getElementById('nr-btn-add-item').style.display = 'none';
    document.querySelectorAll('#nr-items-wrap select, #nr-items-wrap input, #nr-items-wrap button')
      .forEach(el => el.disabled = true);
    const saveBtn = document.getElementById('nr-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
  }

  // Botón eliminar (admin siempre, agente solo en no-archivados)
  const delBtn = document.getElementById('nr-delete-btn');
  if (delBtn) delBtn.style.display = (isAdmin || !isArchivado) ? '' : 'none';

  // Cargar guía del primer producto
  const primerProd = items[0]?.producto_id;
  if (primerProd) _renderGuiaNr(primerProd);
}

// ESTADO chips
function setNrEstado(value, el) {
  document.querySelectorAll('#nr-quick-chips .quick-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('nr-estado').value = value;
  _toggleNrIntentosField(value);
  _toggleNrReciboButton();
}

function _toggleNrReciboButton() {
  const btn = document.getElementById('nr-recibo-btn');
  if (!btn) return;
  const estado = document.getElementById('nr-estado')?.value;
  btn.style.display = estado === 'vendido' ? '' : 'none';
}

function _renderNrReciboPreview(url) {
  const wrap = document.getElementById('nr-recibo-preview');
  if (!wrap) return;
  if (!url) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<a href="${url}" target="_blank" style="color:var(--accent2);font-size:12px;white-space:nowrap;">${_ic('file-text', 13)} Recibo PDF</a>`;
}

function _toggleNrIntentosField(estado) {
  document.getElementById('nr-intentos-rellamada-field').style.display = estado === 'rellamada' ? '' : 'none';
  document.getElementById('nr-intentos-sinresp-field').style.display = estado === 'sin_respuesta' ? '' : 'none';
  if (estado === 'rellamada') {
    document.getElementById('nr-intentos').value = document.getElementById('nr-intentos-rellamada').value || 1;
  } else if (estado === 'sin_respuesta') {
    document.getElementById('nr-intentos').value = document.getElementById('nr-intentos-sinresp').value || 1;
  } else {
    document.getElementById('nr-intentos').value = 1;
  }
}

function _loadNrIntentos(estado, intentos) {
  const val = intentos || 1;
  if (estado === 'rellamada') {
    document.getElementById('nr-intentos-rellamada').value = val;
    document.getElementById('nr-intentos-sinresp').value = 1;
  } else if (estado === 'sin_respuesta') {
    document.getElementById('nr-intentos-sinresp').value = val;
    document.getElementById('nr-intentos-rellamada').value = 1;
  } else {
    document.getElementById('nr-intentos-rellamada').value = 1;
    document.getElementById('nr-intentos-sinresp').value = 1;
  }
  document.getElementById('nr-intentos').value = val;
  onNrIntentosChange();
}

function _leerNrIntentos(estado) {
  if (estado === 'rellamada') return parseInt(document.getElementById('nr-intentos-rellamada').value) || 1;
  if (estado === 'sin_respuesta') return parseInt(document.getElementById('nr-intentos-sinresp').value) || 1;
  return 1;
}

function onNrIntentosChange() {
  const estado = document.getElementById('nr-estado').value;
  if (estado === 'rellamada') {
    const val = parseInt(document.getElementById('nr-intentos-rellamada').value) || 1;
    const warn = document.getElementById('nr-intentos-rellamada-warning');
    document.getElementById('nr-intentos').value = val;
    if (val >= MAX_RELLAMADAS) {
      warn.innerHTML = _ic('triangle-alert', 14) + ' Al guardar se marcará como No interesado y se archivará.';
      warn.style.display = ''; warn.style.color = 'var(--red)';
    } else if (val === MAX_RELLAMADAS - 1) {
      warn.innerHTML = _ic('triangle-alert', 14) + ' Próximo intento (' + MAX_RELLAMADAS + ') cerrará el ciclo.';
      warn.style.display = ''; warn.style.color = 'var(--yellow)';
    } else { warn.style.display = 'none'; }
  } else if (estado === 'sin_respuesta') {
    const val  = parseInt(document.getElementById('nr-intentos-sinresp').value) || 1;
    const warn = document.getElementById('nr-intentos-sinresp-warning');
    document.getElementById('nr-intentos').value = val;
    if (val >= MAX_SIN_RESPUESTA) {
      warn.innerHTML = _ic('triangle-alert', 14) + ' Al guardar se marcará como No interesado y se archivará.';
      warn.style.display = ''; warn.style.color = 'var(--red)';
    } else if (val === MAX_SIN_RESPUESTA - 1) {
      warn.innerHTML = _ic('triangle-alert', 14) + ' Próximo mensaje sin respuesta (' + MAX_SIN_RESPUESTA + ') cerrará el ciclo.';
      warn.style.display = ''; warn.style.color = 'var(--yellow)';
    } else { warn.style.display = 'none'; }
  }
}

// ITEMS
function addNrItem(data) {
  const wrap = document.getElementById('nr-items-wrap');
  const idx = Date.now();
  const row = document.createElement('div');
  row.dataset.idx = idx;
  row.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;position:relative;';

  const productosActivos = allProductos.filter(p => p.activo);
  row.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 90px auto;gap:8px;align-items:end;margin-bottom:8px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Producto</div>
        <select class="smart-input nr-item-producto" onchange="onNrItemProductoChange(this)" style="width:100%;">
          <option value="">— Seleccionar —</option>
          ${productosActivos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Cantidad</div>
        <input class="smart-input nr-item-cantidad" type="number" min="1" max="99"
          value="${data?.cantidad || 1}" style="text-align:center;" oninput="onNrItemCantidadChange(this)">
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:18px;">
        <button type="button" onclick="showNrItemGuia(this)" title="Ver guía de este producto"
          style="display:flex;align-items:center;justify-content:center;height:40px; background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:6px 6px;color:var(--accent2);cursor:pointer;">${_ic('info', 18)}</button>
        <button type="button" onclick="removeNrItem(this)"
          style="display:flex;align-items:center;justify-content:center;height:40px; background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:6px 6px;color:var(--red);cursor:pointer;">${_ic('trash', 18)}</button>
      </div>
    </div>
    <div class="nr-item-stock-warning"
      style="display:none;font-size:11px;color:#f87171;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:6px;padding:5px 8px;margin-bottom:8px;"></div>
    <div class="nr-item-promos-wrap" style="display:none;margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Promoción</div>
      <div class="nr-item-promos-chips" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
      <input type="hidden" class="nr-item-promo-index" value="">
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
      <span style="font-size:12px;color:var(--text3);" class="nr-item-subtotal-label"></span>
      <span style="font-size:14px;font-weight:700;color:var(--green);" class="nr-item-subtotal-display" data-value="0">Bs. 0</span>
    </div>`;

  wrap.appendChild(row);

  if (data?.producto_id) {
    const sel = row.querySelector('.nr-item-producto');
    sel.value = data.producto_id;
    onNrItemProductoChange(sel, data);
  }
  recalcNrMonto();
}

function removeNrItem(btn) {
  btn.closest('[data-idx]').remove();
  recalcNrMonto();
  _verificarNrItemsStock();
  const remaining = document.querySelectorAll('#nr-items-wrap .nr-item-producto');
  const alguno = [...remaining].some(s => s.value);
  if (!alguno) _limpiarGuiaNr();
}

function showNrItemGuia(btn) {
  const row = btn.closest('[data-idx]');
  const sel = row.querySelector('.nr-item-producto');
  const pid = parseInt(sel.value);
  if (!pid) { toast(_ic('triangle-alert', 15) + ' Selecciona un producto para ver su guía', 'error'); return; }
  _renderGuiaNr(pid);
}

function onNrItemProductoChange(sel, preData) {
  const row = sel.closest('[data-idx]');
  const pid = parseInt(sel.value);
  const prod = allProductos.find(p => p.id === pid);

  // Cargar guía del producto seleccionado
  if (pid) _renderGuiaNr(pid);
  else {
    const alguno = [...document.querySelectorAll('#nr-items-wrap .nr-item-producto')].some(s => s.value);
    if (!alguno) _limpiarGuiaNr();
  }

  const promosWrap = row.querySelector('.nr-item-promos-wrap');
  const promosChips = row.querySelector('.nr-item-promos-chips');
  const promoIdx = row.querySelector('.nr-item-promo-index');
  const cantInput = row.querySelector('.nr-item-cantidad');
  promoIdx.value = '';

  if (!prod) {
    promosWrap.style.display = 'none';
    const d = row.querySelector('.nr-item-subtotal-display');
    d.textContent = 'Bs. 0'; d.dataset.value = '0';
    row.querySelector('.nr-item-subtotal-label').textContent = '';
    recalcNrMonto(); return;
  }

  const promos = prod.promociones || [];
  if (promos.length > 0) {
    promosWrap.style.display = '';
    promosChips.innerHTML = promos.map((pr, i) => `
      <span class="quick-chip nr-item-promo-chip"
        data-promo="${i}" data-precio="${pr.precio_total}" data-cantidad="${pr.cantidad}"
        onclick="selectNrItemPromo(this)"
        style="background:var(--yellow-bg);border-color:var(--yellow);color:var(--yellow);">
        ${_ic('tag', 13)} ${pr.etiqueta}
      </span>`).join('');
  } else {
    promosWrap.style.display = 'none';
  }

  if (preData?.promo_index !== undefined && preData.promo_index !== null && promos[preData.promo_index]) {
    const chip = promosChips.querySelector(`[data-promo="${preData.promo_index}"]`);
    if (chip) { chip.classList.add('active'); chip.style.background = 'var(--yellow)'; chip.style.color = '#1a1a00'; }
    promoIdx.value = preData.promo_index;
    cantInput.value = promos[preData.promo_index].cantidad;
  }

  if (preData?.subtotal && promoIdx.value === '') {
    const d = row.querySelector('.nr-item-subtotal-display');
    d.textContent = `Bs. ${parseFloat(preData.subtotal).toFixed(2)}`;
    d.dataset.value = preData.subtotal;
    row.querySelector('.nr-item-subtotal-label').textContent = '';
    _verificarNrItemsStock(); recalcNrMonto(); return;
  }
  updateNrItemSubtotal(row);
  _verificarNrItemsStock();
}

function selectNrItemPromo(chip) {
  const row = chip.closest('[data-idx]');
  const promoIdx = row.querySelector('.nr-item-promo-index');
  const idx = parseInt(chip.dataset.promo);
  const allChips = row.querySelectorAll('.nr-item-promo-chip');
  const cantInput = row.querySelector('.nr-item-cantidad');
  if (promoIdx.value !== '' && parseInt(promoIdx.value) === idx) {
    promoIdx.value = '';
    allChips.forEach(c => { c.classList.remove('active'); c.style.background='var(--yellow-bg)'; c.style.color='var(--yellow)'; });
    updateNrItemSubtotal(row); _verificarNrItemsStock(); return;
  }
  promoIdx.value = idx;
  allChips.forEach(c => { c.classList.remove('active'); c.style.background='var(--yellow-bg)'; c.style.color='var(--yellow)'; });
  chip.classList.add('active'); chip.style.background='var(--yellow)'; chip.style.color='#1a1a00';
  cantInput.value = chip.dataset.cantidad;
  updateNrItemSubtotal(row);
  _verificarNrItemsStock();
}

function onNrItemCantidadChange(input) {
  const row = input.closest('[data-idx]');
  // Don't clear the active promo — just recalculate using it with the new quantity
  updateNrItemSubtotal(row);
  _verificarNrItemsStock();
}

function updateNrItemSubtotal(row) {
  const pid = parseInt(row.querySelector('.nr-item-producto').value);
  const prod = allProductos.find(p => p.id === pid);
  const cant = parseInt(row.querySelector('.nr-item-cantidad').value) || 1;
  const piV = row.querySelector('.nr-item-promo-index').value;
  const disp = row.querySelector('.nr-item-subtotal-display');
  const lbl = row.querySelector('.nr-item-subtotal-label');
  if (!prod) { disp.textContent='Bs. 0'; disp.dataset.value='0'; lbl.textContent=''; recalcNrMonto(); return; }
  let sub;
  if (piV !== '' && prod.promociones?.[parseInt(piV)]) {
    const pr = prod.promociones[parseInt(piV)];
    // Multiply promo unit price by quantity
    const precioUnitario = pr.precio_total / pr.cantidad;
    sub = precioUnitario * cant;
    lbl.textContent = `promo: Bs.${precioUnitario.toFixed(0)}/u × ${cant}`;
  } else {
    sub = prod.precio_base * cant; lbl.textContent = `Bs.${prod.precio_base} × ${cant}`;
  }
  disp.textContent = `Bs. ${sub.toFixed(2)}`; disp.dataset.value = sub;
  recalcNrMonto();
}

function recalcNrMonto() {
  let total = 0;
  document.querySelectorAll('#nr-items-wrap [data-idx]').forEach(row => {
    total += parseFloat(row.querySelector('.nr-item-subtotal-display')?.dataset.value || 0);
  });
  const count = document.querySelectorAll('#nr-items-wrap [data-idx]').length;
  const montoEl = document.getElementById('nr-monto');
  if (total > 0) {
    montoEl.value = total.toFixed(2);
    montoEl._baseValue = total;
    const pct = parseFloat(document.getElementById('nr-descuento')?.value) || 0;
    if (pct > 0) {
      const desc = total * pct / 100;
      montoEl.value = (total - desc).toFixed(2);
      document.getElementById('nr-descuento-tag').textContent = `− Bs. ${desc.toFixed(2)}`;
    }
    const units = [...document.querySelectorAll('#nr-items-wrap [data-idx]')]
      .reduce((s, r) => s + (parseInt(r.querySelector('.nr-item-cantidad')?.value) || 1), 0);
    document.getElementById('nr-monto-tag').textContent = `${count} producto${count!==1?'s':''} · ${units} und.`;
  } else {
    montoEl.value = '';
    document.getElementById('nr-monto-tag').textContent = '';
  }
}

function aplicarNrDescuento() {
  const pct = parseFloat(document.getElementById('nr-descuento').value) || 0;
  const base = parseFloat(document.getElementById('nr-monto')._baseValue) || 0;
  if (!base) return;
  document.getElementById('nr-monto').value = (base - base * pct / 100).toFixed(2);
  document.getElementById('nr-descuento-tag').textContent = pct > 0 ? `− Bs. ${(base*pct/100).toFixed(2)}` : '';
}

function recalcNrDescuento() {
  const m = document.getElementById('nr-monto');
  m._baseValue = parseFloat(m.value) || 0;
  document.getElementById('nr-descuento').value = '';
  document.getElementById('nr-descuento-tag').textContent = '';
}

function getNrItemsData() {
  const items = [];
  document.querySelectorAll('#nr-items-wrap [data-idx]').forEach(row => {
    const pid  = parseInt(row.querySelector('.nr-item-producto').value);
    const cant = parseInt(row.querySelector('.nr-item-cantidad').value) || 1;
    const sub  = parseFloat(row.querySelector('.nr-item-subtotal-display')?.dataset.value || 0);
    if (pid && sub > 0) items.push({ producto_id: pid, cantidad: cant, subtotal: sub });
  });
  return items;
}

// CELULAR
function onNrCelularInput() {
  clearTimeout(_nrCelTimer);
  const cel = document.getElementById('nr-celular').value.trim();
  const sugg = document.getElementById('nr-celular-suggestion');
  sugg.style.display = 'none';
  document.getElementById('nr-cliente-info-box').style.display = 'none';
  if (cel.length < 6) return;

  _nrCelTimer = setTimeout(async () => {
    _nrCelTimer = null;
    const { data: cd } = await db.from('clientes')
      .select('id,nombre,ubicacion,producto_interes,notas,faltas,flag')
      .eq('celular', cel).maybeSingle();

    const ciclo = cd ? await db.from('ventas')
      .select('id,estado,fecha,venta_items(productos:producto_id(nombre))')
      .eq('cliente_id', cd.id).eq('agente_id', currentUser.id).eq('archivado', false)
      .order('id', { ascending: false }).limit(1).maybeSingle().then(r => r.data)
      : null;

    if (cd) {
      document.getElementById('nr-cliente-id').value = cd.id;
      document.getElementById('nr-nombre').value = cd.nombre || '';
      document.getElementById('nr-ubicacion').value = cd.ubicacion || '';

      if (cd.producto_interes) {
        const mp = allProductos.find(p =>
          p.nombre.toLowerCase().includes(cd.producto_interes.toLowerCase()) ||
          cd.producto_interes.toLowerCase().includes(p.nombre.toLowerCase())
        );
        if (mp) {
          const fs = document.querySelector('#nr-items-wrap .nr-item-producto');
          if (fs && !fs.value) { fs.value = mp.id; onNrItemProductoChange(fs); }
        }
      }

      sugg.style.display = 'none';
      const infoBox = document.getElementById('nr-cliente-info-box');
      infoBox.style.display = '';

      const cicloProds = ciclo
        ? (ciclo.venta_items||[]).map(it=>it.productos?.nombre).filter(Boolean).join(', ')
        : '';

      const cicloWarn = ciclo ? `
        <div style="background:rgba(251,191,36,0.15);border:2px solid var(--yellow);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="color:var(--yellow);font-size:13px;font-weight:700;margin-bottom:6px;">${_ic('triangle-alert', 14)} Ya tienes un registro activo con este cliente</div>
          <div style="color:var(--text2);font-size:12px;margin-bottom:8px;">${cicloProds||'—'} · ${ESTADOS[ciclo.estado]?.label||ciclo.estado} · ${ciclo.fecha||''}</div>
          <div style="color:var(--text3);font-size:11px;margin-bottom:8px;">No puedes crear un registro nuevo. Actualiza el existente.</div>
          <button onclick="showNuevoRegistro(${ciclo.id})"
            style="background:var(--yellow);border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;color:#0a0a0f;cursor:pointer;width:100%;">
            → Ir al registro existente
          </button>
        </div>` : '';

      const spamBan = cd.flag==='spam' ? `
        <div style="background:rgba(248,113,113,0.15);border:2px solid var(--red);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="color:var(--red);font-weight:700;font-size:14px;margin-bottom:4px;">${_ic('ban', 14)} ¡SPAM!</div>
          <div style="color:var(--text2);font-size:12px;">Tiene ${cd.faltas} cancelación(es).</div>
        </div>` : '';

      infoBox.innerHTML = spamBan + cicloWarn + `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;">
          <div style="color:var(--accent2);font-weight:600;margin-bottom:4px;">${_ic('user', 14)} Cliente registrado ${flagBadge(cd)}</div>
          ${cd.faltas>0&&cd.flag!=='spam'?`<div style="color:var(--orange);font-size:11px;">${_ic('circle-x', 11)} ${cd.faltas} cancelación(es)</div>`:''}
          ${cd.notas?`<div style="color:var(--text2);margin-top:4px;">${cd.notas}</div>`:''}
        </div>`;

      // Detectar cliente fiel y precargar descuento
      if (!ciclo) {
        // Consultar historial acumulado del cliente (incluye todos los agentes)
        const { data: histFiel } = await db
          .from('clientes_historial')
          .select('unidades')
          .eq('cliente_id', cd.id);

        const totalUnidades = (histFiel || []).reduce((s, h) => s + (h.unidades || 0), 0);

        if (totalUnidades >= _clientesFielesUmbral) {
          const descInput = document.getElementById('nr-descuento');
          if (descInput && (!descInput.value || descInput.value === '0')) {
            descInput.value = _clientesFielesDescuento;
            aplicarNrDescuento();
            const sugg = document.getElementById('nr-celular-suggestion');
            sugg.innerHTML = _ic('star', 13) + ' Cliente fiel — ' + totalUnidades + ' unidades compradas. Descuento del ' + _clientesFielesDescuento + '% aplicado.';
            sugg.style.background = 'var(--green-bg)';
            sugg.style.borderColor = 'rgba(16,185,129,0.4)';
            sugg.style.color = 'var(--green)';
            sugg.style.display = 'block';
          }
        }
      }

      const saveBtn = document.getElementById('nr-save-btn');
      if (saveBtn) {
        saveBtn.disabled = !!ciclo;
        saveBtn.style.opacity = ciclo ? '0.4' : '';
        saveBtn.style.cursor  = ciclo ? 'not-allowed' : '';
      }
    } else {
      document.getElementById('nr-cliente-id').value = '';
      sugg.innerHTML = _ic('sparkles', 13) + ' Registro nuevo: Se creará el perfil al guardar';
      sugg.style.background = 'var(--green-bg)';
      sugg.style.borderColor = 'rgba(34,211,164,0.3)';
      sugg.style.color = 'var(--green)';
      sugg.style.display = 'block';
      const saveBtn = document.getElementById('nr-save-btn');
      if (saveBtn) { saveBtn.disabled=false; saveBtn.style.opacity=''; saveBtn.style.cursor=''; }
    }
  }, 350);
}

// DIRECCIÓN
function onNrDireccionKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const dir = document.getElementById('nr-direccion').value.trim();
  const wrap = document.getElementById('nr-maps-preview');
  if (!dir || !wrap) return;
  const q = encodeURIComponent(dir + ', Bolivia');
  wrap.innerHTML = `<iframe src="https://maps.google.com/maps?q=${q}&output=embed&hl=es"
    width="100%" height="200" style="border:0;border-radius:8px;margin-top:8px;"
    allowfullscreen="" loading="lazy"></iframe>`;
}

// GEO SELECTORES
function _initNrGeoSelectors() {
  if (_nrGeoInit) return;
  _nrGeoInit = true;
  const selDep = document.getElementById('nr-sel-departamento');
  const selProv = document.getElementById('nr-sel-provincia');
  const selMun = document.getElementById('nr-sel-municipio');
  if (!selDep) return;

  Object.keys(BOLIVIA_GEO).sort().forEach(dep => {
    const o = document.createElement('option'); o.value=dep; o.textContent=dep;
    selDep.appendChild(o);
  });

  function upd() {
    const dep=selDep.value, prov=selProv.value, mun=selMun.value;
    const inp = document.getElementById('nr-ubicacion'); if (!inp) return;
    if (mun) inp.value=`${dep} - ${prov} - ${mun}`;
    else if (prov) inp.value=`${dep} - ${prov}`;
    else if (dep) inp.value=dep;
    else inp.value='';
  }

  selDep.onchange = () => {
    const dep=selDep.value;
    selProv.innerHTML='<option value="">— Provincia —</option>';
    selMun.innerHTML='<option value="">— Municipio —</option>';
    selProv.disabled=!dep; selMun.disabled=true; upd();
    if (!dep) return;
    Object.keys(BOLIVIA_GEO[dep].provincias).sort().forEach(p => {
      const o=document.createElement('option'); o.value=p; o.textContent=p; selProv.appendChild(o);
    });
  };
  selProv.onchange = () => {
    const dep=selDep.value, prov=selProv.value;
    selMun.innerHTML='<option value="">— Municipio —</option>';
    selMun.disabled=!prov; upd();
    if (!dep||!prov) return;
    const pd=BOLIVIA_GEO[dep].provincias[prov], cap=BOLIVIA_GEO[dep].capital;
    pd.municipios.forEach(m => {
      const o=document.createElement('option'); o.value=m;
      o.textContent=m===cap?m+' ★ (cap. departamental)':m===pd.capital?m+' · (cap. provincial)':m;
      selMun.appendChild(o);
    });
  };
  selMun.onchange = upd;
}

// ── Ubicación del Almacén (descuenta stock físico al vender de UNA ubicación exacta) ──
let _nrAlmUbicaciones = [];     // catálogo completo de almacen_ubicaciones
let _nrAlmStockUbi = {};        // producto_id → stock en la ubicación seleccionada (almacen_stock)
let _nrAlmStockGeneral = {};    // producto_id → stock_inicial (respaldo)

function _nrAlmUbiId() {
  return parseInt(document.getElementById('nr-alm-ubicacion')?.value) || '';
}

function _nrAlmUbiLabel(ubiId) {
  const u = _nrAlmUbicaciones.find(x => x.id === ubiId);
  return u ? [u.departamento, u.lugar, u.ubicacion].filter(Boolean).join(' · ') : '';
}

async function onNrAlmUbiChange() {
  await _cargarNrStockUbicacion(_nrAlmUbiId());
  _verificarNrItemsStock();
}

async function _initNrAlmacenSelectors() {
  const selUbi = document.getElementById('nr-alm-ubicacion');
  if (!selUbi) return;
  try {
    await DataStore.ensure('almacen', 'inventario');
    _nrAlmUbicaciones = DataStore.ubicaciones || [];
  } catch (e) {
    console.error('almacen: no se pudo cargar ubicaciones para la venta', e);
    _nrAlmUbicaciones = [];
  }
  try {
    _nrAlmStockGeneral = {};
    (DataStore.inventarioStock || []).forEach(r => { _nrAlmStockGeneral[r.producto_id] = r.stock_inicial; });
  } catch (e) {
    _nrAlmStockGeneral = {};
  }
  selUbi.innerHTML = '<option value="">— Seleccionar almacén —</option>';
  _nrAlmUbicaciones.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id;
    o.textContent = [u.departamento, u.lugar, u.ubicacion].filter(Boolean).join(' · ');
    selUbi.appendChild(o);
  });
  if (_nrAlmUbicaciones.length) {
    const scDep = _nrAlmUbicaciones.find(u => u.departamento === 'Santa Cruz');
    selUbi.value = String((scDep || _nrAlmUbicaciones[0]).id);
  }
  await _cargarNrStockUbicacion(_nrAlmUbiId());
  _verificarNrItemsStock();
}

// Stock por producto en la ubicación exacta elegida (lectura DataStore;
// UNIQUE(producto_id, ubicacion_id) garantiza una sola fila por producto).
async function _cargarNrStockUbicacion(ubiId) {
  _nrAlmStockUbi = {};
  if (!ubiId) return;
  try {
    await DataStore.ensure('almacen');
    (DataStore.almacenStock || []).forEach(r => {
      if (r.ubicacion_id === ubiId) _nrAlmStockUbi[r.producto_id] = r.stock;
    });
  } catch (e) {
    console.error('almacen: stock de la ubicación para la venta', e);
  }
}

// Verifica en vivo que la cantidad SUMADA por producto no rebase el stock de la
// ubicación del almacén seleccionada (con respaldo a inventario_stock).
function _verificarNrItemsStock() {
  const ubiLabel = _nrAlmUbiLabel(_nrAlmUbiId());
  const rows = [...document.querySelectorAll('#nr-items-wrap [data-idx]')];
  const sumPorProducto = {};
  rows.forEach(row => {
    const pid = parseInt(row.querySelector('.nr-item-producto')?.value);
    if (!pid) return;
    const cant = parseInt(row.querySelector('.nr-item-cantidad')?.value) || 0;
    sumPorProducto[pid] = (sumPorProducto[pid] || 0) + cant;
  });
  rows.forEach(row => {
    const pid = parseInt(row.querySelector('.nr-item-producto')?.value);
    const warn = row.querySelector('.nr-item-stock-warning');
    const cantInput = row.querySelector('.nr-item-cantidad');
    if (!warn) return;
    if (!pid) {
      warn.style.display = 'none';
      if (cantInput) cantInput.style.borderColor = '';
      return;
    }
    const disponible = (_nrAlmStockUbi[pid] !== undefined ? _nrAlmStockUbi[pid] : _nrAlmStockGeneral[pid]);
    const suma = sumPorProducto[pid] || 0;
    if (disponible === undefined || suma <= disponible) {
      warn.style.display = 'none';
      if (cantInput) cantInput.style.borderColor = '';
      return;
    }
    warn.innerHTML = _ic('triangle-alert', 13) + ' ' + suma + ' und. de este producto, disponible ' + disponible + ' en ' + (ubiLabel || 'el almacén');
    warn.style.display = 'block';
    if (cantInput) cantInput.style.borderColor = '#f87171';
  });
}

// COMPROBANTE
async function _uploadNrComprobante(ventaId) {
  const input = document.getElementById('nr-comprobante');
  const file  = input?.files?.[0];
  if (!file) return null;
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) { toast(_ic('triangle-alert', 15) + ' Solo JPG, PNG, WEBP o PDF','error'); return null; }
  if (file.size > 5*1024*1024) { toast(_ic('triangle-alert', 15) + ' Máximo 5MB','error'); return null; }
  const ext  = file.name.split('.').pop();
  const path = `${currentUser.id}/${ventaId}_${Date.now()}.${ext}`;
  const { error } = await db.storage.from('comprobantes').upload(path, file, { upsert: true });
  if (error) { toast(_ic('circle-x', 15) + ' Error subiendo: '+error.message,'error'); return null; }
  const { data: u } = db.storage.from('comprobantes').getPublicUrl(path);
  return u.publicUrl;
}

async function _uploadNrRecibo(ventaId) {
  const blob = _nrReciboBlob;
  if (!blob) return null;
  const path = `${currentUser.id}/${ventaId}_recibo_${Date.now()}.pdf`;
  const { error } = await db.storage.from('comprobantes').upload(path, blob, { upsert: true, contentType: 'application/pdf' });
  if (error) { toast(_ic('circle-x', 15) + ' Error subiendo recibo: '+error.message,'error'); return null; }
  const { data: u } = db.storage.from('comprobantes').getPublicUrl(path);
  return u.publicUrl;
}

function _renderNrComprobantePreview(url, locked=false) {
  const wrap = document.getElementById('nr-comprobante-preview');
  if (!wrap) return;
  if (!url) { wrap.innerHTML=''; return; }
  const isPdf = url.toLowerCase().includes('.pdf');
  const vid   = document.getElementById('nr-edit-venta-id').value;
  const btnDel = locked ? '' :
    `<button type="button" class="icon-btn danger"
      onclick="nrDeleteComprobante('${url}',${vid})"
      style="font-size:11px;padding:3px 8px;">${_ic('trash-2', 13)}</button>`;
  const btnImg = locked ? '' :
    `<button type="button" class="icon-btn danger"
      onclick="nrDeleteComprobante('${url}',${vid})"
      style="position:absolute;top:4px;right:4px;font-size:11px;padding:3px 7px;background:var(--surface);">${_ic('trash-2', 12)}</button>`;
  wrap.innerHTML = isPdf
    ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
         <a href="${url}" target="_blank" style="color:var(--accent2);font-size:13px;">${_ic('file-text', 13)} Ver PDF</a>${btnDel}
       </div>`
    : `<div style="margin-top:8px;position:relative;display:inline-block;">
         <img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border);"
           onerror="this.style.display='none'">${btnImg}
       </div>`;
}

async function nrDeleteComprobante(url, ventaId) {
  if (!url || !confirm('¿Eliminar comprobante?')) return;
  try {
    const path = url.split('/comprobantes/')[1];
    if (path) await db.storage.from('comprobantes').remove([path]);
    await db.from('ventas').update({ comprobante_url: null }).eq('id', ventaId);
    if (ventasIndex[ventaId]) {
      ventasIndex[ventaId].comprobante_url = null;
      const idx = ventas.findIndex(v => v.id === ventaId);
      if (idx >= 0) ventas[idx].comprobante_url = null;
    }
    _renderNrComprobantePreview(null);
    toast(_ic('trash-2', 15) + ' Comprobante eliminado','success');
    renderVentas();
  } catch(e) { toast(_ic('circle-x', 15) + ' ' + e.message,'error'); }
}

// RECIBO (PDF) — datos de la empresa para el encabezado
let _nrEmpresaCache = null;
async function _cargarEmpresaConfig() {
  if (_nrEmpresaCache) return _nrEmpresaCache;
  const out = { empresa_nombre: 'Nutrition', empresa_nit: '', empresa_telefono: '+59178299604', empresa_direccion: '' };
  try {
    const { data, error } = await db.from('config').select('clave, valor')
      .in('clave', Object.keys(out));
    if (!error && data) data.forEach(r => { out[r.clave] = r.valor; });
  } catch (e) { console.error('recibo: config empresa', e); }
  _nrEmpresaCache = out;
  return out;
}

// Genera el recibo de pago en PDF con los datos del formulario (estado = vendido).
// Solo descarga el PDF; se sube al bucket 'comprobantes' cuando se guarda el registro.
async function generarReciboVenta() {
  const nombre   = document.getElementById('nr-nombre').value.trim();
  const celular  = document.getElementById('nr-celular').value.trim();
  const items    = getNrItemsData();
  if (!nombre)  { toast(_ic('triangle-alert', 15) + ' Ingresa el nombre del cliente','error'); return; }
  if (!celular) { toast(_ic('triangle-alert', 15) + ' Ingresa el celular del cliente','error'); return; }
  if (!items.length) { toast(_ic('triangle-alert', 15) + ' Añade al menos un producto','error'); return; }

  const btn = document.getElementById('nr-recibo-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.55'; }

  try {
    await _cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
    const { jsPDF } = window.jspdf;

    const empresa   = await _cargarEmpresaConfig();
    const ventaId   = document.getElementById('nr-edit-venta-id').value;
    const fecha     = document.getElementById('nr-fecha').value || _fechaHoy();
    const ubicacion = document.getElementById('nr-ubicacion').value.trim();
    const direccion = document.getElementById('nr-direccion').value?.trim();
    const notas     = document.getElementById('nr-notas').value.trim();
    const descPct   = parseInt(document.getElementById('nr-descuento')?.value) || 0;
    const agenteObj = allAgents?.find(a => a.id === (currentUser.rol === 'admin' ? (document.getElementById('nr-agente')?.value || currentUser.id) : currentUser.id));
    const agenteNombre = agenteObj?.nombre || currentUser?.nombre || '';

    const subtotal = items.reduce((s, it) => s + (it.subtotal || 0), 0);
    const descBs   = subtotal * descPct / 100;
    const total    = subtotal - descBs;
    const folio    = ventaId ? 'R-' + String(ventaId).padStart(6, '0')
                             : 'R-' + new Date().toISOString().slice(0, 19).replace(/\D/g, '');
    const fechaTxt = fecha.split('-').reverse().join('/');

    // Logo → dataURL (si no carga, se omite)
    let logoData = null;
    try {
      const resp = await fetch('resources/images/logo/logo.png');
      if (resp.ok) {
        const blob = await resp.blob();
        logoData = await new Promise(res => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(blob);
        });
      }
    } catch (e) { logoData = null; }

    const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' });
    const W    = doc.internal.pageSize.getWidth();
    const H    = doc.internal.pageSize.getHeight();
    const C = {
      accent: [99, 102, 241], white: [255, 255, 255], text: [20, 20, 40],
      text2: [90, 90, 120], text3: [150, 150, 175], border: [210, 210, 230],
      surface: [248, 248, 252], soft: [220, 220, 255],
    };
    const setFill   = c => doc.setFillColor(c[0], c[1], c[2]);
    const setTextC  = c => doc.setTextColor(c[0], c[1], c[2]);

    setFill(C.white); doc.rect(0, 0, W, H, 'F');

    // Encabezado
    setFill(C.accent); doc.rect(0, 0, W, 34, 'F');
    if (logoData) { try { doc.addImage(logoData, 'PNG', 8, 4, 16, 16); } catch (e) {} }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); setTextC(C.white);
    doc.text(empresa.empresa_nombre || 'Nutrition', 27, 14.3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setTextC(C.soft);
    let yEmp = 19;
    if (empresa.empresa_nit)        { doc.text('NIT: ' + empresa.empresa_nit, 27, yEmp); yEmp += 4.6; }
    if (empresa.empresa_telefono)   { doc.text('Tel: ' + empresa.empresa_telefono, 27, yEmp); yEmp += 4.6; }
    if (empresa.empresa_direccion)  { doc.text(empresa.empresa_direccion, 27, yEmp); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setTextC(C.white);
    doc.text('RECIBO DE PAGO', W - 8, 10, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setTextC(C.soft);
    doc.text('Folio: ' + folio, W - 8, 16, { align: 'right' });
    doc.text('Fecha: ' + fechaTxt, W - 8, 21, { align: 'right' });

    // Cliente
    let y = 42;
    setTextC(C.text3); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('CLIENTE', 8, y); y += 5;
    setTextC(C.text); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(nombre, 8, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setTextC(C.text2);
    doc.text('Celular: ' + celular, 8, y); y += 5;
    const dirTxt = [ubicacion, direccion].filter(Boolean).join(' · ');
    if (dirTxt) {
      const dl = doc.splitTextToSize(dirTxt, W - 16);
      doc.text(dl, 8, y); y += 5 * dl.length;
    }
    setFill(C.border); doc.rect(8, y, W - 16, 0.4, 'F'); y += 7;

    // Tabla de productos
    const xCant = 10, xProd = 22, xUnit = W - 44, xSub = W - 10;
    const dibujarCabeceraTabla = () => {
      setFill(C.surface); doc.rect(8, y - 5, W - 16, 7, 'F');
      setTextC(C.text3); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('CANT', xCant, y);
      doc.text('PRODUCTO', xProd, y);
      doc.text('P.UNIT', xUnit, y, { align: 'right' });
      doc.text('SUBTOTAL', xSub, y, { align: 'right' });
      y += 7;
    };
    dibujarCabeceraTabla();

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setTextC(C.text);
    const lh = 5.2;
    for (const it of items) {
      const prod = allProductos.find(p => p.id === it.producto_id);
      const np   = prod?.nombre || 'Producto';
      const cant = it.cantidad || 1;
      const sub  = it.subtotal || 0;
      const unit = cant ? sub / cant : 0;
      const lines = doc.splitTextToSize(np, xUnit - xProd - 6);
      const capH = 3.3;
      const blockH = capH + (lines.length - 1) * lh;
      const h = Math.max(8, blockH + 3);
      if (y + h > H - 36) {
        doc.addPage();
        setFill(C.white); doc.rect(0, 0, W, H, 'F');
        y = 16;
        dibujarCabeceraTabla();
      }
      const baseY = y + (h - blockH) / 2 + capH;
      lines.forEach((ln, li) => doc.text(ln, xProd, baseY + li * lh));
      doc.text(String(cant), xCant, baseY, { align: 'left' });
      doc.text('Bs. ' + unit.toFixed(2), xUnit, baseY, { align: 'right' });
      doc.text('Bs. ' + sub.toFixed(2), xSub, baseY, { align: 'right' });
      y += h;
      setFill(C.border); doc.rect(8, y - 1.2, W - 16, 0.3, 'F');
      y += 3;
    }

    // Totales
    y += 4;
    const right = W - 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setTextC(C.text2);
    doc.text('Subtotal', right - 42, y, { align: 'right' });
    doc.text('Bs. ' + subtotal.toFixed(2), right, y, { align: 'right' });
    y += 6;
    if (descBs > 0) {
      doc.text('Descuento (' + descPct + '%)', right - 42, y, { align: 'right' });
      doc.text('- Bs. ' + descBs.toFixed(2), right, y, { align: 'right' });
      y += 6;
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    const totalTxt = 'TOTAL: Bs. ' + total.toFixed(2);
    const boxW = doc.getTextWidth(totalTxt) + 8;
    const boxX = right - boxW;
    setFill(C.accent); doc.rect(boxX, y - 4.5, boxW, 7, 'F');
    setTextC(C.white);
    doc.text(totalTxt, boxX + boxW - 4, y, { align: 'right' });
    y += 10;

    // Notas
    if (notas) {
      setTextC(C.text3); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text('NOTAS', 8, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setTextC(C.text);
      const nl = doc.splitTextToSize(notas, W - 16);
      doc.text(nl, 8, y); y += 5 * nl.length;
    }

    // Firmas
    const fy = Math.max(y, H - 36);
    setFill(C.border); doc.rect(10, fy, 55, 0.4, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setTextC(C.text2);
    doc.text('Recibí conforme', 10, fy + 5);
    doc.text('Nombre y firma del cliente', 10, fy + 10);
    setFill(C.border); doc.rect(W - 65, fy, 55, 0.4, 'F');
    doc.text('Entregado por: ' + (agenteNombre || '—'), W - 65, fy + 5);
    doc.text('Nombre y firma del agente', W - 65, fy + 10);

    // Pie
    setTextC(C.text3); doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
    doc.text('¡Gracias por tu compra!', W / 2, H - 14, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text('Nota: no es válido para crédito fiscal', W / 2, H - 9, { align: 'center' });

    const pdfBlob = doc.output('blob');
    _descargarBlob(pdfBlob, 'recibo_' + folio + '.pdf');

    _nrReciboBlob = pdfBlob;
    _renderNrReciboPreview(URL.createObjectURL(pdfBlob));
    toast(_ic('circle-check', 15) + ' Recibo generado. Se subirá al guardar el registro','success');
  } catch (e) {
    console.error('recibo', e);
    toast(_ic('circle-x', 15) + ' Error generando recibo: ' + esc(e.message),'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

// GUARDAR
async function saveNuevoRegistro() {
  const saveBtn = document.getElementById('nr-save-btn');
  if (saveBtn?.disabled) return;
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Guardando...'; }
  const ventaId = document.getElementById('nr-edit-venta-id').value;('nr-edit-venta-id').value;
  const celular = document.getElementById('nr-celular').value.trim();
  const nombre = document.getElementById('nr-nombre').value.trim();
  const clienteId  = document.getElementById('nr-cliente-id').value;
  const estado = document.getElementById('nr-estado').value;
  const ubicacion = document.getElementById('nr-ubicacion').value.trim();
  const notas = document.getElementById('nr-notas').value.trim();
  const fecha = document.getElementById('nr-fecha').value;
  const monto = parseFloat(document.getElementById('nr-monto').value) || null;
  const descPct = parseInt(document.getElementById('nr-descuento')?.value) || 0;
  const recordat = document.getElementById('nr-recordatorio')?.value || null;
  const direccion = document.getElementById('nr-direccion')?.value?.trim() || null;
  const agenteId = currentUser.rol==='admin'
    ? (document.getElementById('nr-agente')?.value || currentUser.id)
    : currentUser.id;

  const intentos = _leerNrIntentos(estado);
  if (!celular) { toast(_ic('triangle-alert', 15) + ' El celular es obligatorio','error'); return; }

  const items = getNrItemsData();
  if (!items.length) { toast(_ic('triangle-alert', 15) + ' Añade al menos un producto con precio','error'); return; }

  let estadoFinal = estado;

  if (estado==='rellamada' && intentos>=MAX_RELLAMADAS) {
    if (!confirm(`${intentos} intentos. Al guardar se marcará como "No interesado".\n¿Confirmar?`)) return;
    estadoFinal = 'no_interesado';
    toast(_ic('bell-off', 15) + ' Marcado como No interesado','error');
  } else if (estado==='rellamada' && intentos===MAX_RELLAMADAS-1) {
    toast(_ic('triangle-alert', 15) + ' ' + intentos + '/' + MAX_RELLAMADAS + ' intentos — próximo cierra el ciclo','');
  }
  if (estado==='sin_respuesta' && intentos>=MAX_SIN_RESPUESTA) {
    if (!confirm(`${intentos} sin respuesta. Al guardar se marcará como "No interesado".\n¿Confirmar?`)) return;
    estadoFinal = 'no_interesado';
    toast(_ic('bell-off', 15) + ' Marcado como No interesado','error');
  } else if (estado==='sin_respuesta' && intentos===MAX_SIN_RESPUESTA-1) {
    toast(_ic('triangle-alert', 15) + ' ' + intentos + '/' + MAX_SIN_RESPUESTA + ' sin respuesta — próximo cierra el ciclo','');
  }

  const debeArchivar = ESTADOS_CIERRE.includes(estadoFinal);
  const prodNombre   = items.map(it=>allProductos.find(p=>p.id===it.producto_id)?.nombre).filter(Boolean).join(', ');

  const ventaData = {
    agente_id: agenteId, fecha, notas, monto_total: monto, descuento_pct: descPct,
    recordatorio: recordat || null, estado: estadoFinal,
    intentos: ['rellamada','sin_respuesta'].includes(estado) ? intentos : 1,
    archivado: debeArchivar,
  };

  try {
    let cId = clienteId ? parseInt(clienteId) : null;
    let savedId;

    // ── Validar stock disponible antes de escribir, si la venta quedará como vendido ──
    let stockVentaMap = null;
    let stockUbiValMap = null;
    let ubiOk = false;
    const ubiIdVal = _nrAlmUbiId();
    const ubiLabelVal = ubiIdVal ? _nrAlmUbiLabel(ubiIdVal) : '';
    if (estadoFinal === 'vendido') {
      stockVentaMap = {};
      const prodIds = [...new Set(items.map(it => it.producto_id))];
      const { data: stockRows, error: errStock } = await db.from('inventario_stock')
        .select('producto_id, stock_inicial')
        .in('producto_id', prodIds);
      if (errStock) throw errStock;
      (stockRows || []).forEach(r => { stockVentaMap[r.producto_id] = r.stock_inicial; });

      // Stock físico de la ubicación exacta del almacén seleccionada (almacen_stock)
      try {
        stockUbiValMap = {};
        if (ubiIdVal) {
          const { data: stRows, error: errSt } = await db.from('almacen_stock')
            .select('producto_id, stock')
            .eq('ubicacion_id', ubiIdVal);
          if (errSt) throw errSt;
          (stRows || []).forEach(r => { stockUbiValMap[r.producto_id] = r.stock; });
          ubiOk = true;
        }
      } catch (e) {
        console.error('almacen: validación de stock por ubicación', e);
      }

      // Suma por producto (varias filas del mismo producto suman su cantidad)
      const totalPorProducto = {};
      items.forEach(it => { totalPorProducto[it.producto_id] = (totalPorProducto[it.producto_id] || 0) + (it.cantidad || 1); });
      for (const [pid, cantidad] of Object.entries(totalPorProducto)) {
        const stockActual = stockVentaMap[pid] ?? 0;
        if (stockActual < cantidad) {
          const prodNombre = allProductos.find(p => p.id === parseInt(pid))?.nombre || 'Producto';
          throw new Error(`Stock insuficiente para "${prodNombre}": disponible ${stockActual} — configura stock en Inventario → Ajustes`);
        }
        if (ubiOk && (stockUbiValMap[pid] ?? 0) < cantidad) {
          const prodNombre = allProductos.find(p => p.id === parseInt(pid))?.nombre || 'Producto';
          const stockUbi = stockUbiValMap[pid] ?? 0;
          throw new Error(`Stock insuficiente en "${ubiLabelVal}" para "${prodNombre}": disponible ${stockUbi} — distribuye stock en el módulo de Almacén`);
        }
      }
    }

    if (ventaId) {
      if (!cId) throw new Error('Cliente ID faltante en edición');
      const [,,{ error: errV }] = await Promise.all([
        db.from('clientes').update({ nombre:nombre||'s/n', ubicacion, producto_interes:prodNombre||undefined, direccion_residencial:direccion }).eq('id',cId),
        db.from('venta_items').delete().eq('venta_id',parseInt(ventaId)),
        db.from('ventas').update({ ...ventaData, cliente_id:cId }).eq('id',parseInt(ventaId)),
      ]);
      if (errV) throw errV;
      savedId = parseInt(ventaId);
      toast(_ic('circle-check', 15) + ' Registro actualizado','success');
    } else {
      // CREACIÓN
      if (!cId) {
        const { data:newC, error:errC } = await db.from('clientes').insert({
          celular, nombre:nombre||'s/n', ubicacion, producto_interes:prodNombre||null, direccion_residencial:direccion
        }).select().single();
        if (errC) throw errC;
        cId = newC.id;
      } else {
        await db.from('clientes').update({ nombre:nombre||'s/n', ubicacion, producto_interes:prodNombre||undefined, direccion_residencial:direccion }).eq('id',cId);
      }
      const { data:saved, error:errV } = await db.from('ventas').insert({ ...ventaData, cliente_id:cId }).select().single();
      if (errV) throw errV;
      savedId = saved.id;
      toast(_ic('circle-check', 15) + ' Registro guardado','success');
    }

    const toInsert = items.map(it => ({ ...it, venta_id: savedId }));
    const [{ error: errI }, url, reciboUrl] = await Promise.all([
      db.from('venta_items').insert(toInsert),
      _uploadNrComprobante(savedId),
      _nrReciboBlob ? _uploadNrRecibo(savedId) : Promise.resolve(null),
    ]);
    if (errI) throw errI;
    if (url) await db.from('ventas').update({ comprobante_url: url }).eq('id', savedId);
    if (reciboUrl) await db.from('ventas').update({ recibo_url: reciboUrl }).eq('id', savedId);
    _nrReciboBlob = null;

    // ── Historial acumulado + descuento de stock: solo si la venta quedó como vendido ──
    if (estadoFinal === 'vendido') {
      const mesVenta = fecha.slice(0, 7); // 'YYYY-MM'
      const totalUnidades = items.reduce((s, it) => s + (it.cantidad || 1), 0);
      const montoFinal = monto || 0;
      await db.rpc('upsert_cliente_historial', {
        p_cliente_id: cId,
        p_mes:        mesVenta,
        p_unidades:   totalUnidades,
        p_monto:      montoFinal,
      });
      _clientesFielesCache = null; // invalidar para que recargue

      // ── Decrementar stock (inventario_movimientos) solo la primera vez que llega a vendido ──
      const esNuevo = !ventaId;
      const estadoAnterior = esNuevo ? null : (ventasIndex[parseInt(ventaId)]?.estado || null);
      const primerVendido = esNuevo || estadoAnterior !== 'vendido';
      if (primerVendido) {
        for (const item of items) {
          const cantidad = item.cantidad || 1;
          const stockActual = stockVentaMap?.[item.producto_id] ?? 0;
          const stockPosterior = stockActual - cantidad;
          const { error: errMov } = await db.from('inventario_movimientos').insert({
            producto_id: item.producto_id,
            tipo: 'venta',
            cantidad: cantidad,
            stock_anterior: stockActual,
            stock_posterior: stockPosterior,
            ubicacion: null,
            notas: `Venta automática #${savedId}`,
            usuario_id: agenteId,
          });
          if (errMov) throw errMov;

          if (stockVentaMap && stockVentaMap[item.producto_id] !== undefined) {
            const { error: errUpd } = await db.from('inventario_stock')
              .update({ stock_inicial: stockPosterior })
              .eq('producto_id', item.producto_id);
            if (errUpd) throw errUpd;
          }

          // Descontar el stock físico de la ubicación exacta seleccionada (almacen_stock)
          if (ubiOk && typeof Almacen !== 'undefined' && Almacen.descontarDeUbicacion) {
            const r = await Almacen.descontarDeUbicacion(item.producto_id, cantidad, ubiIdVal);
            if (r && r.error) throw new Error(r.error.message || 'Error descontando stock de almacén');
          }
        }
      }
    }

    await DataStore.refresh('inventario', 'almacen');
    if (window.Inventario?.loadStockData) await Inventario.loadStockData(false);
    if (window._checkStockAlerts) window._checkStockAlerts();

    // Actualizar memoria local
    const old       = ventasIndex[savedId];
    const agenteObj = allAgents.find(a=>a.id===agenteId) || old?.agente || { id:agenteId, nombre:currentUser.nombre };
    const updated = {
      ...(old||{}), id:savedId, cliente_id:cId, agente_id:agenteId, fecha, notas,
      monto_total:monto, descuento_pct:descPct, recordatorio:recordat||null, recordatorio_visto:false,
      estado:estadoFinal, intentos:['rellamada','sin_respuesta'].includes(estado)?intentos:1,
      archivado:debeArchivar, comprobante_url:url||(old?.comprobante_url||null),
      recibo_url:reciboUrl||(old?.recibo_url||null),
      updated_at: new Date().toISOString(),  
      cliente:{ ...(old?.cliente||{}), id:cId, celular, nombre:nombre||'s/n', ubicacion, direccion_residencial:direccion, producto_interes:prodNombre||null },
      agente: agenteObj,
      venta_items: toInsert.map((it,i)=>({ id:i, venta_id:savedId, producto_id:it.producto_id, cantidad:it.cantidad, subtotal:it.subtotal,
        productos:{ id:it.producto_id, nombre:allProductos.find(p=>p.id===it.producto_id)?.nombre||'' } })),
    };
    const idx = ventas.findIndex(v=>v.id===savedId);
    if (idx>=0) ventas[idx]=updated; else ventas.unshift(updated);
    ventasIndex[savedId] = updated;

    dashboardCache.invalidate();
    filteredCache.invalidate();
    _cityFilterDirty = true;

    cerrarNuevoRegistro();
    renderVentas();
    renderDashboard();
  } catch(e) {
    toast(_ic('circle-x', 15) + ' Error: ' + e.message,'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = _ic('save', 15) + ' Guardar'; }
  }
}

// ELIMINAR desde la página
function nrDeleteVenta() {
  if (!_nrVentaId) return;
  const v       = ventasIndex[_nrVentaId];
  const celular = v?.cliente?.celular || '';
  const nombre  = v?.cliente?.nombre  || 's/n';

  document.getElementById('delete-modal-nombre').textContent = nombre;
  document.getElementById('delete-modal-celular').textContent = celular;
  document.getElementById('delete-confirm-input').value = '';
  document.getElementById('delete-confirm-input').style.borderColor = '';
  document.getElementById('delete-modal-error').style.display = 'none';
  document.getElementById('delete-modal').classList.add('open');
  document.getElementById('delete-confirm-input').focus();

  document.getElementById('delete-confirm-btn').onclick = async () => {
    const typed = document.getElementById('delete-confirm-input').value.trim();
    if (typed !== celular) {
      document.getElementById('delete-confirm-input').style.borderColor = 'var(--red)';
      document.getElementById('delete-modal-error').style.display = '';
      return;
    }
    document.getElementById('delete-modal').classList.remove('open');
    try {
      const clienteId = v?.cliente_id;
      const { error } = await db.from('ventas').delete().eq('id', _nrVentaId);
      if (error) throw error;
      if (clienteId) {
        const { count:faltas }   = await db.from('ventas').select('*',{count:'exact',head:true}).eq('cliente_id',clienteId).in('estado',['cancelado','spam']);
        const { count:spamCnt }  = await db.from('ventas').select('*',{count:'exact',head:true}).eq('cliente_id',clienteId).eq('estado','spam');
        await db.from('clientes').update({ faltas:faltas||0, flag:(spamCnt||0)>0?'spam':'normal' }).eq('id',clienteId);
      }
      ventas = ventas.filter(x=>x.id!==_nrVentaId);
      delete ventasIndex[_nrVentaId];
      dashboardCache.invalidate();
      filteredCache.invalidate();
      _cityFilterDirty = true;
      toast(_ic('trash-2', 15) + ' Registro eliminado');
      cerrarNuevoRegistro();
      renderVentas();
      renderDashboard();
    } catch(e) { toast(_ic('circle-x', 15) + ' ' + e.message,'error'); }
  };
}

// GUÍA LATERAL
function _limpiarGuiaNr() {
  _nrGuiaProdId = null;
  document.getElementById('nr-guia-empty').style.display   = 'flex';
  document.getElementById('nr-guia-content').style.display = 'none';
  document.getElementById('nr-guia-subtitle').textContent  = 'Selecciona un producto para ver la guía';
  const eb = document.getElementById('nr-guia-edit-btn');
  if (eb) eb.style.display = 'none';
}

async function _renderGuiaNr(prodId) {
  if (_nrGuiaProdId === prodId) return;
  _nrGuiaProdId = prodId;
  _injectGuiaEditorCSS();

  const prod = allProductos.find(p => p.id === prodId);
  document.getElementById('nr-guia-subtitle').textContent = prod?.nombre || '—';
  document.getElementById('nr-guia-empty').style.display   = 'none';
  document.getElementById('nr-guia-content').style.display = '';
  document.getElementById('nr-guia-col1-body').innerHTML   =
    '<div style="padding:24px;color:var(--text3);font-size:13px;">Cargando...</div>';

  // Usar caché compartido con guia.js
  let guia;
  if (typeof _guiaCache !== 'undefined' && _guiaCache.has(prodId)) {
    guia = _guiaCache.get(prodId);
  } else if (DataStore.guiaMap && DataStore.guiaMap[prodId]) {
    guia = DataStore.guiaMap[prodId];
    if (typeof _guiaCache !== 'undefined') _guiaCache.set(prodId, guia);
  } else {
    const { data } = await db.from('guia_atencion').select('*').eq('producto_id', prodId).maybeSingle();
    if (typeof _guiaCache !== 'undefined') _guiaCache.set(prodId, data);
    guia = data;
  }

  if (_nrGuiaProdId !== prodId) return;

  const norm     = _normalizeContenido(guia?.contenido);
  const emptyMsg = '<div style="color:var(--text3);font-size:13px;padding:24px;text-align:center;">Sin contenido</div>';
  const todo     = [...(norm.col1 || []), ...(norm.col2 || [])];
  document.getElementById('nr-guia-col1-body').innerHTML = _renderColumna(todo) || emptyMsg;

  const eb = document.getElementById('nr-guia-edit-btn');
  if (eb) eb.style.display = currentUser?.rol === 'admin' ? '' : 'none';
}

function abrirEditorGuiaDesdeNr() {
  if (!_nrGuiaProdId) return;
  const prod = allProductos.find(p => p.id === _nrGuiaProdId);
  if (prod) openGuiaEditor(_nrGuiaProdId, prod.nombre);
}