//  leads.js
//  Pestaña "Leads" — webhook vía Supabase tabla leads

const KOMMO_PROXY_URL = 'https://txjgdglfzskirujqctra.supabase.co/functions/v1/kommo-proxy';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4amdkZ2xmenNraXJ1anFjdHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzYzNzYsImV4cCI6MjA4OTI1MjM3Nn0.b3o9KHVaspzyRnMhmB6uX2jLjadWgAFJM-iYHKHjXr0';

let _leads = [];
let _leadsLoading = false;

// Cargar leads pendientes desde Supabase
async function _cargarLeadsPendientes() {
  const { data, error } = await db.from('leads')
    .select('*')
    .eq('procesado', false)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error cargando leads:', error); return; }
  _leads = data || [];
  _renderLeads();
  _actualizarBadgeLeads();
  iniciarRealtimeLeads();
}

// Sincronizar desde Kommo y guardar nuevos en Supabase
async function cargarLeads() {
  if (_leadsLoading) return;
  _leadsLoading = true;

  const btn = document.getElementById('recover-leads-btn');
  if (btn) { btn.classList.add('syncing'); btn.disabled = true; }

  try {
    const res = await fetch(KOMMO_PROXY_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    const leadsKommo = data.leads || [];

    // Upsert: insertar solo nuevos, ignorar duplicados por kommo_lead_id
    if (leadsKommo.length > 0) {
      const { error } = await db.from('leads').upsert(
        leadsKommo.map(l => ({
          celular: l.celular,
          nombre: l.nombre || null,
          fuente: 'kommo',
          kommo_lead_id: l.kommo_lead_id,
          procesado: false,
        })),
        { onConflict: 'kommo_lead_id', ignoreDuplicates: true }
      );
      if (error) console.error('Error guardando leads:', error);
    }

    // Recargar desde Supabase (solo pendientes)
    await _cargarLeadsPendientes();
    toast(`🎯 ${_leads.length} lead${_leads.length !== 1 ? 's' : ''} pendiente${_leads.length !== 1 ? 's' : ''}`, '');

  } catch (e) {
    console.error('Error cargando leads de Kommo:', e);
    toast('❌ Error conectando con Kommo: ' + e.message, 'error');
  } finally {
    _leadsLoading = false;
    if (btn) { btn.classList.remove('syncing'); btn.disabled = false; }
  }
}

// Badge en la pestaña
function _actualizarBadgeLeads() {
  const tab = document.getElementById('tab-leads');
  if (!tab) return;
  const count = _leads.length;
  const existing = tab.querySelector('.leads-badge');
  if (existing) existing.remove();
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'leads-badge';
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.cssText = `
      display:inline-flex;align-items:center;justify-content:center;
      background:var(--red);color:white;
      font-size:10px;font-weight:800;line-height:1;
      min-width:17px;height:17px;padding:0 4px;
      border-radius:20px;margin-left:6px;
      font-family:'Syne',sans-serif;
      animation: leadsPulse 2s ease infinite;
    `;
    tab.appendChild(badge);
  }
}

// Render principal de la vista Leads
function _renderLeads() {
  const wrap = document.getElementById('leads-list-wrap');
  if (!wrap) return;

  const countEl = document.getElementById('leads-count');
  if (countEl) countEl.textContent = `${_leads.length} lead${_leads.length !== 1 ? 's' : ''} pendiente${_leads.length !== 1 ? 's' : ''}`;

  if (_leads.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:60px 20px;">
        <div class="emoji" style="font-size:48px;margin-bottom:12px;">📭</div>
        <p style="color:var(--text2);font-size:14px;">Sin leads pendientes</p>
        <p style="color:var(--text3);font-size:12px;margin-top:4px;">
          Los leads llegan automáticamente desde <b style="color:var(--accent2);">Kommo</b> vía webhook
        </p>
      </div>`;
    return;
  }

  wrap.innerHTML = _leads.map((lead, i) => {
    const iniciales = (lead.nombre || lead.celular || '?')[0].toUpperCase();
    const nombreDisplay = lead.nombre && lead.nombre.trim()
      ? `<span style="font-weight:600;font-size:14px;color:var(--text);">${_escapeHtml(lead.nombre)}</span>`
      : `<span style="color:var(--text3);font-size:13px;font-style:italic;">Sin nombre</span>`;
    const mensajeDisplay = lead.mensaje
      ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;" title="${_escapeHtml(lead.mensaje)}">
           💬 ${_escapeHtml(lead.mensaje)}
         </div>`
      : '';
    const fechaDisplay = lead.created_at
      ? `<span style="font-size:10px;color:var(--text3);margin-left:6px;">${new Date(lead.created_at).toLocaleString('es-BO', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' })}</span>`
      : '';

    return `
    <div class="lead-card" id="lead-card-${i}" style="
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:var(--radius);
      padding:16px 18px;
      display:flex;
      align-items:center;
      gap:14px;
      transition:border-color 0.2s, background 0.2s;
      animation: leadSlideIn 0.3s ease;
    "
    onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface2)'"
    onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'"
    >
      <div style="
        width:44px;height:44px;border-radius:50%;flex-shrink:0;
        background:linear-gradient(135deg,var(--accent),var(--accent2));
        display:flex;align-items:center;justify-content:center;
        font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:white;
      ">${iniciales}</div>

      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          ${nombreDisplay}
          <span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);
                       font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:0.3px;">
            KOMMO
          </span>
          ${fechaDisplay}
        </div>
        <a href="tel:${lead.celular}" onclick="event.stopPropagation()"
          style="color:var(--accent2);font-size:14px;font-weight:600;
                 font-family:monospace;text-decoration:none;letter-spacing:0.5px;">
          📱 ${lead.celular}
        </a>
        ${mensajeDisplay}
      </div>

      <div style="flex-shrink:0;">
        <button
          onclick="registrarLead(${i})"
          style="
            background:var(--accent);border:none;border-radius:8px;
            padding:9px 16px;color:white;font-family:'Syne',sans-serif;
            font-weight:700;font-size:12px;cursor:pointer;
            transition:transform 0.15s, box-shadow 0.15s;white-space:nowrap;
            box-shadow:0 2px 8px var(--accent-glow);
          "
          onmouseover="this.style.transform='translateY(-1px)'"
          onmouseout="this.style.transform=''"
        >
          ✚ Registrar
        </button>
      </div>
    </div>`;
  }).join('');
}

