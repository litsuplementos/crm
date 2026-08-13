// app.js
const SUPABASE_URL = 'https://txjgdglfzskirujqctra.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4amdkZ2xmenNraXJ1anFjdHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzYzNzYsImV4cCI6MjA4OTI1MjM3Nn0.b3o9KHVaspzyRnMhmB6uX2jLjadWgAFJM-iYHKHjXr0';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// SessionManager
const SessionManager = {
  STORAGE_KEY: 'litcrm_session_user',
  saveSession(userData) {
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(userData));
  },
  getSession() {
    const data = sessionStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },
  clearSession() {
    sessionStorage.removeItem(this.STORAGE_KEY);
  }
}

// ICONOS LUCIDE
function _pascal(s) {
  return s.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
function _ic(name, size = 16, extra = {}) {
  const L = window.lucide;
  if (!L || !L.icons) return '';
  const data = L.icons[_pascal(name)];
  if (!data) return '';
  const attrs = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    ...extra,
  };
  const attrStr = Object.entries(attrs).map(([k, v]) => k + '="' + v + '"').join(' ');
  const inner = data.map(([tag, a]) => {
    const as = Object.entries(a).map(([k, v]) => k + '="' + v + '"').join(' ');
    return '<' + tag + ' ' + as + '/>';
  }).join('');
  return '<svg ' + attrStr + '>' + inner + '</svg>';
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// CUSTOM SELECT (dropdown con iconos en las opciones)
const _cselects = {};
function _buildCSelect(id, opciones, onChange) {
  const host = document.getElementById(id);
  if (!host) return;
  const prev = _cselects[id];
  if (prev && prev._dispose) prev._dispose();
  let value = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cselect-btn';
  const label = document.createElement('span');
  label.className = 'cs-label';
  const chev = document.createElement('span');
  chev.className = 'cselect-chev';
  chev.innerHTML = _ic('chevron-down', 14);
  btn.appendChild(label);
  btn.appendChild(chev);
  const list = document.createElement('div');
  list.className = 'cselect-list';
  function renderLabel() {
    const opt = opciones.find(o => o.value === value);
    const t = opt ? opt.label : (opciones[0] ? opciones[0].label : '');
    label.innerHTML = (opt && opt.icon ? _ic(opt.icon, 14) : '') + '<span>' + esc(t) + '</span>';
  }
  function setValue(v, trigger) {
    value = v;
    renderLabel();
    list.querySelectorAll('.cselect-item').forEach(el => el.classList.toggle('sel', el.dataset.value === v));
    if (trigger && onChange) onChange(v);
  }
  function close() { host.classList.remove('open'); }
  opciones.forEach(o => {
    const it = document.createElement('div');
    it.className = 'cselect-item';
    it.dataset.value = o.value;
    it.innerHTML = (o.icon ? _ic(o.icon, 13) : '') + '<span>' + esc(o.label) + '</span>';
    it.addEventListener('click', () => { setValue(o.value, true); close(); });
    list.appendChild(it);
  });
  function onDocClick(e) { if (!host.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  btn.addEventListener('click', () => host.classList.toggle('open'));
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  host.innerHTML = '';
  host.appendChild(btn);
  host.appendChild(list);
  renderLabel();
  _cselects[id] = {
    _dispose() { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onKey); },
    value() { return value; },
    setValue(v, trigger) { setValue(v, !!trigger); },
  };
}
function getCSelectValue(id) { return _cselects[id] ? _cselects[id].value() : ''; }
function setCSelectValue(id, val) { if (_cselects[id]) _cselects[id].setValue(val, false); }

// ─── Utilidades de stock ────────────────────────────────────────────────
// Modelo: inventario_stock.stock_inicial es el ÚNICO total maestro.
// almacen_stock es solo la distribución física y SUM(almacen_stock) === stock_inicial.

// Reparte un total exacto entre ubicaciones (proporcional al stock actual,
// método del mayor residuo). Devuelve el array con la suma exacta == total.
function _repartirTotal(stocks, total) {
  const n = stocks.length;
  if (!n) return [];
  if (total <= 0) return stocks.map(() => 0);
  const base = stocks.reduce((a, b) => a + (b || 0), 0);
  if (base <= 0) {
    const cuts = stocks.map(() => Math.floor(total / n));
    let resto = total - cuts.reduce((a, b) => a + b, 0);
    for (let i = 0; resto > 0 && i < n; i++) { cuts[i]++; resto--; }
    return cuts;
  }
  const cuts = stocks.map(s => Math.floor(total * (s || 0) / base));
  let resto = total - cuts.reduce((a, b) => a + b, 0);
  const cola = stocks
    .map((s, i) => ({ i, frac: (total * (s || 0) / base) - cuts[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; resto > 0 && k < n * 3; k++) {
    cuts[cola[k % n].i]++;
    resto--;
  }
  return cuts;
}

// Recalcula inventario_stock.stock_inicial = SUM(almacen_stock) del producto.
// Idempotente con el trigger SQL almacen_stock_sync_total (respaldo defensivo).
async function _syncStockInicial(productoId) {
  try {
    const { data, error } = await db.from('almacen_stock')
      .select('stock').eq('producto_id', productoId);
    if (error) { console.error('syncStockInicial: lectura', error); return; }
    const total = (data || []).reduce((s, r) => s + (r.stock || 0), 0);
    const { error: errUpd } = await db.from('inventario_stock')
      .update({ stock_inicial: total })
      .eq('producto_id', productoId);
    if (errUpd) console.error('syncStockInicial: actualización', errUpd);
  } catch (e) {
    console.error('syncStockInicial', e);
  }
}

// DATASTORE — precarga en memoria (técnica: navegación instantánea).
// Los módulos (Inventario, Almacén, Guía, Nuevo Registro) leen de aquí en lugar
// de consultar Supabase en cada apertura. refresh() re-consulta solo lo afectado
// después de mutaciones.
const DataStore = {
  _ready: { almacen: false, inventario: false, guia: false },
  _errors: { almacen: null, inventario: null, guia: null },
  ubicaciones: [],
  almacenStock: [],
  almacenMovimientos: [],
  inventarioStock: [],
  inventarioMovimientos: [],
  guiaMap: {},

  async _fetchUbicaciones() {
    const { data, error } = await db.from('almacen_ubicaciones').select('*').order('departamento');
    if (error) throw error;
    this.ubicaciones = data || [];
  },
  async _fetchAlmacenStock() {
    const { data, error } = await db.from('almacen_stock').select('*');
    if (error) throw error;
    this.almacenStock = data || [];
  },
  async _fetchAlmacenMovimientos() {
    const { data, error } = await db.from('almacen_movimientos')
      .select(`
        id, producto_id, origen_id, destino_id, cantidad,
        stock_origen_anterior, stock_origen_posterior,
        stock_destino_anterior, stock_destino_posterior,
        stock_general_anterior, stock_general_posterior,
        notas, usuario_id, created_at,
        origen:origen_id (id, departamento, lugar, ubicacion),
        destino:destino_id (id, departamento, lugar, ubicacion),
        usuarios:usuario_id (id, nombre)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    this.almacenMovimientos = data || [];
  },
  async _fetchInventarioStock() {
    const { data, error } = await db.from('inventario_stock').select('*, usuarios:usuario_id (id, nombre)');
    if (error) throw error;
    this.inventarioStock = data || [];
  },
  async _fetchInventarioMovimientos() {
    const { data, error } = await db.from('inventario_movimientos')
      .select(`
        id, producto_id, tipo, cantidad, stock_anterior, stock_posterior, ubicacion, notas, usuario_id, created_at,
        productos:producto_id (id, nombre),
        usuarios:usuario_id (id, nombre)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    this.inventarioMovimientos = data || [];
  },
  async _fetchGuia() {
    const { data, error } = await db.from('guia_atencion').select('producto_id, contenido');
    if (error) throw error;
    this.guiaMap = Object.fromEntries((data || []).map(g => [g.producto_id, g]));
  },

  _branches: {
    almacen: ['_fetchUbicaciones', '_fetchAlmacenStock', '_fetchAlmacenMovimientos'],
    inventario: ['_fetchInventarioStock', '_fetchInventarioMovimientos'],
    guia: ['_fetchGuia'],
  },

  async _runBranch(branch) {
    this._errors[branch] = null;
    const fns = this._branches[branch] || [];
    await Promise.all(fns.map(fn => this[fn]().catch(e => {
      this._errors[branch] = e?.message || 'Error al consultar la base de datos';
      console.error('DataStore:' + branch, e);
    })));
  },

  async refresh(...ramas) {
    const flat = [...new Set(ramas.flat())];
    await Promise.all(flat.map(r => this._runBranch(r)));
    flat.forEach(r => { this._ready[r] = true; });
  },

  async initialize() { await this.refresh('almacen', 'inventario', 'guia'); },

  async ensure(...ramas) {
    const flat = [...new Set(ramas.flat())];
    const missing = flat.filter(r => !this._ready[r]);
    if (missing.length) await this.refresh(missing);
  },
};

// CACHÉ DE DASHBOARD
const dashboardCache = {
  lastVentasCount: 0,
  lastAgentId: null,
  prods: {},
  cities: {},
  sCounts: {},
  isDirty: true,
  lastIsAdmin: null,
  lastShowingAll: null,

  invalidate() {
    this.isDirty = true;
  },

  isValid(ventasLength, agentId) {
    return !this.isDirty &&
           this.lastVentasCount === ventasLength &&
           this.lastAgentId === agentId;
  }
};

// FIX #6 — caché de getFiltered para evitar re-filtrado en renders consecutivos
const filteredCache = {
  result: null,
  _search: null, _status: null, _prodId: null,
  _ubicacion: null, _agente: null, _tiempo: null,
  _archivado: null, _mesCustom: null,
  invalidate() { this.result = null; }
};

const ESTADOS = {
  rellamada: { label: 'Rellamada', icon: 'rotate-ccw', badge: 'badge-rellamada',  color: 'var(--accent2)' },
  seguimiento: { label: 'Seguimiento', icon: 'refresh-cw', badge: 'badge-seguimiento',color: 'var(--blue)' },
  interesado: { label: 'Interesado', icon: 'star', badge: 'badge-interesado', color: 'var(--yellow)' },
  agendar: { label: 'Agendar', icon: 'calendar', badge: 'badge-agendar', color: 'var(--orange)' },
  sin_respuesta:{ label: 'Sin respuesta', icon: 'phone-off', badge: 'badge-sinresp', color: 'var(--red)' },
  no_interesado:{ label: 'No interesado', icon: 'thumbs-down', badge: 'badge-noint', color: 'var(--text3)' },
  enviado: { label: 'Enviado', icon: 'package', badge: 'badge-enviado', color: 'var(--blue)' },
  vendido: { label: 'Vendido', icon: 'circle-check', badge: 'badge-vendido', color: 'var(--green)' },
  cancelado: { label: 'Cancelado', icon: 'circle-x', badge: 'badge-cancelado', color: '#f87171' },
  spam: { label: 'SPAM', icon: 'ban', badge: 'badge-spam', color: 'var(--text3)' },
};

const ESTADOS_CIERRE = ['vendido', 'no_interesado', 'spam', 'cancelado'];
const MAX_RELLAMADAS = 3;
const MAX_SIN_RESPUESTA = 4;
const PAGE_SIZE = 15;

let currentUser = null;
let ventas = [];
let ventasIndex = {};
let allAgents = [];
let allProductos = [];
let selectedAgentId  = 'all';
let currentPage = 1;

let totalVentasCount = 0;
let mostrarArchivados = false;
let _vendidosEditablesCache = null;
let filtroTiempoDash = 'mes';
let filtroTiempoVentas = 'mes';
let filtroFechaDesdeDash = null;
let filtroFechaHastaDash = null;
let filtroFechaDesdeVentas = null;
let filtroFechaHastaVentas = null;
let _exportColumnasSeleccionadas = null;
let _savedFiltroEstado = '';
let _savedFiltroProducto = '';
let _savedFiltroUbicacion = '';
let _savedFiltroAgente = '';
let _savedFiltroEstadoClientes = '';
let _exportSource = 'ventas';
let _exportColumnasSeleccionadasClientes = null;
let _clientesFielesUmbral = 5;
let _clientesFielesDescuento = 10;
let _clientesFielesCache = null;

let _searchTimer;
let _filterTimer;
function debouncedRenderVentas() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderVentas, 300);
}

(function initFloatingLogo() {
  const LOGO_SRC = 'resources/images/logo/logo.png';
  const SIZE = 64;
  const SPEED = 1.2;

  let vx = SPEED, vy = SPEED * 0.75;
  let x = 80, y = 60;
  let container = null;
  let logoEl = null;
  let rafId = null;

  function createLogo() {
    if (logoEl) return; 
    logoEl = document.createElement('img');
    logoEl.src = LOGO_SRC;
    logoEl.style.cssText = `
      position:absolute;
      width:${SIZE}px;height:${SIZE}px;
      object-fit:contain;
      opacity:0.18;
      overflow: visible;
      pointer-events:none;
      user-select:none;
      z-index:0;
      border-radius:12px;
    `;
    logoEl.onerror = () => { logoEl.style.display = 'none'; };
  }

  function getActiveContainer() {
    return document.querySelector('.view.active .view-scroll-wrap')
        || document.querySelector('.view.active');
  }

  function attach() {
    if (!logoEl) return; 
    const c = getActiveContainer();
    if (!c || c === container) return;
    container = c;
    if (logoEl.parentElement !== container) {
      container.appendChild(logoEl);
      const cur = getComputedStyle(container).position;
      if (cur === 'static') container.style.position = 'relative';
    }
    const cw = container.clientWidth  || 400;
    const ch = container.clientHeight || 300;
    x = Math.random() * (cw - SIZE);
    y = Math.random() * (ch - SIZE);
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!container || !logoEl) return;
    const cw = container.clientWidth  || 400;
    const ch = container.clientHeight || 300;
    x += vx; y += vy;
    if (x <= 0) { x = 0; vx =  Math.abs(vx); }
    if (x >= cw - SIZE){ x = cw - SIZE; vx = -Math.abs(vx); }
    if (y <= 0) { y = 0; vy =  Math.abs(vy); }
    if (y >= ch - SIZE){ y = ch - SIZE; vy = -Math.abs(vy); }
    logoEl.style.left = x + 'px';
    logoEl.style.top = y + 'px';
    const newC = getActiveContainer();
    if (newC && newC !== container) attach();
  }

  function start() {
    createLogo(); 
    attach();
    loop();
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (logoEl && logoEl.parentElement) logoEl.parentElement.removeChild(logoEl);
    logoEl = null;
    container = null;
  }

  // Arrancar cuando el app sea visible
  const appEl = document.getElementById('app');
  if (appEl) {
    const obs = new MutationObserver(() => {
      if (appEl.style.display !== 'none') {
        obs.disconnect();
        setTimeout(start, 100); 
      }
    });
    obs.observe(appEl, { attributes: true, attributeFilter: ['style'] });
  }
  setTimeout(() => {
    const app = document.getElementById('app');
    if (app && app.style.display !== 'none' && !logoEl) start();
  }, 500);

  window._floatingLogoSpeed = (s) => {
    vx = s * Math.sign(vx) || s;
    vy = s * 0.75 * Math.sign(vy) || s * 0.75;
  };
  window._floatingLogoStop = stop;
})();

// THEME
function initTheme() {
  applyTheme(localStorage.getItem('litcrm-theme') || 'white');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('litcrm-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    if (theme === 'night') btn.innerHTML = _ic('sun', 15, { style: 'vertical-align:-2px;' }) + ' Día';
    else if (theme === 'day') btn.innerHTML = _ic('moon', 15, { style: 'vertical-align:-2px;' }) + ' Noche';
    else btn.innerHTML = _ic('leaf', 15, { style: 'vertical-align:-2px;' }) + ' Menta';
  }
}

function toggleTheme() {
  const order = ['white', 'day', 'night'];
  const cur = document.documentElement.getAttribute('data-theme') || 'white';
  applyTheme(order[(order.indexOf(cur) + 1) % 3]);
}

function togglePassVisibility(btn) {
  const input = btn.previousElementSibling;
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  btn.innerHTML = _ic(hidden ? 'eye-off' : 'eye', 16);
}

// Initialize Session
function initializeSession() {
  const savedSession = SessionManager.getSession();
  if (savedSession && savedSession.id) {
    currentUser = savedSession;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-name-top').textContent = savedSession.nombre;
    document.getElementById('user-avatar-top').textContent = savedSession.nombre[0].toUpperCase();
    const isAdmin = savedSession.rol === 'admin';
    document.getElementById('tab-productos').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-config').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-usuarios').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-memorias').style.display = '';
    document.getElementById('tab-almacen').style.display = isAdmin ? '' : 'none';
    if (window._sidebarRenderNav) window._sidebarRenderNav();
    if (window._sidebarSyncUser) window._sidebarSyncUser();
    initApp().catch(e => console.error('Error inicializando app:', e));
  }
}

// Describir tiempo
function describeFiltroTiempo(source) {
  const filtro = source === 'ventas' ? filtroTiempoVentas : filtroTiempoDash;
  const hoy = new Date();
  const opts = { day: 'numeric', month: 'long' };

  if (source === 'dash' && filtro === 'personalizado') {
    if (filtroFechaDesdeDash || filtroFechaHastaDash) {
      const d = filtroFechaDesdeDash ? new Date(filtroFechaDesdeDash + 'T00:00:00') : null;
      const h = filtroFechaHastaDash ? new Date(filtroFechaHastaDash + 'T00:00:00') : hoy;
      if (d && filtroFechaHastaDash) return `Personalizado: del ${d.toLocaleDateString('es-BO', opts)} al ${h.toLocaleDateString('es-BO', opts)}`;
      if (d) return `Personalizado: desde ${d.toLocaleDateString('es-BO', opts)}`;
      if (filtroFechaHastaDash) return `Personalizado: hasta ${h.toLocaleDateString('es-BO', opts)}`;
    }
    return 'Personalizado: sin rango definido (mostrando todos)';
  }

  if (filtro === 'todos') return 'Todos los registros';
  if (filtro === 'dia') {
    return `Hoy: ${hoy.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (filtro === 'semana') {
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() + diffLunes);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return `Esta semana: del ${lunes.toLocaleDateString('es-BO', opts)} al ${domingo.toLocaleDateString('es-BO', opts)}`;
  }
  if (filtro === 'mes') {
    let year = hoy.getFullYear();
    let month = hoy.getMonth();
    if (source === 'dash' && window._filtroMesCustom) {
      const [y, m] = window._filtroMesCustom.split('-').map(Number);
      year = y;
      month = m - 1;
    }
    const primerDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    return `Este mes: del ${primerDia.toLocaleDateString('es-BO', opts)} al ${ultimoDia.toLocaleDateString('es-BO', opts)}`;
  }
  if (filtro === 'año') {
    const year = hoy.getFullYear();
    const primerDia = new Date(year, 0, 1);
    const ultimoDia = new Date(year, 12, 0);
    return `Este año: del ${primerDia.toLocaleDateString('es-BO', opts)} al ${ultimoDia.toLocaleDateString('es-BO', opts)}`;
  }
  return '';
}

// Filtro tiempo
function getFechaLimite(filtro) {
  if (filtro === 'todos') return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (filtro === 'dia') return hoy;
  if (filtro === 'semana') {
    const d = new Date(hoy);
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    d.setDate(hoy.getDate() + diffLunes);
    return d;
  }
  if (filtro === 'mes') {
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }
  if (filtro === 'año') {
    return new Date(hoy.getFullYear(), 0, 1);
  }
  return null;
}

function ventasEnFiltroTiempo(venta, source) {
  const filtro = source === 'ventas' ? filtroTiempoVentas : filtroTiempoDash;

  if (filtro === 'personalizado') {
    if (source === 'dash') {
      if (!filtroFechaDesdeDash && !filtroFechaHastaDash) return true;
      const fechaVenta = venta.updated_at ? new Date(venta.updated_at) : new Date(venta.fecha + 'T00:00:00');
      const desde = filtroFechaDesdeDash ? new Date(filtroFechaDesdeDash + 'T00:00:00') : new Date(0);
      const hasta = filtroFechaHastaDash ? new Date(filtroFechaHastaDash + 'T23:59:59') : new Date();
      return fechaVenta >= desde && fechaVenta <= hasta;
    }
    if (source === 'ventas') {
      if (!filtroFechaDesdeVentas && !filtroFechaHastaVentas) return true;
      const fechaVenta = venta.updated_at ? new Date(venta.updated_at) : new Date(venta.fecha + 'T00:00:00');
      const desde = filtroFechaDesdeVentas ? new Date(filtroFechaDesdeVentas + 'T00:00:00') : new Date(0);
      const hasta = filtroFechaHastaVentas ? new Date(filtroFechaHastaVentas + 'T23:59:59') : new Date();
      return fechaVenta >= desde && fechaVenta <= hasta;
    }
  }

  if (filtro === 'todos') return true;

  const fechaVenta = venta.updated_at ? new Date(venta.updated_at) : new Date(venta.fecha + 'T00:00:00');

  if (filtro === 'mes' && source === 'dash' && window._filtroMesCustom) {
    const [year, month] = window._filtroMesCustom.split('-').map(Number);
    return fechaVenta.getFullYear() === year && fechaVenta.getMonth() === month - 1;
  }

  const limite = getFechaLimite(filtro);
  if (!limite) return true;
  return fechaVenta >= limite;
}

// AUTH
async function doLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const { data, error } = await db.from('usuarios')
      .select('*').eq('usuario', u).eq('password', p).eq('activo', true).single();
    if (error || !data) { errEl.style.display = 'block'; return; }
    currentUser = data;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-name-top').textContent = data.nombre;
    document.getElementById('user-avatar-top').textContent = data.nombre[0].toUpperCase();
    const isAdmin = data.rol === 'admin';
    document.getElementById('tab-productos').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-config').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-usuarios').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-memorias').style.display = '';
    document.getElementById('tab-almacen').style.display = isAdmin ? '' : 'none';
    if (window._sidebarRenderNav) window._sidebarRenderNav();
    if (window._sidebarSyncUser) window._sidebarSyncUser();
    await initApp();
    SessionManager.saveSession(data);
  } catch(e) {
    errEl.textContent   = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

function doLogout() {
  clearInterval(_recordatorioTimer);
  clearTimeout(_nrCelTimer);
  _recordatorioTimer = null;
  _vendidosEditablesCache = null;
  _clientesFielesCache = null;  
  _roscaAnualCache = null;
  _nrCelTimer = null;
  _nrGeoInit = false;
  _dismissRecordatorio();
  if (window._floatingLogoStop) window._floatingLogoStop();

  if (_audioCtx && _audioCtx.state !== 'closed') {
    _audioCtx.suspend().catch(() => {});
  }

  _geoSelectorsInitialized = false;
  filtroTiempoDash = 'mes';
  filtroTiempoVentas = 'mes';
  filtroFechaDesdeDash = null;
  filtroFechaHastaDash = null;
  window._filtroMesCustom = null;
  const drWrap = document.getElementById('dash-date-range');
  if (drWrap) drWrap.style.display = 'none'; 
  selectedAgentId = 'all';       
  ClientesView.invalidate();
  Inventario.reset();

  Objetivos.stop();
  currentUser = null;
  document.getElementById('tab-productos').style.display = 'none';
  document.getElementById('tab-config').style.display = 'none';
  document.getElementById('tab-usuarios').style.display = 'none';
  document.getElementById('tab-almacen').style.display = 'none';
  if (window._sidebarRenderNav) window._sidebarRenderNav();
  ventas = [];
  ventasIndex = {};
  allAgents = [];
  allProductos = [];
  dashboardCache.invalidate();
  filteredCache.invalidate();
  _usersCache = null; 

  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('search-input').value = '';
  setCSelectValue('filter-status', '');
  document.getElementById('filter-producto').value = '';
  document.getElementById('filter-ubicacion').value = '';
  showViewDirect('dashboard');
  SessionManager.clearSession();
}

// INIT
async function initApp() {
  const wrap = document.getElementById('agent-selector-wrap');
  if (wrap) wrap.innerHTML = '';
  const filterAgente = document.getElementById('filter-agente');
  if (filterAgente) filterAgente.style.display = 'none';
  document.getElementById('dashboard-agent-row').style.display = 'none';

  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  if (currentUser.rol === 'admin') {
    await Promise.all([loadProductos(false), loadAgents(), loadVentas(), loadConfigVendidosEditables()]);
    buildAgentSelector();
  } else {
    await Promise.all([loadProductos(false), loadVentas(), getVendidosEditables()]);    
    const [{ data: dataU }, { data: dataD }] = await Promise.all([
      db.from('config').select('valor').eq('clave', 'clientes_fieles_umbral').single(),
      db.from('config').select('valor').eq('clave', 'clientes_fieles_descuento').single(),
    ]);
    if (dataU?.valor) _clientesFielesUmbral = parseInt(dataU.valor) || 5;
    if (dataD?.valor) _clientesFielesDescuento = parseInt(dataD.valor) || 10;
  }
  await _loadUserConfig();
  _setupEventDelegationOnce();

  if (Inventario?.loadStockData) { await DataStore.initialize(); await Inventario.loadStockData(false); }
  renderDashboard();       

  _nrGeoInit = false;
  renderVentas();
  populateProductoFilter();
  if (mostrarArchivados) {
    setArchivoFiltro(true);
  } else {
    setArchivoFiltro(false);
  }
  if (_savedFiltroEstado) {
    if (document.getElementById('filter-status')) setCSelectValue('filter-status', _savedFiltroEstado);
  }
  if (_savedFiltroProducto) {
    const el = document.getElementById('filter-producto');
    if (el) el.value = _savedFiltroProducto;
  }
  if (_savedFiltroUbicacion) {
    const el = document.getElementById('filter-ubicacion');
    if (el) el.value = _savedFiltroUbicacion;
  }
  if (_savedFiltroAgente) {
    const el = document.getElementById('filter-agente');
    if (el) el.value = _savedFiltroAgente;
  }
  renderVentas();
  if (currentUser.rol === 'admin') { renderUsers(); renderProductos(); }
  iniciarChequeoRecordatorios();
  await Objetivos.init();

  document.getElementById('view-dashboard')?.classList.add('active');
  _checkStockAlerts();
}

let _eventDelegationRegistered = false;
function _setupEventDelegationOnce() {
  if (_eventDelegationRegistered) return;
  const tbody = document.getElementById('ventas-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-venta-id]');
    if (!row) return;
    const ventaId = parseInt(row.dataset.ventaId);

    if (e.target.closest('.td-name')) {
      showNuevoRegistro(ventaId);
      return;
    }

    if (e.target.closest('.td-phone')) {
      const venta = ventas.find(v => v.id === ventaId);
      const celular = venta?.cliente?.celular;
      if (celular) {
        navigator.clipboard.writeText(celular).then(() => {
          toast(_ic('clipboard', 15) + ' Número copiado: ' + esc(celular), 'success');
        }).catch(() => {});
      }
      return;
    }
  }, { passive: true });
  _eventDelegationRegistered = true;
}

function onFiltroMesChange(valor) {
  window._filtroMesCustom = valor;
  dashboardCache.invalidate();
  filteredCache.invalidate();
  _saveUserConfig('filtro_mes_custom', valor); 
  renderDashboard();
}

function onDashFechaRangeChange() {
  const desde = document.getElementById('dash-date-desde').value;
  const hasta = document.getElementById('dash-date-hasta').value;
  if (!desde && !hasta) return;
  filtroFechaDesdeDash = desde || null;
  filtroFechaHastaDash = hasta || null;
  dashboardCache.invalidate();
  renderDashboard();
  _saveUserConfig('filtro_fecha_desde_dash', filtroFechaDesdeDash || '');
  _saveUserConfig('filtro_fecha_hasta_dash', filtroFechaHastaDash || '');
}

function clearDashFechaRange() {
  onFiltroTiempoChange('todos', 'dash');
}

function onVentasFechaRangeChange() {
  const desde = document.getElementById('ventas-date-desde').value;
  const hasta = document.getElementById('ventas-date-hasta').value;
  if (!desde && !hasta) return;
  filtroFechaDesdeVentas = desde || null;
  filtroFechaHastaVentas = hasta || null;
  filteredCache.invalidate();
  renderVentas();
  _saveUserConfig('filtro_fecha_desde_ventas', filtroFechaDesdeVentas || '');
  _saveUserConfig('filtro_fecha_hasta_ventas', filtroFechaHastaVentas || '');
}

function clearVentasFechaRange() {
  onFiltroTiempoChange('todos', 'ventas');
}

async function _saveUserConfig(clave, valor) {
  if (!currentUser?.id) return;
  try {
    await db.from('user_config')
      .upsert({ usuario_id: currentUser.id, clave, valor }, { onConflict: 'usuario_id,clave' });
  } catch(e) {
    console.warn('Error guardando user_config:', e.message);
  }
}

async function _loadUserConfig() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await db.from('user_config')
      .select('clave, valor')
      .eq('usuario_id', currentUser.id);
    if (error || !data) return;

    for (const row of data) {
      if (row.clave === 'filtro_tiempo_dash') {
        filtroTiempoDash = row.valor;
        const el = document.getElementById('filtro-tiempo-dash');
        if (el) el.value = filtroTiempoDash;
        if (filtroTiempoDash === 'mes') {
          const mesLabel = document.getElementById('mes-actual-label');
          const mesSel = document.getElementById('filtro-mes-especifico');
          const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
          if (mesLabel) { mesLabel.textContent = meses[new Date().getMonth()]; mesLabel.style.display = ''; }
          if (mesSel) { _buildFiltroMesSelector(); mesSel.style.display = ''; }
        }
        if (filtroTiempoDash === 'personalizado') {
          const dateRangeWrap = document.getElementById('dash-date-range');
          if (dateRangeWrap) dateRangeWrap.style.display = 'flex';
        }
      }
      if (row.clave === 'filtro_tiempo_ventas') {
        filtroTiempoVentas = row.valor;
        const el = document.getElementById('filtro-tiempo-ventas');
        if (el) el.value = filtroTiempoVentas;
        if (filtroTiempoVentas === 'personalizado') {
          const dateRangeWrap = document.getElementById('ventas-date-range');
          if (dateRangeWrap) dateRangeWrap.style.display = 'flex';
        }
      }
      if (row.clave === 'filtro_tiempo') {
        if (!data.some(r => r.clave === 'filtro_tiempo_dash')) {
          filtroTiempoDash = 'mes';
          const el = document.getElementById('filtro-tiempo-dash');
          if (el) el.value = filtroTiempoDash;
          _saveUserConfig('filtro_tiempo_dash', 'mes');
        }
        if (!data.some(r => r.clave === 'filtro_tiempo_ventas')) {
          filtroTiempoVentas = 'mes';
          const el = document.getElementById('filtro-tiempo-ventas');
          if (el) el.value = filtroTiempoVentas;
          _saveUserConfig('filtro_tiempo_ventas', 'mes');
        }
      }
      if (row.clave === 'filtro_mes_custom') {
        const hoy = new Date();
        const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
        if (filtroTiempoDash === 'mes' && row.valor === mesActual) {
          window._filtroMesCustom = row.valor;
        }
      }
      if (row.clave === 'filtro_fecha_desde_dash' && row.valor) {
        filtroFechaDesdeDash = row.valor;
        const el = document.getElementById('dash-date-desde');
        if (el) el.value = row.valor;
      }
      if (row.clave === 'filtro_fecha_hasta_dash' && row.valor) {
        filtroFechaHastaDash = row.valor;
        const el = document.getElementById('dash-date-hasta');
        if (el) el.value = row.valor;
      }
      if (row.clave === 'filtro_fecha_desde_ventas' && row.valor) {
        filtroFechaDesdeVentas = row.valor;
        const el = document.getElementById('ventas-date-desde');
        if (el) el.value = row.valor;
      }
      if (row.clave === 'filtro_fecha_hasta_ventas' && row.valor) {
        filtroFechaHastaVentas = row.valor;
        const el = document.getElementById('ventas-date-hasta');
        if (el) el.value = row.valor;
      }
      if (row.clave === 'export_columnas') {
        _exportColumnasSeleccionadas = row.valor || null;
      }
      if (row.clave === 'export_columnas_clientes') {
        _exportColumnasSeleccionadasClientes = row.valor || null;
      }
      if (row.clave === 'filtro_estado_ventas' && row.valor) {
        _savedFiltroEstado = row.valor;
      }
      if (row.clave === 'filtro_producto_ventas' && row.valor) {
        _savedFiltroProducto = row.valor;
      }
      if (row.clave === 'filtro_ubicacion_ventas' && row.valor) {
        _savedFiltroUbicacion = row.valor;
      }
      if (row.clave === 'filtro_agente_ventas' && row.valor) {
        _savedFiltroAgente = row.valor;
      }
      if (row.clave === 'filtro_archivados_ventas') {
        mostrarArchivados = row.valor === 'true';
      }
      if (row.clave === 'filtro_estado_clientes' && row.valor) {
        _savedFiltroEstadoClientes = row.valor;
      }
    }
    dashboardCache.invalidate();
    filteredCache.invalidate();
  } catch(e) {
    console.warn('Error cargando user_config:', e.message);
  }
}

function _buildFiltroMesSelector() {
  const sel = document.getElementById('filtro-mes-especifico');
  if (!sel) return;
  sel.innerHTML = '';
  const hoy = new Date();
  const year = hoy.getFullYear();
  const meses = [
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ];
  meses.forEach((nombre, i) => {
    const valor = `${year}-${String(i+1).padStart(2,'0')}`;
    const o = document.createElement('option');
    o.value = valor;
    o.textContent = nombre;
    if (i === hoy.getMonth()) o.selected = true;
    sel.appendChild(o);
  });
  window._filtroMesCustom = `${year}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
}

// Catálogo de productos
async function loadProductos(soloActivos = false) {
  let query = db.from('productos').select('*').order('nombre');
  if (soloActivos) query = query.eq('activo', true);
  const { data, error } = await query;
  if (!error) allProductos = data || [];
}

let _cityFilterDirty = true;
function populateCityFilter() {
  if (!_cityFilterDirty) return;
  const sel = document.getElementById('filter-ubicacion');
  const current = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  const cities = [...new Set(ventas.map(v => v.cliente?.ubicacion).filter(c => c && c !== 's/c' && c !== ''))].sort();
  cities.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  sel.value = current;
  _cityFilterDirty = false;
}

function populateProductoFilter() {
  const sel = document.getElementById('filter-producto');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProductos.filter(p => p.activo).forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.nombre;
    sel.appendChild(o);
  });
}

// PRODUCTOS, vista admin CRUD
async function renderProductos() {
  const grid = document.getElementById('productos-grid');
  if (!grid) return;
  grid.innerHTML = allProductos.map(p => {
    const promos = p.promociones || [];
    return `
    <div class="user-card" style="${!p.activo ? 'opacity:0.55;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${p.nombre}</div>
          <div style="font-size:13px;color:var(--text2);margin-top:2px;">
            Precio base: <b style="color:var(--green);">Bs. ${parseFloat(p.precio_base).toFixed(2)}</b>
            ${!p.activo ? '<span style="color:var(--red);margin-left:8px;font-size:11px;">● Inactivo</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="icon-btn" onclick="openProductoModal(${p.id})">${_ic('pencil', 14)}</button>
          <button class="icon-btn danger" onclick="toggleProductoActivo(${p.id}, ${p.activo})">${p.activo ? _ic('ban', 14) : _ic('circle-check', 14)}</button>
          <button class="icon-btn danger" onclick="deleteProducto(${p.id})">${_ic('trash-2', 14)}</button>
        </div>
      </div>
      ${promos.length > 0 ? `
        <div style="font-size:11px;color:var(--text3);font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;">Promociones</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${promos.map(pr => `
            <span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">
              ${_ic('tag', 12, { style: 'vertical-align:-2px;' })} ${pr.etiqueta}
            </span>`).join('')}
        </div>` : `<div style="font-size:12px;color:var(--text3);">Sin promociones</div>`}
    </div>`;
  }).join('') || '<div class="empty-state"><div class="emoji">' + _ic('package', 40) + '</div><p>Sin productos</p></div>';
}

function openProductoModal(id) {
  document.getElementById('producto-modal').classList.add('open');
  document.getElementById('promos-editor').innerHTML = '';
  if (id) {
    const prod = allProductos.find(p => p.id === id);
    if (!prod) return;
    document.getElementById('producto-modal-title').textContent = 'Editar Producto';
    document.getElementById('edit-producto-id').value = id;
    document.getElementById('p-nombre').value         = prod.nombre;
    document.getElementById('p-precio-base').value    = prod.precio_base;
    document.getElementById('p-activo').value         = prod.activo ? 'true' : 'false';
    (prod.promociones || []).forEach(pr => addPromoRow(pr));
  } else {
    document.getElementById('producto-modal-title').textContent = 'Nuevo Producto';
    document.getElementById('edit-producto-id').value = '';
    document.getElementById('p-nombre').value         = '';
    document.getElementById('p-precio-base').value    = '';
    document.getElementById('p-activo').value         = 'true';
  }
}
function closeProductoModal() {
  document.getElementById('producto-modal').classList.remove('open');
}

function addPromoRow(data) {
  const wrap = document.getElementById('promos-editor');
  const div  = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:80px 1fr auto;gap:8px;align-items:center;';
  div.innerHTML = `
    <div>
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;margin-bottom:4px;text-transform:uppercase;">Cantidad</div>
      <input class="smart-input promo-cant" type="number" min="1" placeholder="2"
        value="${data?.cantidad || ''}" style="text-align:center;">
    </div>
    <div>
      <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;margin-bottom:4px;text-transform:uppercase;">Precio total (Bs.)</div>
      <input class="smart-input promo-precio" type="number" min="0" step="0.01" placeholder="270.00"
        value="${data?.precio_total || ''}">
    </div>
    <button type="button" onclick="this.parentElement.remove()"
      style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:6px 9px;color:var(--red);cursor:pointer;margin-top:16px;">${_ic('x', 14)}</button>`;
  wrap.appendChild(div);
}

async function saveProducto() {
  const id = document.getElementById('edit-producto-id').value;
  const nombre = document.getElementById('p-nombre').value.trim();
  const precioBase = parseFloat(document.getElementById('p-precio-base').value) || 0;
  const activo = document.getElementById('p-activo').value === 'true';
  if (!nombre) { toast(_ic('triangle-alert', 15) + ' El nombre es obligatorio', 'error'); return; }
  const rows = document.querySelectorAll('#promos-editor > div');
  const promociones = [];
  for (const row of rows) {
    const cant   = parseInt(row.querySelector('.promo-cant').value);
    const precio = parseFloat(row.querySelector('.promo-precio').value);
    if (cant > 0 && precio > 0) {
      promociones.push({ cantidad: cant, precio_total: precio, etiqueta: `x${cant} — Bs.${precio.toFixed(0)}` });
    }
  }
  const payload = { nombre, precio_base: precioBase, promociones, activo };
  try {
    if (id) {
      const { error } = await db.from('productos').update(payload).eq('id', parseInt(id));
      if (error) throw error;
      toast(_ic('circle-check', 15) + ' Producto actualizado', 'success');
    } else {
      const { error } = await db.from('productos').insert(payload);
      if (error) throw error;
      toast(_ic('circle-check', 15) + ' Producto creado', 'success');
    }
    closeProductoModal();
    // FIX #10 — recargar con soloActivos=false para mantener caché unificado
    await loadProductos(false);
    renderProductos();
    populateProductoFilter();
  } catch(e) { toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error'); }
}

function toggleProductoActivo(id, activo) {
  const prod = allProductos.find(p => p.id === id);
  if (!prod) return;

  const titulo = activo ? '¿Desactivar producto?' : '¿Activar producto?';
  const desc = activo
    ? 'quedará inactivo y no aparecerá al crear nuevos registros.'
    : 'volverá a estar disponible para nuevos registros.';

  document.getElementById('toggle-producto-modal-title').textContent = titulo;
  document.getElementById('toggle-producto-nombre').textContent = prod.nombre;
  document.getElementById('toggle-producto-accion-desc').textContent = ' ' + desc;
  document.getElementById('toggle-producto-warning').style.display = activo ? '' : 'none';

  const btn = document.getElementById('toggle-producto-confirm-btn');
  btn.innerHTML = (activo ? _ic('ban', 14) : _ic('circle-check', 14)) + (activo ? ' Desactivar' : ' Activar');
  btn.style.background = activo ? 'var(--red)' : 'var(--green)';

  document.getElementById('toggle-producto-modal').classList.add('open');

  btn.onclick = async () => {
    closeToggleProductoModal();
    const { error } = await db.from('productos').update({ activo: !activo }).eq('id', id);
    if (error) { toast(_ic('circle-x', 15) + ' ' + esc(error.message), 'error'); return; }
    prod.activo = !activo;
    _actualizarCardProducto(id, !activo);
    // FIX #5 — marcar filtro de ciudad como dirty no aplica aquí, pero
    // sí invalidar el filtro de productos del modal
    populateProductoFilter();
    toast(_ic('circle-check', 15) + ' Producto ' + (activo ? 'desactivado' : 'activado'), 'success');
  };
}

function closeToggleProductoModal() {
  document.getElementById('toggle-producto-modal').classList.remove('open');
}

function _actualizarCardProducto(id, nuevoActivo) {
  const btns = document.querySelectorAll('#productos-grid .icon-btn.danger');
  for (const btn of btns) {
    if (btn.getAttribute('onclick')?.includes(`toggleProductoActivo(${id},`)) {
      const card = btn.closest('.user-card');
      if (!card) break;
      card.style.transition = 'opacity 0.3s ease';
      card.style.opacity = nuevoActivo ? '1' : '0.55';
      const badgeInactivo = card.querySelector('span[style*="color:var(--red)"]');
      if (nuevoActivo && badgeInactivo) {
        badgeInactivo.remove();
      } else if (!nuevoActivo && !badgeInactivo) {
        const precioDiv = card.querySelector('div[style*="color:var(--green)"]')?.parentElement;
        if (precioDiv) {
          const span = document.createElement('span');
          span.style.cssText = 'color:var(--red);margin-left:8px;font-size:11px;';
          span.textContent = '● Inactivo';
          precioDiv.appendChild(span);
        }
      }
      btn.innerHTML = nuevoActivo ? _ic('ban', 14) : _ic('circle-check', 14);
      btn.setAttribute('onclick', `toggleProductoActivo(${id}, ${nuevoActivo})`);
      break;
    }
  }
}

async function loadVentas() {
  try {
    let allVentas = [];
    const BATCH = 1000;
    let from = 0;
    let keepGoing = true;
    let totalCount = 0;

    while (keepGoing) {
      let query = db.from('ventas')
        .select(`
          id, cliente_id, agente_id, fecha, updated_at, estado, intentos,
          notas, comprobante_url, recibo_url, archivado, monto_total, descuento_pct, recordatorio, recordatorio_visto,
          cliente:cliente_id ( id, celular, nombre, ubicacion, direccion_residencial,
                               producto_interes, notas, faltas, flag ),
          agente:agente_id   ( id, nombre ),
          venta_items ( id, cantidad, subtotal, producto_id, productos ( id, nombre ))
        `, from === 0 ? { count: 'exact' } : {})
        .order('archivado', { ascending: true })
        .order('id', { ascending: false })
        .range(from, from + BATCH - 1);

      if (currentUser.rol === 'agente') {
        query = query.eq('agente_id', currentUser.id);
      } else if (currentUser.rol === 'admin' && selectedAgentId !== 'all') {
        query = query.eq('agente_id', selectedAgentId);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      if (from === 0 && count) totalCount = count;
      if (!data || data.length === 0) {
        keepGoing = false;
      } else {
        allVentas = allVentas.concat(data);
        if (data.length < BATCH) keepGoing = false;
        else from += BATCH;
      }
    }

    ventas = allVentas;
    totalVentasCount = totalCount;

    ventasIndex = {};
    ventas.forEach(v => ventasIndex[v.id] = v);
    dashboardCache.invalidate();
    filteredCache.invalidate();
    _cityFilterDirty = true;
    _clientesFielesCache = null;

  } catch(e) {
    toast(_ic('circle-x', 15) + ' Error: ' + esc(e.message), 'error');
    ventas = [];
    ventasIndex = {};
    totalVentasCount = 0;
  }
}

async function loadAgents() {
  const { data, error } = await db.from('usuarios')
    .select('id, nombre, rol').eq('activo', true).order('nombre');
  if (!error) allAgents = data || [];
}

function buildAgentSelector() {
  const wrap = document.getElementById('agent-selector-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <select class="filter-select" id="agent-selector" onchange="onAgentFilterChange()"
      style="background:var(--surface2);border-color:var(--accent);color:var(--accent2);">
      <option value="all">Todos los agentes</option>
      ${allAgents.filter(a => a.rol === 'agente').map(a =>
        `<option value="${a.id}">${a.nombre}</option>`
      ).join('')}
    </select>`;
  const sel = document.getElementById('filter-agente');
  if (sel) {
    sel.style.display = currentUser.rol === 'admin' ? '' : 'none';
    while (sel.options.length > 1) sel.remove(1);
    allAgents.filter(a => a.rol === 'agente').forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = a.nombre;
      sel.appendChild(o);
    });
  }
}

async function onAgentFilterChange() {
  selectedAgentId = document.getElementById('agent-selector').value;
  await loadVentas();
  renderDashboard();
  renderVentas();
}

function onFilterStatusChange() {
  const val = getCSelectValue('filter-status');
  _saveUserConfig('filtro_estado_ventas', val);
  renderVentas();
}
function onFilterProductoChange() {
  const val = document.getElementById('filter-producto').value;
  _saveUserConfig('filtro_producto_ventas', val);
  renderVentas();
}
function onFilterUbicacionChange() {
  const val = document.getElementById('filter-ubicacion').value;
  _saveUserConfig('filtro_ubicacion_ventas', val);
  renderVentas();
}
function onFilterAgenteChange() {
  const val = document.getElementById('filter-agente').value;
  _saveUserConfig('filtro_agente_ventas', val);
  renderVentas();
}
function onClientesFilterEstadoChange() {
  const val = getCSelectValue('clientes-filter-estado');
  _saveUserConfig('filtro_estado_clientes', val);
  ClientesView.render();
}

async function onFiltroTiempoChange(valor, source) {
  if (source === 'dash') {
    filtroTiempoDash = valor;
    const dateRangeWrap = document.getElementById('dash-date-range');

    if (valor === 'personalizado') {
      if (dateRangeWrap) dateRangeWrap.style.display = 'flex';
    } else {
      if (dateRangeWrap) dateRangeWrap.style.display = 'none';
      filtroFechaDesdeDash = null;
      filtroFechaHastaDash = null;
      const desdeEl = document.getElementById('dash-date-desde');
      const hastaEl = document.getElementById('dash-date-hasta');
      if (desdeEl) desdeEl.value = '';
      if (hastaEl) hastaEl.value = '';
    }
  } else {
    filtroTiempoVentas = valor;
    const dateRangeWrap = document.getElementById('ventas-date-range');

    if (valor === 'personalizado') {
      if (dateRangeWrap) dateRangeWrap.style.display = 'flex';
    } else {
      if (dateRangeWrap) dateRangeWrap.style.display = 'none';
      filtroFechaDesdeVentas = null;
      filtroFechaHastaVentas = null;
      const desdeEl = document.getElementById('ventas-date-desde');
      const hastaEl = document.getElementById('ventas-date-hasta');
      if (desdeEl) desdeEl.value = '';
      if (hastaEl) hastaEl.value = '';
    }
  }

  const mesLabel = document.getElementById('mes-actual-label');
  const mesSel = document.getElementById('filtro-mes-especifico');

  if (valor === 'mes' && source === 'dash') {
    const hoy = new Date();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if (mesLabel) { mesLabel.textContent = meses[hoy.getMonth()]; mesLabel.style.display = ''; }
    if (mesSel) { _buildFiltroMesSelector(); mesSel.style.display = ''; }
  } else {
    if (source === 'dash') {
      if (mesLabel) mesLabel.style.display = 'none';
      if (mesSel) mesSel.style.display = 'none';
      window._filtroMesCustom = null;
    }
  }

  dashboardCache.invalidate();
  filteredCache.invalidate();
  if (source === 'dash') {
    const elDash = document.getElementById('filtro-tiempo-dash');
    if (elDash && elDash.value !== valor) elDash.value = valor;
    await _saveUserConfig('filtro_tiempo_dash', valor);
  } else {
    const elVentas = document.getElementById('filtro-tiempo-ventas');
    if (elVentas && elVentas.value !== valor) elVentas.value = valor;
    await _saveUserConfig('filtro_tiempo_ventas', valor);
  }

  if (source === 'dash') renderDashboard();
  if (source === 'ventas') renderVentas();
}

let _syncing = false;
async function syncData() {
  if (_syncing) return;
  _syncing = true;
  const btn = document.getElementById('sync-btn');
  btn.classList.add('syncing');
  try {
    await Promise.all([loadProductos(false), loadVentas()]);
    _roscaAnualCache = null;    
    _clientesFielesCache = null; 
    renderDashboard();
    renderVentas();
    Objetivos.render();
    populateProductoFilter();
    _usersCache = null;
    toast(_ic('circle-check', 15) + ' Datos actualizados', 'success');
    ClientesView.invalidate();
    if (document.getElementById('view-clientes')?.classList.contains('active')) {
      ClientesView.load();
    }
  } finally {
    btn.classList.remove('syncing');
    _syncing = false;
  }
  if (Inventario?.loadStockData) await Inventario.loadStockData();
  _checkStockAlerts();
}

// NAV
function showView(name, evt) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  const target = evt?.target || window.event?.target;
  if (target) target.classList.add('active');
  if (name === 'nuevo-registro') { showNuevoRegistro(); return; }
  if (name === 'ventas') renderVentas();
  if (name === 'clientes') ClientesView.load();
  if (name === 'dashboard') renderDashboard();
  if (name === 'usuarios') renderUsers();
  if (name === 'memorias') renderMemorias();
  if (name === 'productos') renderProductos();
  if (name === 'guia') renderGuia();
  if (name === 'inventario') Inventario.render();
  if (name === 'almacen') Almacen.render();
  if (name === 'config' && currentUser.rol === 'admin') { loadConfigVendidosEditables(); loadConfigEmpresa(); }
}

function showViewDirect(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
  if (name === 'inventario') Inventario.render();
  if (name === 'almacen') Almacen.render();
}

// STATUS / BADGE HELPERS
function statusBadge(estado) {
  const e = ESTADOS[estado] || ESTADOS.rellamada;
  return `<span class="badge ${e.badge}">${_ic(e.icon, 12)} ${e.label}</span>`;
}
function flagBadge(cliente) {
  if (!cliente) return '';
  if (cliente.flag === 'spam') return `<span class="badge badge-spam" title="SPAM: ${cliente.faltas} cancelaciones">${_ic('ban', 12)} SPAM</span>`;
  if (cliente.faltas >= 1) return `<span class="badge badge-cancelado" title="${cliente.faltas} cancelación(es)">${_ic('triangle-alert', 12)} ${cliente.faltas} falta${cliente.faltas > 1 ? 's' : ''}</span>`;
  return '';
}
function prodChip(nombre) {
  if (!nombre) return '';
  const nl = nombre.toLowerCase();
  if (nl.includes('calibr')) return `<span class="prod-chip prod-calibrum">${nombre}</span>`;
  if (nl.includes('colag')) return `<span class="prod-chip prod-colageno">${nombre}</span>`;
  if (nl.includes('osteo')) return `<span class="prod-chip prod-osteofor">${nombre}</span>`;
  if (nl.includes('alivia') || nl.includes('aliviah')) return `<span class="prod-chip prod-alivia">${nombre}</span>`;
  return `<span class="prod-chip">${nombre}</span>`;
}
function montoChip(monto) {
  if (!monto && monto !== 0) return '';
  return `<span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">Bs.${parseFloat(monto).toFixed(2)}</span>`;
}

function renderDashboard() {
  const isAdmin = currentUser.rol === 'admin';
  const showingAll = selectedAgentId === 'all';
  if (dashboardCache.isDirty || dashboardCache.lastIsAdmin !== isAdmin || dashboardCache.lastShowingAll !== showingAll) {
    dashboardCache.lastIsAdmin = isAdmin;
    dashboardCache.lastShowingAll = showingAll;
  }

  
  document.getElementById('dash-periodo').textContent = describeFiltroTiempo('dash');
  document.getElementById('dashboard-agent-row').style.display = isAdmin ? 'flex' : 'none';

  const ventasFiltradas = ventas.filter(v => ventasEnFiltroTiempo(v, 'dash'));
  const total = ventasFiltradas.length;
  const vendidos = ventasFiltradas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0);
  const montoVendidos = ventasFiltradas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (parseFloat(v.monto_total) || 0), 0);
  const interesados = ventasFiltradas.filter(v => v.estado === 'interesado').length;
  const seguimiento = ventasFiltradas.filter(v => v.estado === 'seguimiento').length;
  const sinResp = ventasFiltradas.filter(v => v.estado === 'sin_respuesta').length;

  // — Batch DOM updates (1 reflow en vez de 8+) —
  const dashWrap = document.getElementById('view-dashboard')?.querySelector('.view-scroll-wrap');
  if (dashWrap) dashWrap.style.display = 'none';

  // Llenar card Stock (lista con colores aleatorios estables por producto)
  const stockPaleta = ['#f43f5e', '#f97316', '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];
  const stockColor = (nombre) => {
    let h = 0;
    for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return stockPaleta[Math.abs(h) % stockPaleta.length];
  };
  const stockList = (Inventario?.getAllStock?.() || []);
  document.getElementById('dash-stock-count').textContent = `(${stockList.length})`;
  document.getElementById('dash-stock-list').innerHTML = stockList.length === 0
    ? '<div style="color:var(--text3);font-size:13px;padding:8px;">Sin stock configurado</div>'
    : stockList.map(p => {
        const color = stockColor(p.productName);
        const ini = (p.productName || '?')[0].toUpperCase();
        return `
      <div class="stock-row">
        <span class="stock-dot" style="background:${color}1c;color:${color};">${ini}</span>
        <span class="stock-row-name">${p.productName}</span>
        <span class="stock-row-qty" style="color:${color};">${p.stockActual}</span>
      </div>`;
      }).join('');

  // Llenar card Interesados
  const interesadosList = ventasFiltradas.filter(v => v.estado === 'interesado');
  document.getElementById('dash-interesados-count').textContent = `(${interesadosList.length})`;
  document.getElementById('dash-interesados-list').innerHTML = interesadosList.length === 0
    ? '<div style="color:var(--text3);font-size:13px;padding:8px;">Sin interesados en este período</div>'
    : interesadosList.map(v => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(16,185,129,0.15);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">${v.cliente?.nombre || 's/n'}</div>
          <div style="font-size:11px;color:var(--accent2);">${v.cliente?.celular || ''}</div>
        </div>
        <div style="font-size:11px;text-align:right;flex-shrink:0;">
          ${(v.venta_items||[]).map(it=>it.productos?.nombre).filter(Boolean).map(n=>`<span class="prod-chip" style="font-size:10px;">${n}</span>`).join(' ')}
        </div>
      </div>`).join('');

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:var(--accent-glow);">${_ic('clipboard-list', 22)}</div>
      <div class="stat-value" style="color:var(--accent2);">${total}</div><div class="stat-label">MOVIMIENTOS</div></div>

    <div class="stat-card" onclick="openStatModal('vendido')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--green-bg);">${_ic('circle-check', 22)}</div>
      <div class="stat-value" style="color:var(--green);">${vendidos}</div>
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px;">Bs. ${montoVendidos.toFixed(0)}</div>
      <div class="stat-label">UNIDADES VENDIDAS</div>
    </div>

    <div class="stat-card" onclick="openStatModal('seguimiento')" style="cursor:pointer;">
      <div class="stat-icon" style="background:rgba(96,165,250,0.12);">${_ic('refresh-cw', 22)}</div>
      <div class="stat-value" style="color:var(--blue);">${seguimiento}</div>
      <div class="stat-label">EN SEGUIMIENTO</div>
    </div>

    <div class="stat-card" onclick="openStatModal('sin_respuesta')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--red-bg);">${_ic('phone-off', 22)}</div>
      <div class="stat-value" style="color:var(--red);">${sinResp}</div><div class="stat-label">SIN RESPUESTA</div>
    </div>
  `;

  if (!dashboardCache.isValid(ventasFiltradas.length, selectedAgentId) || dashboardCache.isDirty) {
    dashboardCache.prods = {};
    dashboardCache.cities = {};
    dashboardCache.sCounts = {};

    ventasFiltradas.forEach(v => {
      (v.venta_items || []).forEach(it => {
        const nombre = it.productos?.nombre || 'Sin producto';
        dashboardCache.prods[nombre] = (dashboardCache.prods[nombre] || 0) + 1;
      });
    });

    ventasFiltradas.forEach(v => {
      const c = v.cliente?.ubicacion;
      if (c && c !== 's/c' && c !== '') dashboardCache.cities[c] = (dashboardCache.cities[c] || 0) + 1;
    });

    Object.keys(ESTADOS).forEach(k => {
      dashboardCache.sCounts[k] = ventasFiltradas.filter(v => v.estado === k).length;
    });

    dashboardCache.lastVentasCount = ventasFiltradas.length;
    dashboardCache.lastAgentId = selectedAgentId;
    dashboardCache.isDirty = false;
  }

  const prods = dashboardCache.prods;
  const maxP = Math.max(...Object.values(prods), 1);
  const salesHtml = Object.entries(prods)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `
    <div class="bar-row"><div class="bar-label">${k}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v/maxP*100).toFixed(0)}%;background:var(--accent)"></div></div>
    <div class="bar-count">${v}</div></div>`).join('')
    || '<p style="color:var(--text3);font-size:13px;">Sin datos</p>';
  document.getElementById('prod-chart').innerHTML = `<div class="prod-chart-sales">${salesHtml}</div>`;
  const prodCard = document.getElementById('prod-chart').closest('.dash-card');
  if (prodCard) prodCard.classList.add('dash-card-prod');

  const sCounts = dashboardCache.sCounts;
  const maxS = Math.max(...Object.values(sCounts), 1);
  document.getElementById('status-chart').innerHTML = Object.entries(ESTADOS).map(([k, e]) => `
    <div class="bar-row"><div class="bar-label" style="color:${e.color}">${e.label}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(sCounts[k]/maxS*100).toFixed(0)}%;background:${e.color}"></div></div>
    <div class="bar-count">${sCounts[k]}</div></div>`).join('');

  const cities = dashboardCache.cities;
  const sortedC = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxC = sortedC[0]?.[1] || 1;
  document.getElementById('city-chart').innerHTML = sortedC.map(([k, v]) => `
    <div class="bar-row"><div class="bar-label">${k}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v/maxC*100).toFixed(0)}%;background:var(--blue)"></div></div>
    <div class="bar-count">${v}</div></div>`).join('')
    || '<p style="color:var(--text3);font-size:13px;">Sin datos</p>';

  const pending = ventasFiltradas.filter(v => ['seguimiento', 'rellamada', 'interesado', 'agendar'].includes(v.estado)).slice(0, 10);
  document.getElementById('today-list').innerHTML = pending.length === 0
    ? '<div class="empty-state"><div class="emoji">' + _ic('party-popper', 36) + '</div><p>Sin pendientes</p></div>'
    : pending.map(v => `
    <div class="today-item">
      <div class="today-avatar">${(v.cliente?.nombre || '?')[0].toUpperCase()}</div>
      <div class="today-info">
        <div class="today-detail" style="margin-bottom:2px;">
          <a href="tel:${v.cliente?.celular}" style="color:var(--accent2);text-decoration:none;font-weight:600;font-size:13px;">${v.cliente?.celular || ''}</a>
          ${isAdmin && showingAll ? `<span style="font-size:10px;color:var(--accent2);background:var(--accent-glow);padding:1px 6px;border-radius:4px;margin-left:4px;">${v.agente?.nombre || ''}</span>` : ''}
        </div>
        <div class="today-name" style="font-size:12px;color:var(--text2);">${v.cliente?.nombre || 's/n'}</div>
        <div class="today-detail">${v.notas || ''}  ${statusBadge(v.estado)}</div>
      </div>
    </div>`).join('');

  if (isAdmin && showingAll && allAgents.length > 0) {
    const agStats = allAgents.filter(a => a.rol === 'agente').map(ag => {
      const av = ventasFiltradas.filter(v => v.agente_id === ag.id);
      const ventasVendidas = av.filter(v => v.estado === 'vendido');
      return {
        nombre: ag.nombre,
        total: av.length,
        vendidos: ventasVendidas.length,
        unidades: ventasVendidas.reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0),
        interesados: av.filter(v => v.estado === 'interesado').length,
      };
    });
    if (!window._agentMetric) window._agentMetric = 'unidades';

    const metricConfig = {
      registros: { key: 'total', label: 'Registros', color: 'var(--accent)' },
      vendidos: { key: 'vendidos', label: 'Vendidos', color: 'var(--green)' },
      unidades: { key: 'unidades', label: 'Unidades', color: 'var(--blue)' },
      interesados: { key: 'interesados', label: 'Interesados', color: 'var(--yellow)' },
    };

    const metric = metricConfig[window._agentMetric];
    const maxT = Math.max(...agStats.map(a => a[metric.key]), 1);

    const btns = Object.entries(metricConfig).map(([k, m]) => {
      const active = k === window._agentMetric;
      return `<button onclick="window._agentMetric='${k}';renderDashboard()"
        style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
              border:1px solid ${active ? m.color : 'var(--border)'};
              background:${active ? m.color : 'var(--surface2)'};
              color:${active ? (k==='interesados'?'#1a1a00':'white') : 'var(--text2)'};
              transition:all 0.2s;">
        ${m.label}
      </button>`;
    }).join('');

    document.getElementById('agents-chart').innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
        ${btns}
      </div>
      ${agStats.map(a => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;align-items:center;">
            <span style="font-size:13px;font-weight:600;">${a.nombre}</span>
            <span style="font-size:12px;color:${metric.color};font-weight:700;">${a[metric.key]} ${metric.label}</span>
          </div>
          <div class="bar-track" style="height:10px;">
            <div class="bar-fill" style="width:${(a[metric.key]/maxT*100).toFixed(0)}%;background:${metric.color};transition:width 0.4s ease;"></div>
          </div>
        </div>`).join('')}
    `;
    document.getElementById('agents-card').style.display = '';
  } else {
    document.getElementById('agents-card').style.display = 'none';
  }
  renderClientesFieles();
  renderRoscaAnual();
  if (dashWrap) dashWrap.style.display = '';
}

// VENTAS — lista + filtros

// FIX #6 — getFiltered con memoización por inputs
function getFiltered() {
  const search    = document.getElementById('search-input').value.toLowerCase();
  const status    = getCSelectValue('filter-status');
  const prodId    = document.getElementById('filter-producto').value;
  const ubicacion = document.getElementById('filter-ubicacion').value;
  const agente    = currentUser.rol === 'admin' ? (document.getElementById('filter-agente')?.value || '') : '';
  const mesCustom = window._filtroMesCustom || null;

  // Comparar con valores cacheados
  if (
    filteredCache.result !== null &&
    filteredCache._search    === search &&
    filteredCache._status    === status &&
    filteredCache._prodId    === prodId &&
    filteredCache._ubicacion === ubicacion &&
    filteredCache._agente    === agente &&
    filteredCache._tiempo    === filtroTiempoVentas &&
    filteredCache._archivado === mostrarArchivados &&
    filteredCache._mesCustom === mesCustom &&
    filteredCache._fechaDesde === filtroFechaDesdeVentas &&
    filteredCache._fechaHasta === filtroFechaHastaVentas
  ) {
    return filteredCache.result;
  }

  const result = ventas.filter(v => {
    if (!!v.archivado !== mostrarArchivados) return false;
    if (!ventasEnFiltroTiempo(v, 'ventas')) return false;
    if (status && v.estado !== status) return false;
    if (prodId && !(v.venta_items || []).some(it => it.producto_id == prodId)) return false;
    if (ubicacion && !(v.cliente?.ubicacion || '').toLowerCase().includes(ubicacion.toLowerCase())) return false;
    if (agente && v.agente_id !== agente) return false;
    if (search) {
      const nombre    = v.cliente?.nombre || '';
      const cel       = v.cliente?.celular || '';
      const prodNames = (v.venta_items || []).map(it => it.productos?.nombre || '').join(' ');
      const haystack  = `${nombre} ${cel} ${prodNames} ${v.cliente?.ubicacion || ''} ${v.notas || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  // Guardar en caché
  filteredCache.result    = result;
  filteredCache._search    = search;
  filteredCache._status    = status;
  filteredCache._prodId    = prodId;
  filteredCache._ubicacion = ubicacion;
  filteredCache._agente    = agente;
  filteredCache._tiempo    = filtroTiempoVentas;
  filteredCache._archivado = mostrarArchivados;
  filteredCache._mesCustom = mesCustom;
  filteredCache._fechaDesde = filtroFechaDesdeVentas;
  filteredCache._fechaHasta = filtroFechaHastaVentas;

  return result;
}

function renderVentas() {
  populateCityFilter();
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = 1;
  const page = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const isAdmin = currentUser?.rol === 'admin';

  document.getElementById('ventas-count').textContent =
    `${total} ${mostrarArchivados ? 'archivados' : 'activos'} encontrados`;
  const totalUnidades = filtered.reduce(
    (sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0
  );
  document.getElementById('table-count').textContent =
    `${total} registros · ${totalUnidades} unidades`;

  // Fragment para un solo reflow
  const tbody = document.getElementById('ventas-tbody');
  const fragment = document.createDocumentFragment();

  if (page.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="10" style="text-align:center;padding:40px;color:var(--text2);">Sin resultados</td>';
    fragment.appendChild(tr);
  } else {
    for (const v of page) {
      const prodNombres = (v.venta_items || []).map(it => it.productos?.nombre).filter(Boolean);
      const prodCell = prodNombres.length > 0
        ? prodNombres.map(n => prodChip(n)).join(' ')
        : '<span style="color:var(--text3);font-size:12px;">—</span>';
      const ubicacion = v.cliente?.ubicacion || '';

      const tr = document.createElement('tr');
      tr.dataset.ventaId = v.id;
      if (v.archivado) tr.style.opacity = '0.6';

      tr.innerHTML = `
        <td style="color:var(--text2);font-size:12px;">${v.fecha || ''}${v.archivado ? ' ' + _ic('lock', 10) : ''}</td>
        <td class="td-name">${v.cliente?.nombre || '<span style="color:var(--text3)">s/n</span>'} ${flagBadge(v.cliente)}</td>
        <td class="td-phone">
          ${v.cliente?.celular || ''}
        </td>
        <td>${prodCell}</td>
        <td>${v.monto_total ? montoChip(v.monto_total) : ''}</td>
        <td style="max-width:160px;white-space:normal;word-break:break-word;font-size:13px;color:var(--text2);">${ubicacion}</td>
        <td>${statusBadge(v.estado)}${v.estado === 'rellamada' && v.intentos > 1 ? `<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>` : ''}${v.estado === 'sin_respuesta' && v.intentos > 1 ? `<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>` : ''}</td>
        <td style="min-width:280px;max-width:260px;overflow:hidden;white-space:normal;color:var(--text2);font-size:12px;" title="${v.notas || ''}">${v.notas || ''}${v.comprobante_url ? ` <a href="${v.comprobante_url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent2);">${_ic('paperclip', 12)}</a>` : ''}</td>
        <td style="font-size:11px;color:var(--text3);white-space:nowrap;">
          ${v.updated_at ? new Date(v.updated_at).toLocaleDateString('es-BO', 
            {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}
        </td>
        ${isAdmin ? `<td style="font-size:11px;color:var(--accent2);">${v.agente?.nombre || '—'}</td>` : ''}`;
      fragment.appendChild(tr);
    }
  }

  tbody.replaceChildren(fragment);
  document.getElementById('th-agente').style.display = isAdmin ? '' : 'none';
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1)
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    else if (Math.abs(i - currentPage) === 2)
      html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
  document.getElementById('pagination').innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  renderVentas();
  document.getElementById('view-ventas').scrollTo({ top: 0, behavior: 'instant' });
}

function setArchivoFiltro(archivado) {
  mostrarArchivados = archivado;
  currentPage = 1;
  filteredCache.invalidate(); // FIX #6
  _saveUserConfig('filtro_archivados_ventas', archivado ? 'true' : '');
  document.getElementById('tab-activos').classList.toggle('archivo-tab-active', !archivado);
  document.getElementById('tab-archivados').classList.toggle('archivo-tab-active', archivado);

  const activos = ['rellamada', 'seguimiento', 'interesado', 'agendar', 'sin_respuesta', 'enviado'];
  const archivados = ['vendido', 'no_interesado', 'cancelado', 'spam'];
  const opciones = archivado ? archivados : activos;
  _buildCSelect('filter-status',
    [{ value: '', label: 'Todos los estados' }].concat(opciones.map(v => ({ value: v, label: ESTADOS[v].label, icon: ESTADOS[v].icon }))),
    onFilterStatusChange);
  setCSelectValue('filter-status', '');

  renderVentas();
}

// ELIMINAR USUARIO
function deleteUser(id) {
  db.from('usuarios').select('*').eq('id', id).single().then(({ data: u }) => {
    if (!u) return;
    if (u.usuario === 'admin') { toast(_ic('triangle-alert', 15) + ' No se puede eliminar el administrador principal', 'error'); return; }
    document.getElementById('delete-user-nombre').textContent = u.nombre;
    document.getElementById('delete-user-confirm-input').value = '';
    document.getElementById('delete-user-confirm-input').style.borderColor = '';
    document.getElementById('delete-user-error').style.display = 'none';
    document.getElementById('delete-user-warning').style.display = 'none';
    document.getElementById('delete-user-inv-warning').style.display = 'none';
    document.getElementById('delete-user-modal').classList.add('open');
    document.getElementById('delete-user-confirm-input').focus();

    Promise.all([
      db.from('inventario_movimientos').select('*', { count: 'exact', head: true }).eq('usuario_id', u.id),
      db.from('inventario_stock').select('*', { count: 'exact', head: true }).eq('usuario_id', u.id)
    ]).then(([movRes, stockRes]) => {
      if ((movRes.count || 0) + (stockRes.count || 0) > 0) {
        document.getElementById('delete-user-inv-warning').style.display = '';
      }
    });

    document.getElementById('delete-user-confirm-btn').onclick = async () => {
      const typed = document.getElementById('delete-user-confirm-input').value.trim();
      if (typed !== u.nombre) {
        document.getElementById('delete-user-confirm-input').style.borderColor = 'var(--red)';
        document.getElementById('delete-user-error').style.display = '';
        return;
      }

      const { count, error: countError } = await db.from('ventas')
        .select('*', { count: 'exact', head: true })
        .eq('agente_id', u.id);

      if (count > 0) {
        document.getElementById('delete-user-confirm-input').style.borderColor = 'var(--yellow)';
        document.getElementById('delete-user-error').style.display = 'none';
        document.getElementById('delete-user-warning').style.display = '';
        return;
      }

      document.getElementById('delete-user-modal').classList.remove('open');
      try {
        const { error } = await db.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        toast(_ic('trash-2', 15) + ' Usuario eliminado');
        _usersCache = null;
        renderUsers();
        await loadAgents();
        buildAgentSelector();
    } catch(e) { toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error'); }
    };
  });
}

function closeDeleteUserModal() {
  document.getElementById('delete-user-modal').classList.remove('open');
}

// ELIMINAR PRODUCTO
function deleteProducto(id) {
  const prod = allProductos.find(p => p.id === id);
  if (!prod) return;
  document.getElementById('delete-producto-nombre').textContent = prod.nombre;
  document.getElementById('delete-producto-confirm-input').value = '';
  document.getElementById('delete-producto-confirm-input').style.borderColor = '';
  document.getElementById('delete-producto-error').style.display = 'none';
  document.getElementById('delete-producto-warning').style.display = 'none';
  document.getElementById('delete-producto-modal').classList.add('open');
  document.getElementById('delete-producto-confirm-input').focus();

  document.getElementById('delete-producto-confirm-btn').onclick = async () => {
    const typed = document.getElementById('delete-producto-confirm-input').value.trim();
    if (typed !== prod.nombre) {
      document.getElementById('delete-producto-confirm-input').style.borderColor = 'var(--red)';
      document.getElementById('delete-producto-error').style.display = '';
      return;
    }
    const { count } = await db.from('venta_items')
      .select('*', { count: 'exact', head: true })
      .eq('producto_id', id);

    if (count > 0) {
      document.getElementById('delete-producto-confirm-input').style.borderColor = 'var(--yellow)';
      document.getElementById('delete-producto-warning').style.display = '';
      return;
    }
    document.getElementById('delete-producto-modal').classList.remove('open');
    try {
      const { error } = await db.from('productos').delete().eq('id', id);
      if (error) throw error;
      toast(_ic('trash-2', 15) + ' Producto eliminado');
      // FIX #10 — mantener carga unificada
      await loadProductos(false);
      renderProductos();
      populateProductoFilter();
    } catch(e) {
      const raw = (e && (e.message || e.details)) || '';
      const esFK = e && (e.code === '23503' || /violates foreign key constraint/i.test(raw));
      if (esFK) {
        toast(_ic('circle-x', 15) + ' No se puede eliminar: el producto ya tiene movimientos o transacciones registradas', 'error');
      } else {
        toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error');
      }
    }
  };
}
function closeDeleteProductoModal() {
  document.getElementById('delete-producto-modal').classList.remove('open');
}

// ELIMINAR VENTA
function deleteVenta(id) {
  const v = ventas.find(x => x.id === id);
  const celular = v?.cliente?.celular || '';
  const nombre = v?.cliente?.nombre || 's/n';
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
      const vent = ventas.find(x => x.id === id);
      const clienteId = vent?.cliente_id;
      const { error } = await db.from('ventas').delete().eq('id', id);
      if (error) throw error;
      if (clienteId) {
        const { count: faltas } = await db.from('ventas').select('*', { count: 'exact', head: true }).eq('cliente_id', clienteId).in('estado', ['cancelado', 'spam']);
        const { count: spamCount } = await db.from('ventas').select('*', { count: 'exact', head: true }).eq('cliente_id', clienteId).eq('estado', 'spam');
        await db.from('clientes').update({
          faltas: faltas || 0,
          flag: (spamCount || 0) > 0 ? 'spam' : 'normal',
        }).eq('id', clienteId);
      }
      ventas = ventas.filter(v => v.id !== id);
      delete ventasIndex[id];
      dashboardCache.invalidate();
      filteredCache.invalidate(); // FIX #6
      _cityFilterDirty = true;   // FIX #5
      toast(_ic('trash-2', 15) + ' Registro eliminado');
      renderVentas();
      renderDashboard();
    } catch(e) { toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error'); }
  };
}
function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('open'); }

document.addEventListener('click', e => {
  if (!e.target.closest('.smart-input-row'))
    document.querySelectorAll('.dropdown-list').forEach(d => d.style.display = 'none');
});

// USUARIOS — FIX #9: caché para evitar SELECT en cada visita a la pestaña
let _usersCache = null;

async function renderUsers() {
  // FIX #9 — usar caché; solo hacer SELECT si no hay datos o fueron invalidados
  if (!_usersCache) {
    const { data, error } = await db.from('usuarios').select('*').order('nombre');
    if (error) { toast(_ic('circle-x', 15) + ' Error cargando usuarios', 'error'); return; }
    _usersCache = data || [];
  }
  const data = _usersCache;
  document.getElementById('users-grid').innerHTML = data.map(u => `
    <div class="user-card" style="${!u.activo ? 'opacity:0.5;' : ''}">
      <div class="user-card-header">
        <div class="user-card-avatar">${u.nombre[0].toUpperCase()}</div>
        <div>
          <div class="user-card-name">${u.nombre}${!u.activo ? ' <span style="color:var(--red);font-size:11px;">(inactivo)</span>' : ''}</div>
          <div class="user-card-role">@${u.usuario} · <span style="color:${u.rol === 'admin' ? 'var(--accent2)' : 'var(--green)'}">${u.rol}</span></div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="icon-btn" onclick="openUserModal('${u.id}')">${_ic('pencil', 13)} Editar</button>
        ${u.usuario !== 'admin' ? `
          <button class="icon-btn danger" onclick="toggleUserActive('${u.id}',${u.activo})">${u.activo ? _ic('ban', 13) : _ic('circle-check', 13)} ${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="icon-btn danger" onclick="deleteUser('${u.id}')">${_ic('trash-2', 14)}</button>
        ` : ''}
      </div>
    </div>`).join('');
}

async function toggleUserActive(id, active) {
  if (!confirm(`¿${active ? 'desactivar' : 'activar'} este usuario?`)) return;
  const { error } = await db.from('usuarios').update({ activo: !active }).eq('id', id);
  if (error) toast(_ic('circle-x', 15) + ' ' + esc(error.message), 'error');
  else {
    toast(_ic('circle-check', 15) + ' Usuario ' + (active ? 'desactivado' : 'activado'));
    _usersCache = null; // FIX #9 — invalidar caché al modificar
    renderUsers();
    await loadAgents();
    buildAgentSelector();
  }
}

function openUserModal(id) {
  document.getElementById('user-modal').classList.add('open');
  if (id) {
    // FIX #9 — leer del caché si está disponible
    const fromCache = _usersCache?.find(u => u.id === id);
    if (fromCache) {
      document.getElementById('user-modal-title').textContent = 'Editar Usuario';
      document.getElementById('edit-user-id').value = fromCache.id;
      document.getElementById('u-nombre').value = fromCache.nombre;
      document.getElementById('u-user').value = fromCache.usuario;
      document.getElementById('u-pass').value = fromCache.password;
      document.getElementById('u-rol').value = fromCache.rol;
    } else {
      db.from('usuarios').select('*').eq('id', id).single().then(({ data }) => {
        if (!data) return;
        document.getElementById('user-modal-title').textContent = 'Editar Usuario';
        document.getElementById('edit-user-id').value = data.id;
        document.getElementById('u-nombre').value = data.nombre;
        document.getElementById('u-user').value = data.usuario;
        document.getElementById('u-pass').value = data.password;
        document.getElementById('u-rol').value = data.rol;
      });
    }
  } else {
    document.getElementById('user-modal-title').textContent = 'Nuevo Agente';
    ['edit-user-id', 'u-nombre', 'u-user', 'u-pass'].forEach(fid => document.getElementById(fid).value = '');
    document.getElementById('u-rol').value = 'agente';
  }
}

function closeUserModal() { document.getElementById('user-modal').classList.remove('open'); }

async function saveUser() {
  const id = document.getElementById('edit-user-id').value;
  const data = {
    nombre: document.getElementById('u-nombre').value.trim(),
    usuario: document.getElementById('u-user').value.trim(),
    password: document.getElementById('u-pass').value,
    rol: document.getElementById('u-rol').value,
    activo: true,
  };
  if (!data.nombre || !data.usuario || !data.password) { toast(_ic('triangle-alert', 15) + ' Completa todos los campos', 'error'); return; }
  try {
    if (id) { const { error } = await db.from('usuarios').update(data).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('usuarios').insert(data); if (error) throw error; }
    closeUserModal();
    _usersCache = null;
    renderUsers();
    await loadAgents();
    buildAgentSelector();
    selectedAgentId = 'all';
    const agentSel = document.getElementById('agent-selector');
    if (agentSel) agentSel.value = 'all';
    await loadVentas();
    renderDashboard();
    renderVentas();
    toast(_ic('circle-check', 15) + ' Usuario guardado', 'success');
  } catch(e) { toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error'); }
}

// BOLIVIA — Datos geográficos
const BOLIVIA_GEO = {
  "Santa Cruz": { capital: "Santa Cruz de la Sierra", provincias: { "Andrés Ibáñez": { capital: "Santa Cruz de la Sierra", municipios: ["Santa Cruz de la Sierra","Cotoca","Porongo","La Guardia","El Torno","Warnes"] }, "Warnes": { capital: "Warnes", municipios: ["Warnes","Okinawa Uno"] }, "Ichilo": { capital: "Buena Vista", municipios: ["Buena Vista","San Carlos","Yapacaní","San Juan"] }, "Sara": { capital: "Portachuelo", municipios: ["Portachuelo","Santa Rosa del Sara","Colpa Bélgica"] }, "Obispo Santisteban": { capital: "Montero", municipios: ["Montero","Saavedra","Mineros","General Saavedra"] }, "Ñuflo de Chávez": { capital: "Concepción", municipios: ["Concepción","San Julián","San Antonio de Lomerío","Cuatro Cañadas","San Ramón","San Javier"] }, "Velasco": { capital: "San Ignacio de Velasco", municipios: ["San Ignacio de Velasco","San Miguel de Velasco","San Rafael"] }, "Chiquitos": { capital: "San José de Chiquitos", municipios: ["San José de Chiquitos","Pailón","Roboré","Charagua"] }, "Cordillera": { capital: "Camiri", municipios: ["Camiri","Charagua","Cabezas","Boyuibe","Cuevo","Gutiérrez","Lagunillas"] }, "Florida": { capital: "Samaipata", municipios: ["Samaipata","Mairana","Pampagrande"] }, "Vallegrande": { capital: "Vallegrande", municipios: ["Vallegrande","Moro Moro","Pucará"] }, "Manuel María Caballero": { capital: "Comarapa", municipios: ["Comarapa","Saipina"] }, "Germán Busch": { capital: "Puerto Suárez", municipios: ["Puerto Suárez","Puerto Quijarro","Carmen Rivero Torres"] }, "Ángel Sandoval": { capital: "San Matías", municipios: ["San Matías"] } } },
  "La Paz": { capital: "La Paz", provincias: { "Murillo": { capital: "La Paz", municipios: ["La Paz","El Alto","Palca","Mecapaca","Achocalla","Viacha"] }, "Omasuyos": { capital: "Achacachi", municipios: ["Achacachi","Ancoraimes"] }, "Pacajes": { capital: "Coro Coro", municipios: ["Coro Coro","Comanche","Charaña","Calacoto"] }, "Larecaja": { capital: "Sorata", municipios: ["Sorata","Guanay","Teoponte"] }, "Sud Yungas": { capital: "Chulumani", municipios: ["Chulumani","Irupana","Yanacachi","Palos Blancos","La Asunta"] }, "Nor Yungas": { capital: "Coroico", municipios: ["Coroico","Coripata"] }, "Caranavi": { capital: "Caranavi", municipios: ["Caranavi"] }, "Los Andes": { capital: "Pucarani", municipios: ["Pucarani","Laja","Batallas","Puerto Pérez"] }, "Aroma": { capital: "Sica Sica", municipios: ["Sica Sica","Ayo Ayo","Calamarca","Colquencha","Umala"] } } },
  "Cochabamba": { capital: "Cochabamba", provincias: { "Cercado": { capital: "Cochabamba", municipios: ["Cochabamba","Quillacollo","Sacaba","Colcapirhua","Sipe Sipe","Tiquipaya","Vinto"] }, "Chapare": { capital: "Sacaba", municipios: ["Sacaba","Colomi","Villa Tunari","Entre Ríos","Puerto Villarroel"] }, "Esteban Arze": { capital: "Tarata", municipios: ["Tarata","Arbieto","Santiváñez"] }, "Punata": { capital: "Punata", municipios: ["Punata","Villa Rivero","San Benito"] }, "Aiquile": { capital: "Aiquile", municipios: ["Aiquile","Alalay"] }, "Arque": { capital: "Arque", municipios: ["Arque"] }, "Ayopaya": { capital: "Morochata", municipios: ["Morochata","Independencia"] }, "Campero": { capital: "Aiquile", municipios: ["Aiquile"] } } },
  "Potosí": { capital: "Potosí", provincias: { "Tomás Frías": { capital: "Potosí", municipios: ["Potosí","Yocalla","Urmiri","Chaqui","Tacobamba"] }, "Antonio Quijarro": { capital: "Uyuni", municipios: ["Uyuni","Tomave","Porco"] }, "Sud Chichas": { capital: "Tupiza", municipios: ["Tupiza","Atocha"] }, "Modesto Omiste": { capital: "Villazón", municipios: ["Villazón"] }, "Chayanta": { capital: "Chayanta", municipios: ["Chayanta","Sacaca"] }, "Filemón Gómez": { capital: "Cotagaita", municipios: ["Cotagaita"] } } },
  "Oruro": { capital: "Oruro", provincias: { "Cercado": { capital: "Oruro", municipios: ["Oruro","El Choro","Soracachi"] }, "Junín": { capital: "Junín", municipios: ["Junín","Chipaya"] }, "Avaroa": { capital: "Oruro", municipios: ["Oruro"] }, "Poopó": { capital: "Poopó", municipios: ["Poopó","Antacagasta"] }, "Dalence": { capital: "Huanuni", municipios: ["Huanuni"] } } },
  "Chuquisaca": { capital: "Sucre", provincias: { "Oropeza": { capital: "Sucre", municipios: ["Sucre","Yotala","Poroma"] }, "Belisario Boeto": { capital: "Tarabuco", municipios: ["Tarabuco","Tomina","Alcalá"] }, "Jaime Zudáñez": { capital: "Monteagudo", municipios: ["Monteagudo","Huerta Mayu"] }, "Yamparáez": { capital: "Azurduy", municipios: ["Azurduy","Tarvita"] } } },
  "Tarija": { capital: "Tarija", provincias: { "Cercado": { capital: "Tarija", municipios: ["Tarija","San Lorenzo","Uriondo","Padcaya"] }, "Gran Chaco": { capital: "Yacuiba", municipios: ["Yacuiba","Caraparí","Villamontes"] }, "Méndez": { capital: "Entre Ríos", municipios: ["Entre Ríos"] } } },
  "Beni": { capital: "Trinidad", provincias: { "Cercado": { capital: "Trinidad", municipios: ["Trinidad","San Javier"] }, "Vaca Díez": { capital: "Riberalta", municipios: ["Riberalta","Guayaramerín"] }, "Yacuma": { capital: "Santa Rosa de Yacuma", municipios: ["Santa Rosa de Yacuma"] }, "Moxos": { capital: "San Ignacio de Moxos", municipios: ["San Ignacio de Moxos","Loreto"] }, "Ballivián": { capital: "Rurrenabaque", municipios: ["Rurrenabaque","Reyes"] } } },
  "Pando": { capital: "Cobija", provincias: { "Nicolás Suárez": { capital: "Cobija", municipios: ["Cobija","Bolpebra","Bella Flor","Porvenir","San Pedro"] }, "Manuripi": { capital: "Filadelfia", municipios: ["Filadelfia"] } } }
};

function onDireccionKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const dir = document.getElementById('f-direccion').value.trim();
  const wrap = document.getElementById('maps-preview');
  if (!dir || !wrap) return;
  const q = encodeURIComponent(dir + ', Bolivia');
  wrap.innerHTML = `<iframe src="https://maps.google.com/maps?q=${q}&output=embed&hl=es" width="100%" height="220" style="border:0;border-radius:8px;margin-top:8px;" allowfullscreen="" loading="lazy"></iframe>`;
}

// TOAST
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').innerHTML = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// CERRAR MODALES CON ESCAPE
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modals = [
      { id: 'user-modal', closeFunc: closeUserModal },
      { id: 'delete-user-modal', closeFunc: closeDeleteUserModal },
      { id: 'delete-modal', closeFunc: closeDeleteModal },
      { id: 'producto-modal', closeFunc: closeProductoModal },
      { id: 'delete-producto-modal',closeFunc: closeDeleteProductoModal },
      { id: 'stat-modal', closeFunc: closeStatModal },
      { id: 'toggle-producto-modal', closeFunc: closeToggleProductoModal },
      { id: 'guia-modal', closeFunc: closeGuiaModal },
      { id: 'export-modal', closeFunc: closeExportModal },
    ];
    for (const { id, closeFunc } of modals) {
      const modal = document.getElementById(id);
      if (modal?.classList.contains('open')) { closeFunc(); break; }
    }
  }
});

document.getElementById('delete-confirm-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('delete-confirm-btn').click();
});

// STAT MODAL
let statModalPage = 1;
const STAT_PAGE_SIZE = 10;
let statModalEstado = '';

function openStatModal(estado) {
  statModalEstado = estado;
  statModalPage = 1;
  document.getElementById('stat-modal').classList.add('open');
  renderStatModal();
}

function closeStatModal() {
  document.getElementById('stat-modal').classList.remove('open');
}

function renderStatModal() {
  const estado = statModalEstado;
  const labels = { vendido: 'Vendidos', interesado: 'Interesados', sin_respuesta: 'Sin respuesta', seguimiento: 'En seguimiento', rellamada: 'Rellamadas', agendar: 'Agendar' };
  document.getElementById('stat-modal-title').textContent = labels[estado] || estado;

  const filtered = ventas.filter(v => v.estado === estado && ventasEnFiltroTiempo(v, 'dash'));
  const total = filtered.length;

  let resumenTexto = '';
  if (estado === 'vendido') {
    const totalUnidades = filtered.reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0);
    const totalMonto = filtered.reduce((sum, v) => sum + (parseFloat(v.monto_total) || 0), 0);
    resumenTexto = `${total} venta${total !== 1 ? 's' : ''} · ${totalUnidades} unidad${totalUnidades !== 1 ? 'es' : ''} · Bs. ${totalMonto.toFixed(0)}`;
  } else if (estado === 'interesado') {
    resumenTexto = `${total} registro${total !== 1 ? 's' : ''} con estado Interesado`;
  } else if (estado === 'sin_respuesta') {
    resumenTexto = `${total} registro${total !== 1 ? 's' : ''} con estado Sin respuesta`;
  } else {
    resumenTexto = `${total} registro${total !== 1 ? 's' : ''} — ${labels[estado] || estado}`;
  }  

  const periodoTexto = describeFiltroTiempo('dash');
  const pages = Math.ceil(total / STAT_PAGE_SIZE) || 1;
  if (statModalPage > pages) statModalPage = 1;
  const page = filtered.slice((statModalPage - 1) * STAT_PAGE_SIZE, statModalPage * STAT_PAGE_SIZE);
  const isAdmin = currentUser?.rol === 'admin';

  document.getElementById('stat-modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">${resumenTexto}</div>
    <div style="font-size:11px;color:var(--accent2);margin-bottom:14px;font-style:italic;">${_ic('calendar', 12, { style: 'vertical-align:-2px;' })} ${periodoTexto}</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Fecha</th>
            <th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Cliente</th>
            <th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Celular</th>
            <th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Productos</th>
            <th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Monto</th>
            ${isAdmin ? `<th style="background:var(--surface2);padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid var(--border);">Agente</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${page.map(v => {
            const prods = (v.venta_items || []).map(it => it.productos?.nombre).filter(Boolean);
            const prodCell = prods.length > 0 ? prods.map(n => prodChip(n)).join(' ') : '—';
            return `
            <tr onclick="closeStatModal();setTimeout(()=>openVentaModal(${v.id}),50)" style="cursor:pointer;border-bottom:1px solid var(--border);" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
              <td style="padding:9px 12px;font-size:13px;color:var(--text2);">${v.fecha || ''}</td>
              <td style="padding:9px 12px;font-size:13px;font-weight:500;">${v.cliente?.nombre || 's/n'}</td>
              <td style="padding:9px 12px;font-size:13px;font-family:monospace;color:var(--accent2);">
                <a href="tel:${v.cliente?.celular}" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none;">${v.cliente?.celular || ''}</a>
              </td>
              <td style="padding:9px 12px;">${prodCell}</td>
              <td style="padding:9px 12px;">${v.monto_total ? montoChip(v.monto_total) : ''}</td>
              ${isAdmin ? `<td style="padding:9px 12px;font-size:11px;color:var(--accent2);">${v.agente?.nombre || '—'}</td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${pages > 1 ? `
    <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:14px;">
      <button class="page-btn" onclick="statModalPage--;renderStatModal()" ${statModalPage===1?'disabled':''}>‹</button>
      ${Array.from({length:pages},(_,i)=>`<button class="page-btn ${i+1===statModalPage?'active':''}" onclick="statModalPage=${i+1};renderStatModal()">${i+1}</button>`).join('')}
      <button class="page-btn" onclick="statModalPage++;renderStatModal()" ${statModalPage===pages?'disabled':''}>›</button>
    </div>` : ''}
  `;
}

async function loadConfigVendidosEditables() {
  try {
    const { data: dataVendidos, error } = await db.from('config')
      .select('valor').eq('clave', 'vendidos_editables').single();

    if (error) throw error;

    const val = dataVendidos?.valor === 'true';
    const cb = document.getElementById('toggle-vendidos-editables');
    const span = document.getElementById('toggle-vendidos-span');
    _vendidosEditablesCache = val;
    if (cb) cb.checked = val;
    if (span) span.style.background = val ? 'var(--green)' : 'var(--border)';

    const [{ data: dataUmbral }, { data: dataDesc }, { data: dataUmbralCom }] = await Promise.all([
      db.from('config').select('valor').eq('clave', 'clientes_fieles_umbral').single(),
      db.from('config').select('valor').eq('clave', 'clientes_fieles_descuento').single(),
      db.from('config').select('valor').eq('clave', 'umbral_comision').single(),
    ]);
    if (dataUmbral?.valor) _clientesFielesUmbral = parseInt(dataUmbral.valor) || 5;
    if (dataDesc?.valor) _clientesFielesDescuento = parseInt(dataDesc.valor) || 10;
    const inpUmbralCom = document.getElementById('config-umbral-comision');
    if (inpUmbralCom && dataUmbralCom?.valor) inpUmbralCom.value = dataUmbralCom.valor;
    const inpUmbral = document.getElementById('config-clientes-umbral');
    const inpDesc = document.getElementById('config-clientes-descuento');
    if (inpUmbral) inpUmbral.value = _clientesFielesUmbral;
    if (inpDesc) inpDesc.value = _clientesFielesDescuento;
    const inpObj = document.getElementById('config-objetivo-dia');
    if (inpObj) inpObj.value = Objetivos.getMeta();
    // Sincronizar toggle de emojis
    const toggleEmojis = document.getElementById('toggle-emojis-activos');
    const spanEmojis   = document.getElementById('toggle-emojis-span');
    if (toggleEmojis) {
      const activos = Objetivos.getEmojisActivos();
      toggleEmojis.checked = activos;
      if (spanEmojis) spanEmojis.style.background = activos ? 'var(--green)' : 'var(--border)';
    }
    // Sincronizar inputs de horario
    const h = Objetivos.getHorario();
    const _minToTimeStr = (min) => {
      return `${Math.floor(min/60).toString().padStart(2,'0')}:${(min%60).toString().padStart(2,'0')}`;
    };
    const hMI = document.getElementById('horario-manana-inicio');
    const hMF = document.getElementById('horario-manana-fin');
    const hTI = document.getElementById('horario-tarde-inicio');
    const hTF = document.getElementById('horario-tarde-fin');
    if (hMI) hMI.value = _minToTimeStr(h.mañana.inicio);
    if (hMF) hMF.value = _minToTimeStr(h.mañana.fin);
    if (hTI) hTI.value = _minToTimeStr(h.tarde.inicio);
    if (hTF) hTF.value = _minToTimeStr(h.tarde.fin);
  } catch(e) {
    console.error('Error cargando config:', e);
  }
}

const CONFIG_EMPRESA_KEYS = ['empresa_nombre', 'empresa_nit', 'empresa_telefono', 'empresa_direccion'];

async function loadConfigEmpresa() {
  try {
    const { data, error } = await db.from('config').select('clave, valor').in('clave', CONFIG_EMPRESA_KEYS);
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.clave] = r.valor; });
    const ids = { empresa_nombre:'config-empresa-nombre', empresa_nit:'config-empresa-nit',
                  empresa_telefono:'config-empresa-telefono', empresa_direccion:'config-empresa-direccion' };
    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el && map[key] != null) el.value = map[key];
    }
  } catch(e) {
    console.error('Error cargando información de empresa:', e);
  }
}

async function saveConfigEmpresa() {
  const values = {
    empresa_nombre:     document.getElementById('config-empresa-nombre').value.trim(),
    empresa_nit:        document.getElementById('config-empresa-nit').value.trim(),
    empresa_telefono:   document.getElementById('config-empresa-telefono').value.trim(),
    empresa_direccion:  document.getElementById('config-empresa-direccion').value.trim(),
  };
  if (!values.empresa_nombre) {
    toast(_ic('triangle-alert', 15) + ' Ingresa el nombre de la empresa', 'error'); return;
  }
  try {
    const rows = CONFIG_EMPRESA_KEYS.map(clave => ({ clave, valor: values[clave] }));
    const { error } = await db.from('config').upsert(rows, { onConflict: 'clave' });
    if (error) throw error;
    _nrEmpresaCache = null;
    toast(_ic('circle-check', 15) + ' Información de empresa guardada', 'success');
  } catch(e) {
    console.error('Error guardando información de empresa:', e);
    toast(_ic('circle-x', 15) + ' Error guardando información de empresa', 'error');
  }
}

async function saveConfigVendidosEditables(enabled) {
  try {
    const { error } = await db.from('config')
      .update({ valor: enabled ? 'true' : 'false' })
      .eq('clave', 'vendidos_editables');
    if (error) throw error;
    const span = document.getElementById('toggle-vendidos-span');
    if (span) span.style.background = enabled ? 'var(--green)' : 'var(--border)';
    toast(enabled ? _ic('circle-check', 15) + ' Agentes pueden editar vendidos' : _ic('lock', 15) + ' Vendidos bloqueados para agentes', 'success');
    _vendidosEditablesCache = enabled;
  } catch(e) {
    console.error('Error guardando config:', e);
    toast(_ic('circle-x', 15) + ' Error guardando configuración', 'error');
  }
}

async function getVendidosEditables() {
  if (_vendidosEditablesCache !== null) return _vendidosEditablesCache;
  try {
    const { data, error } = await db.from('config')
      .select('valor').eq('clave', 'vendidos_editables').single();
    if (error) throw error;
    _vendidosEditablesCache = data?.valor === 'true';
    return _vendidosEditablesCache;
  } catch(e) {
    console.error('Error leyendo config:', e);
    return false;
  }
}

// NOTIFICACIÓN DE STOCK
let _stockAlertsDismissed = new Set();

window._dismissStockAlerts = function(productId) {
  if (productId != null) {
    _stockAlertsDismissed.add(productId);
  } else {
    const alerts = (Inventario?.getStockAlerts?.() || []);
    alerts.forEach(a => _stockAlertsDismissed.add(a.productId));
  }
  _checkStockAlerts();
};

window._dismissAllStockAlerts = function() {
  const alerts = (Inventario?.getStockAlerts?.() || []);
  alerts.forEach(a => _stockAlertsDismissed.add(a.productId));
  const panel = document.getElementById('stock-notif-panel');
  if (panel) panel.style.display = 'none';
  _checkStockAlerts();
};

function _checkStockAlerts() {
  const alerts = (Inventario?.getStockAlerts?.() || []);
  const btn = document.getElementById('stock-notif-btn');
  const badge = document.getElementById('stock-notif-count');
  const panel = document.getElementById('stock-notif-panel');
  const list = document.getElementById('stock-notif-list');
  if (!btn) return;

  const nuevos = alerts.filter(a => !_stockAlertsDismissed.has(a.productId));
  if (nuevos.length > 0) {
    const hasBajo = nuevos.some(a => a.level === 'bajo');
    btn.style.display = '';
    btn.classList.toggle('has-bajo', hasBajo);
    btn.classList.toggle('has-medio', !hasBajo);
    if (badge) badge.textContent = nuevos.length > 9 ? '9+' : nuevos.length;

    if (list) {
      list.innerHTML = nuevos.map(a => `
        <div class="stock-notif-item">
          <span class="stock-notif-name">${a.productName}</span>
          <span class="stock-notif-badge" style="color:${a.level === 'bajo' ? 'var(--red)' : 'var(--orange)'}">${a.label}</span>
          <span class="stock-notif-qty">${a.stockActual}</span>
          <button class="stock-notif-dismiss" data-pid="${a.productId}" title="Descartar">${_ic('x', 12)}</button>
        </div>
      `).join('');
    }
  } else {
    btn.style.display = 'none';
    if (panel) panel.style.display = 'none';
  }
}

// SISTEMA DE RECORDATORIOS
let _recordatorioTimer = null;
let _bipInterval = null;
let _audioCtx = null;
let _bipAudio = null;
let _bipActivo = false; 
let _bipPlaying = false;
let _bipTimeout = null;

function _getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

let _AUDIO_FILES = [];
let _audioFilesLoaded = false;

async function _loadAudioFiles() {
  if (_audioFilesLoaded) return;
  const BATCH = 10;
  const found = [];
  let probe = 1;
  let hasMore = true;

  while (hasMore) {
    const end = probe + BATCH - 1;
    const promises = [];
    const batchResults = {};

    for (let i = probe; i <= end; i++) {
      const url = `resources/audio/Recordatorio${i}.mp3`;
      promises.push(
        fetch(url, { method: 'HEAD' })
          .then(res => { if (res.ok) batchResults[i] = url; })
          .catch(() => {})
      );
    }
    await Promise.all(promises);

    for (let i = probe; i <= end; i++) {
      if (batchResults[i]) {
        found.push(batchResults[i]);
      } else {
        hasMore = false;
        break;
      }
    }

    probe = end + 1;
  }

  _AUDIO_FILES = found;
  _audioFilesLoaded = true;
}

function _bip() {
  if (!_bipActivo) return;
  if (_bipPlaying) return;

  if (_AUDIO_FILES.length === 0) {
    _bipTimeout = setTimeout(_bip, 5000);
    return;
  }

  if (_bipAudio) {
    _bipAudio.pause();
    _bipAudio.src = '';
    _bipAudio = null;
  }

  _bipPlaying = true;
  const archivo = _AUDIO_FILES[Math.floor(Math.random() * _AUDIO_FILES.length)];
  _bipAudio = new Audio(archivo);
  _bipAudio.volume = 0.8;

  let _done = false;
  const _onDone = () => {
    if (_done) return;
    _done = true;
    _bipPlaying = false;
    _bipAudio = null;
    if (!_bipActivo) return;
    _bipTimeout = setTimeout(_bip, 15000);
  };

  _bipAudio.addEventListener('ended', _onDone);
  _bipAudio.addEventListener('error', _onDone);

  _bipAudio.play().catch(_onDone);
}

function _mostrarNotificacionRecordatorio(venta) {
  _loadAudioFiles();
  clearInterval(_bipInterval);

  // Spacer: reserva espacio real en el bottom para que el scroll no quede tapado
  let spacer = document.getElementById('recordatorio-spacer');
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.id = 'recordatorio-spacer';
    spacer.style.cssText = 'height:0;transition:height 0.3s ease;pointer-events:none;flex-shrink:0;';
    // Insertarlo al final del .content-area (o del body como fallback)
    const ca = document.querySelector('.content-area') || document.querySelector('.main') || document.body;
    ca.appendChild(spacer);
  }

  let banner = document.getElementById('recordatorio-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'recordatorio-banner';
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:9999;
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      color:white;padding:14px 20px;
      display:flex;align-items:center;justify-content:space-between;
      box-shadow:0 -4px 20px rgba(0,0,0,0.3);
      font-family:'DM Sans',sans-serif;font-size:14px;
      animation: slideDown 0.3s ease;
    `;
    document.body.appendChild(banner);
  }

  const nombre = venta.cliente?.nombre || 'Cliente';
  const celular = venta.cliente?.celular || '';
  const notas = venta.notas || '';

  const ahoraLocal2 = new Date().toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16);
  const ahoraMs2 = new Date(ahoraLocal2).getTime();
  const pendientesCount = ventas.filter(v =>
    v.recordatorio && !v.recordatorio_visto &&
    !window._recordatoriosVistos?.has(v.id) &&
    new Date(v.recordatorio.slice(0, 16)).getTime() <= ahoraMs2 + 5 * 60 * 1000
  ).length;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
      ${pendientesCount > 1 ? `
        <div style="background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.5);
            border-radius:8px;padding:4px 8px;text-align:center;flex-shrink:0;">
          <div style="font-size:16px;font-weight:800;line-height:1;">${pendientesCount}</div>
          <div style="font-size:9px;font-weight:700;opacity:0.85;letter-spacing:0.3px;">PEND.</div>
        </div>` : ''}
      <span style="font-size:22px;flex-shrink:0;">⏰</span>
      <div style="min-width:0;">
        <div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Recordatorio — ${nombre}</div>
        <div style="font-size:12px;opacity:0.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${celular}${notas ? ' · ' + notas.slice(0,60) : ''}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
      <button onclick="showNuevoRegistro(${venta.id});_marcarRecordatorioVisto(${venta.id});_dismissRecordatorio()"
        style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);
               border-radius:6px;padding:6px 12px;color:white;cursor:pointer;font-size:13px;font-weight:600;">
        Ver registro
      </button>
      <button onclick="_silenciarRecordatorio()"
        style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);
               border-radius:6px;padding:6px 12px;color:white;cursor:pointer;font-size:13px;font-weight:600;">
        ${_ic('bell-off', 14)} Silenciar
      </button>
      <button onclick="_marcarRecordatorioVisto(${venta.id});_dismissRecordatorio()"
        style="background:white;border:none;border-radius:6px;padding:6px 16px;
              color:var(--accent);cursor:pointer;font-size:13px;font-weight:700;">
        ${_ic('check', 14)} VISTO
      </button>
    </div>
  `;
  banner.style.display = 'flex';

  requestAnimationFrame(() => {
    const h = banner.getBoundingClientRect().height;
    if (spacer) spacer.style.height = h + 'px';
  });

  _bipActivo = true;
  _bip();
}

function _silenciarRecordatorio() {
  _bipActivo = false;
  _bipPlaying = false;
  clearTimeout(_bipTimeout);
  _bipTimeout = null;
  if (_bipAudio) { _bipAudio.pause(); _bipAudio.src = ''; _bipAudio = null; }
  // Solo silencia el audio, el banner sigue visible
  const btn = document.querySelector('#recordatorio-banner button[onclick="_silenciarRecordatorio()"]');
  if (btn) { btn.innerHTML = _ic('bell-off', 14) + ' Silenciado'; btn.disabled = true; btn.style.opacity = '0.5'; }
}

function _dismissRecordatorio() {
  _bipActivo  = false;
  _bipPlaying = false;         
  clearTimeout(_bipTimeout);   
  _bipTimeout = null;
  clearInterval(_bipInterval);
  _bipInterval = null;
  if (_bipAudio) { _bipAudio.pause(); _bipAudio.src = ''; _bipAudio = null; }
  const banner = document.getElementById('recordatorio-banner');
  if (banner) banner.style.display = 'none';
  const spacer = document.getElementById('recordatorio-spacer');
  if (spacer) spacer.style.height = '0';
}

async function _marcarRecordatorioVisto(ventaId) {
  if (!window._recordatoriosVistos) window._recordatoriosVistos = new Set();
  window._recordatoriosVistos.add(ventaId);
  if (ventasIndex[ventaId]) ventasIndex[ventaId].recordatorio_visto = true;
  const idx = ventas.findIndex(v => v.id === ventaId);
  if (idx >= 0) ventas[idx].recordatorio_visto = true;
  await db.from('ventas').update({ recordatorio_visto: true }).eq('id', ventaId);
}

function iniciarChequeoRecordatorios() {
  clearInterval(_recordatorioTimer);
  _recordatorioTimer = setInterval(_chequearRecordatorios, 30000);
  _chequearRecordatorios();
}

function _chequearRecordatorios() {
  if (!ventas || !ventas.length) return;
  if (!window._recordatoriosVistos) window._recordatoriosVistos = new Set();
  const ahoraLocal = new Date().toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16);
  const ahoraMs = new Date(ahoraLocal).getTime();
  const enCincoMin = ahoraMs + 5 * 60 * 1000;
  const unHoraAntes = ahoraMs - 60 * 60 * 1000;

  for (const v of ventas) {
    if (!v.recordatorio) continue;
    if (v.recordatorio_visto) continue;
    const recMs = new Date(v.recordatorio.slice(0, 16)).getTime();
    if (recMs >= unHoraAntes && recMs <= enCincoMin) {
      if (window._recordatoriosVistos.has(v.id)) continue;
      window._recordatoriosVistos.add(v.id);
      _mostrarNotificacionRecordatorio(v);
      break;
    }
  }
}

function _activarSonido(btn) {
  try {
    _getAudioCtx();
    _bip();
    btn.style.background = 'var(--green-bg)';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
    btn.innerHTML = _ic('circle-check', 14) + ' Sonido activado';
    btn.disabled = true;
    const status = document.getElementById('sonido-status');
    if (status) {
      status.textContent = 'El navegador permitirá las alertas de recordatorio.';
      status.style.display = '';
      status.style.color = 'var(--green)';
    }
  } catch(e) {
    const status = document.getElementById('sonido-status');
    if (status) {
      status.innerHTML = _ic('triangle-alert', 13, { style: 'vertical-align:-2px;' }) + ' No se pudo activar el sonido en este navegador.';
      status.style.display = '';
      status.style.color = 'var(--red)';
    }
  }
}

async function saveConfigClientesFieles() {
  const umbral = parseInt(document.getElementById('config-clientes-umbral').value) || 5;
  const desc = parseInt(document.getElementById('config-clientes-descuento').value) || 10;
  try {
    await Promise.all([
      db.from('config').update({ valor: String(umbral) }).eq('clave', 'clientes_fieles_umbral'),
      db.from('config').update({ valor: String(desc) }).eq('clave', 'clientes_fieles_descuento'),
    ]);
    _clientesFielesUmbral = umbral;
    _clientesFielesDescuento = desc;
    _clientesFielesCache = null;
    toast(_ic('circle-check', 15) + ' Configuración de clientes fieles guardada', 'success');
    renderDashboard();
  } catch(e) { toast(_ic('circle-x', 15) + ' ' + esc(e.message), 'error'); }
}

function _getClientesFieles() {
  if (_clientesFielesCache) return _clientesFielesCache;

  const mapa = {};
  for (const v of ventas) {
    if (v.estado !== 'vendido') continue;
    const cid = v.cliente_id;
    if (!mapa[cid]) {
      mapa[cid] = {
        id: cid,
        nombre: v.cliente?.nombre || 's/n',
        celular: v.cliente?.celular || '',
        unidades: 0,
        monto_total: 0,
        ventas_count: 0,
      };
    }
    for (const it of (v.venta_items || [])) {
      mapa[cid].unidades += it.cantidad || 1;
    }
    mapa[cid].monto_total += parseFloat(v.monto_total || 0);
    mapa[cid].ventas_count += 1;
  }

  const lista = Object.values(mapa).sort((a, b) => b.unidades - a.unidades);
  const top = lista.slice(0, 5);
  const topIds = new Set(top.map(c => c.id));
  const resto = lista.filter(c => !topIds.has(c.id)).slice(0, 20);

  _clientesFielesCache = { top, resto };
  return _clientesFielesCache;
}

let _renderingClientesFieles = false;
function renderClientesFieles() {
  const wrap = document.getElementById('dash-clientes-fieles');
  if (!wrap) return;

  const { top, resto } = _getClientesFieles();

  if (!top.length && !resto.length) {
    wrap.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:8px;">Sin clientes con ventas aún</div>`;
    return;
  }

  const maxU = (top[0] || resto[0])?.unidades || 1;
  const medallas = [
    _ic('medal', 14, { style: 'color:#fbbf24;' }),
    _ic('medal', 14, { style: 'color:#cbd5e1;' }),
    _ic('medal', 14, { style: 'color:#d97706;' }),
    _ic('award', 14, { style: 'color:var(--text3);' }) + ' 4',
    _ic('award', 14, { style: 'color:var(--text3);' }) + ' 5',
  ];

  const topHTML = top.length
    ? top.map((c, i) => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="font-size:13px;font-weight:600;">${medallas[i]} ${c.nombre}</span>
            <span style="font-size:12px;color:var(--green);font-weight:700;">${c.unidades} und.</span>
          </div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:5px;">${c.celular}</div>
          <div class="bar-track" style="height:8px;">
            <div class="bar-fill" style="width:${(c.unidades/maxU*100).toFixed(0)}%;background:var(--green);transition:width 0.5s ease;"></div>
          </div>
        </div>`).join('')
    : `<div style="color:var(--text3);font-size:13px;padding:8px 0;">Sin clientes con ventas aún</div>`;

  const restoHTML = resto.length
    ? resto.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-size:12px;font-weight:500;">${c.nombre}</div>
            <div style="font-size:12px;color:var(--text3);">${c.celular}</div>
          </div>
          <span style="font-size:12px;color:var(--green);font-weight:700;">${c.unidades} und.</span>
        </div>`).join('')
    : `<div style="font-size:12px;color:var(--text3);padding:8px 0;">Sin otros clientes</div>`;

  wrap.innerHTML = `
    <div style="display:grid;grid-template-columns:55% 40%;gap:5%;">
      <div>${topHTML}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
          Otros clientes (1 o más unidades)
        </div>
        <div style="max-height:260px;overflow-y:auto;">${restoHTML}</div>
      </div>
    </div>`;
}

// Rosca / donut anual
let _roscaAnualCache = null;
 
function _getRoscaAnual() {
  if (_roscaAnualCache) return _roscaAnualCache;

  const year = new Date().getFullYear();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const mapa = {};
  for (let i = 1; i <= 12; i++) {
    mapa[`${year}-${String(i).padStart(2,'0')}`] = { mes: meses[i-1], unidades: 0, monto: 0 };
  }

  for (const v of ventas) {
    if (v.estado !== 'vendido' || !v.updated_at) continue;
    const fecha = new Date(v.updated_at);
    if (fecha.getFullYear() !== year) continue;
    const key = `${year}-${String(fecha.getMonth()+1).padStart(2,'0')}`;
    if (!mapa[key]) continue;
    for (const it of (v.venta_items || [])) mapa[key].unidades += it.cantidad || 1;
    mapa[key].monto += parseFloat(v.monto_total || 0);
  }

  _roscaAnualCache = Object.values(mapa);
  return _roscaAnualCache;
}

function renderRoscaAnual() {
  const wrap = document.getElementById('dash-rosca-anual');
  if (!wrap) return;
 
  const datos = _getRoscaAnual();
  const totalUnidades = datos.reduce((s, d) => s + d.unidades, 0);
  const totalMonto = datos.reduce((s, d) => s + d.monto, 0);
 
  if (totalUnidades === 0) {
    wrap.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:16px;text-align:center;">Sin ventas registradas este año</div>`;
    Objetivos.render();
    return;
  }
 
  const activos = datos.filter(d => d.unidades > 0);
  const colores = [
    '#6366f1','#22d3a4','#60a5fa','#fbbf24','#f472b6',
    '#34d399','#a78bfa','#fb923c','#f87171','#38bdf8',
    '#4ade80','#e879f9',
  ];
 
  const cx = 110, cy = 110, R = 90, r = 54, TAU = 2 * Math.PI;
  let startAngle = -Math.PI / 2;
  const segmentos = [];
 
  datos.forEach((d, i) => {
    if (d.unidades === 0) { segmentos.push(null); return; }
    const pct = d.unidades / totalUnidades;
    const angle = pct * TAU;
    const end = startAngle + angle;
    const gap = 0.025;
    const s = startAngle + gap / 2;
    const e = end - gap / 2;
    const x1 = cx + R * Math.cos(s), y1 = cy + R * Math.sin(s);
    const x2 = cx + R * Math.cos(e), y2 = cy + R * Math.sin(e);
    const x3 = cx + r * Math.cos(e), y3 = cy + r * Math.sin(e);
    const x4 = cx + r * Math.cos(s), y4 = cy + r * Math.sin(s);
    const large = angle - gap > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large},0 ${x4},${y4} Z`;
    segmentos.push({ path, color: colores[i % colores.length], d, pct });
    startAngle = end;
  });
 
  const paths = segmentos.map(seg => {
    if (!seg) return '';
    return `<path d="${seg.path}" fill="${seg.color}" opacity="0.9"
      style="cursor:pointer;transition:opacity 0.15s;"></path>`;
  }).join('');
 
  const leyenda = activos.map(d => {
    const idx = datos.indexOf(d);
    return `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
        <div style="width:10px;height:10px;border-radius:3px;background:${colores[idx % colores.length]};flex-shrink:0;"></div>
        <span style="font-size:11px;color:var(--text2);flex:1;">${d.mes}</span>
        <span style="font-size:11px;color:var(--text);font-weight:600;">${d.unidades} und</span>
        <span style="font-size:11px;color:var(--green);font-weight:700;">Bs.${d.monto.toFixed(0)}</span>
      </div>`;
  }).join('');
 
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
 
      <!-- SVG Donut -->
      <div style="position:relative;flex-shrink:0;">
        <svg width="220" height="220" viewBox="0 0 220 220">
          ${paths}
          <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="var(--surface)"/>
          <text x="${cx}" y="${cy - 10}" text-anchor="middle"
            style="font-size:11px;fill:var(--text3);font-family:'DM Sans',sans-serif;font-weight:600;">
            ${new Date().getFullYear()}
          </text>
          <text x="${cx}" y="${cy + 8}" text-anchor="middle"
            style="font-size:18px;fill:var(--text);font-family:'Syne',sans-serif;font-weight:700;">
            ${totalUnidades}
          </text>
          <text x="${cx}" y="${cy + 24}" text-anchor="middle"
            style="font-size:10px;fill:var(--text3);font-family:'DM Sans',sans-serif;">
            unidades
          </text>
          <text x="${cx}" y="${cy + 38}" text-anchor="middle"
            style="font-size:11px;fill:var(--green);font-family:'DM Sans',sans-serif;font-weight:700;">
            Bs.${totalMonto.toFixed(0)}
          </text>
        </svg>
        <div id="rosca-tooltip" style="
          display:none;position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);
          background:var(--surface2);border:1px solid var(--border);
          border-radius:8px;padding:8px 12px;font-size:12px;
          color:var(--text);text-align:center;pointer-events:none;
          white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:10;
        "></div>
      </div>
 
      <!-- Leyenda -->
      <div style="flex:1;min-width:160px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);
          text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
          Por mes
        </div>
        <div class="leyenda-list" style="overflow-y:auto;max-height:180px;">
          ${leyenda}
        </div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
          <div style="font-size:12px;color:var(--text3);">Total año</div>
          <div style="font-size:15px;font-weight:700;color:var(--text);">${totalUnidades} unidades</div>
          <div style="font-size:14px;font-weight:700;color:var(--green);">Bs. ${totalMonto.toFixed(0)}</div>
        </div>
      </div>
 
    </div>`;
 
  // Hover en segmentos del donut
  document.querySelectorAll('#dash-rosca-anual svg path').forEach((path, i) => {
    const seg = segmentos.filter(Boolean)[i];
    if (!seg) return;
    path.addEventListener('mouseover', () => {
      const tt = document.getElementById('rosca-tooltip');
      if (tt) {
        tt.innerHTML = `<b>${seg.d.mes}</b><br>${seg.d.unidades} und · Bs.${seg.d.monto.toFixed(0)}`;
        tt.style.display = 'block';
      }
    });
    path.addEventListener('mouseout', () => {
      const tt = document.getElementById('rosca-tooltip');
      if (tt) tt.style.display = 'none';
    });
  });
 
  Objetivos.render();
}

// ── EXPORT ──
const EXPORT_COLUMNS_VENTAS = [
  { key:'fecha',       label:'Fecha',          get: v => v.fecha || '' },
  { key:'cliente',     label:'Cliente',        get: v => v.cliente?.nombre || '' },
  { key:'celular',     label:'Celular',        get: v => v.cliente?.celular || '' },
  { key:'productos',   label:'Productos',      get: v => (v.venta_items||[]).map(it => it.productos?.nombre).filter(Boolean).join(', ') },
  { key:'monto',       label:'Monto',          get: v => v.monto_total ? `Bs.${Number(v.monto_total).toFixed(2)}` : '' },
  { key:'lugar',       label:'Lugar',          get: v => v.cliente?.ubicacion || '' },
  { key:'estado',      label:'Estado',         get: v => { const e = ESTADOS[v.estado]; return e ? e.label : (v.estado || ''); } },
  { key:'notas',       label:'Notas',          get: v => v.notas || '' },
  { key:'actualizado', label:'Actualizado en', get: v => v.updated_at ? new Date(v.updated_at).toLocaleDateString('es-BO',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '' },
  { key:'agente',      label:'Agente',         get: v => v.agente?.nombre || '' },
];

const EXPORT_COLUMNS_CLIENTES = [
  { key:'nombre',            label:'Nombre',             get: c => c.nombre || '' },
  { key:'celular',           label:'Celular',            get: c => c.celular || '' },
  { key:'ubicacion',         label:'Ubicación',          get: c => c.ubicacion || '' },
  { key:'unidades',          label:'Unidades Compradas', get: c => c.total_unidades != null ? String(c.total_unidades) : '' },
  { key:'monto',             label:'Monto Vendido',      get: c => c.total_monto ? `Bs.${Number(c.total_monto).toFixed(2)}` : '' },
  { key:'faltas',            label:'Faltas',             get: c => c.total_faltas != null ? String(c.total_faltas) : '' },
  { key:'sin_respuesta',     label:'Sin Respuesta',      get: c => c.sin_respuesta_count != null ? String(c.sin_respuesta_count) : '' },
  { key:'estado',            label:'Estado',             get: c => c.flag || '' },
  { key:'ultima_actualiz',   label:'Última Actualización', get: c => c.ultima_venta ? new Date(c.ultima_venta).toLocaleDateString('es-BO',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '' },
  { key:'fecha_registro',    label:'Fecha de Registro',  get: c => c.created_at ? new Date(c.created_at).toLocaleDateString('es-BO',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '' },
];

const _EXPORT_CONFIG = {
  ventas: {
    columns: EXPORT_COLUMNS_VENTAS,
    savedKey: 'export_columnas',
    savedVar: '_exportColumnasSeleccionadas',
    title: 'LIT CRM — Registros',
    filename: 'registros',
    getData: () => getFiltered(),
  },
  clientes: {
    columns: EXPORT_COLUMNS_CLIENTES,
    savedKey: 'export_columnas_clientes',
    savedVar: '_exportColumnasSeleccionadasClientes',
    title: 'LIT CRM — Clientes',
    filename: 'clientes',
    getData: () => {
      if (typeof ClientesView !== 'undefined' && ClientesView.getFiltered) return ClientesView.getFiltered();
      return [];
    },
  },
};

function _getExportConfig() {
  return _EXPORT_CONFIG[_exportSource] || _EXPORT_CONFIG.ventas;
}

function openExportModal(source) {
  _exportSource = source || 'ventas';
  const cfg = _getExportConfig();
  const data = cfg.getData();
  document.getElementById('export-count').textContent = data.length;

  const list = document.getElementById('export-columns-list');
  list.innerHTML = cfg.columns.map(c => `
    <label style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;cursor:pointer;transition:background 0.15s;"
      onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
      <input type="checkbox" data-key="${c.key}" checked style="accent-color:var(--accent);">
      <span style="font-size:13px;">${c.label}</span>
    </label>
  `).join('');

  const savedVal = cfg.savedVar === '_exportColumnasSeleccionadas' ? _exportColumnasSeleccionadas : _exportColumnasSeleccionadasClientes;
  if (savedVal) {
    const saved = savedVal.split(',');
    list.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = saved.includes(cb.dataset.key);
    });
  }
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.onchange = _guardarColumnasExport;
  });

  function actualizarFormatCards() {
    document.querySelectorAll('.export-format-card').forEach(c => {
      const r = c.querySelector('input[type=radio]');
      c.style.borderColor = r?.checked ? 'var(--accent)' : 'var(--border)';
      c.style.background = r?.checked ? 'var(--accent-glow)' : '';
    });
  }
  document.querySelectorAll('.export-format-card').forEach(card => {
    card.onclick = () => {
      const radio = card.querySelector('input[type=radio]');
      if (radio) radio.checked = true;
      actualizarFormatCards();
    };
  });
  document.querySelectorAll('input[name="export-format"]').forEach(radio => {
    radio.onchange = actualizarFormatCards;
  });
  actualizarFormatCards();
  document.getElementById('export-progress').style.display = 'none';
  document.getElementById('export-btn').disabled = false;
  document.getElementById('export-btn').innerHTML = _ic('upload', 15) + ' Exportar';
  document.getElementById('export-modal').classList.add('open');
}

function closeExportModal() {
  document.getElementById('export-modal').classList.remove('open');
}

function selectAllColumns(selected) {
  document.querySelectorAll('#export-columns-list input[type=checkbox]').forEach(cb => cb.checked = selected);
  _guardarColumnasExport();
}

function _guardarColumnasExport() {
  const cfg = _getExportConfig();
  const checked = [...document.querySelectorAll('#export-columns-list input[type=checkbox]:checked')]
    .map(cb => cb.dataset.key);
  const val = checked.length === cfg.columns.length ? null : checked.join(',');
  if (cfg.savedVar === '_exportColumnasSeleccionadas') {
    _exportColumnasSeleccionadas = val;
  } else {
    _exportColumnasSeleccionadasClientes = val;
  }
  _saveUserConfig(cfg.savedKey, val || '');
}

function _cargarLibreria(url, globalCheck) {
  if (eval(`typeof ${globalCheck} !== 'undefined'`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(s);
  });
}

function _getSelectedColumns() {
  const cfg = _getExportConfig();
  return cfg.columns.filter(c =>
    document.querySelector(`#export-columns-list input[data-key="${c.key}"]`)?.checked
  );
}

async function doExport() {
  const format = document.querySelector('input[name="export-format"]:checked')?.value;
  if (!format) { toast(_ic('triangle-alert', 15) + ' Selecciona un formato', 'error'); return; }

  const cols = _getSelectedColumns();
  if (cols.length === 0) { toast(_ic('triangle-alert', 15) + ' Selecciona al menos una columna', 'error'); return; }

  const data = _getExportConfig().getData();
  if (data.length === 0) { toast(_ic('triangle-alert', 15) + ' No hay registros para exportar', 'error'); return; }

  const progress = document.getElementById('export-progress');
  const progressText = document.getElementById('export-progress-text');
  const btn = document.getElementById('export-btn');
  progress.style.display = 'flex';
  btn.disabled = true;
  btn.innerHTML = _ic('loader', 15) + ' Generando...';

  try {
    if (format === 'excel') {
      await _exportarExcel(data, cols);
    } else {
      await _exportarPDF(data, cols);
    }
  } catch(e) {
    toast(_ic('triangle-alert', 15) + ' Error al exportar: ' + esc(e.message), 'error');
    console.error(e);
  } finally {
    progress.style.display = 'none';
    btn.disabled = false;
    btn.innerHTML = _ic('upload', 15) + ' Exportar';
    closeExportModal();
  }
}

async function _exportarExcel(data, cols) {
  const pt = document.getElementById('export-progress-text');
  pt.textContent = 'Cargando librería Excel...';
  await _cargarLibreria('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js', 'XLSX');

  pt.textContent = 'Generando Excel...';
  const rows = data.map(v => {
    const row = {};
    cols.forEach(c => { row[c.label] = c.get(v); });
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  const colWidths = cols.map(c => ({ wch: Math.max(c.label.length * 2, 12) }));
  ws['!cols'] = colWidths;

  const cfg = _getExportConfig();
  XLSX.utils.book_append_sheet(wb, ws, cfg.filename);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  _descargarBlob(blob, `${cfg.filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

async function _exportarPDF(data, cols) {
  const pt = document.getElementById('export-progress-text');
  pt.textContent = 'Cargando librería PDF...';
  await _cargarLibreria('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');

  pt.textContent = 'Generando PDF...';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const C = {
    accent: [99,102,241], green: [16,150,100], text: [20,20,40],
    text2: [80,80,110], text3: [140,140,170], border: [210,210,230],
    surface2: [248,248,252], bg: [255,255,255], white: [255,255,255],
  };
  const setFill = c => doc.setFillColor(c[0],c[1],c[2]);
  const setTextC = c => doc.setTextColor(c[0],c[1],c[2]);

  setFill(C.bg); doc.rect(0,0,W,H,'F');
  const cfg = _getExportConfig();
  setFill(C.accent); doc.rect(0,0,W,16,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(12); setTextC(C.white);
  doc.text(cfg.title, 8, 11);
  doc.setFontSize(6); doc.setFont('helvetica','normal'); setTextC([220,220,255]);
  doc.text(`Generado: ${new Date().toLocaleString('es-BO')}`, W-6, 11, { align:'right' });

  const hoy = new Date();
  const filtroLabel = _exportSource === 'ventas' ? describeFiltroTiempo('ventas') : '';
  doc.setFontSize(7); doc.setFont('helvetica','normal'); setTextC(C.text2);
  doc.text(`${data.length} registros · ${filtroLabel}`, 8, 22);

  const headers = cols.map(c => c.label);
  const colKey = cols.map(c => c.key);
  const colW = cols.map((_, i) => Math.max(16, Math.min(55, 270 / cols.length)));

  const rows = data.map(v => cols.map(c => c.get(v)));

  let y = 28;
  const rowH = 6.5;
  const lineH = 3.8;
  const margin = 6;
  const usableW = W - margin * 2;

  // Header row
  setFill(C.surface2); doc.rect(margin, y, usableW, rowH, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(7); setTextC(C.text);
  let x = margin;
  headers.forEach((h, i) => {
    doc.text(h, x + 1.5, y + 4.5);
    x += colW[i % colW.length];
  });
  y += rowH;

  // Data rows
  doc.setFont('helvetica','normal'); doc.setFontSize(6);
  let page = 1;
  for (const row of rows) {
    if (y + rowH > H - 10) {
      // Footer
      setTextC(C.text3); doc.setFontSize(6);
      doc.text(`Página ${page}`, W/2, H-4, { align:'center' });
      doc.addPage();
      page++;
      setFill(C.bg); doc.rect(0,0,W,H,'F');
      y = margin;

      // Header row again
      setFill(C.surface2); doc.rect(margin, y, usableW, rowH, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7); setTextC(C.text);
      x = margin;
      headers.forEach((h, i) => {
        doc.text(h, x + 1.5, y + 4.5);
        x += colW[i % colW.length];
      });
      y += rowH;
      doc.setFont('helvetica','normal'); doc.setFontSize(6);
    }

    x = margin;
    row.forEach((val, i) => {
      const cellW = colW[i % colW.length];
      setTextC(C.text2);
      const text = String(val || '');
      const lines = doc.splitTextToSize(text, cellW - 3);
      lines.forEach((line, li) => {
        if (li > 0 && y + lineH > H - 10) { y += lineH; }
        doc.text(line, x + 1.5, y + 4 + li * lineH);
      });
      x += cellW;
    });
    y += rowH;
  }

  setTextC(C.text3); doc.setFontSize(6);
  doc.text(`Página ${page}`, W/2, H-4, { align:'center' });

  const blob = doc.output('blob');
  _descargarBlob(blob, `${cfg.filename}_${new Date().toISOString().slice(0,10)}.pdf`);
}

function _descargarBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// INIT
initTheme();