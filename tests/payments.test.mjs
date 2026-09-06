import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../server/accounting.mjs';

async function withDatabase(role, run) {
  const originalFetch = globalThis.fetch;
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_EDGE_IP', 'GOOGLE_SHEETS_SPREADSHEET_ID'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { SUPABASE_URL: 'https://accounting-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' });
  delete process.env.SUPABASE_EDGE_IP;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const writes = [];
  const order = { id: 4, customer: 'Test', sold_tons: 15, unit_price: 1500000, paid_amount: 0, quantity_tons: 34 };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname.endsWith('/sessions')) return Response.json([{ username: 'test', role, expires_at: '2099-01-01' }]);
    assert.ok(url.pathname.endsWith('/orders'), 'Only the order may be accessed');
    if (init.method === 'PATCH') { const changes = JSON.parse(init.body); writes.push(changes); return Response.json({ ...order, ...changes }); }
    return Response.json(order);
  };
  try { await run(writes); } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
}
const request = paidAmount => new Request('https://example.com/api/accounting', { method: 'PATCH', headers: { cookie: 'thit_session=test', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'order', id: 4, paidAmount }) });
test('recording a payment updates only received money, preserving sold quantity and price', async () => {
  await withDatabase('admin', async writes => {
    const response = await handler(request(22500000));
    assert.equal(response.status, 200);
    assert.deepEqual(writes, [{ paid_amount: 22500000 }]);
    const { record } = await response.json();
    assert.equal(record.soldTons, 15);
    assert.equal(record.unitPrice, 1500000);
    assert.equal(record.paidAmount, 22500000);
  });
});
test('invalid payments and read-only users cannot modify money', async () => {
  await withDatabase('admin', async writes => {
    for (const amount of [-1, 'bad', null, '']) assert.equal((await handler(request(amount))).status, 400);
    assert.equal(writes.length, 0);
  });
  await withDatabase('user', async writes => { assert.equal((await handler(request(100))).status, 403); assert.equal(writes.length, 0); });
});
