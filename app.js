// ⚡ VERSIÓN OPTIMIZADA - Implementa mejoras críticas

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

// 🎯 OPTIMIZACIÓN 1: CACHÉ DE DASHBOARD
const dashboardCache = {
  lastVentasCount: 0,
  lastAgentId: null,
  prods: {},
  cities: {},
  sCounts: {},
  agStats: [],
  isDirty: true,
  
  invalidate() {
    this.isDirty = true;
  },
  
  isValid(ventasLength, agentId) {
    return !this.isDirty && 
           this.lastVentasCount === ventasLength && 
           this.lastAgentId === agentId;
  }
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

let currentUser = null;
let ventas = [];
let ventasIndex = {}; // 🎯 OPTIMIZACIÓN 5: Índice de ventas para búsqueda O(1)
let allAgents = [];
let allProductos = [];
let selectedAgentId  = 'all';
let currentPage = 1;
const PAGE_SIZE = 25;
let mostrarArchivados = false;

// 🎯 OPTIMIZACIÓN 2: Debounce mejorado
let _searchTimer;
let _filterTimer;
function debouncedRenderVentas() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderVentas, 250);
}
function debouncedFilterRender() {
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(renderVentas, 300);
}

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
    initApp().catch(e => console.error('Error inicializando app:', e));
  }
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
    document.getElementById('user-name-top').textContent   = data.nombre;
    document.getElementById('user-avatar-top').textContent = data.nombre[0].toUpperCase();
    const isAdmin = data.rol === 'admin';
    document.getElementById('tab-productos').style.display = isAdmin ? '' : 'none';
    document.getElementById('tab-config').style.display    = isAdmin ? '' : 'none';
    document.getElementById('tab-usuarios').style.display  = isAdmin ? '' : 'none';
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
  currentUser = null; 
  ventas = []; 
  ventasIndex = {}; // Limpiar índice
  allAgents = []; 
  allProductos = [];
  dashboardCache.invalidate(); // Invalidar caché
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showViewDirect('dashboard');
  SessionManager.clearSession();
}

// INIT
async function initApp() {
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  if (currentUser.rol === 'admin') {
    await Promise.all([loadProductos(), loadAgents(), loadVentas()]);
    buildAgentSelector();
  } else {
    await Promise.all([loadProductos(), loadVentas()]);
  }
  setupEventDelegation(); // 🎯 OPTIMIZACIÓN 6: Setup de event delegation
  renderDashboard();
  initGeoSelectors();
  renderVentas();
  populateProductoFilter();
  setArchivoFiltro(false);
  if (currentUser.rol === 'admin') { renderUsers(); renderProductos(); }
}

// 🎯 OPTIMIZACIÓN 6: Event Delegation (delegación de eventos)
function setupEventDelegation() {
  const tbody = document.getElementById('ventas-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) {
        const row = e.target.closest('tr[data-venta-id]');
        if (row) openVentaModal(parseInt(row.dataset.ventaId));
      }
    });
  }
}

// PRODUCTOS — catálogo
async function loadProductos() {
  const { data, error } = await db.from('productos')
    .select('*').eq('activo', true).order('nombre');
  if (!error) allProductos = data || [];
}
async function loadProductosAll() {
  const { data, error } = await db.from('productos').select('*').order('nombre');
  if (!error) allProductos = data || [];
}

function populateProductoFilter() {
  const sel = document.getElementById('filter-producto');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProductos.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.nombre;
    sel.appendChild(o);
  });
}

