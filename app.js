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
  rellamada: { label: '🔁 Rellamada', badge: 'badge-rellamada',  color: 'var(--accent2)' },
  seguimiento: { label: '🔄 Seguimiento', badge: 'badge-seguimiento',color: 'var(--blue)' },
  interesado: { label: '🌟 Interesado', badge: 'badge-interesado', color: 'var(--yellow)' },
  agendar: { label: '📅 Agendar', badge: 'badge-agendar', color: 'var(--orange)' },
  sin_respuesta:{ label: '📵 Sin respuesta', badge: 'badge-sinresp', color: 'var(--red)' },
  no_interesado:{ label: '👎 No interesado', badge: 'badge-noint', color: 'var(--text3)' },
  enviado: { label: '📦 Enviado', badge: 'badge-enviado', color: 'var(--blue)' },
  vendido: { label: '✅ Vendido', badge: 'badge-vendido', color: 'var(--green)' },
  cancelado: { label: '❌ Cancelado', badge: 'badge-cancelado', color: '#f87171' },
  spam: { label: '🚫 SPAM', badge: 'badge-spam', color: 'var(--text3)' },
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
let filtroTiempo = 'mes';
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
    requestAnimationFrame(loop);
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
    if (theme === 'night') btn.textContent = '☀️ Día';
    else if (theme === 'day') btn.textContent = '🌙 Noche';
    else btn.textContent = '🌿 Menta';
  }
}

function toggleTheme() {
  const order = ['white', 'day', 'night'];
  const cur = document.documentElement.getAttribute('data-theme') || 'white';
  applyTheme(order[(order.indexOf(cur) + 1) % 3]);
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
    initApp().catch(e => console.error('Error inicializando app:', e));
  }
}

// Describir tiempo
function describeFiltroTiempo() {
  const hoy = new Date();
  const opts = { day: 'numeric', month: 'long' };

  if (filtroTiempo === 'todos') return 'Todos los registros';
  if (filtroTiempo === 'dia') {
    return `Hoy — ${hoy.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (filtroTiempo === 'semana') {
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() + diffLunes);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    return `Esta semana — del ${lunes.toLocaleDateString('es-BO', opts)} al ${domingo.toLocaleDateString('es-BO', opts)}`;
  }
  if (filtroTiempo === 'mes') {
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return `Este mes — del ${primerDia.toLocaleDateString('es-BO', opts)} al ${ultimoDia.toLocaleDateString('es-BO', opts)}`;
  }
  if (filtroTiempo === 'año') {
    return `Este año — del 1 de enero al 31 de diciembre de ${hoy.getFullYear()}`;
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

function ventasEnFiltroTiempo(venta) {
  if (filtroTiempo === 'todos') return true;

  const fechaVenta = venta.updated_at ? new Date(venta.updated_at) : new Date(venta.fecha + 'T00:00:00');

  if (filtroTiempo === 'mes' && window._filtroMesCustom) {
    const [year, month] = window._filtroMesCustom.split('-').map(Number);
    return fechaVenta.getFullYear() === year && fechaVenta.getMonth() === month - 1;
  }

  const limite = getFechaLimite(filtroTiempo);
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
  _bipAudio = null;
  _eventDelegationRegistered = false;
  _dismissRecordatorio();

  if (_audioCtx && _audioCtx.state !== 'closed') {
    _audioCtx.suspend().catch(() => {});
  }

  _geoSelectorsInitialized = false;
  filtroTiempo = 'mes';           
  window._filtroMesCustom = null; 
  selectedAgentId = 'all';       
  ClientesView.invalidate();  

  Objetivos.stop();
  currentUser = null;
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
  document.getElementById('filter-status').value = '';
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

  await Promise.all([
    _getClientesFieles(),  
    _getRoscaAnual(),       
  ]);
  renderDashboard();       

  _nrGeoInit = false;
  renderVentas();
  populateProductoFilter();
  setArchivoFiltro(false);
  if (currentUser.rol === 'admin') { renderUsers(); renderProductos(); }
  iniciarChequeoRecordatorios();
  await Objetivos.init();
}

let _eventDelegationRegistered = false;
function _setupEventDelegationOnce() {
  if (_eventDelegationRegistered) return;
  const tbody = document.getElementById('ventas-tbody');
  if (!tbody) return;
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) {
      const row = e.target.closest('tr[data-venta-id]');
      if (row) showNuevoRegistro(parseInt(row.dataset.ventaId));
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
  renderVentas();
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
      if (row.clave === 'filtro_tiempo') {
        filtroTiempo = row.valor;
        ['filtro-tiempo-global', 'filtro-tiempo-ventas', 'filtro-tiempo-dash'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = filtroTiempo;
        });
        if (filtroTiempo === 'mes') {
          const mesLabel = document.getElementById('mes-actual-label');
          const mesSel = document.getElementById('filtro-mes-especifico');
          const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                         'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
          if (mesLabel) { mesLabel.textContent = meses[new Date().getMonth()]; mesLabel.style.display = ''; }
          if (mesSel) { _buildFiltroMesSelector(); mesSel.style.display = ''; }
        }
      }
      if (row.clave === 'filtro_mes_custom') {
        const hoy = new Date();
        const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
        if (filtroTiempo === 'mes' && row.valor === mesActual) {
          window._filtroMesCustom = row.valor;
        }
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
          <button class="icon-btn" onclick="openProductoModal(${p.id})">✏️</button>
          <button class="icon-btn danger" onclick="toggleProductoActivo(${p.id}, ${p.activo})">${p.activo ? '🚫' : '✅'}</button>
          <button class="icon-btn danger" onclick="deleteProducto(${p.id})">🗑️</button>
        </div>
      </div>
      ${promos.length > 0 ? `
        <div style="font-size:11px;color:var(--text3);font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;">Promociones</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${promos.map(pr => `
            <span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">
              🏷️ ${pr.etiqueta}
            </span>`).join('')}
        </div>` : `<div style="font-size:12px;color:var(--text3);">Sin promociones</div>`}
    </div>`;
  }).join('') || '<div class="empty-state"><div class="emoji">📦</div><p>Sin productos</p></div>';
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
      style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:6px 9px;color:var(--red);cursor:pointer;margin-top:16px;">✕</button>`;
  wrap.appendChild(div);
}

