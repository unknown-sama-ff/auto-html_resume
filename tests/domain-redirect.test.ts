import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

async function localApp(railway = false) {
  const listener = net.createServer();
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), RAILWAY_ENVIRONMENT_ID: railway ? 'test-environment' : '', CORS_ORIGIN: 'https://esjl.asia' },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Test server startup timeout')); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    child.stdout.on('data', data => { if (String(data).includes('server listening')) { clearTimeout(timer); resolve(); } });
  });
  return { port, child };
}

function request(port: number, host: string, requestPath: string, method = 'GET', headers: Record<string, string> = {}, body = '') {
  return new Promise<{ status: number | undefined; location: string | undefined; body: string }>((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers: { Host: host, ...headers } }, response => {
      let content = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { content += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location, body: content }));
      response.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Test request timeout')));
    outgoing.end(body);
  });
}

test('www permanently redirects GET, HEAD and POST to HTTPS while preserving paths and encoded queries', async () => {
  const app = await localApp();
  try {
    const requestPath = '/resume/%E7%AE%80%E5%8E%86?template=modern&source=www%2Fentry';
    for (const host of ['www.esjl.asia', 'WWW.ESJL.ASIA', 'www.esjl.asia:8080', 'www.esjl.asia.']) {
      for (const method of ['GET', 'HEAD']) {
        const result = await request(app.port, host, requestPath, method);
        assert.equal(result.status, 308);
        assert.equal(result.location, `https://esjl.asia${requestPath}`);
      }
    }
    const result = await request(app.port, 'www.esjl.asia', '/api/ai/edit?source=www', 'POST', {
      Origin: 'https://www.esjl.asia', 'Content-Type': 'application/json',
    }, '{"prompt":"test"}');
    assert.equal(result.status, 308);
    assert.equal(result.location, 'https://esjl.asia/api/ai/edit?source=www');
  } finally { app.child.kill(); }
});

test('canonical host, local development, Railway healthchecks and unrelated hosts remain unchanged', async () => {
  const app = await localApp();
  try {
    for (const host of ['esjl.asia', 'esjl.asia:8080', 'localhost', '127.0.0.1', 'healthcheck.railway.app', 'auto-htmlresume-production.up.railway.app', 'www.esjl.asia.evil.example', 'other.esjl.asia']) {
      const result = await request(app.port, host, '/api/health', 'GET', { 'X-Forwarded-Host': 'www.esjl.asia' });
      assert.equal(result.status, 200, host);
      assert.equal(result.location, undefined, host);
      assert.equal(JSON.parse(result.body).ok, true);
    }
    for (const requestPath of ['//evil.example/redirect?next=1', '/%2F%2Fevil.example/?next=https%3A%2F%2Fevil.example', 'http://evil.example/path?source=absolute']) {
      const result = await request(app.port, 'www.esjl.asia', requestPath);
      assert.equal(result.status, 308);
      assert.equal(new URL(result.location!).origin, 'https://esjl.asia');
      assert.equal(result.location, `https://esjl.asia${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`);
    }
  } finally { app.child.kill(); }
});

test('Railway forwarded host redirects only the www alias and keeps the canonical destination and healthcheck available', async () => {
  const app = await localApp(true);
  try {
    const alias = await request(app.port, 'internal:8080', '/?source=railway', 'GET', { 'X-Forwarded-Host': 'www.esjl.asia' });
    assert.equal(alias.status, 308);
    assert.equal(alias.location, 'https://esjl.asia/?source=railway');
    for (const host of ['esjl.asia', 'healthcheck.railway.app', 'other.example', 'www.esjl.asia.evil.example', 'www.esjl.asia, other.example']) {
      const result = await request(app.port, 'internal:8080', '/api/health', 'GET', { 'X-Forwarded-Host': host });
      assert.equal(result.status, 200, host);
      assert.equal(result.location, undefined, host);
    }
    const healthcheck = await request(app.port, 'healthcheck.railway.app', '/api/health');
    assert.equal(healthcheck.status, 200);
  } finally { app.child.kill(); }
});
