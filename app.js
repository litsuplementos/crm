// ═══════════════════════════════════════════════
//  LIT CRM v3 — Clientes + Ventas
// ═══════════════════════════════════════════════

const SUPABASE_URL      = 'https://txjgdglfzskirujqctra.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4amdkZ2xmenNraXJ1anFjdHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzYzNzYsImV4cCI6MjA4OTI1MjM3Nn0.b3o9KHVaspzyRnMhmB6uX2jLjadWgAFJM-iYHKHjXr0';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════
//  CONSTANTES DE ESTADO
// ═══════════════════════════════════════════════
const ESTADOS = {
  rellamada:    { label: '🔁 Rellamada',        badge: 'badge-rellamada',  color: 'var(--accent2)' },
  seguimiento:  { label: '🔄 Seguimiento',      badge: 'badge-seguimiento',color: 'var(--blue)' },
  interesado:   { label: '🌟 Interesado',       badge: 'badge-interesado', color: 'var(--yellow)' },
  agendar:      { label: '📅 Agendar',          badge: 'badge-agendar',    color: 'var(--orange)' },
  sin_respuesta:{ label: '📵 Sin respuesta',    badge: 'badge-sinresp',    color: 'var(--red)' },
  no_interesado:{ label: '👎 No interesado',    badge: 'badge-noint',      color: 'var(--text3)' },
  enviado:      { label: '📦 Enviado',          badge: 'badge-enviado',    color: 'var(--blue)' },
  vendido:      { label: '✅ Vendido',          badge: 'badge-vendido',    color: 'var(--green)' },
  cancelado:    { label: '❌ Cancelado',        badge: 'badge-cancelado',  color: '#f87171' },
  spam:         { label: '🚫 SPAM',            badge: 'badge-spam',       color: 'var(--text3)' },
};

// Estados que cierran el ciclo de venta (archivan el registro)
const ESTADOS_CIERRE = ['vendido', 'no_interesado', 'spam', 'cancelado'];

// Límite de rellamadas antes de marcar No interesado
const MAX_RELLAMADAS = 3;

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let currentUser     = null;
let ventas          = [];
let allAgents       = [];
let selectedAgentId = 'all';
let currentPage     = 1;
const PAGE_SIZE     = 25;
let mostrarArchivados = false;

// ═══════════════════════════════════════════════
//  THEME (día / noche)
// ═══════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('litcrm-theme') || 'white';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('litcrm-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) { if(theme==='night') btn.textContent='☀️ Día'; else if(theme==='day') btn.textContent='🌙 Noche'; else btn.textContent='🌿 Menta'; }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'night';
  const order = ['white','day','night']; const idx = order.indexOf(current); applyTheme(order[(idx+1)%3]);
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
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
    document.getElementById('tab-config').style.display   = data.rol === 'admin' ? '' : 'none';
    document.getElementById('tab-usuarios').style.display = data.rol === 'admin' ? '' : 'none';
    await initApp();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') doLogin();
});