async function saveProducto() {
  const id = document.getElementById('edit-producto-id').value;
  const nombre = document.getElementById('p-nombre').value.trim();
  const precioBase = parseFloat(document.getElementById('p-precio-base').value) || 0;
  const activo = document.getElementById('p-activo').value === 'true';
  if (!nombre) { toast('⚠️ El nombre es obligatorio', 'error'); return; }
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
      toast('✅ Producto actualizado', 'success');
    } else {
      const { error } = await db.from('productos').insert(payload);
      if (error) throw error;
      toast('✅ Producto creado', 'success');
    }
    closeProductoModal();
    // FIX #10 — recargar con soloActivos=false para mantener caché unificado
    await loadProductos(false);
    renderProductos();
    populateProductoFilter();
  } catch(e) { toast('❌ ' + e.message, 'error'); }
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
  btn.textContent = activo ? '🚫 Desactivar' : '✅ Activar';
  btn.style.background = activo ? 'var(--red)' : 'var(--green)';

  document.getElementById('toggle-producto-modal').classList.add('open');

  btn.onclick = async () => {
    closeToggleProductoModal();
    const { error } = await db.from('productos').update({ activo: !activo }).eq('id', id);
    if (error) { toast('❌ ' + error.message, 'error'); return; }
    prod.activo = !activo;
    _actualizarCardProducto(id, !activo);
    // FIX #5 — marcar filtro de ciudad como dirty no aplica aquí, pero
    // sí invalidar el filtro de productos del modal
    populateProductoFilter();
    toast(`✅ Producto ${activo ? 'desactivado' : 'activado'}`, 'success');
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
      btn.textContent = nuevoActivo ? '🚫' : '✅';
      btn.setAttribute('onclick', `toggleProductoActivo(${id}, ${nuevoActivo})`);
      break;
    }
  }
}

