'use strict';
// Exact public GTIN lookups only. No account details, stock, prices, photos or
// camera frames are sent to the public product databases; the browser decodes locally.
const { fail } = require('./retail');
function gtin(value) {
  const code = String(value ?? '').trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) throw fail('Enter an EAN-8, EAN-13, UPC-A or GTIN-14 barcode');
  let sum = 0;
  for (let i = code.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(code[i]) * weight;
  if ((10 - sum % 10) % 10 !== Number(code.at(-1))) throw fail('Barcode check digit is invalid. Try scanning again or check the printed digits');
  return code;
}
const SOURCES = {
 openfoodfacts: { host: 'world.openfoodfacts.org', label: 'Open Food Facts', type: 'food' },
 openbeautyfacts: { host: 'world.openbeautyfacts.org', label: 'Open Beauty Facts', type: 'beauty' },
 openproductsfacts: { host: 'world.openproductsfacts.org', label: 'Open Products Facts', type: 'product' },
 openpetfoodfacts: { host: 'world.openpetfoodfacts.org', label: 'Open Pet Food Facts', type: 'petfood' }
};
const clean = (v, max = 160) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
function createLookup({ fetcher = global.fetch, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), people = new Map();
  let calls = [];
  function throttle(actor) {
    const time = now(), cutoff = time - 60000;
    calls = calls.filter(t => t > cutoff);
    const person = (people.get(actor) || []).filter(t => t > cutoff);
    if (calls.length >= 14 || person.length >= 10) {
      const oldest = calls.length >= 14 ? calls[0] : person[0];
      throw Object.assign(fail('Barcode lookup is busy. Please wait a minute and try again; you can still enter a product manually', 429), { retry_after_seconds: Math.max(1, Math.ceil((oldest + 60000 - time) / 1000)) });
    }
    if (people.size > 1000) for (const [key, times] of people) if (times.at(-1) <= cutoff) people.delete(key);
    if (people.size > 1000 && !people.has(actor)) throw fail('Barcode lookup is busy. Please try again shortly', 429);
    person.push(time); people.set(actor, person); calls.push(time);
  }
  function save(code, result) {
    if (cache.size >= 1000) cache.delete(cache.keys().next().value);
    cache.set(code, { result, until: now() + (result.found ? 86400000 : 300000) });
    return result;
  }
  async function lookup(raw, actor) {
    const code = gtin(raw), old = cache.get(code);
    if (old?.until > now()) return old.result;
    if (pending.has(code)) return pending.get(code);
    throttle(actor);
    const operation = (async () => {
      const urlFor = host => 'https://' + host + '/api/v3/product/' + code + '?product_type=all&fields=code,product_name,product_name_en,brands,quantity,product_type';
      let url = urlFor(SOURCES.openfoodfacts.host), source = 'openfoodfacts';
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        let response; const visited = new Set();
        for (let redirects = 0; ; redirects++) {
          if (visited.has(url)) throw fail('Product lookup redirect loop was rejected', 502);
          visited.add(url);
          response = await fetcher(url, { headers: { 'User-Agent': 'InventoryOS-Retail/4.0 (hello@inventoryos.co.uk)', Accept: 'application/json' }, signal: controller.signal, redirect: 'manual' });
          if (![301,302,303,307,308].includes(response.status)) break;
          if (redirects >= 2 || !response.headers.get('location')) throw fail('Product lookup is temporarily unavailable', 502);
          let next; try { next = new URL(response.headers.get('location'), url); } catch { throw fail('Product lookup redirect was rejected', 502); }
          const known = Object.entries(SOURCES).find(([,meta]) => meta.host === next.hostname);
          const path = next.pathname.match(/^\/api\/v[23]\/product\/(\d+)(?:\.json)?\/?$/);
          if (!known || next.protocol !== 'https:' || next.port && next.port !== '443' || next.username || next.password || !path || path[1].replace(/^0+/, '') !== code.replace(/^0+/, '')) throw fail('Product lookup redirect was rejected', 502);
          source = known[0]; url = urlFor(known[1].host);
          await response.body?.cancel();
        }
        if (response.status === 404) return save(code, { success: true, found: false, barcode: code });
        if (response.status === 429) throw fail('Product lookup is busy. Wait a minute or enter this product manually', 429);
        if (!response.ok) throw fail('Product lookup is temporarily unavailable. Try again or enter the name manually', 502);
        if (Number(response.headers.get('content-length')) > 262144) throw fail('Product lookup returned an oversized result', 502);
        const reader = response.body.getReader(); let size = 0; const chunks = [];
        try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 262144) { await reader.cancel(); throw fail('Product lookup returned an oversized result', 502); } chunks.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('Product lookup returned an unreadable result. Enter the product manually', 502); }
        const p = body.product;
        if ((!p || typeof p !== 'object') && (body.status === 0 || body.status === 'failure' || body.result?.id === 'product_not_found')) return save(code, { success: true, found: false, barcode: code });
        if (!p || typeof p !== 'object') throw fail('Product lookup returned no usable details. Enter the name manually', 502);
        const returned = String(p.code || body.code || code);
        if (!/^\d+$/.test(returned) || returned.replace(/^0+/, '') !== code.replace(/^0+/, '')) throw fail('Product lookup returned a different barcode. Please enter this product manually', 502);
        const name = clean(p.product_name_en || p.product_name);
        if (!name) return save(code, { success: true, found: false, barcode: code });
        const type = p.product_type || body.product_type;
        const reported = Object.entries(SOURCES).find(([,meta]) => meta.type === type);
        if (reported) source = reported[0];
        const meta = SOURCES[source];
        return save(code, { success: true, found: true, product: { name, brand: clean(p.brands), quantity: clean(p.quantity, 80), barcode: code, source, source_name: meta.label, product_type: meta.type, source_url: 'https://' + meta.host + '/product/' + code }, attribution: meta.label + ' — Open Database Licence (ODbL)' });
      } catch (e) {
        if (e.statusCode) throw e;
        throw fail('Product lookup could not connect. Try again or enter this product manually', 502);
      } finally { clearTimeout(timeout); }
    })();
    pending.set(code, operation);
    try { return await operation; } finally { pending.delete(code); }
  }
  return { lookup };
}
module.exports = { createLookup, gtin, SOURCES };