function doLogout() {
  currentUser = null; ventas = []; allAgents = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showViewDirect('dashboard');
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
async function initApp() {
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('es-BO', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  if (currentUser.rol === 'admin') { await loadAgents(); buildAgentSelector(); }
  await loadVentas();
  renderDashboard();
  initGeoSelectors();
  renderVentas();
  if (currentUser.rol === 'admin') renderUsers();
}

// ═══════════════════════════════════════════════
//  CARGAR VENTAS
// ═══════════════════════════════════════════════
async function loadVentas() {
  try {
    let query = db.from('ventas')
      .select(`
        *,
        cliente:cliente_id ( id, celular, nombre, ciudad, producto_interes, notas, faltas, sin_respuesta, flag, direccion_residencial ),
        agente:agente_id   ( id, nombre )
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
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
    ventas = [];
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
      ${allAgents.filter(a=>a.rol==='agente').map(a=>
        `<option value="${a.id}">👤 ${a.nombre}</option>`
      ).join('')}
    </select>`;

  const sel = document.getElementById('filter-agente');
  if (sel) {
    sel.style.display = '';
    while (sel.options.length > 1) sel.remove(1);
    allAgents.filter(a=>a.rol==='agente').forEach(a => {
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

async function syncData() {
  const btn = document.getElementById('sync-btn');
  btn.classList.add('syncing');
  try {
    await loadVentas();
    renderDashboard();
    renderVentas();
    toast('✅ Datos actualizados', 'success');
  } finally { btn.classList.remove('syncing'); }
}

// ═══════════════════════════════════════════════
//  NAV
// ═══════════════════════════════════════════════
function showView(name) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  event.target.classList.add('active');
  if (name==='ventas')    renderVentas();
  if (name==='dashboard') renderDashboard();
  if (name==='usuarios')  renderUsers();
}
function showViewDirect(name) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('view-'+name)?.classList.add('active');
  document.querySelector(`[data-view="${name}"]`)?.classList.add('active');
}

// ═══════════════════════════════════════════════
//  STATUS HELPERS
// ═══════════════════════════════════════════════
function statusBadge(estado) {
  const e = ESTADOS[estado] || ESTADOS.rellamada;
  return `<span class="badge ${e.badge}">${e.label}</span>`;
}

function flagBadge(cliente) {
  if (!cliente) return '';
  if (cliente.flag === 'spam') return `<span class="badge badge-spam" title="SPAM: ${cliente.faltas} cancelaciones">🚫 SPAM</span>`;
  if (cliente.faltas >= 1)     return `<span class="badge badge-cancelado" title="${cliente.faltas} cancelación(es)">⚠️ ${cliente.faltas} falta${cliente.faltas>1?'s':''}</span>`;
  if (cliente.sin_respuesta >= 4) return `<span class="badge badge-sinresp" title="${cliente.sin_respuesta} sin respuesta">📵 ${cliente.sin_respuesta}×</span>`;
  return '';
}

function prodChip(p) {
  const pl = (p||'').toLowerCase();
  if (pl.includes('calibr')) return `<span class="prod-chip prod-calibrum">${p}</span>`;
  if (pl.includes('colag'))  return `<span class="prod-chip prod-colageno">${p}</span>`;
  if (pl.includes('osteo'))  return `<span class="prod-chip prod-osteofor">${p}</span>`;
  if (pl.includes('alivia')) return `<span class="prod-chip prod-alivia">${p}</span>`;
  return p ? `<span class="prod-chip">${p}</span>` : '';
}

// ═══════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  const isAdmin = currentUser.rol === 'admin';
  const showingAll = selectedAgentId === 'all';

  let subtitle = isAdmin
    ? (showingAll ? 'Vista general — todos los agentes' : `Filtrando: ${allAgents.find(a=>a.id===selectedAgentId)?.nombre||''}`)
    : `Tu actividad — ${currentUser.nombre}`;
  document.getElementById('dash-subtitle').textContent = subtitle;
  document.getElementById('dashboard-agent-row').style.display = isAdmin ? 'flex' : 'none';

  const total    = ventas.length;
  const vendidos = ventas.filter(v=>v.estado==='vendido').length;
  const enviados = ventas.filter(v=>v.estado==='enviado').length;
  const interesados = ventas.filter(v=>v.estado==='interesado').length;
  const seguimiento = ventas.filter(v=>['seguimiento','rellamada','agendar'].includes(v.estado)).length;
  const sinResp  = ventas.filter(v=>v.estado==='sin_respuesta').length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:var(--accent-glow);">📋</div>
      <div class="stat-value" style="color:var(--accent2);">${total}</div><div class="stat-label">TOTAL VENTAS</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--green-bg);">✅</div>
      <div class="stat-value" style="color:var(--green);">${vendidos}</div><div class="stat-label">VENDIDOS</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--blue-bg);">📦</div>
      <div class="stat-value" style="color:var(--blue);">${enviados}</div><div class="stat-label">ENVIADOS</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--yellow-bg);">🌟</div>
      <div class="stat-value" style="color:var(--yellow);">${interesados}</div><div class="stat-label">INTERESADOS</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:rgba(96,165,250,0.12);">🔄</div>
      <div class="stat-value" style="color:var(--blue);">${seguimiento}</div><div class="stat-label">EN SEGUIMIENTO</div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--red-bg);">📵</div>
      <div class="stat-value" style="color:var(--red);">${sinResp}</div><div class="stat-label">SIN RESPUESTA</div></div>
  `;

  // Products
  const prods = {};
  ventas.forEach(v => {
    const pl = (v.producto||'').toLowerCase();
    let key = 'Otro';
    if (pl.includes('calibr')) key='Calibrum';
    else if (pl.includes('colag')) key='Colágeno Premium';
    else if (pl.includes('osteo')) key='Osteofor';
    else if (pl.includes('alivia')) key='Alivia Fen';
    prods[key] = (prods[key]||0)+1;
  });
  const pColors = {'Calibrum':'var(--accent)','Colágeno Premium':'var(--green)','Osteofor':'var(--yellow)','Alivia Fen':'var(--orange)','Otro':'var(--text3)'};
  const maxP = Math.max(...Object.values(prods),1);
  document.getElementById('prod-chart').innerHTML = Object.entries(prods).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div class="bar-row"><div class="bar-label">${k}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v/maxP*100).toFixed(0)}%;background:${pColors[k]||'var(--accent)'}"></div></div>
    <div class="bar-count">${v}</div></div>`).join('') || '<p style="color:var(--text3);font-size:13px;">Sin datos</p>';

  // Pipeline
  const sCounts = {};
  Object.keys(ESTADOS).forEach(k => sCounts[k] = ventas.filter(v=>v.estado===k).length);
  const maxS = Math.max(...Object.values(sCounts),1);
  document.getElementById('status-chart').innerHTML = Object.entries(ESTADOS).map(([k,e])=>`
    <div class="bar-row"><div class="bar-label" style="color:${e.color}">${e.label}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(sCounts[k]/maxS*100).toFixed(0)}%;background:${e.color}"></div></div>
    <div class="bar-count">${sCounts[k]}</div></div>`).join('');

  // Cities
  const cities = {};
  ventas.forEach(v => {
    const c = v.ciudad || v.cliente?.ciudad;
    if (c && c !== 's/c' && c !== '') cities[c] = (cities[c]||0)+1;
  });
  const sortedC = Object.entries(cities).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxC = sortedC[0]?.[1]||1;
  document.getElementById('city-chart').innerHTML = sortedC.map(([k,v])=>`
    <div class="bar-row"><div class="bar-label">${k}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(v/maxC*100).toFixed(0)}%;background:var(--blue)"></div></div>
    <div class="bar-count">${v}</div></div>`).join('') || '<p style="color:var(--text3);font-size:13px;">Sin datos</p>';

  // Pendientes urgentes
  const pending = ventas.filter(v=>['seguimiento','rellamada','interesado','agendar'].includes(v.estado)).slice(0,10);
  document.getElementById('today-list').innerHTML = pending.length===0
    ? '<div class="empty-state"><div class="emoji">🎉</div><p>Sin pendientes</p></div>'
    : pending.map(v=>`
    <div class="today-item">
      <div class="today-avatar">${(v.cliente?.nombre||'?')[0].toUpperCase()}</div>
      <div class="today-info">
        <div class="today-name">${v.cliente?.nombre||'s/n'}
          ${isAdmin&&showingAll?`<span style="font-size:10px;color:var(--accent2);background:var(--accent-glow);padding:1px 6px;border-radius:4px;margin-left:4px;">${v.agente?.nombre||''}</span>`:''}
        </div>
        <div class="today-detail">${v.notas||''}  ${statusBadge(v.estado)}</div>
      </div>
      <div class="today-phone"><a href="tel:${v.cliente?.celular}" style="color:var(--accent2);text-decoration:none;">${v.cliente?.celular||''}</a></div>
    </div>`).join('');

  // Admin: comparación por agente
  if (isAdmin && showingAll && allAgents.length > 0) {
    const agStats = allAgents.filter(a=>a.rol==='agente').map(ag=>{
      const av = ventas.filter(v=>v.agente_id===ag.id);
      return { nombre:ag.nombre, total:av.length,
        vendidos:av.filter(v=>v.estado==='vendido').length,
        interesados:av.filter(v=>v.estado==='interesado').length };
    });
    const maxT = Math.max(...agStats.map(a=>a.total),1);
    document.getElementById('agents-chart').innerHTML = agStats.map(a=>`
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

// ═══════════════════════════════════════════════
//  VENTAS — lista + filtros
// ═══════════════════════════════════════════════
function populateCityFilter() {
  const cities = [...new Set(ventas.map(v=>v.ciudad||v.cliente?.ciudad).filter(c=>c&&c!=='s/c'&&c!==''))].sort();
  const sel = document.getElementById('filter-ciudad');
  while (sel.options.length > 1) sel.remove(1);
  cities.forEach(c => { const o=document.createElement('option'); o.value=c.toLowerCase(); o.textContent=c; sel.appendChild(o); });
}

function getFiltered() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('filter-status').value;
  const prod   = document.getElementById('filter-producto').value;
  const ciudad = document.getElementById('filter-ciudad').value;
  const agente  = document.getElementById('filter-agente')?.value || '';
  return ventas.filter(v => {
    if (!!v.archivado !== mostrarArchivados) return false;
    const nombre = v.cliente?.nombre||'';
    const cel    = v.cliente?.celular||'';
    const haystack = `${nombre} ${cel} ${v.producto||''} ${v.ciudad||''} ${v.notas||''}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && v.estado !== status) return false;
    if (prod && !(v.producto||'').toLowerCase().includes(prod)) return false;
    if (ciudad && !(v.ciudad||v.cliente?.ciudad||'').toLowerCase().includes(ciudad)) return false;
    if (agente && v.agente_id !== agente) return false;
    return true;
  });
}

