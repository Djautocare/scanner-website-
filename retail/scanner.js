(function () {
  'use strict';
  let active = null, library;
  function valid(code) {
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(String(code))) return false;
    let sum = 0;
    for (let i = code.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(code[i]) * w;
    return (10 - sum % 10) % 10 === Number(code.at(-1));
  }
  function stop() {
    if (!active) return;
    const a = active; active = null; a.cancelled = true;
    clearTimeout(a.timer); clearTimeout(a.expiry);
    a.controls?.stop();
    a.stream?.getTracks().forEach(t => t.stop());
    if (a.video) { a.video.pause(); a.video.srcObject = null; }
    if (a.element?.isConnected) a.element.hidden = true;
  }
  function fallback() {
    if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
    if (!library) library = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'retail/vendor/zxing-browser-0.1.5.min.js';
      script.onload = () => window.ZXingBrowser ? resolve(window.ZXingBrowser) : reject(new Error('Scanner could not be loaded'));
      script.onerror = () => { script.remove(); library = null; reject(new Error('Scanner could not be loaded. Type the barcode instead.')); };
      document.head.append(script);
    });
    return library;
  }
  async function start(element, onCode) {
    stop();
    const video = element.querySelector('video'), message = element.querySelector('[data-camera-status]');
    const a = { element, video, cancelled: false, last: '', hits: 0, lastAt: 0 }; active = a;
    const status = text => { if (!a.cancelled && message?.isConnected) message.textContent = text; };
    element.hidden = false; status('Opening the rear camera…');
    element.querySelector('[data-stop-camera]').onclick = stop;
    function found(raw) {
      const code = String(raw || '').trim(); if (a.cancelled || !valid(code)) return;
      const time = Date.now();
      a.hits = a.last === code && time - a.lastAt < 2500 ? a.hits + 1 : 1;
      a.last = code; a.lastAt = time;
      if (a.hits < 2) return;
      stop(); onCode(code);
    }
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS and a supported browser. You can type the barcode instead.');
      a.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (a.cancelled) { a.stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = a.stream; await video.play();
      if (a.cancelled) return;
      status('Hold the full barcode inside the camera view. Keep it steady in good light.');
      let detector = null;
      if (window.BarcodeDetector) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          const selected = ['ean_13', 'ean_8', 'upc_a'].filter(f => formats.includes(f));
          if (selected.includes('ean_13')) detector = new BarcodeDetector({ formats: selected });
        } catch { /* Use the local ZXing decoder on browsers without support. */ }
      }
      if (a.cancelled) return;
      if (detector) {
        const scan = async () => {
          if (a.cancelled) return;
          try { if (video.readyState >= 2) for (const result of await detector.detect(video)) found(result.rawValue); } catch { status('Move back slightly and keep the barcode in focus.'); }
          if (!a.cancelled) a.timer = setTimeout(scan, 220);
        };
        scan();
      } else {
        const ZX = await fallback(); if (a.cancelled) return;
        // DecodeHintType.TRY_HARDER is 3 in the pinned ZXing core. This scans
        // more image rows and permits the core's rotated-image retry.
        const reader = new ZX.BrowserMultiFormatOneDReader(new Map([[3, true]]), { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 250 });
        const controls = await reader.decodeFromStream(a.stream, video, result => { if (result) found(result.getText()); });
        a.controls = controls; if (a.cancelled) controls.stop();
      }
      if (!a.cancelled) a.expiry = setTimeout(() => { if (active === a) { stop(); onCode(null, 'Camera paused after one minute. Tap Scan EAN to try again or type the barcode.'); } }, 60000);
    } catch (e) {
      if (a.cancelled) return;
      const error = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or type the barcode.' : e.name === 'NotFoundError' ? 'No camera was found. Type the barcode instead.' : e.message || 'Camera could not start. Type the barcode instead.';
      stop(); onCode(null, error);
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  window.InventoryRetailScanner = { start, stop, valid };
})();