// PRODUCTOS — vista admin CRUD
async function renderProductos() {
  await loadProductosAll();
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
    await loadProductos();
    await loadProductosAll();
    renderProductos();
    populateProductoFilter();
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

async function toggleProductoActivo(id, activo) {
  const accion = activo ? 'desactivar' : 'activar';
  if (!confirm(`¿${accion} este producto?`)) return;
  const { error } = await db.from('productos').update({ activo: !activo }).eq('id', id);
  if (error) { toast('❌ ' + error.message, 'error'); return; }
  toast(`✅ Producto ${activo ? 'desactivado' : 'activado'}`);
  await loadProductosAll();
  renderProductos();
}

// 🎯 OPTIMIZACIÓN 5: Cargar ventas CON ÍNDICE
async function loadVentas() {
  try {
    let query = db.from('ventas')
      .select(`
        id, cliente_id, agente_id, fecha, estado, intentos,
        notas, comprobante_url, archivado, monto_total,
        cliente:cliente_id ( id, celular, nombre, ubicacion, direccion_residencial,
                             producto_interes, notas, faltas, flag ),
        agente:agente_id   ( id, nombre ),
        venta_items ( id, cantidad, subtotal, producto_id, productos ( id, nombre ))
      `)
      .order('archivado', { ascending: true })
      .order('id', { ascending: false });

    if (currentUser.rol === 'agente') {
      query = query.eq('agente_id', currentUser.id);
    } else if (currentUser.rol === 'admin' && selectedAgentId !== 'all') {
      query = query.eq('agente_id', selectedAgentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    ventas = data || [];
    
    // Construir índice O(1) para búsquedas
    ventasIndex = {};
    ventas.forEach(v => ventasIndex[v.id] = v);
    
    // Invalidar caché de dashboard
    dashboardCache.invalidate();
    
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
    ventas = [];
    ventasIndex = {};
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
    sel.style.display = '';
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
  initGeoSelectors();
  renderVentas();
}

let _syncing = false;
async function syncData() {
  if (_syncing) return;
  _syncing = true;
  const btn = document.getElementById('sync-btn');
  btn.classList.add('syncing');
  try {
    await Promise.all([loadProductos(), loadVentas()]);
    renderDashboard();
    renderVentas();
    populateProductoFilter();
    toast('✅ Datos actualizados', 'success');
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
  if (name === 'ventas')    renderVentas();
  if (name === 'dashboard') renderDashboard();
  if (name === 'usuarios')  renderUsers();
  if (name === 'productos') renderProductos();
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
  return `<span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">Bs.${parseFloat(monto).toFixed(0)}</span>`;
}

// 🎯 OPTIMIZACIÓN 1: Dashboard con Caché
function renderDashboard() {
  const isAdmin    = currentUser.rol === 'admin';
  const showingAll = selectedAgentId === 'all';

  const subtitle = isAdmin
    ? (showingAll ? 'Vista general — todos los agentes' : `Filtrando: ${allAgents.find(a => a.id === selectedAgentId)?.nombre || ''}`)
    : `Tu actividad — ${currentUser.nombre}`;
  document.getElementById('dash-subtitle').textContent = subtitle;
  document.getElementById('dashboard-agent-row').style.display = isAdmin ? 'flex' : 'none';

  const total = ventas.length;
  const vendidos = ventas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0);
  const montoVendidos = ventas
    .filter(v => v.estado === 'vendido')
    .reduce((sum, v) => sum + (parseFloat(v.monto_total) || 0), 0);
  const enviados  = ventas.filter(v => v.estado === 'enviado').length;
  const interesados = ventas.filter(v => v.estado === 'interesado').length;
  const seguimiento = ventas.filter(v => ['seguimiento', 'rellamada', 'agendar'].includes(v.estado)).length;
  const sinResp = ventas.filter(v => v.estado === 'sin_respuesta').length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:var(--accent-glow);">📋</div>
      <div class="stat-value" style="color:var(--accent2);">${total}</div><div class="stat-label">MOVIMIENTOS</div></div>

    <div class="stat-card" onclick="openStatModal('vendido')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--green-bg);">✅</div>
      <div class="stat-value" style="color:var(--green);">${vendidos}</div>
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px;">Bs. ${montoVendidos.toFixed(0)}</div>
      <div class="stat-label">VENDIDOS</div>
    </div>

    <div class="stat-card"><div class="stat-icon" style="background:var(--blue-bg);">📦</div>
      <div class="stat-value" style="color:var(--blue);">${enviados}</div><div class="stat-label">ENVIADOS</div></div>

    <div class="stat-card" onclick="openStatModal('interesado')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--yellow-bg);">🌟</div>
      <div class="stat-value" style="color:var(--yellow);">${interesados}</div><div class="stat-label">INTERESADOS</div>
    </div>

    <div class="stat-card"><div class="stat-icon" style="background:rgba(96,165,250,0.12);">🔄</div>
      <div class="stat-value" style="color:var(--blue);">${seguimiento}</div><div class="stat-label">EN SEGUIMIENTO</div></div>

    <div class="stat-card" onclick="openStatModal('sin_respuesta')" style="cursor:pointer;">
      <div class="stat-icon" style="background:var(--red-bg);">📵</div>
      <div class="stat-value" style="color:var(--red);">${sinResp}</div><div class="stat-label">SIN RESPUESTA</div>
    </div>
  `;

  // Usar caché para cálculos costosos
  if (!dashboardCache.isValid(ventas.length, selectedAgentId)) {
    // Recalcular solo si cambió
    dashboardCache.prods = {};
    dashboardCache.cities = {};
    dashboardCache.sCounts = {};
    
    ventas.forEach(v => {
      (v.venta_items || []).forEach(it => {
        const nombre = it.productos?.nombre || 'Sin producto'
        dashboardCache.prods[nombre] = (dashboardCache.prods[nombre] || 0) + 1;
      });
    });
    
    ventas.forEach(v => {
      const c = v.cliente?.ubicacion;
      if (c && c !== 's/c' && c !== '') dashboardCache.cities[c] = (dashboardCache.cities[c] || 0) + 1;
    });
    
    Object.keys(ESTADOS).forEach(k => {
      dashboardCache.sCounts[k] = ventas.filter(v => v.estado === k).length;
    });
    
    dashboardCache.lastVentasCount = ventas.length;
    dashboardCache.lastAgentId = selectedAgentId;
    dashboardCache.isDirty = false;
  }

  // Usar datos cacheados
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

  // Pendientes
  const pending = ventas.filter(v => ['seguimiento', 'rellamada', 'interesado', 'agendar'].includes(v.estado)).slice(0, 10);
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

  // Rendimiento por agente
  if (isAdmin && showingAll && allAgents.length > 0) {
    const agStats = allAgents.filter(a => a.rol === 'agente').map(ag => {
      const av = ventas.filter(v => v.agente_id === ag.id);
      return {
        nombre: ag.nombre,
        total: av.length,
        vendidos: av.filter(v => v.estado === 'vendido').length,
        interesados: av.filter(v => v.estado === 'interesado').length,
      };
    });
    const maxT = Math.max(...agStats.map(a => a.total), 1);
    document.getElementById('agents-chart').innerHTML = agStats.map(a => `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;">${a.nombre}</span>
          <span style="font-size:12px;color:var(--text2);">${a.total} registros · ${a.vendidos} vendidos · ${a.interesados} interesados</span>
        </div>
        <div class="bar-track" style="height:10px;">
          <div class="bar-fill" style="width:${(a.total/maxT*100).toFixed(0)}%;background:linear-gradient(90deg,var(--accent),var(--accent2))"></div>
        </div>
      </div>`).join('');
    document.getElementById('agents-card').style.display = '';
  } else {
    document.getElementById('agents-card').style.display = 'none';
  }
}

//  VENTAS — lista + filtros
function populateCityFilter() {
  const cities = [...new Set(ventas.map(v => v.cliente?.ubicacion).filter(c => c && c !== 's/c' && c !== ''))].sort();
  const sel = document.getElementById('filter-ubicacion');
  while (sel.options.length > 1) sel.remove(1);
  cities.forEach(c => { const o = document.createElement('option'); o.value = c.toLowerCase(); o.textContent = c; sel.appendChild(o); });
}

function getFiltered() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const prodId = document.getElementById('filter-producto').value;
  const ubicacion = document.getElementById('filter-ubicacion').value;
  const agente = document.getElementById('filter-agente')?.value || '';
  return ventas.filter(v => {
    if (!!v.archivado !== mostrarArchivados) return false;
    const nombre = v.cliente?.nombre  || '';
    const cel = v.cliente?.celular || '';
    const prodNames = (v.venta_items || []).map(it => it.productos?.nombre || '').join(' ');
    const haystack  = `${nombre} ${cel} ${prodNames} ${v.cliente?.ubicacion || ''} ${v.notas || ''}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && v.estado !== status) return false;
    if (prodId && !(v.venta_items || []).some(it => it.producto_id == prodId)) return false;
    if (ubicacion && !(v.cliente?.ubicacion || '').toLowerCase().includes(ubicacion)) return false;
    if (agente && v.agente_id !== agente) return false;
    return true;
  });
}

function renderVentas() {
  populateCityFilter();
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = 1;
  const page = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const isAdmin = currentUser?.rol === 'admin';

  document.getElementById('ventas-count').textContent = `${total} ${mostrarArchivados ? 'archivados' : 'activos'} encontrados`;
  const totalUnidades = filtered.reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0);
  document.getElementById('table-count').textContent = `${total} registros · ${totalUnidades} unidades`;

  document.getElementById('ventas-tbody').innerHTML = page.map(v => {
    const prodNombres = (v.venta_items || []).map(it => it.productos?.nombre).filter(Boolean);
    const prodCell    = prodNombres.length > 0
      ? prodNombres.map(n => prodChip(n)).join(' ')
      : '<span style="color:var(--text3);font-size:12px;">—</span>';
    const ubicacion   = v.cliente?.ubicacion || '';
    return `
    <tr data-venta-id="${v.id}" style="${v.archivado ? 'opacity:0.6;' : ''}">
      <td style="color:var(--text2);font-size:12px;">${v.fecha || ''}${v.archivado ? ' 🔒' : ''}</td>
      <td class="td-name">${v.cliente?.nombre || '<span style="color:var(--text3)">s/n</span>'} ${flagBadge(v.cliente)}</td>
      <td class="td-phone">
        <a href="tel:${v.cliente?.celular}" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none;">${v.cliente?.celular || ''}</a>
      </td>
      <td>${prodCell}</td>
      <td>${v.monto_total ? montoChip(v.monto_total) : ''}</td>
      <td class="td-ubicacion">${ubicacion}</td>
      <td>${statusBadge(v.estado)}${v.estado === 'rellamada' && v.intentos > 1 ? `<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>` : ''}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);font-size:12px;" title="${v.notas || ''}">${v.notas || ''}${v.comprobante_url ? ` <a href="${v.comprobante_url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent2);">📎</a>` : ''}</td>
      ${isAdmin ? `<td style="font-size:11px;color:var(--accent2);">${v.agente?.nombre || '—'}</td>` : ''}
      <td class="td-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" onclick="openVentaModal(${v.id})">✏️</button>
        <button class="icon-btn danger" onclick="deleteVenta(${v.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text2);">Sin resultados</td></tr>';

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
function goPage(p) { currentPage = p; renderVentas(); window.scrollTo(0, 200); }

function setArchivoFiltro(archivado) {
  mostrarArchivados = archivado;
  currentPage = 1;
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

//  VENTA ITEMS — multi-producto (código igual al original - mantener sin cambios)
function addVentaItem(data) {
  const wrap = document.getElementById('venta-items-wrap');
  const idx  = Date.now();
  const row = document.createElement('div');
  row.dataset.idx = idx;
  row.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;position:relative;';
  row.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 90px auto;gap:8px;align-items:end;margin-bottom:8px;">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Producto</div>
        <select class="smart-input item-producto" onchange="onItemProductoChange(this)" style="width:100%;">
          <option value="">— Seleccionar —</option>
          ${allProductos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px;">Cantidad</div>
        <input class="smart-input item-cantidad" type="number" min="1" max="99"
          value="${data?.cantidad || 1}" style="text-align:center;" oninput="onItemCantidadChange(this)">
      </div>
      <button type="button" onclick="removeVentaItem(this)"
        style="background:var(--red-bg);border:1px solid var(--red);border-radius:6px;padding:8px 10px;color:var(--red);cursor:pointer;margin-top:18px;">✕</button>
    </div>
    <div class="item-promos-wrap" style="display:none;margin-bottom:8px;">
      <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Promoción</div>
      <div class="item-promos-chips" style="display:flex;flex-wrap:wrap;gap:5px;"></div>
      <input type="hidden" class="item-promo-index" value="">
    </div>
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
      <span style="font-size:12px;color:var(--text3);" class="item-subtotal-label"></span>
      <span style="font-size:14px;font-weight:700;color:var(--green);" class="item-subtotal-display" data-value="0">Bs. 0</span>
    </div>
  `;
  wrap.appendChild(row);
  if (data?.producto_id) {
    const sel = row.querySelector('.item-producto');
    sel.value = data.producto_id;
    onItemProductoChange(sel, data);
  }
  recalcMonto();
}

function removeVentaItem(btn) {
  btn.closest('[data-idx]').remove();
  recalcMonto();
}

function onItemProductoChange(sel, preData) {
  const row = sel.closest('[data-idx]');
  const pid = parseInt(sel.value);
  const prod = allProductos.find(p => p.id === pid);
  const promosWrap = row.querySelector('.item-promos-wrap');
  const promosChips = row.querySelector('.item-promos-chips');
  const promoIdx = row.querySelector('.item-promo-index');
  const cantInput = row.querySelector('.item-cantidad');
  promoIdx.value = '';
  if (!prod) {
    promosWrap.style.display = 'none';
    const display = row.querySelector('.item-subtotal-display');
    display.textContent = 'Bs. 0';
    display.dataset.value = '0';
    row.querySelector('.item-subtotal-label').textContent = '';
    recalcMonto();
    return;
  }
  const promos = prod.promociones || [];
  if (promos.length > 0) {
    promosWrap.style.display = '';
    promosChips.innerHTML = promos.map((pr, i) => `
      <span class="quick-chip item-promo-chip"
        data-promo="${i}" data-precio="${pr.precio_total}" data-cantidad="${pr.cantidad}"
        onclick="selectItemPromo(this)"
        style="background:var(--yellow-bg);border-color:var(--yellow);color:var(--yellow);">
        🏷️ ${pr.etiqueta}
      </span>`).join('');
  } else {
    promosWrap.style.display = 'none';
  }
  if (preData?.promo_index !== undefined && preData.promo_index !== null && promos[preData.promo_index]) {
    const chip = promosChips.querySelector(`[data-promo="${preData.promo_index}"]`);
    if (chip) {
      chip.classList.add('active');
      chip.style.background = 'var(--yellow)';
      chip.style.color = '#1a1a00';
    }
    promoIdx.value = preData.promo_index;
    cantInput.value = promos[preData.promo_index].cantidad;
  }
  if (preData?.subtotal && promoIdx.value === '') {
    const display = row.querySelector('.item-subtotal-display');
    display.textContent = `Bs. ${parseFloat(preData.subtotal).toFixed(2)}`;
    display.dataset.value = preData.subtotal;
    row.querySelector('.item-subtotal-label').textContent = '';
    recalcMonto();
    return;
  }
  updateItemSubtotal(row);
}

function selectItemPromo(chip) {
  const row = chip.closest('[data-idx]');
  const promoIdx = row.querySelector('.item-promo-index');
  const idx = parseInt(chip.dataset.promo);
  const allChips = row.querySelectorAll('.item-promo-chip');
  const cantInput = row.querySelector('.item-cantidad');
  if (promoIdx.value !== '' && parseInt(promoIdx.value) === idx) {
    promoIdx.value = '';
    allChips.forEach(c => {
      c.classList.remove('active');
      c.style.background = 'var(--yellow-bg)';
      c.style.color = 'var(--yellow)';
      c.style.borderColor = 'var(--yellow)';
    });
    updateItemSubtotal(row);
    return;
  }
  promoIdx.value = idx;
  allChips.forEach(c => {
    c.classList.remove('active');
    c.style.background = 'var(--yellow-bg)';
    c.style.color = 'var(--yellow)';
    c.style.borderColor = 'var(--yellow)';
  });
  chip.classList.add('active');
  chip.style.background = 'var(--yellow)';
  chip.style.color = '#1a1a00';
  chip.style.borderColor = 'var(--yellow)';
  cantInput.value = chip.dataset.cantidad;
  updateItemSubtotal(row);
}

function onItemCantidadChange(input) {
  const row = input.closest('[data-idx]');
  const promoIdx = row.querySelector('.item-promo-index');
  if (promoIdx.value !== '') {
    promoIdx.value = '';
    row.querySelectorAll('.item-promo-chip').forEach(c => {
      c.classList.remove('active');
      c.style.background = 'var(--yellow-bg)';
      c.style.color = 'var(--yellow)';
      c.style.borderColor = 'var(--yellow)';
    });
  }
  updateItemSubtotal(row);
}

function updateItemSubtotal(row) {
  const pid = parseInt(row.querySelector('.item-producto').value);
  const prod = allProductos.find(p => p.id === pid);
  const cant = parseInt(row.querySelector('.item-cantidad').value) || 1;
  const promoIdxV = row.querySelector('.item-promo-index').value;
  const display = row.querySelector('.item-subtotal-display');
  const label = row.querySelector('.item-subtotal-label');
  if (!prod) {
    display.textContent = 'Bs. 0';
    display.dataset.value = '0';
    label.textContent = '';
    recalcMonto();
    return;
  }
  let subtotal;
  if (promoIdxV !== '' && prod.promociones?.[parseInt(promoIdxV)]) {
    const promo = prod.promociones[parseInt(promoIdxV)];
    subtotal = promo.precio_total;
    label.textContent = `promo: ${promo.etiqueta}`;
  } else {
    subtotal = prod.precio_base * cant;
    label.textContent = `Bs.${prod.precio_base} × ${cant}`;
  }
  display.textContent = `Bs. ${subtotal.toFixed(2)}`;
  display.dataset.value = subtotal;
  recalcMonto();
}

function recalcMonto() {
  let total = 0;
  document.querySelectorAll('#venta-items-wrap [data-idx]').forEach(row => {
    total += parseFloat(row.querySelector('.item-subtotal-display')?.dataset.value || 0);
  });
  const count = document.querySelectorAll('#venta-items-wrap [data-idx]').length;
  if (total > 0) {
    document.getElementById('f-monto').value = total.toFixed(2);
    document.getElementById('monto-tag').textContent = `${count} producto${count !== 1 ? 's' : ''}`;
  } else {
    document.getElementById('f-monto').value = '';
    document.getElementById('monto-tag').textContent = '';
  }
}

function getVentaItemsData() {
  const items = [];
  document.querySelectorAll('#venta-items-wrap [data-idx]').forEach(row => {
    const pid = parseInt(row.querySelector('.item-producto').value);
    const cant = parseInt(row.querySelector('.item-cantidad').value) || 1;
    const sub = parseFloat(row.querySelector('.item-subtotal-display')?.dataset.value || 0);
    if (pid && sub > 0) items.push({ producto_id: pid, cantidad: cant, subtotal: sub });
  });
  return items;
}

function clearVentaItems() {
  document.getElementById('venta-items-wrap').innerHTML = '';
  document.getElementById('f-monto').value = '';
  document.getElementById('monto-tag').textContent = '';
}

// MODAL VENTA
let celularTimer = null;

async function onCelularInput() {
  clearTimeout(celularTimer);
  const cel = document.getElementById('f-celular').value.trim();
  const sugg = document.getElementById('celular-suggestion');
  sugg.style.display = 'none';
  document.getElementById('cliente-info-box').style.display = 'none';
  if (cel.length < 6) return;
  celularTimer = setTimeout(async () => {
    const { data } = await db.from('clientes')
      .select('id, nombre, ubicacion, producto_interes, notas, faltas, flag')
      .eq('celular', cel).maybeSingle();
    if (data) {
      document.getElementById('f-cliente-id').value = data.id;
      document.getElementById('f-nombre').value = data.nombre || '';
      document.getElementById('f-ubicacion').value = data.ubicacion || '';
      if (data.producto_interes) {
        const matchProd = allProductos.find(p =>
          p.nombre.toLowerCase().includes(data.producto_interes.toLowerCase()) ||
          data.producto_interes.toLowerCase().includes(p.nombre.toLowerCase())
        );
        if (matchProd) {
          const firstSel = document.querySelector('#venta-items-wrap .item-producto');
          if (firstSel && !firstSel.value) {
            firstSel.value = matchProd.id;
            onItemProductoChange(firstSel);
          }
        }
      }
      const infoBox = document.getElementById('cliente-info-box');
      infoBox.style.display = '';
      const { data: cicloAbierto } = await db.from('ventas')
        .select('id, estado, fecha, venta_items( productos:producto_id(nombre) )')
        .eq('cliente_id', data.id).eq('agente_id', currentUser.id).eq('archivado', false)
        .order('id', { ascending: false }).limit(1).maybeSingle();
      const cicloProds = cicloAbierto
        ? (cicloAbierto.venta_items || []).map(it => it.productos?.nombre).filter(Boolean).join(', ')
        : '';
      const cicloWarning = cicloAbierto ? `
        <div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:8px 12px;margin-bottom:8px;">
          <div style="color:var(--yellow);font-size:12px;font-weight:600;margin-bottom:4px;">⚠️ Ya tienes un ciclo abierto con este cliente</div>
          <div style="color:var(--text2);font-size:11px;">${cicloProds || '—'} · ${ESTADOS[cicloAbierto.estado]?.label || cicloAbierto.estado} · ${cicloAbierto.fecha || ''}</div>
          <button onclick="closeVentaModal();setTimeout(()=>openVentaModal(${cicloAbierto.id}),50)"
            style="margin-top:6px;background:var(--yellow);border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:600;color:#0a0a0f;cursor:pointer;">→ Ir al registro existente</button>
        </div>` : '';
      const spamBanner = data.flag === 'spam' ? `
        <div style="background:rgba(248,113,113,0.15);border:2px solid var(--red);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="color:var(--red);font-weight:700;font-size:14px;margin-bottom:4px;">🚫 ¡SPAM! Este cliente solo molesta, no compra.</div>
          <div style="color:var(--text2);font-size:12px;">Tiene ${data.faltas} cancelación(es) registrada(s).</div>
        </div>` : '';
      infoBox.innerHTML = spamBanner + cicloWarning + `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;">
          <div style="color:var(--accent2);font-weight:600;margin-bottom:4px;">👤 Cliente registrado ${flagBadge(data)}</div>
          ${data.faltas > 0 && data.flag !== 'spam' ? `<div style="color:var(--orange);font-size:11px;">❌ ${data.faltas} cancelación(es)</div>` : ''}
          ${data.notas ? `<div style="color:var(--text2);margin-top:4px;">${data.notas}</div>` : ''}
        </div>`;
    } else {
      document.getElementById('f-cliente-id').value = '';
      sugg.textContent = '✨ Nuevo cliente — se creará el perfil al guardar';
      sugg.style.background = 'var(--green-bg)';
      sugg.style.borderColor = 'rgba(34,211,164,0.3)';
      sugg.style.color = 'var(--green)';
      sugg.style.display = 'block';
    }
  }, 350);
}

async function openVentaModal(id) {
  document.getElementById('venta-modal').classList.add('open');
  document.querySelectorAll('.quick-chip').forEach(ch => {
    ch.classList.remove('active', 'chip-disabled');
    ch.title = '';
  });
  document.getElementById('celular-suggestion').style.display = 'none';
  document.getElementById('cliente-info-box').style.display = 'none';
  document.getElementById('f-comprobante').value = '';
  renderComprobantePreview(null);
  if (allProductos.length === 0) await loadProductos();
  const af = document.getElementById('agente-field');
  if (af) {
    af.style.display = currentUser.rol === 'admin' ? '' : 'none';
    if (currentUser.rol === 'admin') {
      document.getElementById('f-agente').innerHTML =
        allAgents.filter(a => a.rol === 'agente').map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');
    }
  }
  if (id) {
    // 🎯 OPTIMIZACIÓN 5: Usar índice para búsqueda O(1)
    const v = ventasIndex[id];
    if (!v) return;
    const isArchivado = !!v.archivado;
    const isAdmin = currentUser?.rol === 'admin';
    const shouldLock = isArchivado && !isAdmin;
    document.getElementById('modal-title').textContent = isArchivado ? '🔒 Registro Archivado' : 'Editar Registro';
    const archivedBanner = document.getElementById('archived-banner');
    if (archivedBanner) archivedBanner.style.display = isArchivado ? '' : 'none';
    const lockFields = ['f-fecha', 'f-celular', 'f-nombre', 'f-ubicacion', 'f-notas', 'f-intentos', 'f-direccion', 'f-monto'];
    lockFields.forEach(fid => { const el = document.getElementById(fid); if (el) el.disabled = shouldLock; });
    document.querySelectorAll('.quick-chip').forEach(ch => {
      ch.style.pointerEvents = shouldLock ? 'none' : '';
      ch.style.opacity = shouldLock ? '0.4' : '';
    });
    const addItemBtn = document.getElementById('btn-add-item');
    if (addItemBtn) addItemBtn.style.display = shouldLock ? 'none' : '';
    const saveBtn = document.querySelector('#venta-modal .btn-save');
    if (saveBtn) saveBtn.style.display = shouldLock ? 'none' : '';
    document.getElementById('edit-venta-id').value = id;
    document.getElementById('f-fecha').value = v.fecha || '';
    document.getElementById('f-celular').value = v.cliente?.celular || '';
    document.getElementById('f-nombre').value = v.cliente?.nombre || '';
    document.getElementById('f-cliente-id').value = v.cliente_id || '';
    document.getElementById('f-ubicacion').value = v.cliente?.ubicacion || '';
    document.getElementById('f-notas').value = v.notas || '';
    document.getElementById('f-direccion').value = v.cliente?.direccion_residencial || '';
    document.getElementById('f-monto').value = v.monto_total || '';
    document.getElementById('monto-tag').textContent = '';
    clearVentaItems();
    const itemsExistentes = v.venta_items || [];
    if (itemsExistentes.length > 0) {
      itemsExistentes.forEach(it => addVentaItem({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        subtotal: it.subtotal,
      }));
    } else {
      addVentaItem();
    }
    if (shouldLock) {
      document.querySelectorAll('#venta-items-wrap select, #venta-items-wrap input, #venta-items-wrap button').forEach(el => el.disabled = true);
    }
    const mp = document.getElementById('maps-preview');
    if (mp) mp.innerHTML = '';
    if (v.cliente?.direccion_residencial) onDireccionKeydown({ key: 'Enter', preventDefault: () => {} });
    ['sel-departamento', 'sel-provincia', 'sel-municipio'].forEach(sid => {
      const el = document.getElementById(sid);
      if (el) { el.value = ''; if (sid !== 'sel-departamento') el.disabled = true; }
    });
    document.getElementById('f-intentos').value = v.intentos || 1;
    document.getElementById('f-estado').value = v.estado || 'rellamada';
    document.querySelector(`.quick-chip[data-estado="${v.estado}"]`)?.classList.add('active');
    toggleIntentosField(v.estado);
    if (currentUser.rol === 'admin' && v.agente_id)
      document.getElementById('f-agente').value = v.agente_id;
    renderComprobantePreview(v.comprobante_url || null);
  } else {
    document.getElementById('modal-title').textContent = 'Nuevo Registro';
    document.getElementById('edit-venta-id').value = '';
    const archivedBanner = document.getElementById('archived-banner');
    if (archivedBanner) archivedBanner.style.display = 'none';
    const lockFields = ['f-fecha', 'f-celular', 'f-nombre', 'f-ubicacion', 'f-notas', 'f-intentos', 'f-direccion', 'f-monto'];
    lockFields.forEach(fid => { const el = document.getElementById(fid); if (el) el.disabled = false; });
    document.querySelectorAll('.quick-chip').forEach(ch => { ch.style.pointerEvents = ''; ch.style.opacity = ''; });
    const addItemBtn = document.getElementById('btn-add-item');
    if (addItemBtn) addItemBtn.style.display = '';
    const saveBtn = document.querySelector('#venta-modal .btn-save');
    if (saveBtn) saveBtn.style.display = '';
    document.getElementById('f-fecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('f-celular').value = '';
    document.getElementById('f-nombre').value = '';
    document.getElementById('f-cliente-id').value = '';
    document.getElementById('f-ubicacion').value = '';
    document.getElementById('f-notas').value = '';
    document.getElementById('f-direccion').value = '';
    const mpNew = document.getElementById('maps-preview');
    if (mpNew) mpNew.innerHTML = '';
    ['sel-departamento', 'sel-provincia', 'sel-municipio'].forEach(sid => {
      const el = document.getElementById(sid);
      if (el) { el.value = ''; if (sid !== 'sel-departamento') el.disabled = true; }
    });
    document.getElementById('f-intentos').value = 1;
    document.getElementById('f-estado').value = 'rellamada';
    document.querySelector('.quick-chip[data-estado="rellamada"]')?.classList.add('active');
    toggleIntentosField('rellamada');
    if (currentUser.rol === 'admin' && allAgents.length > 0)
      document.getElementById('f-agente').value = allAgents.find(a => a.rol === 'agente')?.id || '';
    clearVentaItems();
    addVentaItem();
  }
}

function toggleIntentosField(estado) {
  const wrap = document.getElementById('intentos-field');
  if (wrap) wrap.style.display = ['rellamada', 'sin_respuesta'].includes(estado) ? '' : 'none';
}

function onIntentosChange() {
  const val = parseInt(document.getElementById('f-intentos').value) || 1;
  const warn = document.getElementById('intentos-warning');
  if (!warn) return;
  if (val >= MAX_RELLAMADAS) {
    warn.textContent = '⚠️ Al guardar se marcará como No interesado y se archivará.';
    warn.style.display = '';
    warn.style.color = 'var(--red)';
  } else if (val === MAX_RELLAMADAS - 1) {
    warn.textContent = `⚠️ Próximo intento (${MAX_RELLAMADAS}) cerrará el ciclo.`;
    warn.style.display = '';
    warn.style.color = 'var(--yellow)';
  } else {
    warn.style.display = 'none';
  }
}

function setEstado(value, el) {
  if (el.classList.contains('chip-disabled') && currentUser?.rol !== 'admin') {
    toast('⚠️ ' + (el.title || 'Estado no disponible'), 'error');
    return;
  }
  document.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('f-estado').value = value;
  toggleIntentosField(value);
}

function closeVentaModal() {
  // 🎯 OPTIMIZACIÓN 4: Limpiar timers antes de cerrar
  clearTimeout(celularTimer);
  document.getElementById('venta-modal').classList.remove('open');
}

// 🎯 OPTIMIZACIÓN 3: Batch Queries en saveVenta
async function saveVenta() {
  const ventaId = document.getElementById('edit-venta-id').value;
  const celular = document.getElementById('f-celular').value.trim();
  const nombre = document.getElementById('f-nombre').value.trim();
  const clienteId = document.getElementById('f-cliente-id').value;
  const estado = document.getElementById('f-estado').value;
  const ubicacion = document.getElementById('f-ubicacion').value.trim();
  const notas = document.getElementById('f-notas').value.trim();
  const intentos = parseInt(document.getElementById('f-intentos').value) || 1;
  const fecha = document.getElementById('f-fecha').value;
  const monto = parseFloat(document.getElementById('f-monto').value) || null;
  const direccion = document.getElementById('f-direccion')?.value?.trim() || null;
  const agenteId = currentUser.rol === 'admin'
    ? document.getElementById('f-agente')?.value || currentUser.id
    : currentUser.id;

  if (!celular) { toast('⚠️ El celular es obligatorio', 'error'); return; }

  const items = getVentaItemsData();
  if (items.length === 0) { toast('⚠️ Añade al menos un producto con precio', 'error'); return; }

  try {
    let cId = clienteId ? parseInt(clienteId) : null;
    const prodNombreParaPerfil = items
      .map(it => allProductos.find(p => p.id === it.producto_id)?.nombre)
      .filter(Boolean).join(', ');

    if (!cId) {
      const { data: newC, error: errC } = await db.from('clientes')
        .insert({
          celular,
          nombre: nombre || 's/n',
          ubicacion,
          producto_interes: prodNombreParaPerfil || null,
          direccion_residencial: direccion,
        }).select().single();
      if (errC) throw errC;
      cId = newC.id;
    } else {
      await db.from('clientes').update({
        nombre: nombre || 's/n',
        ubicacion,
        producto_interes: prodNombreParaPerfil || undefined,
        direccion_residencial: direccion,
      }).eq('id', cId);
    }

    let estadoFinal = estado;
    if (estado === 'rellamada') {
      if (intentos >= MAX_RELLAMADAS) {
        const ok = confirm(
          `Este registro ya tiene ${intentos} intentos.\n` +
          `Al guardar se marcará como "No interesado" y se archivará.\n\n¿Confirmar?`
        );
        if (!ok) return;
        estadoFinal = 'no_interesado';
        toast('🔕 Marcado como No interesado (3 rellamadas)', 'error');
      } else if (intentos === MAX_RELLAMADAS - 1) {
        toast(`⚠️ ${intentos}/${MAX_RELLAMADAS} intentos — próximo cierra el ciclo`, 'error');
      }
    }

    if (estado === 'sin_respuesta' && intentos >= 4) {    
      if (estado === 'sin_respuesta') {
        const ok = confirm(
          `Este cliente ya tiene ${intentos} sin respuesta.\n` +
          `Al guardar se marcará como "No interesado" y se archivará.\n\n¿Confirmar?`
        );
        if (!ok) return;
        estadoFinal = 'no_interesado';
        toast('🔕 Marcado como No interesado (4 sin respuesta)', 'error');
      }
    }

    const debeArchivar = ESTADOS_CIERRE.includes(estadoFinal);

    const ventaData = {
      cliente_id: cId,
      agente_id: agenteId,
      fecha,
      notas,
      monto_total: monto,
      estado: estadoFinal,
      intentos: ['rellamada', 'sin_respuesta'].includes(estado) ? intentos : 1,
      archivado: debeArchivar,
    };

    let savedId;
    if (ventaId) {
      const { error } = await db.from('ventas').update(ventaData).eq('id', parseInt(ventaId));
      if (error) throw error;
      savedId = parseInt(ventaId);
      await db.from('venta_items').delete().eq('venta_id', savedId);
      toast('✅ Registro actualizado', 'success');
    } else {
      const { data: saved, error } = await db.from('ventas').insert(ventaData).select().single();
      if (error) throw error;
      savedId = saved.id;
      toast('✅ Registro agregado', 'success');
    }

    const itemsToInsert = items.map(it => ({ ...it, venta_id: savedId }));
    const { error: errItems } = await db.from('venta_items').insert(itemsToInsert);
    if (errItems) throw errItems;

    // 🎯 OPTIMIZACIÓN 3: Batch queries en una sola
    if (currentUser.rol === 'admin' && estadoFinal !== 'spam') {
      const { data: stats } = await db.from('ventas')
        .select('estado', { count: 'exact' })
        .eq('cliente_id', cId)
        .in('estado', ['cancelado', 'spam', 'sin_respuesta']);
      
      const spamCount = stats?.filter(s => s.estado === 'spam').length || 0;
      if (spamCount === 0) {
        await db.from('clientes').update({ flag: 'normal' }).eq('id', cId);
      }
    }

    const url = await uploadComprobante(savedId);
    if (url) await db.from('ventas').update({ comprobante_url: url }).eq('id', savedId);

    const { data: ventaActualizada } = await db.from('ventas')
      .select(`id, cliente_id, agente_id, fecha, estado, intentos,
        notas, comprobante_url, archivado, monto_total,
        cliente:cliente_id ( id, celular, nombre, ubicacion, direccion_residencial,
                             producto_interes, notas, faltas, flag ),
        agente:agente_id ( id, nombre ),
        venta_items ( id, cantidad, subtotal, producto_id, productos ( id, nombre ))`)
      .eq('id', savedId).single();

    if (ventaActualizada) {
      const idx = ventas.findIndex(v => v.id === savedId);
      if (idx >= 0) {
        ventas[idx] = ventaActualizada;
        ventasIndex[savedId] = ventaActualizada; // Actualizar índice
      } else {
        ventas.unshift(ventaActualizada);
        ventasIndex[savedId] = ventaActualizada; // Agregar a índice
      }
    }

    dashboardCache.invalidate(); // Invalidar caché

    closeVentaModal();
    renderVentas();
    renderDashboard();
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
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
      document.getElementById('delete-user-modal').classList.remove('open');
      try {
        const { error } = await db.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        toast('🗑️ Usuario eliminado');
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
    // Verificar si tiene venta_items
    const { count } = await db.from('venta_items')
      .select('*', { count: 'exact', head: true })
      .eq('producto_id', id);
    if (count > 0) {
      document.getElementById('delete-producto-warning').style.display = '';
      return;
    }
    document.getElementById('delete-producto-modal').classList.remove('open');
    try {
      const { error } = await db.from('productos').delete().eq('id', id);
      if (error) throw error;
      toast('🗑️ Producto eliminado');
      await loadProductosAll();
      renderProductos();
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
      delete ventasIndex[id]; // Limpiar índice
      dashboardCache.invalidate(); // Invalidar caché
      toast('🗑️ Registro eliminado');
      renderVentas();
      renderDashboard();
    } catch(e) { toast('❌ ' + e.message, 'error'); }
  };
}

function closeDeleteModal() { document.getElementById('delete-modal').classList.remove('open'); }

// COMPROBANTE (igual al original - mantener sin cambios)
async function uploadComprobante(ventaId) {
  const input = document.getElementById('f-comprobante');
  const file = input?.files?.[0];
  if (!file) return null;
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) { toast('⚠️ Solo JPG, PNG, WEBP o PDF', 'error'); return null; }
  if (file.size > 5 * 1024 * 1024) { toast('⚠️ Máximo 5MB', 'error'); return null; }
  const ext = file.name.split('.').pop();
  const path = `${currentUser.id}/${ventaId}_${Date.now()}.${ext}`;
  const { error } = await db.storage.from('comprobantes').upload(path, file, { upsert: true });
  if (error) { toast('❌ Error subiendo: ' + error.message, 'error'); return null; }
  const { data: u } = db.storage.from('comprobantes').getPublicUrl(path);
  return u.publicUrl;
}

async function deleteComprobante(url, ventaId) {
  if (!url || !confirm('¿Eliminar comprobante?')) return;
  const path = url.split('/comprobantes/')[1];
  if (path) await db.storage.from('comprobantes').remove([path]);
  await db.from('ventas').update({ comprobante_url: null }).eq('id', ventaId);
  toast('🗑️ Comprobante eliminado');
  await loadVentas();
  renderVentas();
}

function renderComprobantePreview(url) {
  const wrap = document.getElementById('comprobante-preview');
  if (!wrap) return;
  if (!url) { wrap.innerHTML = ''; return; }
  const isPdf = url.toLowerCase().includes('.pdf');
  wrap.innerHTML = isPdf
    ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;"><a href="${url}" target="_blank" style="color:var(--accent2);font-size:13px;">📄 Ver PDF</a><button type="button" class="icon-btn danger" onclick="deleteComprobante('${url}',parseInt(document.getElementById('edit-venta-id').value))" style="font-size:11px;padding:3px 8px;">🗑️</button></div>`
    : `<div style="margin-top:8px;position:relative;display:inline-block;"><img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display='none'"><button type="button" class="icon-btn danger" onclick="deleteComprobante('${url}',parseInt(document.getElementById('edit-venta-id').value))" style="position:absolute;top:4px;right:4px;font-size:11px;padding:3px 7px;background:var(--surface);">🗑️</button></div>`;
}

document.addEventListener('click', e => {
  if (!e.target.closest('.smart-input-row'))
    document.querySelectorAll('.dropdown-list').forEach(d => d.style.display = 'none');
});

// USUARIOS (igual al original - mantener sin cambios)
async function renderUsers() {
  const { data, error } = await db.from('usuarios').select('*').order('nombre');
  if (error) { toast('❌ Error cargando usuarios', 'error'); return; }
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
    renderUsers();
    await loadAgents();
    buildAgentSelector();
  }
}

function openUserModal(id) {
  document.getElementById('user-modal').classList.add('open');
  if (id) {
    db.from('usuarios').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return;
      document.getElementById('user-modal-title').textContent = 'Editar Usuario';
      document.getElementById('edit-user-id').value = data.id;
      document.getElementById('u-nombre').value = data.nombre;
      document.getElementById('u-user').value = data.usuario;
      document.getElementById('u-pass').value = data.password;
      document.getElementById('u-rol').value = data.rol;
    });
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
    renderUsers();
    await loadAgents();
    buildAgentSelector();
    toast('✅ Usuario guardado', 'success');
  } catch(e) { toast('❌ ' + e.message, 'error'); }
}