function renderVentas() {
  populateCityFilter();
  const filtered = getFiltered();
  const total = filtered.length;
  const totalPages = Math.ceil(total/PAGE_SIZE)||1;
  if (currentPage > totalPages) currentPage = 1;
  const page = filtered.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
  const isAdmin = currentUser?.rol==='admin';

  document.getElementById('ventas-count').textContent = `${total} ${mostrarArchivados ? 'archivados' : 'activos'} encontrados`;
  document.getElementById('table-count').textContent  = `${total} registros`;

  document.getElementById('ventas-tbody').innerHTML = page.map(v=>`
    <tr onclick="openVentaModal(${v.id})" style="${v.archivado?'opacity:0.6;':''}">
      <td style="color:var(--text2);font-size:12px;">${v.fecha||''}${v.archivado?' <span title="Registro archivado" style="font-size:10px;">🔒</span>':''}</td>
      <td class="td-name">
        ${v.cliente?.nombre||'<span style="color:var(--text3)">s/n</span>'}
        ${flagBadge(v.cliente)}
      </td>
      <td class="td-phone">
        <a href="tel:${v.cliente?.celular}" onclick="event.stopPropagation()" style="color:var(--accent2);text-decoration:none;">${v.cliente?.celular||''}</a>
      </td>
      <td>${prodChip(v.producto)}</td>
      <td class="td-ciudad">${v.ciudad||v.cliente?.ciudad||''}</td>
      <td>${statusBadge(v.estado)}${v.estado==='rellamada'&&v.intentos>1?`<span style="font-size:10px;color:var(--text3);margin-left:4px;">${v.intentos}×</span>`:''}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2);font-size:12px;" title="${v.notas||''}">${v.notas||''}${v.comprobante_url?` <a href="${v.comprobante_url}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent2);">📎</a>`:''}</td>
      ${isAdmin?`<td style="font-size:11px;color:var(--accent2);">${v.agente?.nombre||'—'}</td>`:''}
      <td class="td-actions" onclick="event.stopPropagation()">
        <button class="icon-btn" onclick="openVentaModal(${v.id})">✏️</button>
        <button class="icon-btn danger" onclick="deleteVenta(${v.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text2);">Sin resultados</td></tr>';

  document.getElementById('th-agente').style.display = isAdmin ? '' : 'none';

  document.getElementById('ventas-cards').innerHTML = page.map(v=>`
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div>
          <div class="mobile-card-name">${v.cliente?.nombre||'s/n'} ${flagBadge(v.cliente)}</div>
          <div class="mobile-card-phone">${v.cliente?.celular||''}</div>
        </div>
        ${statusBadge(v.estado)}
      </div>
      <div class="mobile-card-row">
        ${prodChip(v.producto)}
        <span style="color:var(--text2);font-size:12px;">📍 ${v.ciudad||v.cliente?.ciudad||'s/c'}</span>
        <span style="color:var(--text3);font-size:11px;">${v.fecha||''}</span>
        ${isAdmin?`<span style="font-size:11px;color:var(--accent2);background:var(--accent-glow);padding:1px 6px;border-radius:4px;">${v.agente?.nombre||''}</span>`:''}
      </div>
      <div style="color:var(--text2);font-size:12px;margin-top:8px;">${v.notas||''}</div>
      <div class="mobile-card-actions">
        <button class="icon-btn" onclick="openVentaModal(${v.id})">✏️ Editar</button>
        <a href="tel:${v.cliente?.celular}" style="text-decoration:none;"><button class="icon-btn" style="color:var(--green);border-color:rgba(34,211,164,0.3);">📞 Llamar</button></a>
        <button class="icon-btn danger" onclick="deleteVenta(${v.id})">🗑️</button>
      </div>
    </div>`).join('') || '<div class="empty-state"><div class="emoji">🔍</div><p>Sin resultados</p></div>';

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  if (totalPages<=1) { document.getElementById('pagination').innerHTML=''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
  for (let i=1; i<=totalPages; i++) {
    if (i===1||i===totalPages||Math.abs(i-currentPage)<=1)
      html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    else if (Math.abs(i-currentPage)===2)
      html += `<span style="color:var(--text3);padding:0 4px;">…</span>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
  document.getElementById('pagination').innerHTML = html;
}
function goPage(p) { currentPage=p; renderVentas(); window.scrollTo(0,200); }

function setArchivoFiltro(archivado) {
  mostrarArchivados = archivado;
  currentPage = 1;
  document.getElementById('tab-activos').classList.toggle('archivo-tab-active', !archivado);
  document.getElementById('tab-archivados').classList.toggle('archivo-tab-active', archivado);
  renderVentas();
}

// ═══════════════════════════════════════════════
//  MODAL VENTA — Nuevo o Editar
// ═══════════════════════════════════════════════
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
      .select('id, nombre, ciudad, producto_interes, notas, faltas, sin_respuesta, flag')
      .eq('celular', cel).maybeSingle();

    if (data) {
      document.getElementById('f-cliente-id').value = data.id;
      document.getElementById('f-nombre').value = data.nombre || '';
      document.getElementById('f-ciudad').value = data.ciudad || '';
      document.getElementById('f-producto').value = data.producto_interes || '';

      const infoBox = document.getElementById('cliente-info-box');
      infoBox.style.display = '';

      const isAdmin = currentUser?.rol === 'admin';
      const sinRespCount = data.sin_respuesta || 0;

      // Chip Sin respuesta: deshabilitar si ya tiene 4+
      const chipSinResp = document.querySelector('.quick-chip[data-estado="sin_respuesta"]');
      if (chipSinResp) {
        if (sinRespCount >= 4 && !isAdmin) {
          chipSinResp.classList.add('chip-disabled');
          chipSinResp.title = `Ya tiene ${sinRespCount} sin respuesta — el próximo se marcará como No interesado`;
        } else {
          chipSinResp.classList.remove('chip-disabled');
          chipSinResp.title = '';
        }
      }

      // ── CAMBIO: chip Cancelado NUNCA se deshabilita ──
      // (eliminada la lógica que lo bloqueaba por flag === 'spam')

      // Buscar ciclo abierto del agente para este cliente
      const { data: cicloAbierto } = await db.from('ventas')
        .select('id, estado, fecha, producto')
        .eq('cliente_id', data.id)
        .eq('agente_id', currentUser.id)
        .eq('archivado', false)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      let cicloWarning = '';
      if (cicloAbierto) {
        cicloWarning = `
          <div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:6px;padding:8px 12px;margin-bottom:8px;">
            <div style="color:var(--yellow);font-size:12px;font-weight:600;margin-bottom:4px;">⚠️ Ya tienes un ciclo abierto con este cliente</div>
            <div style="color:var(--text2);font-size:11px;">${cicloAbierto.producto||''} · ${ESTADOS[cicloAbierto.estado]?.label||cicloAbierto.estado} · ${cicloAbierto.fecha||''}</div>
            <button onclick="closeVentaModal();setTimeout(()=>openVentaModal(${cicloAbierto.id}),50)" style="margin-top:6px;background:var(--yellow);border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:600;color:#0a0a0f;cursor:pointer;">
              → Ir al registro existente
            </button>
          </div>`;
      }

      const spamBanner = data.flag === 'spam' ? `
        <div style="background:rgba(248,113,113,0.15);border:2px solid var(--red);border-radius:8px;padding:12px 16px;margin-bottom:8px;">
          <div style="color:var(--red);font-weight:700;font-size:14px;margin-bottom:4px;">🚫 ¡SPAM! Este cliente solo molesta, no compra.</div>
          <div style="color:var(--text2);font-size:12px;">Tiene ${data.faltas} cancelación(es) registrada(s). Puedes continuar, pero quedará marcado como SPAM.</div>
        </div>` : '';

      infoBox.innerHTML = spamBanner + cicloWarning + `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;">
          <div style="color:var(--accent2);font-weight:600;margin-bottom:4px;">👤 Cliente registrado ${flagBadge(data)}</div>
          ${sinRespCount>0?`<div style="color:${sinRespCount>=4?'var(--red)':'var(--text2)'};font-size:11px;">📵 ${sinRespCount}/4 sin respuesta${sinRespCount>=4?' — ⚠️ próximo se marca No interesado':''}</div>`:''}
          ${data.faltas>0 && data.flag!=='spam'?`<div style="color:var(--orange);font-size:11px;">❌ ${data.faltas} cancelación(es) registrada(s)${data.faltas>=2?' — ⚠️ cliente con múltiples cancelaciones':' — ⚠️ cliente con cancelación previa'}</div>`:''}
          ${data.notas?`<div style="color:var(--text2);margin-top:4px;">${data.notas}</div>`:''}
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

function openVentaModal(id) {
  document.getElementById('venta-modal').classList.add('open');
  document.querySelectorAll('.quick-chip').forEach(ch=>{
    ch.classList.remove('active');
    ch.classList.remove('chip-disabled');
    ch.title = '';
  });
  document.getElementById('celular-suggestion').style.display = 'none';
  document.getElementById('cliente-info-box').style.display = 'none';
  document.getElementById('f-comprobante').value = '';
  renderComprobantePreview(null);

  const af = document.getElementById('agente-field');
  if (af) {
    af.style.display = currentUser.rol==='admin' ? '' : 'none';
    if (currentUser.rol==='admin') {
      document.getElementById('f-agente').innerHTML =
        allAgents.filter(a=>a.rol==='agente').map(a=>`<option value="${a.id}">${a.nombre}</option>`).join('');
    }
  }

  if (id) {
    const v = ventas.find(x=>x.id===id);
    if (!v) return;

    const isArchivado = v.archivado;
    document.getElementById('modal-title').textContent = isArchivado ? '🔒 Registro Archivado' : 'Editar Registro';

    const archivedBanner = document.getElementById('archived-banner');
    if (archivedBanner) archivedBanner.style.display = isArchivado ? '' : 'none';

    const isAdmin = currentUser?.rol === 'admin';
    const shouldLock = isArchivado && !isAdmin;
    ['f-fecha','f-celular','f-nombre','f-producto','f-ciudad','f-notas','f-intentos','f-direccion'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.disabled = shouldLock;
    });
    document.querySelectorAll('.quick-chip').forEach(ch => {
      ch.style.pointerEvents = shouldLock ? 'none' : '';
      ch.style.opacity = shouldLock ? '0.4' : '';
    });
    const saveBtn = document.querySelector('#venta-modal .btn-save');
    if (saveBtn) saveBtn.style.display = shouldLock ? 'none' : '';
    document.getElementById('edit-venta-id').value = id;
    document.getElementById('f-fecha').value   = v.fecha || '';
    document.getElementById('f-celular').value = v.cliente?.celular || '';
    document.getElementById('f-nombre').value  = v.cliente?.nombre || '';
    document.getElementById('f-cliente-id').value = v.cliente_id || '';
    document.getElementById('f-producto').value = v.producto || '';
    document.getElementById('f-ciudad').value  = v.ciudad || v.cliente?.ciudad || '';
    document.getElementById('f-notas').value   = v.notas || '';
    document.getElementById('f-direccion').value = v.cliente?.direccion_residencial || '';
    const mp = document.getElementById('maps-preview'); if (mp) mp.innerHTML = '';
    if (v.cliente?.direccion_residencial) onDireccionKeydown({key:'Enter',preventDefault:()=>{}});
    ['sel-departamento','sel-provincia','sel-municipio'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value=''; if(id!=='sel-departamento') el.disabled=true; }
    });
    document.getElementById('f-intentos').value = v.intentos || 1;
    document.getElementById('f-estado').value  = v.estado || 'rellamada';
    document.querySelector(`.quick-chip[data-estado="${v.estado}"]`)?.classList.add('active');
    toggleIntentosField(v.estado);
    if (currentUser.rol==='admin' && v.agente_id)
      document.getElementById('f-agente').value = v.agente_id;
    renderComprobantePreview(v.comprobante_url||null);
  } else {
    document.getElementById('modal-title').textContent = 'Nuevo Registro';
    document.getElementById('edit-venta-id').value = '';
    const archivedBanner = document.getElementById('archived-banner');
    if (archivedBanner) archivedBanner.style.display = 'none';
    ['f-fecha','f-celular','f-nombre','f-producto','f-ciudad','f-notas','f-intentos','f-direccion'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.disabled = false;
    });
    document.querySelectorAll('.quick-chip').forEach(ch => {
      ch.style.pointerEvents = ''; ch.style.opacity = '';
    });
    const saveBtn = document.querySelector('#venta-modal .btn-save');
    if (saveBtn) saveBtn.style.display = '';
    document.getElementById('f-fecha').value   = new Date().toISOString().split('T')[0];
    document.getElementById('f-celular').value = '';
    document.getElementById('f-nombre').value  = '';
    document.getElementById('f-cliente-id').value = '';
    document.getElementById('f-producto').value = '';
    document.getElementById('f-ciudad').value  = '';
    document.getElementById('f-notas').value   = '';
    document.getElementById('f-direccion').value = '';
    const mpNew = document.getElementById('maps-preview'); if (mpNew) mpNew.innerHTML = '';
    ['sel-departamento','sel-provincia','sel-municipio'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value=''; if(id!=='sel-departamento') el.disabled=true; }
    });
    document.getElementById('f-intentos').value = 1;
    document.getElementById('f-estado').value  = 'rellamada';
    toggleIntentosField('rellamada');
    if (currentUser.rol==='admin' && allAgents.length>0)
      document.getElementById('f-agente').value = allAgents.find(a=>a.rol==='agente')?.id || '';
  }
}

function toggleIntentosField(estado) {
  const wrap = document.getElementById('intentos-field');
  if (wrap) wrap.style.display = estado==='rellamada' ? '' : 'none';
}

function onIntentosChange() {
  const val = parseInt(document.getElementById('f-intentos').value) || 1;
  const warn = document.getElementById('intentos-warning');
  if (!warn) return;
  // ── CAMBIO: límite reducido a MAX_RELLAMADAS (3) ──
  if (val >= MAX_RELLAMADAS) {
    warn.textContent = `⚠️ Al guardar se marcará como No interesado y se archivará.`;
    warn.style.display = '';
    warn.style.color = 'var(--red)';
  } else if (val === MAX_RELLAMADAS - 1) {
    warn.textContent = `⚠️ Próximo intento (${MAX_RELLAMADAS}) cerrará el ciclo como No interesado.`;
    warn.style.display = '';
    warn.style.color = 'var(--yellow)';
  } else {
    warn.style.display = 'none';
  }
}

function setEstado(value, el) {
  if (el.classList.contains('chip-disabled') && currentUser?.rol !== 'admin') {
    toast('⚠️ ' + (el.title || 'Este estado no está disponible para este cliente'), 'error');
    return;
  }
  document.querySelectorAll('.quick-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('f-estado').value = value;
  toggleIntentosField(value);
}

function closeVentaModal() { document.getElementById('venta-modal').classList.remove('open'); }

async function saveVenta() {
  const ventaId  = document.getElementById('edit-venta-id').value;
  const celular  = document.getElementById('f-celular').value.trim();
  const nombre   = document.getElementById('f-nombre').value.trim();
  const clienteId = document.getElementById('f-cliente-id').value;
  const estado   = document.getElementById('f-estado').value;
  const producto = document.getElementById('f-producto').value.trim();
  const ciudad   = document.getElementById('f-ciudad').value.trim();
  const notas    = document.getElementById('f-notas').value.trim();
  const intentos = parseInt(document.getElementById('f-intentos').value)||1;
  const fecha    = document.getElementById('f-fecha').value;
  const agenteId = currentUser.rol==='admin'
    ? document.getElementById('f-agente')?.value || currentUser.id
    : currentUser.id;

  if (!celular) { toast('⚠️ El celular es obligatorio', 'error'); return; }

  try {
    let cId = clienteId ? parseInt(clienteId) : null;

    if (!cId) {
      const { data: newC, error: errC } = await db.from('clientes')
        .insert({ celular, nombre: nombre||'s/n', ciudad, producto_interes: producto,
          direccion_residencial: document.getElementById('f-direccion')?.value?.trim() || null })
        .select().single();
      if (errC) throw errC;
      cId = newC.id;
    } else {
      const direccion = document.getElementById('f-direccion')?.value?.trim() || null;
      await db.from('clientes').update({ nombre: nombre||'s/n', ciudad, producto_interes: producto, direccion_residencial: direccion }).eq('id', cId);
    }

    // ── CAMBIO: límite de rellamadas = MAX_RELLAMADAS (3) ──
    let estadoFinal = estado;
    if (estado === 'rellamada') {
      if (intentos >= MAX_RELLAMADAS) {
        const ok = confirm(
          `Este registro ya tiene ${intentos} intentos de rellamada.\n` +
          `Al guardar se marcará automáticamente como "No interesado" y se archivará.\n\n` +
          `¿Confirmar?`
        );
        if (!ok) return;
        estadoFinal = 'no_interesado';
      } else if (intentos === MAX_RELLAMADAS - 1) {
        toast(`⚠️ ${intentos}/${MAX_RELLAMADAS} intentos — al llegar a ${MAX_RELLAMADAS} se marcará No interesado automáticamente`, 'error');
      }
    }

    if (estadoFinal !== estado) {
      toast('🔕 Marcado como No interesado (3 rellamadas sin respuesta)', 'error');
    }

    const debeArchivar = ESTADOS_CIERRE.includes(estadoFinal);
    const ventaData = {
      cliente_id: cId,
      agente_id:  agenteId,
      fecha, producto, ciudad, notas,
      estado: estadoFinal,
      intentos: estado==='rellamada' ? intentos : 1,
      archivado: debeArchivar,
    };

    let savedId;
    if (ventaId) {
      const { error } = await db.from('ventas').update(ventaData).eq('id', parseInt(ventaId));
      if (error) throw error;
      savedId = parseInt(ventaId);
      toast('✅ Registro actualizado', 'success');
    } else {
      const { data: saved, error } = await db.from('ventas').insert(ventaData).select().single();
      if (error) throw error;
      savedId = saved.id;
      toast('✅ Registro agregado', 'success');
    }

    if (currentUser.rol === 'admin' && estadoFinal !== 'spam') {
      const { count: spamCount } = await db.from('ventas')
        .select('*', {count:'exact',head:true})
        .eq('cliente_id', cId).eq('estado','spam')
        .neq('id', savedId);
      if ((spamCount || 0) === 0) {
        await db.from('clientes').update({ flag: 'normal' }).eq('id', cId);
      }
    }

    const url = await uploadComprobante(savedId);
    if (url) await db.from('ventas').update({comprobante_url: url}).eq('id', savedId);

    closeVentaModal();
    await loadVentas();
    renderVentas();
    renderDashboard();
  } catch(e) {
    toast('❌ Error: ' + e.message, 'error');
  }
}

function deleteVenta(id) {
  const v = ventas.find(x=>x.id===id);
  const celular = v?.cliente?.celular || '';
  const nombre  = v?.cliente?.nombre  || 's/n';
  document.getElementById('delete-modal-nombre').textContent  = nombre;
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
      const ventaAEliminar = ventas.find(x=>x.id===id);
      const clienteId = ventaAEliminar?.cliente_id;

      const { error } = await db.from('ventas').delete().eq('id', id);
      if (error) throw error;

      if (clienteId) {
        const { count: faltas } = await db.from('ventas')
          .select('*', {count:'exact',head:true})
          .eq('cliente_id', clienteId)
          .in('estado', ['cancelado','spam']);
        const { count: sinResp } = await db.from('ventas')
          .select('*', {count:'exact',head:true})
          .eq('cliente_id', clienteId)
          .eq('estado', 'sin_respuesta');
        const { count: spamCount } = await db.from('ventas')
          .select('*', {count:'exact',head:true})
          .eq('cliente_id', clienteId)
          .eq('estado', 'spam');
        const nuevoFlag = (spamCount || 0) > 0 ? 'spam' : 'normal';
        await db.from('clientes').update({
          faltas: faltas || 0,
          sin_respuesta: sinResp || 0,
          flag: nuevoFlag
        }).eq('id', clienteId);
      }

      toast('🗑️ Registro eliminado');
      await loadVentas();
      renderVentas();
      renderDashboard();
    } catch(e) { toast('❌ '+e.message,'error'); }
  };
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
}

// ═══════════════════════════════════════════════
//  COMPROBANTE
// ═══════════════════════════════════════════════
async function uploadComprobante(ventaId) {
  const input = document.getElementById('f-comprobante');
  const file = input?.files?.[0];
  if (!file) return null;
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) { toast('⚠️ Solo JPG, PNG, WEBP o PDF','error'); return null; }
  if (file.size > 5*1024*1024) { toast('⚠️ Máximo 5MB','error'); return null; }
  const ext = file.name.split('.').pop();
  const path = `${currentUser.id}/${ventaId}_${Date.now()}.${ext}`;
  const { error } = await db.storage.from('comprobantes').upload(path, file, {upsert:true});
  if (error) { toast('❌ Error subiendo: '+error.message,'error'); return null; }
  const { data: u } = db.storage.from('comprobantes').getPublicUrl(path);
  return u.publicUrl;
}

async function deleteComprobante(url, ventaId) {
  if (!url || !confirm('¿Eliminar comprobante?')) return;
  const path = url.split('/comprobantes/')[1];
  if (path) await db.storage.from('comprobantes').remove([path]);
  await db.from('ventas').update({comprobante_url:null}).eq('id', ventaId);
  toast('🗑️ Comprobante eliminado');
  await loadVentas(); renderVentas();
}

function renderComprobantePreview(url) {
  const wrap = document.getElementById('comprobante-preview');
  if (!wrap) return;
  if (!url) { wrap.innerHTML=''; return; }
  const isPdf = url.toLowerCase().includes('.pdf');
  wrap.innerHTML = isPdf
    ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <a href="${url}" target="_blank" style="color:var(--accent2);font-size:13px;">📄 Ver PDF</a>
        <button type="button" class="icon-btn danger" onclick="deleteComprobante('${url}',parseInt(document.getElementById('edit-venta-id').value))" style="font-size:11px;padding:3px 8px;">🗑️</button>
       </div>`
    : `<div style="margin-top:8px;position:relative;display:inline-block;">
        <img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display='none'">
        <button type="button" class="icon-btn danger" onclick="deleteComprobante('${url}',parseInt(document.getElementById('edit-venta-id').value))" style="position:absolute;top:4px;right:4px;font-size:11px;padding:3px 7px;background:var(--surface);">🗑️</button>
       </div>`;
}

// ═══════════════════════════════════════════════
//  SMART INPUTS
// ═══════════════════════════════════════════════
function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isOpen = dd.style.display !== 'none';
  document.querySelectorAll('.dropdown-list').forEach(d=>d.style.display='none');
  dd.style.display = isOpen ? 'none' : 'block';
}
function selectOption(inputId, value, ddId) {
  document.getElementById(inputId).value = value;
  document.getElementById(ddId).style.display = 'none';
  document.getElementById(inputId).focus();
}
document.addEventListener('click', e => {
  if (!e.target.closest('.smart-input-row'))
    document.querySelectorAll('.dropdown-list').forEach(d=>d.style.display='none');
});

