(() => {
 'use strict';

 const bundle = document.currentScript;
 const publicSite = bundle?.dataset.localeScope === 'public';
 const sample = document.documentElement.hasAttribute('data-practice-page');
 const revision = new URL(bundle.src).searchParams.get('v') || '1';
 const assetURL = name => new URL(name, bundle.src).href;
 const storageKey = 'inventoryos_language';
 const cookieKey = 'inventoryos_locale';
 const locales = {
  en: {name: 'English', tag: 'en-GB', button: 'Language', waiting: 'Loading language…', error: 'Could not load that language. Try again.'},
  es: {name: 'Español', tag: 'es', button: 'Idioma', waiting: 'Cargando idioma…', error: 'No se ha podido cargar el idioma. Inténtalo de nuevo.'},
  fr: {name: 'Français', tag: 'fr', button: 'Langue', waiting: 'Chargement de la langue…', error: 'Impossible de charger cette langue. Réessayez.'},
  de: {name: 'Deutsch', tag: 'de', button: 'Sprache', waiting: 'Sprache wird geladen…', error: 'Diese Sprache konnte nicht geladen werden. Versuche es erneut.'},
  it: {name: 'Italiano', tag: 'it', button: 'Lingua', waiting: 'Caricamento della lingua…', error: 'Impossibile caricare la lingua. Riprova.'},
  pl: {name: 'Polski', tag: 'pl', button: 'Język', waiting: 'Wczytywanie języka…', error: 'Nie udało się wczytać języka. Spróbuj ponownie.'},
  pt: {name: 'Português', tag: 'pt-PT', button: 'Idioma', waiting: 'A carregar o idioma…', error: 'Não foi possível carregar o idioma. Tenta novamente.'},
  nl: {name: 'Nederlands', tag: 'nl', button: 'Taal', waiting: 'Taal laden…', error: 'Deze taal kon niet worden geladen. Probeer het opnieuw.'}
 };
 const attributes = ['title', 'aria-label', 'aria-description', 'placeholder', 'alt'];
 const skip = 'script,style,noscript,svg,pre,code,kbd,samp,output,option:not([value]),[contenteditable],[translate="no"],[data-i18n-ignore]';
 // Product, customer and workspace values remain as entered. The public practice
 // workspace has example data and marks the editable example names separately.
 const workspaceData = 'tbody,#workspace-inventory option:not([value="all"]),.avatar,.business-picker b,.person strong,.practice-match strong,.practice-product-row strong,.practice-location-card strong,[data-customer-name],[data-product-name]';
 const excluded = publicSite ? skip : skip + ',' + workspaceData;
 const practiceTemplates = [
  [/^New workspace layout · Step (\d+) of (\d+)$/, 'New workspace layout · Step %1 of %2'],
  [/^(\d+) units$/, '%1 units'],
  [/^(\d+) units in holding$/, '%1 units in holding'],
  [/^(\d+) units to replenish$/, '%1 units to replenish']
 ];
 const snapshots = new WeakMap();
 const caches = new Map();
 const pending = new Set();
 const observed = new WeakSet();
 const shadowRoots = new Set();
 const initialLanguage = document.documentElement.lang || 'en-GB';
 const themeControls = '[data-marketing-appearance-toggle],#topbar [data-action="theme"],.practice-header-actions [data-action="appearance"]';
 const onInventoryOS = /^(?:[a-z0-9-]+\.)*inventoryos\.co\.uk$/i.test(location.hostname);
 let language = 'en';
 let dictionary = null;
 let request = 0;
 let pendingLanguage = null;
 let repaint;
 let activePicker;
 let pickerId = 0;
 let workspaceFrame = false;
 try { workspaceFrame = window.parent !== window && window.parent.location.origin === location.origin && !publicSite && !sample; } catch {}

 const style = document.createElement('link');
 style.rel = 'stylesheet';
 style.href = assetURL('language.css?v=' + encodeURIComponent(revision));
 document.head.append(style);

 function savedLanguage() {
  try {
   const localeCookie = document.cookie.split(';').map(entry => entry.trim()).find(entry => entry.startsWith(cookieKey + '='));
   const cookie = localeCookie?.slice(cookieKey.length + 1);
   if (Object.hasOwn(locales, cookie)) return cookie;
  } catch {}
  try {
   const local = localStorage.getItem(storageKey);
   return Object.hasOwn(locales, local) ? local : 'en';
  } catch {
   return 'en';
  }
 }

 function saveLanguage(next) {
  if (onInventoryOS) document.cookie = cookieKey + '=' + next + '; Domain=inventoryos.co.uk; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
  try { localStorage.setItem(storageKey, next); } catch {}
 }

 function plain(value) {
  return value?.replace(/[\s\uFEFF]+/g, ' ').trim();
 }

 function translateText(text) {
  if (!dictionary) return null;
  const direct = dictionary.get(text);
  if (direct || !sample) return direct;
  for (const [pattern, key] of practiceTemplates) {
   const matches = text.match(pattern);
   const template = matches && dictionary.get(key);
   if (template) return template.replace(/%([1-9])/g, (_, index) => matches[Number(index)]);
  }
  return null;
 }

 function translated(element, field, current, write) {
  if (!current) return;
  let fields = snapshots.get(element);
  const previous = fields?.get(field);
  const source = previous?.output === current ? previous.source : current;
  const guess = translateText(plain(source));
  const output = guess ? source.replace(/\S(?:[\s\S]*\S)?/, () => guess) : source;
  if (output === current && !previous) return;
  if (!fields) {
   fields = new Map();
   snapshots.set(element, fields);
  }
  fields.set(field, {source, output});
  if (output !== current) write(output);
 }

 function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
   if (!node.parentElement?.closest(excluded + ',textarea')) translated(node, 'text', node.data, text => { node.data = text; });
   return;
  }
  const root = node.nodeType === Node.ELEMENT_NODE ? node : null;
  if (root?.closest(excluded) || (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host?.closest(excluded))) return;
  if (root) {
   for (const attribute of attributes) {
    translated(root, attribute, root.getAttribute(attribute), value => root.setAttribute(attribute, value));
   }
  }
  if (root?.tagName === 'TEXTAREA') return;
  for (const child of node.childNodes) {
   if (child.nodeType === Node.ELEMENT_NODE || child.nodeType === Node.TEXT_NODE) translateNode(child);
  }
 }

 function observe(root) {
  if (observed.has(root)) return;
  observed.add(root);
  observer.observe(root, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes});
 }

 function refresh(full = false) {
  const body = document.body;
  if (!body) return;
  if (full) {
   translateNode(body);
   translated(document.querySelector('title') || body, 'documentTitle', document.title, value => { document.title = value; });
  } else {
   for (const node of pending) {
    if (node.isConnected) translateNode(node);
   }
  }
  pending.clear();

  for (const player of body.querySelectorAll('inventoryos-demo')) {
   const root = player.shadowRoot;
   if (root && !shadowRoots.has(root)) {
    shadowRoots.add(root);
    observe(root);
    if (dictionary) translateNode(root);
   }
  }
  for (const root of shadowRoots) {
   if (!root.host.isConnected) shadowRoots.delete(root);
   else if (full) translateNode(root);
  }
  mountPickers(body);
 }

 const observer = new MutationObserver(changes => {
  for (const change of changes) {
   if (change.type !== 'childList') pending.add(change.target);
   else for (const node of change.addedNodes) pending.add(node);
  }
  if (!repaint) repaint = requestAnimationFrame(() => {
   repaint = 0;
   if (dictionary) refresh();
   else {
    pending.clear();
    mountPickers(document.body);
   }
  });
 });

 async function getCatalogue(next) {
  if (!caches.has(next)) {
   const download = fetch(assetURL('languages/' + next + '.json?v=' + encodeURIComponent(revision)), {credentials: 'same-origin'})
    .then(response => {
     if (!response.ok) throw new Error('Language unavailable');
     return response.json();
    })
    .then(data => new Map(Object.entries(data)))
    .catch(error => {
     caches.delete(next);
     throw error;
    });
   caches.set(next, download);
  }
  return caches.get(next);
 }

 async function useLanguage(next, persist = false) {
  if (!Object.hasOwn(locales, next)) return;
  const chosen = ++request;
  pendingLanguage = {code: next, persist};
  updatePickers(next === 'en' ? '' : locales[language].waiting);
  let nextDictionary;
  try {
   nextDictionary = next === 'en' ? null : await getCatalogue(next);
  } catch {
   if (chosen === request) {
    pendingLanguage = null;
    updatePickers(locales[language].error);
   }
   return;
  }
  if (chosen !== request) return;
  pendingLanguage = null;
  dictionary = nextDictionary;
  language = next;
  document.documentElement.lang = next === 'en' ? initialLanguage : locales[next].tag;
  if (persist) saveLanguage(next);
  updatePickers('');
  refresh(true);
 }

 function flag(code) {
  const icon = document.createElement('span');
  icon.className = 'ios-flag ios-flag-' + code;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
 }

 function pickerState(root, message) {
  const toggle = root.querySelector('.ios-language-toggle');
  const label = locales[language].button + ' · ' + locales[language].name;
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  if (toggle.firstChild?.className !== 'ios-flag ios-flag-' + language) toggle.replaceChildren(flag(language));
  for (const item of root.querySelectorAll('[data-language]')) {
   item.setAttribute('aria-pressed', String(item.dataset.language === language));
  }
  const status = root.querySelector('.ios-language-status');
  if (message !== undefined && status.textContent !== message) status.textContent = message;
 }

 function updatePickers(message) {
  for (const root of document.querySelectorAll('.ios-language')) pickerState(root, message);
 }

 function reposition(picker) {
  if (!picker?.root.isConnected) return;
  const rect = picker.toggle.getBoundingClientRect();
  const width = Math.min(214, window.innerWidth - 16);
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const gap = 7;
  const roomBelow = Math.max(0, window.innerHeight - rect.bottom - gap - 8);
  const roomAbove = Math.max(0, rect.top - gap - 8);
  const openBelow = picker.menu.scrollHeight + 2 <= roomBelow || roomBelow >= roomAbove;
  picker.menu.style.left = Math.max(8, Math.min(rect.right - width, maxLeft)) + 'px';
  picker.menu.style.maxHeight = (openBelow ? roomBelow : roomAbove) + 'px';
  picker.menu.style.top = (openBelow ? rect.bottom + gap : rect.top - picker.menu.offsetHeight - gap) + 'px';
 }

 function closePicker(picker, focus = false) {
  if (activePicker === picker) activePicker = null;
  picker.toggle.setAttribute('aria-expanded', 'false');
  if (picker.native && picker.menu.matches(':popover-open')) picker.menu.hidePopover();
  if (!picker.native) picker.menu.hidden = true;
  if (focus) picker.toggle.focus();
 }

 function makePicker() {
  const root = document.createElement('span');
  root.className = 'ios-language';
  root.setAttribute('data-i18n-ignore', '');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ios-language-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('span');
  menu.className = 'ios-language-options';
  menu.id = 'inventoryos-language-' + (++pickerId);
  toggle.setAttribute('aria-controls', menu.id);
  const native = typeof menu.showPopover === 'function';
  if (native) menu.setAttribute('popover', 'manual');
  else menu.hidden = true;
  const picker = {root, toggle, menu, native};
  for (const [code, locale] of Object.entries(locales)) {
   const option = document.createElement('button');
   option.type = 'button';
   option.dataset.language = code;
   option.lang = locale.tag;
   option.append(flag(code), document.createTextNode(locale.name));
   option.addEventListener('click', async () => {
    await useLanguage(code, true);
    if (code === language) closePicker(picker, true);
   });
   menu.append(option);
  }
  const status = document.createElement('span');
  status.className = 'ios-language-status';
  status.setAttribute('role', 'status');
  menu.append(status);
  root.append(toggle, menu);
  toggle.addEventListener('click', event => {
   if (activePicker === picker) return closePicker(picker, true);
   if (activePicker) closePicker(activePicker);
   activePicker = picker;
   toggle.setAttribute('aria-expanded', 'true');
   if (native) menu.showPopover();
   else menu.hidden = false;
   reposition(picker);
   if (event.detail === 0) menu.querySelector('[aria-pressed="true"]')?.focus();
  });
  pickerState(root, '');
  return root;
 }

 function mountPickers(body) {
  if (workspaceFrame) return;
  const toggles = [...body.querySelectorAll(themeControls)];
  if (!toggles.length && !publicSite && !sample) {
   toggles.push(...body.querySelectorAll('.inventory-topbar-right > .topbar-settings'));
  }
  for (const target of toggles) {
   if (!target.nextElementSibling?.classList.contains('ios-language')) target.after(makePicker());
  }
  for (const mount of body.querySelectorAll('[data-language-picker]')) {
   if (!mount.querySelector('.ios-language')) mount.append(makePicker());
  }
 }

 document.addEventListener('click', event => {
  if (activePicker && !activePicker.root.contains(event.target)) closePicker(activePicker);
 }, true);
 document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activePicker) {
   event.preventDefault();
   event.stopPropagation();
   closePicker(activePicker, true);
  }
 }, true);
 window.addEventListener('resize', () => reposition(activePicker));
 window.addEventListener('scroll', () => reposition(activePicker), true);
 // Storage events cover tabs on this origin. When a tab on another
 // InventoryOS subdomain becomes active, read the shared preference again.
 function syncSavedLanguage() {
  if (pendingLanguage?.persist) return;
  const saved = savedLanguage();
  if (saved !== (pendingLanguage?.code ?? language)) void useLanguage(saved);
 }
 window.addEventListener('storage', event => {
  if (event.key === storageKey) syncSavedLanguage();
 });
 window.addEventListener('pageshow', syncSavedLanguage);
 window.addEventListener('focus', syncSavedLanguage);
 document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncSavedLanguage();
 });

 function start() {
  observe(document.body);
  refresh();
  void useLanguage(savedLanguage());
 }
 // The public homepage hydrates server-rendered React markup. Wait until its
 // deferred app scripts have run before adding a sibling or changing text.
 if (publicSite && document.readyState !== 'complete') window.addEventListener('load', start, {once: true});
 else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
 else start();
})();