async function loadVentas() {
  try {
    let query = db.from('ventas')
      .select(`
        id, cliente_id, agente_id, fecha, updated_at, estado, intentos,
        notas, comprobante_url, archivado, monto_total, descuento_pct, recordatorio, recordatorio_visto,
        cliente:cliente_id ( id, celular, nombre, ubicacion, direccion_residencial,
                             producto_interes, notas, faltas, flag ),
        agente:agente_id   ( id, nombre ),
        venta_items ( id, cantidad, subtotal, producto_id, productos ( id, nombre ))
      `, { count: 'exact' })
      .order('archivado', { ascending: true })
      .order('id', { ascending: false });

    if (currentUser.rol === 'agente') {
      query = query.eq('agente_id', currentUser.id);
    } else if (currentUser.rol === 'admin' && selectedAgentId !== 'all') {
      query = query.eq('agente_id', selectedAgentId);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    ventas = data || [];
    totalVentasCount = count || 0;

    ventasIndex = {};
    ventas.forEach(v => ventasIndex[v.id] = v);
    dashboardCache.invalidate();
    filteredCache.invalidate();
    _cityFilterDirty = true;
    _clientesFielesCache = null;

  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
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
      <option value="all">👥 Todos los agentes</option>
      ${allAgents.filter(a => a.rol === 'agente').map(a =>
        `<option value="${a.id}">👤 ${a.nombre}</option>`
      ).join('')}
    </select>`;
  const sel = document.getElementById('filter-agente');
  if (sel) {
    sel.style.display = currentUser.rol === 'admin' ? '' : 'none';
    while (sel.options.length > 1) sel.remove(1);
    allAgents.filter(a => a.rol === 'agente').forEach(a => {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = '👤 ' + a.nombre;
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

async function onFiltroTiempoChange(valor) {
  filtroTiempo = valor;
  const mesLabel = document.getElementById('mes-actual-label');
  const mesSel = document.getElementById('filtro-mes-especifico');

  if (valor === 'mes') {
    const hoy = new Date();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if (mesLabel) { mesLabel.textContent = meses[hoy.getMonth()]; mesLabel.style.display = ''; }
    if (mesSel) { _buildFiltroMesSelector(); mesSel.style.display = ''; }
  } else {
    if (mesLabel) mesLabel.style.display = 'none';
    if (mesSel) mesSel.style.display = 'none';
    window._filtroMesCustom = null;
  }

  dashboardCache.invalidate();
  filteredCache.invalidate();
  ['filtro-tiempo-global', 'filtro-tiempo-ventas', 'filtro-tiempo-dash'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== valor) el.value = valor;
  });

  // Guardar preferencia del usuario actual (todos los roles)
  await _saveUserConfig('filtro_tiempo', valor);

  renderDashboard();
  renderVentas();
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
    toast('✅ Datos actualizados', 'success');
    ClientesView.invalidate();
    if (document.getElementById('view-clientes')?.classList.contains('active')) {
      ClientesView.load();
    }
  } finally {
    btn.classList.remove('syncing');
    _syncing = false;
  }
}

// NAV
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  event.target.classList.add('active');
  if (name === 'nuevo-registro') { showNuevoRegistro(); return; }
  if (name === 'ventas') renderVentas();
  if (name === 'clientes') ClientesView.load();
  if (name === 'dashboard') renderDashboard();
  if (name === 'usuarios') renderUsers();
  if (name === 'memorias') renderMemorias();
  if (name === 'productos') renderProductos();
  if (name === 'guia') renderGuia();
  if (name === 'config' && currentUser.rol === 'admin') loadConfigVendidosEditables();
}

function showViewDirect(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
}

// STATUS / BADGE HELPERS
function statusBadge(estado) {
  const e = ESTADOS[estado] || ESTADOS.rellamada;
  return `<span class="badge ${e.badge}">${e.label}</span>`;
}
function flagBadge(cliente) {
  if (!cliente) return '';
  if (cliente.flag === 'spam') return `<span class="badge badge-spam" title="SPAM: ${cliente.faltas} cancelaciones">🚫 SPAM</span>`;
  if (cliente.faltas >= 1) return `<span class="badge badge-cancelado" title="${cliente.faltas} cancelación(es)">⚠️ ${cliente.faltas} falta${cliente.faltas > 1 ? 's' : ''}</span>`;
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

  
  document.getElementById('dash-periodo').textContent = describeFiltroTiempo();
  document.getElementById('dashboard-agent-row').style.display = isAdmin ? 'flex' : 'none';

  const ventasFiltradas = ventas.filter(ventasEnFiltroTiempo);
  const total = ventasFiltradas.length;
  const vendidos = ventasFiltradas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0);
  const montoVendidos = ventasFiltradas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (parseFloat(v.monto_total) || 0), 0);
  const enviados  = ventasFiltradas.filter(v => v.estado === 'enviado').length;
  const interesados = ventasFiltradas.filter(v => v.estado === 'interesado').length;
  const seguimiento = ventasFiltradas.filter(v => v.estado === 'seguimiento').length;
  const sinResp = ventasFiltradas.filter(v => v.estado === 'sin_respuesta').length;

  // Llenar card Enviados
  const enviadosList = ventasFiltradas.filter(v => v.estado === 'enviado');
  document.getElementById('dash-enviados-count').textContent = `(${enviadosList.length})`;
  document.getElementById('dash-enviados-list').innerHTML = enviadosList.length === 0
    ? '<div style="color:var(--text3);font-size:13px;padding:8px;">Sin enviados en este período</div>'
    : enviadosList.map(v => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.cliente?.nombre || 's/n'}</div>
          <div style="font-size:11px;color:var(--accent2);">${v.cliente?.celular || ''}</div>
        </div>
        <div style="font-size:11px;color:var(--text2);text-align:right;flex-shrink:0;">
          ${(v.venta_items||[]).map(it=>it.productos?.nombre).filter(Boolean).map(n=>`<span class="prod-chip" style="font-size:10px;">${n}</span>`).join(' ')}
        </div>
      </div>`).join('');

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
    <div class="stat-card"><div class="stat-icon" style="background:var(--accent-glow);">📋</div>
      <div class="stat-value" style="color:var(--accent2);">${total}</div><div class="stat-label">MOVIMIENTOS</div></div>

    <div class="stat-card" onclick="openStatModal('vendido')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--green-bg);">✅</div>
      <div class="stat-value" style="color:var(--green);">${vendidos}</div>
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px;">Bs. ${montoVendidos.toFixed(0)}</div>
      <div class="stat-label">UNIDADES VENDIDAS</div>
    </div>

    <div class="stat-card" onclick="openStatModal('seguimiento')" style="cursor:pointer;">
      <div class="stat-icon" style="background:rgba(96,165,250,0.12);">🔄</div>
      <div class="stat-value" style="color:var(--blue);">${seguimiento}</div>
      <div class="stat-label">EN SEGUIMIENTO</div>
    </div>

    <div class="stat-card" onclick="openStatModal('sin_respuesta')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--red-bg);">📵</div>
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
  document.getElementById('prod-chart').innerHTML = Object.entries(prods)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `
    <div class="bar-row"><div class="bar-label">${k}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v/maxP*100).toFixed(0)}%;background:var(--accent)"></div></div>
    <div class="bar-count">${v}</div></div>`).join('')
    || '<p style="color:var(--text3);font-size:13px;">Sin datos</p>';

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
    ? '<div class="empty-state"><div class="emoji">🎉</div><p>Sin pendientes</p></div>'
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
}

