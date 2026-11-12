(function () {
    'use strict';

    const healthUrl = InventoryAPI.API_BASE + '/api-health';
    const retryDelay = 2500;
    const pollDelay = 30000;
    const timeoutDelay = 5000;
    const message = 'We’re just doing some quick maintenance. Please check back in 5 minutes.';

    function start() {
        const status = document.createElement('div');
        status.id = 'inventoryos-backend-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-atomic', 'true');
        document.body.prepend(status);

        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = '/css/backend-maintenance.css?v=1';
        document.head.append(style);

        let failures = 0;
        let checking = false;
        let timer;
        let banner;

        function show(showBanner) {
            if (showBanner && !banner) {
                banner = document.createElement('p');
                banner.textContent = message;
                status.append(banner);
            } else if (!showBanner && banner) {
                banner.remove();
                banner = undefined;
            }
        }

        async function check() {
            clearTimeout(timer);
            if (checking || document.hidden || !navigator.onLine) return;

            checking = true;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutDelay);
            let healthy = false;
            try {
                const response = await fetch(healthUrl, {
                    credentials: 'omit',
                    cache: 'no-store',
                    signal: controller.signal
                });
                healthy = response.ok && (await response.json()).database === 'Connected';
            } catch {
                // The API or its proxy can fail before returning a JSON response.
            } finally {
                clearTimeout(timeout);
                checking = false;
            }

            if (!navigator.onLine) return;
            failures = healthy ? 0 : Math.min(2, failures + 1);
            show(failures === 2);
            if (!document.hidden) {
                timer = setTimeout(check, failures === 1 ? retryDelay : pollDelay);
            }
        }

        window.addEventListener('offline', () => {
            clearTimeout(timer);
            failures = 0;
            show(false);
        });
        window.addEventListener('online', check);
        window.addEventListener('pageshow', event => {
            if (event.persisted) check();
        });
        document.addEventListener('visibilitychange', check);
        check();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
