/* sidebar.js */

(function () {
  const _sidebarObservers = [];

  (function injectCSS() {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'sidebar.css';
    document.head.appendChild(link);
  })();

  function init() {
    const app = document.getElementById('app');
    if (!app) { setTimeout(init, 50); return; }
    buildSidebar();
    wrapContentArea();
    observeNavTabs(); 
    observeUserData(); 
    syncSidebarWithUser();
    loadSidebarState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  const NAV_ITEMS = [
    { id: 'dashboard', icon: 'layout-dashboard', label: 'Dashboard', view: 'dashboard', always: true, color: 'var(--accent)' },
    { id: 'ventas', icon: 'clipboard-list', label: 'Registros', view: 'ventas', always: true, color: 'var(--blue)' },
    { id: 'clientes', icon: 'users', label: 'Clientes', view: 'clientes', always: true, color: 'var(--orange)' },
    { id: 'productos', icon: 'package', label: 'Productos', view: 'productos', tabId: 'tab-productos', color: 'var(--green)' },
    { id: 'inventario', icon: 'package-search', label: 'Inventario', view: 'inventario', always: true, color: 'var(--accent2)' },
    { id: 'almacen', icon: 'truck', label: 'Almacén', view: 'almacen', tabId: 'tab-almacen', color: 'var(--blue)' },
    { id: 'muestras', icon: 'flask-conical', label: 'Muestras', view: 'muestras', tabId: 'tab-muestras', color: 'var(--green)' },
    { id: 'guia', icon: 'book-open', label: 'Guía AC', view: 'guia', always: true, color: 'var(--orange)' },
    { id: 'config', icon: 'settings', label: 'Ajustes', view: 'config', tabId: 'tab-config', color: 'var(--text2)' },
    { id: 'usuarios', icon: 'lock-keyhole', label: 'Usuarios', view: 'usuarios', tabId: 'tab-usuarios', color: 'var(--green)' },
    { id: 'memorias', icon: 'database', label: 'Memorias', view: 'memorias', always: true, color: 'var(--accent2)' },
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

    // Botón de notificación de stock + panel desplegable
    const stockWrap = document.createElement('div');
    stockWrap.id = 'stock-notif-wrap';
    stockWrap.style.cssText = 'position:relative;display:flex;';

    const stockBtn = document.createElement('button');
    stockBtn.id = 'stock-notif-btn';
    stockBtn.title = 'Stock moderado o bajo';
    stockBtn.style.display = 'none';
    stockBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg><span id="stock-notif-count" class="stock-notif-count"></span>';
    stockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('stock-notif-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      }
    });
    stockWrap.appendChild(stockBtn);

    const panel = document.createElement('div');
    panel.id = 'stock-notif-panel';
    panel.className = 'stock-notif-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="stock-notif-header">
        <span class="stock-notif-title">Alertas de Stock</span>
        <button class="stock-notif-header-close" data-action="close-panel" title="Cerrar">✕</button>
      </div>
      <div id="stock-notif-list" class="stock-notif-list"></div>
      <div class="stock-notif-footer">
        <button data-action="dismiss-all" title="Descartar todas">Descartar todo</button>
      </div>
    `;
    stockWrap.appendChild(panel);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.parentNode.insertBefore(stockWrap, themeToggle);
    }

    // Delegación de eventos en el panel
    panel.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action], .stock-notif-dismiss');
      if (!target) return;
      e.stopPropagation();
      const action = target.dataset.action;
      if (action === 'close-panel') {
        panel.style.display = 'none';
      } else if (action === 'dismiss-all') {
        if (window._dismissAllStockAlerts) window._dismissAllStockAlerts();
      }
      const pid = target.dataset.pid;
      if (pid != null) {
        if (window._dismissStockAlerts) window._dismissStockAlerts(Number(pid));
      }
    });

    // Cerrar panel al hacer clic fuera
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('stock-notif-panel');
      if (!panel || panel.style.display === 'none') return;
      if (!e.target.closest('#stock-notif-wrap')) {
        panel.style.display = 'none';
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth <= 768) {
        document.body.classList.remove('sidebar-collapsed');
      } else {
        document.body.classList.remove('sidebar-open');
        if (localStorage.getItem(SIDEBAR_KEY) === '1') {
          document.body.classList.add('sidebar-collapsed');
        }
      }
    });
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
      el.style.setProperty('--nav-ico', item.color || 'var(--text3)');
      el.innerHTML = `
        <span class="sidebar-nav-icon">${_ic(item.icon, 16)}</span>
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

    // Llamar showView directamente con el target del tab original
    const origTab = document.querySelector(`.nav-tab[data-view="${viewName}"]`);
    if (origTab) {
      if (window.showView) window.showView(viewName, { target: origTab });
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
    _sidebarObservers.push(mo);

    // También observar las views directamente
    const main = document.querySelector('.main');
    if (main) {
      const mo2 = new MutationObserver(() => {
        syncActiveItem();
      });
      mo2.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
      _sidebarObservers.push(mo2);
    }

    // Observar cambios de display en los tabs para admin-only items
    const allTabs = document.querySelectorAll('.nav-tab[id]');
    allTabs.forEach(tab => {
      const mo3 = new MutationObserver(() => {
        renderNavItems(); // re-renderizar cuando cambien visibilidad
      });
      mo3.observe(tab, { attributes: true, attributeFilter: ['style'] });
      _sidebarObservers.push(mo3);
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
    _sidebarObservers.push(mo);
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
    // En mobile, toggle abre/cierra como overlay en vez de colapsar
    if (window.innerWidth <= 768) {
      if (document.body.classList.contains('sidebar-open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
      return;
    }
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }

  function loadSidebarState() {
    // Solo aplicar estado colapsado en desktop
    if (window.innerWidth > 768 && localStorage.getItem(SIDEBAR_KEY) === '1') {
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
    window.showView = function(name, evt) {
      closeMobileSidebar();
      _origShowView.call(this, name, evt);
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
  window._sidebarDisconnectObservers = function() {
    _sidebarObservers.forEach(mo => mo.disconnect());
    _sidebarObservers.length = 0;
  };

})();