// VENTAS — lista + filtros

// FIX #6 — getFiltered con memoización por inputs
function getFiltered() {
  const search    = document.getElementById('search-input').value.toLowerCase();
  const status    = document.getElementById('filter-status').value;
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
    filteredCache._tiempo    === filtroTiempo &&
    filteredCache._archivado === mostrarArchivados &&
    filteredCache._mesCustom === mesCustom
  ) {
    return filteredCache.result;
  }

  const result = ventas.filter(v => {
    if (!!v.archivado !== mostrarArchivados) return false;
    if (!ventasEnFiltroTiempo(v)) return false;
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
  filteredCache._tiempo    = filtroTiempo;
  filteredCache._archivado = mostrarArchivados;
  filteredCache._mesCustom = mesCustom;

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
        <td style="color:var(--text2);font-size:12px;">${v.fecha || ''}${v.archivado ? ' 🔒' : ''}</td>
        <td class="td-name">${v.cliente?.nombre || '<span style="color:var(--text3)">s/n</span>'} ${flagBadge(v.cliente)}</td>
        <td class="td-phone">
          <a href="tel:${v.cliente?.celular}" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none;">${v.cliente?.celular || ''}</a>
        </td>
        <td>${prodCell}</td>
        <td>${v.monto_total ? montoChip(v.monto_total) : ''}</td>
        <td style="max-width:160px;white-space:normal;word-break:break-word;font-size:13px;color:var(--text2);">${ubicacion}</td>
        <td>${statusBadge(v.estado)}${v.estado === 'rellamada' && v.intentos > 1 ? `<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>` : ''}${v.estado === 'sin_respuesta' && v.intentos > 1 ? `<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>` : ''}</td>
        <td style="min-width:280px;max-width:260px;overflow:hidden;white-space:normal;color:var(--text2);font-size:12px;" title="${v.notas || ''}">${v.notas || ''}${v.comprobante_url ? ` <a href="${v.comprobante_url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent2);">📎</a>` : ''}</td>
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
  document.getElementById('tab-activos').classList.toggle('archivo-tab-active', !archivado);
  document.getElementById('tab-archivados').classList.toggle('archivo-tab-active', archivado);

  const sel = document.getElementById('filter-status');
  sel.value = '';
  const activos = [
    ['rellamada',     '🔁 Rellamada'],
    ['seguimiento',   '🔄 Seguimiento'],
    ['interesado',    '🌟 Interesado'],
    ['agendar',       '📅 Agendar'],
    ['sin_respuesta', '📵 Sin respuesta'],
    ['enviado',       '📦 Enviado'],
  ];
  const archivados = [
    ['vendido',       '✅ Vendido'],
    ['no_interesado', '👎 No interesado'],
    ['cancelado',     '❌ Cancelado'],
    ['spam',          '🚫 SPAM'],
  ];
  const opciones = archivado ? archivados : activos;
  sel.innerHTML = '<option value="">Todos los estados</option>' +
    opciones.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  renderVentas();
}

// ELIMINAR USUARIO
function deleteUser(id) {
  db.from('usuarios').select('*').eq('id', id).single().then(({ data: u }) => {
    if (!u) return;
    if (u.usuario === 'admin') { toast('⚠️ No se puede eliminar el administrador principal', 'error'); return; }
    document.getElementById('delete-user-nombre').textContent = u.nombre;
    document.getElementById('delete-user-confirm-input').value = '';
    document.getElementById('delete-user-confirm-input').style.borderColor = '';
    document.getElementById('delete-user-error').style.display = 'none';
    document.getElementById('delete-user-modal').classList.add('open');
    document.getElementById('delete-user-confirm-input').focus();

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
        toast('🗑️ Usuario eliminado');
        _usersCache = null; // FIX #9
        renderUsers();
        await loadAgents();
        buildAgentSelector();
      } catch(e) { toast('❌ ' + e.message, 'error'); }
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
      toast('🗑️ Producto eliminado');
      // FIX #10 — mantener carga unificada
      await loadProductos(false);
      renderProductos();
      populateProductoFilter();
    } catch(e) { toast('❌ ' + e.message, 'error'); }
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
      toast('🗑️ Registro eliminado');
      renderVentas();
      renderDashboard();
    } catch(e) { toast('❌ ' + e.message, 'error'); }
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
    if (error) { toast('❌ Error cargando usuarios', 'error'); return; }
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
        <button class="icon-btn" onclick="openUserModal('${u.id}')">✏️ Editar</button>
        ${u.usuario !== 'admin' ? `
          <button class="icon-btn danger" onclick="toggleUserActive('${u.id}',${u.activo})">${u.activo ? '🚫 Desactivar' : '✅ Activar'}</button>
          <button class="icon-btn danger" onclick="deleteUser('${u.id}')">🗑️</button>
        ` : ''}
      </div>
    </div>`).join('');
}

async function toggleUserActive(id, active) {
  if (!confirm(`¿${active ? 'desactivar' : 'activar'} este usuario?`)) return;
  const { error } = await db.from('usuarios').update({ activo: !active }).eq('id', id);
  if (error) toast('❌ ' + error.message, 'error');
  else {
    toast(`✅ Usuario ${active ? 'desactivado' : 'activado'}`);
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
  if (!data.nombre || !data.usuario || !data.password) { toast('⚠️ Completa todos los campos', 'error'); return; }
  try {
    if (id) { const { error } = await db.from('usuarios').update(data).eq('id', id); if (error) throw error; }
    else { const { error } = await db.from('usuarios').insert(data); if (error) throw error; }
    closeUserModal();
    _usersCache = null; // FIX #9 — invalidar caché al guardar
    renderUsers();
    await loadAgents();
    buildAgentSelector();
    toast('✅ Usuario guardado', 'success');
  } catch(e) { toast('❌ ' + e.message, 'error'); }
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
  document.getElementById('toast-msg').textContent = msg;
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
  const labels = { vendido: '✅ Vendidos', interesado: '🌟 Interesados', sin_respuesta: '📵 Sin respuesta', seguimiento: '🔄 En seguimiento', rellamada: '🔁 Rellamadas', agendar: '📅 Agendar' };
  document.getElementById('stat-modal-title').textContent = labels[estado] || estado;

  const filtered = ventas.filter(v => v.estado === estado && ventasEnFiltroTiempo(v));
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

  const periodoTexto = describeFiltroTiempo();
  const pages = Math.ceil(total / STAT_PAGE_SIZE) || 1;
  if (statModalPage > pages) statModalPage = 1;
  const page = filtered.slice((statModalPage - 1) * STAT_PAGE_SIZE, statModalPage * STAT_PAGE_SIZE);
  const isAdmin = currentUser?.rol === 'admin';

  document.getElementById('stat-modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">${resumenTexto}</div>
    <div style="font-size:11px;color:var(--accent2);margin-bottom:14px;font-style:italic;">📅 ${periodoTexto}</div>
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
    const [{ data: dataVendidos, error }, { data: dataFiltro }] = await Promise.all([
      db.from('config').select('valor').eq('clave', 'vendidos_editables').single(),
      db.from('config').select('valor').eq('clave', 'filtro_tiempo_default').single(),
    ]);

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

async function saveConfigVendidosEditables(enabled) {
  try {
    const { error } = await db.from('config')
      .update({ valor: enabled ? 'true' : 'false' })
      .eq('clave', 'vendidos_editables');
    if (error) throw error;
    const span = document.getElementById('toggle-vendidos-span');
    if (span) span.style.background = enabled ? 'var(--green)' : 'var(--border)';
    toast(enabled ? '✅ Agentes pueden editar vendidos' : '🔒 Vendidos bloqueados para agentes', 'success');
    _vendidosEditablesCache = enabled;
  } catch(e) {
    console.error('Error guardando config:', e);
    toast('❌ Error guardando configuración', 'error');
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
  const found = [];
  for (let i = 1; i <= 50; i++) {
    const url = `resources/audio/Recordatorio${i}.mp3`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) found.push(url);
      else break; // para en el primer número que no exista
    } catch { break; }
  }
  _AUDIO_FILES = found.length > 0 ? found : [];
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
      <button onclick="showNuevoRegistro(${venta.id});_dismissRecordatorio()"
        style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);
               border-radius:6px;padding:6px 12px;color:white;cursor:pointer;font-size:13px;font-weight:600;">
        Ver registro
      </button>
      <button onclick="_silenciarRecordatorio()"
        style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.35);
               border-radius:6px;padding:6px 12px;color:white;cursor:pointer;font-size:13px;font-weight:600;">
        🔕 Silenciar
      </button>
      <button onclick="_marcarRecordatorioVisto(${venta.id});_dismissRecordatorio()"
        style="background:white;border:none;border-radius:6px;padding:6px 16px;
              color:var(--accent);cursor:pointer;font-size:13px;font-weight:700;">
        ✓ VISTO
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
  if (btn) { btn.textContent = '🔇 Silenciado'; btn.disabled = true; btn.style.opacity = '0.5'; }
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
    btn.textContent = '✅ Sonido activado';
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
      status.textContent = '⚠️ No se pudo activar el sonido en este navegador.';
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
    toast('✅ Configuración de clientes fieles guardada', 'success');
    renderDashboard();
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

async function _getClientesFieles() {
  if (_clientesFielesCache) return _clientesFielesCache;

  const { data, error } = await db
    .from('clientes_historial')
    .select(`
      cliente_id,
      mes,
      unidades,
      monto_total,
      ventas_count,
      cliente:cliente_id ( nombre, celular )
    `)
    .order('mes', { ascending: false });

  if (error || !data) {
    _clientesFielesCache = { top: [], resto: [] };
    return _clientesFielesCache;
  }

  // Agrupar por cliente sumando todos sus meses
  const mapa = {};
  for (const row of data) {
    const cid = row.cliente_id;
    if (!mapa[cid]) {
      mapa[cid] = {
        id: cid,
        nombre: row.cliente?.nombre  || 's/n',
        celular: row.cliente?.celular || '',
        unidades: 0,
        monto_total: 0,
        ventas_count: 0,
      };
    }
    mapa[cid].unidades += row.unidades || 0;
    mapa[cid].monto_total += parseFloat(row.monto_total || 0);
    mapa[cid].ventas_count += row.ventas_count || 0;
  }

  const lista = Object.values(mapa).sort((a, b) => b.unidades - a.unidades);
  const top = lista.slice(0, 5);
  const topIds = new Set(top.map(c => c.id));
  const resto = lista.filter(c => !topIds.has(c.id)).slice(0, 20);

  _clientesFielesCache = { top, resto };
  return _clientesFielesCache;
}

let _renderingClientesFieles = false;
async function renderClientesFieles() {
  if (_renderingClientesFieles) return;
  _renderingClientesFieles = true;
  const wrap = document.getElementById('dash-clientes-fieles');
  if (!wrap) return;
  wrap.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px;">Cargando...</div>';
  try {
    const { top, resto } = await _getClientesFieles();

    if (!top.length && !resto.length) {
      wrap.innerHTML = `<div style="color:var(--text3);font-size:13px;padding:8px;">
        Sin clientes fieles aún (umbral: ${_clientesFielesUmbral} unidades)
      </div>`;
      return;
    }

    const maxU = (top[0] || resto[0])?.unidades || 1;
    const medallas = ['🥇','🥈','🥉','4️⃣','5️⃣'];

    const topHTML = top.length
      ? top.map((c, i) => `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;
                align-items:center;margin-bottom:5px;">
              <span style="font-size:13px;font-weight:600;">
                ${medallas[i]} ${c.nombre}
              </span>
              <span style="font-size:12px;color:var(--green);font-weight:700;">
                ${c.unidades} und.
              </span>
            </div>
            <div style="font-size:12px;color:var(--text3);margin-bottom:5px;">
              ${c.celular}
            </div>
            <div class="bar-track" style="height:8px;">
              <div class="bar-fill"
                style="width:${(c.unidades/maxU*100).toFixed(0)}%;
                      background:var(--green);transition:width 0.5s ease;">
              </div>
            </div>
          </div>`).join('')
      : `<div style="color:var(--text3);font-size:13px;padding:8px 0;">
          Sin clientes con ${_clientesFielesUmbral}+ unidades aún
        </div>`;

    const restoHTML = resto.length
      ? resto.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;
              padding:6px 0;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:12px;font-weight:500;">${c.nombre}</div>
              <div style="font-size:12px;color:var(--text3);">${c.celular}</div>
            </div>
            <span style="font-size:12px;color:var(--green);font-weight:700;">
              ${c.unidades} und.
            </span>
          </div>`).join('')
      : `<div style="font-size:12px;color:var(--text3);padding:8px 0;">
          Sin otros clientes 1 unidad o más
        </div>`;

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:55% 40%;gap:5%;">
        <div>${topHTML}</div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
            Otros clientes (1 o más unidades)
          </div>
          <div style="max-height:260px;overflow-y:auto;">
            ${restoHTML}
          </div>
        </div>
      </div>`;
  } finally {
    _renderingClientesFieles = false;  // siempre se libera
  }
}

// Rosca / donut anual
let _roscaAnualCache = null;

async function _getRoscaAnual() {
  if (_roscaAnualCache) return _roscaAnualCache;
  const year = new Date().getFullYear();
  const desde = `${year}-01`;
  const hasta = `${year}-12`;

  const { data, error } = await db
    .from('clientes_historial')
    .select('mes, unidades, monto_total')
    .gte('mes', desde)
    .lte('mes', hasta);

  if (error || !data) { _roscaAnualCache = []; return []; }

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const mapa = {};
  for (let i = 1; i <= 12; i++) {
    const key = `${year}-${String(i).padStart(2,'0')}`;
    mapa[key] = { mes: meses[i-1], unidades: 0, monto: 0 };
  }
  for (const row of data) {
    if (mapa[row.mes]) {
      mapa[row.mes].unidades += row.unidades || 0;
      mapa[row.mes].monto    += parseFloat(row.monto_total || 0);
    }
  }
  _roscaAnualCache = Object.values(mapa);
  return _roscaAnualCache;
}

async function renderRoscaAnual() {
  const wrap = document.getElementById('dash-rosca-anual');
  if (!wrap) return;
 
  const datos = await _getRoscaAnual();
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
        ${leyenda}
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

// INIT
initTheme();