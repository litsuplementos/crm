// ═══════════════════════════════════════════════
//  LIT CRM — leads.js
//  Pestaña "Leads" — consume Edge Function kommo-proxy
//  Sin tabla leads, sin polling, carga 100% manual
// ═══════════════════════════════════════════════

const KOMMO_PROXY_URL = 'https://txjgdglfzskirujqctra.supabase.co/functions/v1/kommo-proxy';

let _leads = [];
let _leadsLoading = false;

// ── Cargar leads desde Kommo vía Edge Function ───────────────
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
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4amdkZ2xmenNraXJ1anFjdHJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzYzNzYsImV4cCI6MjA4OTI1MjM3Nn0.b3o9KHVaspzyRnMhmB6uX2jLjadWgAFJM-iYHKHjXr0',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Error ${res.status}`);
    }

    const data = await res.json();
    _leads = data.leads || [];
    _renderLeads();
    _actualizarBadgeLeads();
    toast(`🎯 ${_leads.length} lead${_leads.length !== 1 ? 's' : ''} encontrado${_leads.length !== 1 ? 's' : ''} en Kommo`, '');

  } catch (e) {
    console.error('Error cargando leads de Kommo:', e);
    toast('❌ Error conectando con Kommo: ' + e.message, 'error');
  } finally {
    _leadsLoading = false;
    if (btn) { btn.classList.remove('syncing'); btn.disabled = false; }
  }
}

// ── Badge en la pestaña ──────────────────────────────────────
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

// ── Render principal de la vista Leads ──────────────────────
function _renderLeads() {
  const wrap = document.getElementById('leads-list-wrap');
  if (!wrap) return;

  const countEl = document.getElementById('leads-count');
  if (countEl) countEl.textContent = `${_leads.length} lead${_leads.length !== 1 ? 's' : ''} en Kommo`;

  if (_leads.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:60px 20px;">
        <div class="emoji" style="font-size:48px;margin-bottom:12px;">📭</div>
        <p style="color:var(--text2);font-size:14px;">Sin leads en Kommo</p>
        <p style="color:var(--text3);font-size:12px;margin-top:4px;">
          Usa el botón <b style="color:var(--accent2);">Recuperar Leads</b> en la barra superior para sincronizar
        </p>
      </div>`;
    return;
  }

  wrap.innerHTML = _leads.map((lead, i) => {
    const iniciales = (lead.nombre || lead.celular || '?')[0].toUpperCase();
    const nombreDisplay = lead.nombre
      ? `<span style="font-weight:600;font-size:14px;color:var(--text);">${_escapeHtml(lead.nombre)}</span>`
      : `<span style="color:var(--text3);font-size:13px;font-style:italic;">Sin nombre</span>`;

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
      <!-- Avatar -->
      <div style="
        width:44px;height:44px;border-radius:50%;flex-shrink:0;
        background:linear-gradient(135deg,var(--accent),var(--accent2));
        display:flex;align-items:center;justify-content:center;
        font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:white;
      ">${iniciales}</div>

      <!-- Info -->
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          ${nombreDisplay}
          <span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);
                       font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;letter-spacing:0.3px;">
            KOMMO
          </span>
        </div>
        <a href="tel:${lead.celular}" onclick="event.stopPropagation()"
          style="color:var(--accent2);font-size:14px;font-weight:600;
                 font-family:monospace;text-decoration:none;letter-spacing:0.5px;">
          📱 ${lead.celular}
        </a>
      </div>

      <!-- Acción -->
      <div style="flex-shrink:0;">
        <button
          onclick="registrarLead(${i})"
          style="
            background:var(--accent);border:none;border-radius:8px;
            padding:9px 16px;color:white;font-family:'Syne',sans-serif;
            font-weight:700;font-size:12px;cursor:pointer;
            transition:transform 0.15s, box-shadow 0.15s;white-space:nowrap;
            box-shadow:0 2px 8px rgba(125,211,252,0.3);
          "
          onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(125,211,252,0.5)'"
          onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(125,211,252,0.3)'"
        >
          ✚ Registrar cliente
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Registrar: abrir modal pre-cargado ──────────────────────
async function registrarLead(idx) {
  const lead = _leads[idx];
  if (!lead) return;

  // Cambiar a vista de ventas
  showViewDirect('ventas');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-view="ventas"]')?.classList.add('active');

  // Abrir modal nuevo registro
  await openVentaModal();
  await new Promise(r => setTimeout(r, 80));

  const celularInput = document.getElementById('f-celular');
  const nombreInput  = document.getElementById('f-nombre');

  if (celularInput) {
    celularInput.value = lead.celular;
    await onCelularInput();
  }

  if (nombreInput && lead.nombre) {
    await new Promise(r => setTimeout(r, 400));
    if (!nombreInput.value) nombreInput.value = lead.nombre;
  }

  // Guardar índice en el modal para quitar el lead de la lista al guardar
  document.getElementById('venta-modal').dataset.leadIdx = idx;

  toast(`📋 Lead cargado: ${lead.celular}`, 'success');
}

// ── Hook: al guardar una venta, quitar el lead de la lista ──
async function onVentaGuardadaDesdeLeads() {
  const modal = document.getElementById('venta-modal');
  const idx = modal?.dataset.leadIdx !== undefined ? parseInt(modal.dataset.leadIdx) : null;
  if (idx === null || isNaN(idx)) return;
  delete modal.dataset.leadIdx;
  // Quitar de la lista en memoria (no hay nada que borrar en BD)
  _leads.splice(idx, 1);
  _renderLeads();
  _actualizarBadgeLeads();
}

// ── Render vista (llamado desde showView) ────────────────────
function renderLeads() {
  _renderLeads();
}

// ── Helper ───────────────────────────────────────────────────
function _escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}