import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/auth.js';
import accounting from '../api/accounting.js';

test('Vercel auth accepts a Web Request and returns JSON with status', async () => {
  const response = await auth.fetch(new Request('https://example.vercel.app/api/auth'));
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { user: null });
});
test('Vercel accounting rejects unauthenticated reads and writes', async () => {
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await accounting.fetch(new Request('https://example.vercel.app/api/accounting', { method }));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
});
test('logout preserves the secure session-clearing cookie', async () => {
  const response = await auth.fetch(new Request('https://example.vercel.app/api/auth', { method: 'DELETE' }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /thit_session=;/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=0']) assert.ok(cookie.includes(flag));
});