// ═══════════════════════════════════════════════
//  USUARIOS (admin)
// ═══════════════════════════════════════════════
async function renderUsers() {
  const { data, error } = await db.from('usuarios').select('*').order('nombre');
  if (error) { toast('❌ Error cargando usuarios','error'); return; }
  document.getElementById('users-grid').innerHTML = data.map(u=>`
    <div class="user-card" style="${!u.activo?'opacity:0.5;':''}">
      <div class="user-card-header">
        <div class="user-card-avatar">${u.nombre[0].toUpperCase()}</div>
        <div>
          <div class="user-card-name">${u.nombre}${!u.activo?' <span style="color:var(--red);font-size:11px;">(inactivo)</span>':''}</div>
          <div class="user-card-role">@${u.usuario} · <span style="color:${u.rol==='admin'?'var(--accent2)':'var(--green)'}">${u.rol}</span></div>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="icon-btn" onclick="openUserModal('${u.id}')">✏️ Editar</button>
        ${u.usuario!=='admin'?`<button class="icon-btn danger" onclick="toggleUserActive('${u.id}',${u.activo})">${u.activo?'🚫 Desactivar':'✅ Activar'}</button>`:''}
      </div>
    </div>`).join('');
}

async function toggleUserActive(id, active) {
  const action = active ? 'desactivar' : 'activar';
  if (!confirm(`¿${action} este usuario?`)) return;
  const { error } = await db.from('usuarios').update({activo:!active}).eq('id',id);
  if (error) toast('❌ '+error.message,'error');
  else { toast(`✅ Usuario ${action}do`); renderUsers(); await loadAgents(); buildAgentSelector(); }
}

