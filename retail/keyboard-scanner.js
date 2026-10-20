(function () {
  'use strict';
  // USB/Bluetooth keyboard-wedge scanners normally finish with Enter or Tab.
  // Leave ordinary typing alone, and only reroute a rapid burst at its terminator.
  window.InventoryRetailKeyboard = {
    attach({ context, scan }) {
      let burst = null;
      function restore(b) {
        const el = b.field?.isConnected ? b.field : (b.id ? document.getElementById(b.id) : null);
        if (el && 'value' in el) {
          el.value = b.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          if (b.start != null && el.setSelectionRange) try { el.setSelectionRange(b.start, b.end); } catch {}
        }
      }
      document.addEventListener('keydown', e => {
        const mode = context();
        if (!mode || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) { burst = null; return; }
        const field = e.target, barcodeField = mode === 'product' && field.name === 'barcode';
        if (e.key === 'Enter' || e.key === 'Tab') {
          const b = burst; burst = null;
          const rapid = b && b.mode === mode && b.code.length >= 6 && performance.now() - b.last < 150 && b.fast && (b.last - b.first) / Math.max(1, b.code.length - 1) < 40;
          const direct = (barcodeField && e.key === 'Enter') || (mode === 'checkout' && field.id === 'retailSearch' && e.key === 'Enter');
          if (!rapid && !direct) return;
          e.preventDefault(); e.stopImmediatePropagation();
          const code = rapid ? b.code : field.value;
          if (rapid && !barcodeField) restore(b);
          scan(String(code || '').trim(), mode); return;
        }
        if (e.key.length !== 1 || e.key === ' ') { if (e.key !== 'Shift') burst = null; return; }
        const now = performance.now();
        if (!burst || now - burst.last > 80 || burst.mode !== mode) {
          burst = { code: '', field, id: field.id, value: field.value, start: field.selectionStart, end: field.selectionEnd, mode, first: now, last: now, fast: true };
        }
        burst.code += e.key; burst.fast = burst.fast && now - burst.last <= 80; burst.last = now;
        if (burst.code.length > 100) burst = null;
      }, true);
    }
  };
})();
