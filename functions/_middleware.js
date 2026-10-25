// Cloudflare adds its JavaScript Detection script after Pages serves the page.
// Its injector reads this fresh CSP nonce and applies it to its own scripts.
// Do not add nonce attributes to arbitrary application/user-supplied HTML.
export const STATIC_CSP = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self' data:; connect-src 'self' https://api.inventoryos.co.uk https://cloudflareinsights.com http://localhost:* http://127.0.0.1:* ws://localhost:* wss://localhost:* ws://127.0.0.1:* wss://127.0.0.1:* ws://localhost.qz.io:* wss://localhost.qz.io:*; frame-src 'self' https://api.inventoryos.co.uk blob: data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'";
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), payment=()"
};

export function secureResponse(response) {
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    const html = (headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() === 'text/html';
    let policy = STATIC_CSP;
    if (html && response.status !== 304) {
        // 128 random bits, created for this response. Never use a fixed nonce.
        const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        policy = policy.replace("script-src 'self'", "script-src 'nonce-" + nonce + "' 'self'");
        // Shared caches must not replay another response's nonce. Explicit PWA
        // offline caches continue to store the public shell and its matching CSP.
        headers.set('Cache-Control', 'private, no-store');
        headers.set('CDN-Cache-Control', 'no-store');
        headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
        headers.delete('ETag');
        headers.delete('Last-Modified');
        headers.delete('Content-Length');
    }
    // Replace the static fallback CSP, rather than adding a second conflicting policy.
    headers.set('Content-Security-Policy', policy);
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
}

export async function onRequest(context) {
    let request = context.request;
    const pathname = new URL(request.url).pathname;
    const page = pathname.endsWith('/') || !pathname.split('/').pop().includes('.') || /\.html$/i.test(pathname);
    if (page && ['GET','HEAD'].includes(request.method)) {
        // A 304 could combine a fresh header with old cached challenge HTML.
        const headers = new Headers(request.headers);
        headers.delete('If-None-Match');
        headers.delete('If-Modified-Since');
        request = new Request(request, {headers});
    }
    return secureResponse(await context.next(request));
}