function openUserModal(id) {
  document.getElementById('user-modal').classList.add('open');
  if (id) {
    db.from('usuarios').select('*').eq('id',id).single().then(({data}) => {
      if (!data) return;
      document.getElementById('user-modal-title').textContent = 'Editar Usuario';
      document.getElementById('edit-user-id').value = data.id;
      document.getElementById('u-nombre').value   = data.nombre;
      document.getElementById('u-user').value     = data.usuario;
      document.getElementById('u-pass').value     = data.password;
      document.getElementById('u-rol').value      = data.rol;
    });
  } else {
    document.getElementById('user-modal-title').textContent = 'Nuevo Agente';
    ['edit-user-id','u-nombre','u-user','u-pass'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('u-rol').value = 'agente';
  }
}
function closeUserModal() { document.getElementById('user-modal').classList.remove('open'); }

async function saveUser() {
  const id = document.getElementById('edit-user-id').value;
  const data = {
    nombre:   document.getElementById('u-nombre').value.trim(),
    usuario:  document.getElementById('u-user').value.trim(),
    password: document.getElementById('u-pass').value,
    rol:      document.getElementById('u-rol').value,
    activo:   true,
  };
  if (!data.nombre||!data.usuario||!data.password) { toast('⚠️ Completa todos los campos','error'); return; }
  try {
    if (id) { const {error}=await db.from('usuarios').update(data).eq('id',id); if(error) throw error; }
    else    { const {error}=await db.from('usuarios').insert(data);              if(error) throw error; }
    closeUserModal(); renderUsers(); await loadAgents(); buildAgentSelector();
    toast('✅ Usuario guardado','success');
  } catch(e) { toast('❌ '+e.message,'error'); }
}

// ═══════════════════════════════════════════════
//  EXPORT CSV
// ═══════════════════════════════════════════════
function exportCSV() {
  const isAdmin = currentUser?.rol==='admin';
  const headers = ['ID','Fecha','Nombre','Celular','Producto','Ciudad','Estado','Notas',...(isAdmin?['Agente']:[])];
  const rows = ventas.map(v=>[
    v.id, v.fecha,
    v.cliente?.nombre||'', v.cliente?.celular||'',
    v.producto||'', v.ciudad||v.cliente?.ciudad||'',
    v.estado||'', v.notas||'',
    ...(isAdmin?[v.agente?.nombre||'']:[])
  ].map(x=>`"${(x||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','),...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LIT_CRM_${currentUser.nombre}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('📥 CSV exportado','success');
}

// ═══════════════════════════════════════════════
//  BOLIVIA — Datos geográficos
// ═══════════════════════════════════════════════
const BOLIVIA_GEO = {
  "Santa Cruz": {
    capital: "Santa Cruz de la Sierra",
    provincias: {
      "Andrés Ibáñez": { capital: "Santa Cruz de la Sierra", municipios: ["Santa Cruz de la Sierra","Cotoca","Porongo","La Guardia","El Torno","Warnes"] },
      "Warnes": { capital: "Warnes", municipios: ["Warnes","Okinawa Uno"] },
      "Ichilo": { capital: "Buena Vista", municipios: ["Buena Vista","San Carlos","Yapacaní","San Juan"] },
      "Sara": { capital: "Portachuelo", municipios: ["Portachuelo","Santa Rosa del Sara","Colpa Bélgica"] },
      "Obispo Santisteban": { capital: "Montero", municipios: ["Montero","Saavedra","Mineros","General Saavedra"] },
      "Ñuflo de Chávez": { capital: "Concepción", municipios: ["Concepción","San Julián","San Antonio de Lomerío","Cuatro Cañadas","San Ramón","San Javier"] },
      "Velasco": { capital: "San Ignacio de Velasco", municipios: ["San Ignacio de Velasco","San Miguel de Velasco","San Rafael"] },
      "Chiquitos": { capital: "San José de Chiquitos", municipios: ["San José de Chiquitos","Pailón","Roboré","Charagua"] },
      "Cordillera": { capital: "Camiri", municipios: ["Camiri","Charagua","Cabezas","Boyuibe","Cuevo","Gutiérrez","Lagunillas"] },
      "Florida": { capital: "Samaipata", municipios: ["Samaipata","Mairana","Pampagrande"] },
      "Vallegrande": { capital: "Vallegrande", municipios: ["Vallegrande","Moro Moro","Pucará"] },
      "Manuel María Caballero": { capital: "Comarapa", municipios: ["Comarapa","Saipina"] },
      "Germán Busch": { capital: "Puerto Suárez", municipios: ["Puerto Suárez","Puerto Quijarro","Carmen Rivero Torres"] },
      "Ángel Sandoval": { capital: "San Matías", municipios: ["San Matías"] }
    }
  },
  "La Paz": {
    capital: "La Paz",
    provincias: {
      "Murillo": { capital: "La Paz", municipios: ["La Paz","El Alto","Palca","Mecapaca","Achocalla","Viacha"] },
      "Omasuyos": { capital: "Achacachi", municipios: ["Achacachi","Ancoraimes"] },
      "Pacajes": { capital: "Coro Coro", municipios: ["Coro Coro","Comanche","Charaña","Calacoto"] },
      "Camacho": { capital: "Puerto Acosta", municipios: ["Puerto Acosta","Mocomoco","San Pedro de Tiquina"] },
      "Muñecas": { capital: "Chuma", municipios: ["Chuma","Ayata","Aucapata"] },
      "Franz Tamayo": { capital: "Apolo", municipios: ["Apolo","Pelechuco"] },
      "Larecaja": { capital: "Sorata", municipios: ["Sorata","Guanay","Teoponte"] },
      "Sud Yungas": { capital: "Chulumani", municipios: ["Chulumani","Irupana","Yanacachi","Palos Blancos","La Asunta"] },
      "Nor Yungas": { capital: "Coroico", municipios: ["Coroico","Coripata"] },
      "Abel Iturralde": { capital: "Ixiamas", municipios: ["Ixiamas","San Buenaventura"] },
      "Manco Kápac": { capital: "Copacabana", municipios: ["Copacabana","San Pedro de Tiquina"] },
      "Ingavi": { capital: "Viacha", municipios: ["Viacha","Guaqui","Tiwanaku","Desaguadero","Taraco"] },
      "Loayza": { capital: "Patacamaya", municipios: ["Patacamaya","Luribay","Sapahaqui","Yaco"] },
      "Inquisivi": { capital: "Quime", municipios: ["Quime","Cajuata","Colquiri","Ichoca"] },
      "Caranavi": { capital: "Caranavi", municipios: ["Caranavi"] },
      "Los Andes": { capital: "Pucarani", municipios: ["Pucarani","Laja","Batallas","Puerto Pérez"] },
      "Aroma": { capital: "Sica Sica", municipios: ["Sica Sica","Ayo Ayo","Calamarca","Colquencha","Umala"] }
    }
  },
  "Cochabamba": {
    capital: "Cochabamba",
    provincias: {
      "Cercado": { capital: "Cochabamba", municipios: ["Cochabamba","Quillacollo","Sacaba","Colcapirhua","Sipe Sipe","Tiquipaya","Vinto"] },
      "Quillacollo": { capital: "Quillacollo", municipios: ["Quillacollo","Colcapirhua","Sipe Sipe","Tiquipaya","Vinto"] },
      "Chapare": { capital: "Sacaba", municipios: ["Sacaba","Colomi","Villa Tunari","Entre Ríos","Puerto Villarroel"] },
      "Ayopaya": { capital: "Independencia", municipios: ["Independencia","Morochata","Cocapata"] },
      "Esteban Arze": { capital: "Tarata", municipios: ["Tarata","Arbieto","Santiváñez"] },
      "Arani": { capital: "Arani", municipios: ["Arani","Vacas"] },
      "Capinota": { capital: "Capinota", municipios: ["Capinota","Santivañez","Sicaya"] },
      "Germán Jordán": { capital: "Cliza", municipios: ["Cliza","Tolata","Toco"] },
      "Punata": { capital: "Punata", municipios: ["Punata","Villa Rivero","San Benito"] },
      "Carrasco": { capital: "Totora", municipios: ["Totora","Pojo","Chimoré","Puerto Villarroel"] },
      "Mizque": { capital: "Mizque", municipios: ["Mizque","Vila Vila","Alalay"] },
      "Campero": { capital: "Aiquile", municipios: ["Aiquile","Pasorapa","Omereque"] },
      "Tapacarí": { capital: "Tapacarí", municipios: ["Tapacarí"] }
    }
  },
  "Potosí": { capital: "Potosí", provincias: { "Tomás Frías": { capital: "Potosí", municipios: ["Potosí","Yocalla","Urmiri","Chaqui","Tacobamba"] }, "Antonio Quijarro": { capital: "Uyuni", municipios: ["Uyuni","Tomave","Porco"] }, "Chayanta": { capital: "Llallagua", municipios: ["Llallagua","Uncía","Chayanta","Sacaca","Ravelo","Ocurí"] }, "Linares": { capital: "Puna", municipios: ["Puna","Caiza D","Betanzos"] }, "Nor Chichas": { capital: "Cotagaita", municipios: ["Cotagaita","Vitichi"] }, "Sud Chichas": { capital: "Tupiza", municipios: ["Tupiza","Atocha"] }, "Modesto Omiste": { capital: "Villazón", municipios: ["Villazón"] } } },
  "Oruro": { capital: "Oruro", provincias: { "Cercado": { capital: "Oruro", municipios: ["Oruro","El Choro","Soracachi"] }, "Eduardo Avaroa": { capital: "Challapata", municipios: ["Challapata","Santuario de Quillacas"] }, "Poopó": { capital: "Poopó", municipios: ["Poopó","Pazña","Antequera"] }, "Pantaleón Dalence": { capital: "Huanuni", municipios: ["Huanuni","Machacamarca"] } } },
  "Chuquisaca": { capital: "Sucre", provincias: { "Oropeza": { capital: "Sucre", municipios: ["Sucre","Yotala","Poroma"] }, "Yamparáez": { capital: "Tarabuco", municipios: ["Tarabuco","Yamparáez"] }, "Tomina": { capital: "Padilla", municipios: ["Padilla","Tomina","Sopachuy","El Villar"] }, "Hernando Siles": { capital: "Monteagudo", municipios: ["Monteagudo","Huacareta"] }, "Nor Cinti": { capital: "Camargo", municipios: ["Camargo","Villa Charcas"] } } },
  "Tarija": { capital: "Tarija", provincias: { "Cercado": { capital: "Tarija", municipios: ["Tarija","San Lorenzo","Uriondo","Padcaya"] }, "Gran Chaco": { capital: "Yacuiba", municipios: ["Yacuiba","Caraparí","Villamontes"] }, "Arce": { capital: "Bermejo", municipios: ["Bermejo"] } } },
  "Beni": { capital: "Trinidad", provincias: { "Cercado": { capital: "Trinidad", municipios: ["Trinidad","San Javier"] }, "Vaca Díez": { capital: "Riberalta", municipios: ["Riberalta","Guayaramerín"] }, "Ballivián": { capital: "San Borja", municipios: ["San Borja","Rurrenabaque","Santa Rosa","Reyes"] } } },
  "Pando": { capital: "Cobija", provincias: { "Nicolás Suárez": { capital: "Cobija", municipios: ["Cobija","Bolpebra","Bella Flor","Porvenir","San Pedro"] }, "Manuripi": { capital: "Puerto Rico", municipios: ["Puerto Rico","Filadelfia","San Lorenzo"] } } }
};

function initGeoSelectors() {
  const selDep = document.getElementById('sel-departamento');
  const selProv = document.getElementById('sel-provincia');
  const selMun = document.getElementById('sel-municipio');
  if (!selDep) return;

  selDep.innerHTML = '<option value="">— Departamento —</option>';
  Object.keys(BOLIVIA_GEO).sort().forEach(dep => {
    const o = document.createElement('option');
    o.value = dep; o.textContent = dep;
    selDep.appendChild(o);
  });

  selDep.onchange = () => {
    const dep = selDep.value;
    selProv.innerHTML = '<option value="">— Provincia —</option>';
    selMun.innerHTML  = '<option value="">— Municipio —</option>';
    selProv.disabled  = !dep;
    selMun.disabled   = true;
    if (!dep) return;
    Object.keys(BOLIVIA_GEO[dep].provincias).sort().forEach(prov => {
      const o = document.createElement('option');
      o.value = prov; o.textContent = prov;
      selProv.appendChild(o);
    });
  };

  selProv.onchange = () => {
    const dep  = selDep.value;
    const prov = selProv.value;
    selMun.innerHTML = '<option value="">— Municipio —</option>';
    selMun.disabled  = !prov;
    if (!dep || !prov) return;
    const provData = BOLIVIA_GEO[dep].provincias[prov];
    const capProv  = provData.capital;
    const capDep   = BOLIVIA_GEO[dep].capital;
    provData.municipios.forEach(mun => {
      const o = document.createElement('option');
      o.value = mun;
      const esCapDep  = mun === capDep;
      const esCapProv = mun === capProv && mun !== capDep;
      o.textContent = esCapDep  ? mun + ' ★ (cap. departamental)' :
                      esCapProv ? mun + ' · (cap. provincial)' : mun;
      selMun.appendChild(o);
    });
  };

  selMun.onchange = () => {
    const mun = selMun.value;
    if (mun) {
      const input = document.getElementById('f-ciudad');
      if (input) { input.value = mun; input.dispatchEvent(new Event('input')); }
    }
  };
}

function onDireccionKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const dir = document.getElementById('f-direccion').value.trim();
  const wrap = document.getElementById('maps-preview');
  if (!dir || !wrap) return;
  const q = encodeURIComponent(dir + ', Bolivia');
  wrap.innerHTML = `<iframe
    src="https://maps.google.com/maps?q=${q}&output=embed&hl=es"
    width="100%" height="220"
    style="border:0;border-radius:8px;margin-top:8px;"
    allowfullscreen="" loading="lazy">
  </iframe>`;
}

// ═══════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════
let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.className = 'toast show '+type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 4000);
}

// Cerrar modales al hacer clic en overlay
document.getElementById('venta-modal').addEventListener('click', e=>{if(e.target===e.currentTarget) closeVentaModal();});
document.getElementById('user-modal').addEventListener('click',  e=>{if(e.target===e.currentTarget) closeUserModal();});
document.getElementById('delete-modal').addEventListener('click', e=>{if(e.target===e.currentTarget) closeDeleteModal();});
document.getElementById('delete-confirm-input').addEventListener('keydown', e=>{if(e.key==='Enter') document.getElementById('delete-confirm-btn').click();});

// Init theme on page load
initTheme();