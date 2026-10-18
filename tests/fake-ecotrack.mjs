// خادم Ecotrack وهمي للاختبار: نفس المسارات التي يستعملها التطبيق.
import http from 'node:http';

export function fakeEcotrack({ token = 'TOK', pageSize = 2 } = {}) {
  const orders = new Map(); // tracking -> order
  const remarks = new Map(); // tracking -> [{remarque, livreur, created_at}]
  const calls = [];
  const add = (o) => orders.set(o.tracking, { created_at: '2026-10-18 09:00:00', ...o });
  const setStatus = (t, status) => { orders.get(t).status = status; };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
    const p = url.pathname.replace('/api/v1/', '');
    const q = Object.fromEntries(url.searchParams);
    calls.push({ method: req.method, path: p, q });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'Unauthenticated.' });
    if (p === 'validate/token') return send(200, { message: 'VALID_TOKEN' });
    if (p === 'get/orders') {
      const all = [...orders.values()];
      const page = +q.page || 1;
      const last = Math.max(1, Math.ceil(all.length / pageSize));
      return send(200, { current_page: page, last_page: last, data: all.slice((page - 1) * pageSize, page * pageSize) });
    }
    if (p === 'valid/order' && req.method === 'POST') {
      const o = orders.get(q.tracking);
      if (!o) return send(404, { message: 'Order not found' });
      if (!/pr[eê]t/i.test(o.status)) return send(422, { message: 'Order already shipped' });
      o.status = 'Vers station';
      return send(200, { success: true });
    }
    if (p === 'delete/order' && req.method === 'DELETE') {
      if (!orders.delete(q.tracking)) return send(404, { message: 'Order not found' });
      return send(200, { success: true });
    }
    if (p === 'get/maj') return send(200, remarks.get(q.tracking) || []);
    return send(404, { message: 'not found ' + p });
  });
  return {
    orders, remarks, calls, add, setStatus,
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => server.close(r)),
  };
}