// Registrar: abrir modal pre-cargado
async function registrarLead(idx) {
  const lead = _leads[idx];
  if (!lead) return;

  showViewDirect('ventas');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-view="ventas"]')?.classList.add('active');

  await openVentaModal();
  await new Promise(r => setTimeout(r, 80));

  const celularInput = document.getElementById('f-celular');
  const nombreInput  = document.getElementById('f-nombre');
  const notasInput   = document.getElementById('f-notas');

  if (celularInput) {
    celularInput.value = lead.celular;
    await onCelularInput();
  }

  if (nombreInput && lead.nombre) {
    await new Promise(r => setTimeout(r, 400));
    if (!nombreInput.value) nombreInput.value = lead.nombre;
  }

  // Poner el mensaje en notas si existe
  if (notasInput && lead.mensaje && !notasInput.value) {
    notasInput.value = lead.mensaje;
  }

  // Guardar ID del lead en la BD para marcarlo procesado al guardar
  document.getElementById('venta-modal').dataset.leadDbId = lead.id;
  document.getElementById('venta-modal').dataset.leadIdx = idx;

  toast(`📋 Lead cargado: ${lead.celular}`, 'success');
}

// Hook: al guardar una venta, marcar lead como procesado
async function onVentaGuardadaDesdeLeads() {
  const modal = document.getElementById('venta-modal');
  const leadDbId = modal?.dataset.leadDbId ? parseInt(modal.dataset.leadDbId) : null;
  const idx = modal?.dataset.leadIdx !== undefined ? parseInt(modal.dataset.leadIdx) : null;

  delete modal.dataset.leadDbId;
  delete modal.dataset.leadIdx;

  if (!leadDbId || isNaN(leadDbId)) return;

  // Marcar como procesado en Supabase
  const { error } = await db.from('leads').update({ procesado: true }).eq('id', leadDbId);
  if (error) console.error('Error marcando lead procesado:', error);

  // Quitar de la lista en memoria
  if (idx !== null && !isNaN(idx)) {
    _leads.splice(idx, 1);
  } else {
    _leads = _leads.filter(l => l.id !== leadDbId);
  }

  _renderLeads();
  _actualizarBadgeLeads();
}

// ── Checar si hay que re-mostrar lead cuando se archiva venta ─
// Se llama desde saveVenta() en app.js cuando el estado es de cierre
async function _reactivarLeadSiArchivado(celular) {
  // Los estados de cierre son: vendido, no_interesado, spam, cancelado
  // Si el registro queda archivado, el lead puede volver a aparecer
  // solo si hay un nuevo mensaje (webhook lo manejará automáticamente)
  // No hacemos nada aquí — el webhook creará un nuevo registro en leads
  // con procesado=false cuando llegue el próximo mensaje
}

// Agregar lead manualmente
async function agregarLeadManual() {
  const celular = document.getElementById('lead-manual-celular')?.value.trim();
  const nombre  = document.getElementById('lead-manual-nombre')?.value.trim() || null;
  if (!celular) { toast('⚠️ El celular es obligatorio', 'error'); return; }

  const { error } = await db.from('leads').upsert(
    [{ celular, nombre, fuente: 'manual', procesado: false }],
    { onConflict: 'celular', ignoreDuplicates: false }
  );

  if (error) { toast('❌ ' + error.message, 'error'); return; }

  document.getElementById('lead-manual-celular').value = '';
  document.getElementById('lead-manual-nombre').value = '';
  document.getElementById('leads-manual-panel').style.display = 'none';

  await _cargarLeadsPendientes();
  toast('✅ Lead agregado', 'success');
}

// Render vista (llamado desde showView)
function renderLeads() {
  _cargarLeadsPendientes();
}

// Helper
function _escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Realtime: escuchar nuevos leads del webhook
let _realtimeChannel = null;

function iniciarRealtimeLeads() {
  // No iniciar si ya está activo
  if (_realtimeChannel) return;

  _realtimeChannel = db
    .channel('leads-entrantes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'leads',
        filter: 'procesado=eq.false',
      },
      (payload) => {
        const nuevo = payload.new;
        
        // Evitar duplicados en memoria
        if (_leads.some(l => l.id === nuevo.id)) return;

        // Agregar al inicio de la lista
        _leads.unshift(nuevo);
        _renderLeads();
        _actualizarBadgeLeads();

        // Notificación sutil
        toast(`🎯 Nuevo lead: ${nuevo.nombre || nuevo.celular}`, '');
      }
    )
    .subscribe();
}

function detenerRealtimeLeads() {
  if (_realtimeChannel) {
    db.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}