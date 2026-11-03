/* Shared presentation adapter. It moves existing navigation/control nodes;
   stock, authentication, subscriptions, printing and APIs remain in their
   existing modules. Never load the design-preview models in production. */
(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const path = location.pathname;
  const area = path.includes('/manufacturing/') || /manufacturing\.html$/.test(path) ? 'manufacturing'
    : path.includes('/retail/') ? 'retail' : path.includes('getting-started') ? 'practice' : 'reseller';
  let queued = false;
  const word = { reseller: 'Reseller', manufacturing: 'Manufacturing', retail: 'Retail', practice: 'Guided practice' };

  function button(label, action) {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label;
    node.dataset.designAction = action;
    return node;
  }
  function link(label, href) {
    const node = document.createElement('a'); node.href = href; node.textContent = label; return node;
  }
  function mode() {
    return document.documentElement.dataset.appearance === 'light' ? 'light' : 'dark';
  }
  function refreshThemeLabels() {
    document.querySelectorAll('[data-design-action="theme"]').forEach(node => {
      const label = mode() === 'dark' ? '☀ Light' : '☾ Dark';
      const accessible = mode() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      if (node.textContent !== label) node.textContent = label;
      if (node.getAttribute('aria-label') !== accessible) node.setAttribute('aria-label', accessible);
    });
  }
  function utilityBar(host, before) {
    if (!host || host.querySelector(':scope > .design-utilitybar')) return;
    const bar = document.createElement('div'); bar.className = 'design-utilitybar';
    const crumb = document.createElement('div'); crumb.className = 'design-breadcrumb';
    const context = document.createElement('span'); context.textContent = 'Workspace /';
    const name = document.createElement('b'); name.textContent = 'InventoryOS ' + word[area];
    crumb.append(context, name);
    const actions = document.createElement('div'); actions.className = 'design-utilities';
    const appearance = button('', 'theme'); appearance.dataset.designTheme = '';
    actions.append(appearance);
    if (area === 'practice') actions.append(link('Email help', 'mailto:hello@inventoryos.co.uk'));
    else if (area === 'manufacturing') actions.append(link('Start here', 'manufacturing/index.html#setup'));
    else if (area === 'retail') actions.append(link('Start here', path.includes('/dashboard/') ? 'retail/dashboard/index.html#setup' : 'retail/index.html#setup'));
    else actions.append(link('Setup guide ↗', 'settings.html#guide'));
    bar.append(crumb, actions); host.insertBefore(bar, before || host.firstChild);
    refreshThemeLabels();
  }
  function dashboardNavigation() {
    const host = $('.dashboard-sidebar .sidebar-scroll');
    if (!host || host.dataset.designNavigation || !window.InventoryOSAppShell?.navigation) return;
    const extensions = [...host.querySelectorAll('[data-retail-nav],[data-manufacturing-nav]')];
    host.innerHTML = window.InventoryOSAppShell.navigation('dashboard');
    host.querySelectorAll('.ios-shell-nav').forEach(node => node.classList.add('sidebar-nav'));
    const workspace = host.querySelector('nav'); workspace?.setAttribute('aria-label', 'Main navigation');
    host.querySelectorAll('.ios-shell-nav-link').forEach(node => node.classList.add('sidebar-link'));
    host.querySelectorAll('.ios-shell-nav-icon').forEach(node => node.classList.add('sidebar-icon'));
    const areas = host.querySelector('[data-design-area-links]');
    extensions.forEach(node => areas?.append(node));
    host.dataset.designNavigation = '1';
  }
  function bindDrawer() {
    const sidebar = $('#iosShellSidebar') || $('#dashboardSidebar') || $('#retailSidebar') || $('#mfgSidebar');
    const toggle = $('#iosShellMenuButton') || $('#mobileMenuButton') || $('#retailMenu') || $('#mfgMenu');
    if (!sidebar || !toggle || sidebar.dataset.designDrawer) return;
    sidebar.dataset.designDrawer = '1';
    const breakpoint = sidebar.id === 'iosShellSidebar' || sidebar.id === 'dashboardSidebar' ? 900 : 760;
    const shade = button('', 'close-menu'); shade.className = 'design-backdrop';
    shade.setAttribute('aria-label', 'Close navigation'); shade.hidden = true;
    document.body.append(shade);
    const isOpen = () => matchMedia('(max-width:' + breakpoint + 'px)').matches &&
      (sidebar.classList.contains('open') || document.body.classList.contains('sidebar-open') || document.body.classList.contains('ios-shell-menu-open'));
    const sync = () => {
      const mobile = matchMedia('(max-width:' + breakpoint + 'px)').matches, open = isOpen();
      shade.hidden = !open; sidebar.inert = mobile && !open;
      if (mobile) sidebar.setAttribute('aria-hidden', String(!open)); else sidebar.removeAttribute('aria-hidden');
      toggle.setAttribute('aria-expanded', String(open));
    };
    const close = () => { if (isOpen()) { toggle.click(); sync(); toggle.focus({ preventScroll: true }); } };
    shade.addEventListener('click', close);
    // A different page starts with its own closed drawer. Do not hide or
    // inert the source link while the browser is activating that navigation.
    sidebar.addEventListener('click', event => {
      const anchor=event.target.closest('a[href]');
      if(!anchor)return;
      const target=new URL(anchor.href,location.href);
      if(target.pathname===location.pathname&&target.search===location.search&&target.hash===location.hash){event.preventDefault();settingsSection();close();}
    });
    window.addEventListener('hashchange',()=>{if(isOpen())close();});
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) close();
    });
    new MutationObserver(sync).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', sync); sync();
  }
  function settingsSection() {
    if (!/settings\.html$/.test(path)) return;
    const target = { guide: 'guidePanel', help: 'helpPanel', stack: 'stackPanel', settings: 'settingsPanel', manufacturing: 'settingsPanel' }[location.hash.slice(1)];
    if (target && !$('[data-settings-tab="' + target + '"]')?.classList.contains('active')) {
      $('[data-settings-tab="' + target + '"]')?.click();
    }
  }
  function workflowStrip() {
    if (area !== 'reseller' || $('.design-flow-strip')) return;
    const steps = {
      'add.html': ['Describe the item', 'Choose quantity & location', 'Save & prepare labels'],
      'remove.html': ['Choose items & quantities', 'Consolidate the pick', 'Confirm stock removal'],
      'boxes.html': ['Create a storage location', 'Give it a name & notes', 'Start adding stock'],
      'dispatch-centre.html': ['Import shipping labels', 'Review & match products', 'Pack & print']
    }[path.split('/').pop()];
    const host = $('.ios-shell-content');
    if (!steps || !host) return;
    const strip = document.createElement('div'); strip.className = 'design-flow-strip';
    strip.setAttribute('aria-label', 'Workflow');
    steps.forEach((text, i) => { const step = document.createElement('span'), n = document.createElement('b'); n.textContent = '0' + (i + 1); step.append(n, document.createTextNode(text)); strip.append(step); });
    strip.append(link('Need a hand? Open the guide ↗', 'settings.html#guide'));
    host.prepend(strip);
  }
  function enhance() {
    queued = false; if (!document.body) return;
    if (document.body.dataset.workspaceDesign !== area) document.body.dataset.workspaceDesign = area;
    dashboardNavigation();
    const headerAvatar = $('#iosShellHeaderAvatar'), shellHeader = $('.ios-shell-header');
    if (headerAvatar && shellHeader && headerAvatar.parentElement !== shellHeader) shellHeader.append(headerAvatar);
    if (area === 'practice') utilityBar($('.practice-shell'), $('.practice-header'));
    else if (area === 'retail' || area === 'manufacturing') utilityBar($('.retail-main'), $('.retail-header'));
    else utilityBar($('.dashboard-frame') || $('.ios-shell-frame'), $('.dashboard-top') || $('.ios-shell-header'));
    workflowStrip(); bindDrawer(); refreshThemeLabels();
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(enhance); } }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-design-action="theme"]')) return;
    const next = mode() === 'dark' ? 'light' : 'dark';
    const theme = typeof InventoryTheme !== 'undefined' ? InventoryTheme : window.InventoryTheme;
    if (theme?.setAppearance) theme.setAppearance(next);
    else {
      document.documentElement.dataset.appearance = next;
      document.documentElement.style.colorScheme = next;
      try { localStorage.setItem('inventoryos_appearance', next); } catch { /* Browser-local preference only. */ }
    }
    refreshThemeLabels();
  });
  // The live headers are stable. View changes must not move layout nodes or
  // re-select a Settings tab after the user has chosen another section.
  for (const event of ['inventoryos-shell-ready', 'inventoryos-practice-rendered']) window.addEventListener(event, schedule);
  window.addEventListener('inventoryos-appearance-changed', refreshThemeLabels);
  window.addEventListener('hashchange', settingsSection);
  function start(){enhance();settingsSection();}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.InventoryWorkspaceDesign = { enhance, schedule };
})();
