'use strict';
const express = require('express');
const auth = require('../middleware/authMiddleware');
const { workspaceMiddleware } = require('../middleware/workspaceMiddleware');
const R = require('../utils/retail').service();
const router = express.Router();
router.use(auth, workspaceMiddleware);
const handle = fn => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    const status = e.statusCode || 500;
    if (status === 500) console.error('Retail request failed:', e.code || e.name);
    res.status(status).json({ success: false, error: status === 500 ? 'Retail could not complete this request. Please retry; completed requests are protected from duplication.' : e.message, upgrade_required: status === 402, retryable: status >= 500 });
  }
};
router.get('/status', handle(R.status));
router.get('/overview', handle(R.overview));
router.get('/products/:id/history', handle(R.history));
function mutate(method, route, fn, options) {
  router[method](route, handle(req => R.transaction(req, (c, s, b) => fn(c, s, b, req.params.id), options)));
}
mutate('patch', '/settings', R.settings, { inventory: false, admin: true, enabled: false, entitled: false });
mutate('post', '/products', R.saveProduct, { admin: true });
mutate('patch', '/products/:id', R.saveProduct, { admin: true });
mutate('post', '/stock-in', R.receiveStock);
mutate('post', '/counts', R.requestCount);
mutate('post', '/counts/:id', R.countStock);
mutate('post', '/till/open', R.openTill, { admin: true });
mutate('post', '/till/movement', R.movement, { admin: true });
mutate('post', '/till/balance', R.balance, { admin: true });
mutate('post', '/checkout', R.checkout);
mutate('post', '/sales/:id/refund', R.refund, { admin: true });
mutate('post', '/deliveries', R.createDelivery, { admin: true });
mutate('patch', '/deliveries/:id', R.deliveryStatus, { admin: true });
mutate('post', '/deliveries/:id/receive', R.receiveDelivery);
mutate('post', '/tasks', R.createTask);
mutate('patch', '/tasks/:id', R.taskStatus);
mutate('post', '/reports/preview', async (c, s) => ({ report: await R.report(c, s, true) }));
module.exports = router;