//  EXPORT CSV
function exportCSV() {
  const isAdmin = currentUser?.rol === 'admin';
  const headers = [
    'ID', 'Fecha', 'Nombre', 'Celular', 'Productos', 'Monto (Bs.)',
    'Ubicación', 'Estado', 'Notas',
    ...(isAdmin ? ['Agente'] : [])
  ];
  const rows = ventas.map(v => [
    v.id,
    v.fecha,
    v.cliente?.nombre || '',
    v.cliente?.celular || '',
    (v.venta_items || []).map(it => {
      const pn = it.productos?.nombre || '';
      const cant = it.cantidad || 1;
      const sub = it.subtotal ? ` (Bs.${parseFloat(it.subtotal).toFixed(0)})` : '';
      return `${pn} x${cant}${sub}`;
    }).join(' + '),
    v.monto_total || '',
    v.cliente?.ubicacion || '',
    v.estado || '',
    v.notas || '',
    ...(isAdmin ? [v.agente?.nombre || ''] : [])
  ].map(x => `"${(x || '').toString().replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LIT_CRM_${currentUser.nombre}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('📥 CSV exportado', 'success');
}

//  BOLIVIA — Datos geográficos (igual al original)
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

function initGeoSelectors() {
  const selDep = document.getElementById('sel-departamento');
  const selProv = document.getElementById('sel-provincia');
  const selMun = document.getElementById('sel-municipio');
  if (!selDep) return;
  selDep.innerHTML = '<option value="">— Departamento —</option>';
  Object.keys(BOLIVIA_GEO).sort().forEach(dep => {
    const o = document.createElement('option');
    o.value = dep;
    o.textContent = dep;
    selDep.appendChild(o);
  });
  function updateUbicacionInput() {
    const dep = selDep.value, prov = selProv.value, mun = selMun.value;
    const inp = document.getElementById('f-ubicacion');
    if (!inp) return;
    if (mun) inp.value = `${dep} - ${prov} - ${mun}`;
    else if (prov) inp.value = `${dep} - ${prov}`;
    else if (dep) inp.value = dep;
    else inp.value = '';
  }
  selDep.onchange = () => {
    const dep = selDep.value;
    selProv.innerHTML = '<option value="">— Provincia —</option>';
    selMun.innerHTML = '<option value="">— Municipio —</option>';
    selProv.disabled = !dep;
    selMun.disabled = true;
    updateUbicacionInput();
    if (!dep) return;
    Object.keys(BOLIVIA_GEO[dep].provincias).sort().forEach(prov => {
      const o = document.createElement('option');
      o.value = prov;
      o.textContent = prov;
      selProv.appendChild(o);
    });
  };
  selProv.onchange = () => {
    const dep = selDep.value, prov = selProv.value;
    selMun.innerHTML = '<option value="">— Municipio —</option>';
    selMun.disabled = !prov;
    updateUbicacionInput();
    if (!dep || !prov) return;
    const provData = BOLIVIA_GEO[dep].provincias[prov];
    const capDep = BOLIVIA_GEO[dep].capital;
    provData.municipios.forEach(mun => {
      const o = document.createElement('option');
      o.value = mun;
      o.textContent = mun === capDep ? mun + ' ★ (cap. departamental)' : mun === provData.capital ? mun + ' · (cap. provincial)' : mun;
      selMun.appendChild(o);
    });
  };
  selMun.onchange = () => {
    updateUbicacionInput();
  };
}

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

/*
// CERRAR MODALES AL CLICK EN OVERLAY
document.getElementById('venta-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeVentaModal(); });
document.getElementById('user-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeUserModal(); });
document.getElementById('delete-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteModal(); });
document.getElementById('producto-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeProductoModal(); });
document.getElementById('delete-confirm-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('delete-confirm-btn').click(); });
document.getElementById('stat-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeStatModal(); });
*/

// CERRAR MODALES AL CLICK EN X
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modals = [
      { id: 'venta-modal', closeFunc: closeVentaModal },
      { id: 'user-modal', closeFunc: closeUserModal },
      { id: 'delete-user-modal', closeFunc: closeDeleteUserModal },      
      { id: 'delete-modal', closeFunc: closeDeleteModal },
      { id: 'producto-modal', closeFunc: closeProductoModal },
      { id: 'delete-producto-modal', closeFunc: closeDeleteProductoModal },
      { id: 'stat-modal', closeFunc: closeStatModal }
    ];

    for (const { id, closeFunc } of modals) {
      const modal = document.getElementById(id);
      if (modal?.classList.contains('open')) {
        closeFunc();
        break;
      }
    }
  }
});

document.getElementById('delete-confirm-input').addEventListener('keydown', e => { 
  if (e.key === 'Enter') document.getElementById('delete-confirm-btn').click(); 
});

// STAT MODAL (igual al original)
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
  const labels = { vendido: '✅ Vendidos', interesado: '🌟 Interesados', sin_respuesta: '📵 Sin respuesta' };
  document.getElementById('stat-modal-title').textContent = labels[estado] || estado;

  const filtered = ventas.filter(v => v.estado === estado);
  const total = filtered.length;
  const totalUnidades = estado === 'vendido'
    ? filtered.reduce((sum, v) => sum + (v.venta_items || []).reduce((s, it) => s + (it.cantidad || 1), 0), 0)
    : null;
  const pages = Math.ceil(total / STAT_PAGE_SIZE) || 1;
  if (statModalPage > pages) statModalPage = 1;
  const page = filtered.slice((statModalPage - 1) * STAT_PAGE_SIZE, statModalPage * STAT_PAGE_SIZE);

  const isAdmin = currentUser?.rol === 'admin';

  document.getElementById('stat-modal-body').innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
      ${total} ventas${totalUnidades !== null ? ` · ${totalUnidades} unidades` : ''}
    </div>
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

// INIT
initTheme();