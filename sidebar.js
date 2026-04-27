/* sidebar.js */

(function () {
  /* 1. Inyectar <link> al CSS del sidebar */
  (function injectCSS() {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'sidebar.css';
    document.head.appendChild(link);
  })();

  /* 2. Esperar a que el DOM esté listo */
  function init() {
    const app = document.getElementById('app');
    if (!app) { setTimeout(init, 50); return; }
    buildSidebar();
    wrapContentArea();
    observeNavTabs(); // sincroniza sidebar con el sistema de pestañas original
    observeUserData(); // sincroniza nombre/avatar
    syncSidebarWithUser();
    loadSidebarState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* 3. Definición de items del sidebar */
  const NAV_ITEMS = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard',   view: 'dashboard',  always: true },
    { id: 'leads',     icon: '🎯', label: 'Leads',        view: 'leads',      tabId: 'tab-leads' },
    { id: 'ventas',    icon: '📋', label: 'Registros',    view: 'ventas',     always: true },
    { id: 'productos', icon: '📦', label: 'Productos',    view: 'productos',  tabId: 'tab-productos' },
    { id: 'guia',      icon: '📚', label: 'Guía AC',      view: 'guia',       always: true },
    { id: 'config',    icon: '⚙️',  label: 'Ajustes',      view: 'config',     tabId: 'tab-config' },
    { id: 'usuarios',  icon: '🔐', label: 'Usuarios',     view: 'usuarios',   tabId: 'tab-usuarios' },
    { id: 'memorias',  icon: '🗄️',  label: 'Memorias',    view: 'memorias',   always: true },
  ];

  /* 4. Construir el DOM del sidebar */
  function buildSidebar() {
    const app = document.getElementById('app');

    // Overlay para mobile
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(overlay);

    const sidebar = document.createElement('div');
    sidebar.id = 'sidebar';
    sidebar.innerHTML = `
      <!-- Logo -->
      <div class="sidebar-logo-wrap">
        <div class="sidebar-logo-inner">
          <div class="sidebar-logo-text">LIT <span>CRM</span></div>
          <div class="sidebar-badge-logo">PRO</div>
        </div>
        <button class="sidebar-toggle" id="sidebar-toggle-btn" title="Colapsar/expandir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
      </div>

      <!-- Nav -->
      <nav class="sidebar-nav" id="sidebar-nav"></nav>      
    `;

    // Insertar antes de topbar (primer hijo)
    app.insertBefore(sidebar, app.firstChild);

    // Toggle collapse
    document.getElementById('sidebar-toggle-btn').addEventListener('click', toggleSidebar);

    // Botón mobile en topbar
    const mobileBtn = document.createElement('button');
    mobileBtn.id = 'mobile-sidebar-toggle';
    mobileBtn.style.cssText = 'background:none;border:1px solid var(--border);border-radius:8px;padding:5px 8px;color:var(--text2);cursor:pointer;font-size:18px;display:none;align-items:center;justify-content:center;';
    mobileBtn.textContent = '☰';
    mobileBtn.addEventListener('click', openMobileSidebar);
    const topbar = document.querySelector('.topbar');
    if (topbar) topbar.insertBefore(mobileBtn, topbar.firstChild);

    renderNavItems();
  }

  /* 5. Renderizar items de nav */
  function renderNavItems() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    nav.innerHTML = '';

    NAV_ITEMS.forEach(item => {
      // Verificar visibilidad: si tiene tabId, respeta el display del tab original
      const origTab = item.tabId ? document.getElementById(item.tabId) : null;
      if (origTab && origTab.style.display === 'none') return; // no mostrar si admin-only y no es admin

      const el = document.createElement('div');
      el.className = 'sidebar-nav-item';
      el.dataset.view = item.view;
      el.dataset.label = item.label;
      el.setAttribute('title', '');
      el.innerHTML = `
        <span class="sidebar-nav-icon">${item.icon}</span>
        <span class="sidebar-nav-label">${item.label}</span>
      `;
      el.addEventListener('click', () => {
        sidebarNavigate(item.view, el);
      });
      nav.appendChild(el);
    });

    // Activar el item que corresponde a la vista activa actual
    syncActiveItem();
  }

  /* 6. Navegar desde sidebar */
  function sidebarNavigate(viewName, clickedEl) {
    // Cerrar mobile sidebar si está abierto
    closeMobileSidebar();

    // Activar visualmente
    document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
    if (clickedEl) clickedEl.classList.add('active');

    // Llamar al showView original, simulando click en el tab original
    const origTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
    if (origTab) {
      // Clonar evento para que showView reciba el event.target correcto
      const fakeEvent = { target: origTab };
      const origShowView = window.showView;
      if (origShowView) {
        // showView usa `event.target.classList.add('active')` — necesitamos
        // parchear temporalmente window.event o llamar de forma directa
        origTab.click();
      }
    } else {
      // Fallback: llamar showViewDirect si existe
      if (window.showViewDirect) window.showViewDirect(viewName);
    }
  }

  /* 7. Wrapping del content area */
  function wrapContentArea() {
    const app = document.getElementById('app');
    const topbar = app.querySelector('.topbar');
    const mainEl = app.querySelector('.main');
    if (!mainEl || !topbar) return;

    // Crear wrapper
    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';

    // Mover .main dentro del wrapper
    app.insertBefore(contentArea, mainEl);
    contentArea.appendChild(mainEl);
  }

  /* 8. Sincronizar item activo del sidebar */
  function syncActiveItem() {
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    const viewId = activeView.id?.replace('view-', '');
    document.querySelectorAll('.sidebar-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewId);
    });
  }

  /* 9. Observar cambios en los tabs originales (cuando showView los activa) */
  function observeNavTabs() {
    // MutationObserver sobre .nav-tabs para detectar cambio de clase active
    const navTabs = document.querySelector('.nav-tabs');
    if (!navTabs) return;

    const mo = new MutationObserver(() => {
      syncActiveItem();
    });
    mo.observe(navTabs, { subtree: true, attributes: true, attributeFilter: ['class'] });

    // También observar las views directamente
    const main = document.querySelector('.main');
    if (main) {
      const mo2 = new MutationObserver(() => {
        syncActiveItem();
      });
      mo2.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    // Observar cambios de display en los tabs para admin-only items
    const allTabs = document.querySelectorAll('.nav-tab[id]');
    allTabs.forEach(tab => {
      const mo3 = new MutationObserver(() => {
        renderNavItems(); // re-renderizar cuando cambien visibilidad
      });
      mo3.observe(tab, { attributes: true, attributeFilter: ['style'] });
    });
  }

  /* 10. Sincronizar nombre y avatar del usuario */
  function observeUserData() {
    const nameEl = document.getElementById('user-name-top');
    const avatarEl = document.getElementById('user-avatar-top');
    if (!nameEl || !avatarEl) return;

    const update = () => syncSidebarWithUser();
    const mo = new MutationObserver(update);
    mo.observe(nameEl, { childList: true, characterData: true, subtree: true });
    mo.observe(avatarEl, { childList: true, characterData: true, subtree: true });
  }

  function syncSidebarWithUser() {
    const nameEl = document.getElementById('user-name-top');
    const avatarEl = document.getElementById('user-avatar-top');
    const sName  = document.getElementById('sidebar-user-name');
    const sAvatar= document.getElementById('sidebar-avatar');
    const sRole  = document.getElementById('sidebar-user-role');

    if (nameEl && sName)  sName.textContent  = nameEl.textContent || '—';
    if (avatarEl && sAvatar) sAvatar.textContent = avatarEl.textContent || '?';

    // Rol — leer de currentUser si existe
    if (sRole && window.currentUser) {
      sRole.textContent = window.currentUser.rol === 'admin' ? 'Administrador' : 'Agente';
    }

    // Re-renderizar nav para mostrar/ocultar items admin
    setTimeout(renderNavItems, 100);
  }

  /* ── 11. Parchear syncData para animar el botón del sidebar ── */
  const _origSyncData = window.syncData;
  if (_origSyncData) {
    window.syncData = async function() {
      const btn = document.getElementById('sidebar-sync-btn');
      if (btn) btn.classList.add('syncing');
      try { await _origSyncData(); }
      finally { if (btn) btn.classList.remove('syncing'); }
    };
  }

  /* ── 12. Colapsar / expandir ── */
  const SIDEBAR_KEY = 'litcrm_sidebar_collapsed';

  function toggleSidebar() {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }

  function loadSidebarState() {
    if (localStorage.getItem(SIDEBAR_KEY) === '1') {
      document.body.classList.add('sidebar-collapsed');
    }
  }

  /* ── 14. Mobile helpers ── */
  function openMobileSidebar() {
    document.body.classList.add('sidebar-open');
  }
  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  /* ── 15. Parchear showView para cerrar mobile sidebar al navegar ── */
  const _origShowView = window.showView;
  if (_origShowView) {
    window.showView = function(name) {
      closeMobileSidebar();
      _origShowView.call(this, name);
      // Diferir sincronización hasta después de que showView actualice el DOM
      setTimeout(syncActiveItem, 0);
      // También re-sincronizar usuario (por si acaba de hacer login)
      syncSidebarWithUser();
    };
  }

  // Exponer para uso externo si es necesario
  window._sidebarSyncActiveItem = syncActiveItem;
  window._sidebarRenderNav = renderNavItems;
  window._sidebarSyncUser = syncSidebarWithUser;

})();