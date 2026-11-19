import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

const key = 'a'.repeat(32);
const securityJsCode = 'b'.repeat(32);
const place = { id: 'square', query: '天府广场', city: '成都' };
function request(server, path, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'travel-map-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataDir = join(directory, 'data');
  const publicDir = join(directory, 'public');
  const mapConfigFile = join(directory, 'map.json');
  await mkdir(dataDir); await mkdir(publicDir);
  await writeFile(mapConfigFile, JSON.stringify({ key, securityJsCode }), { mode: 0o600 });
  await writeFile(join(dataDir, 'test-2026.json'), JSON.stringify({ tripId: 'test-2026', places: [place] }));
  const server = createServer({ dataDir, publicDir, mapConfigFile, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, dataDir, mapConfigFile };
}
function search(extra = {}, callback = 'AMap.callback_1') {
  const params = new URLSearchParams({ key, callback, keywords: place.query, city: place.city, citylimit: 'true', page: '1', offset: '3', ...extra });
  return '/_AMapService/v3/place/text?' + params;
}
function provider(url, value = { status: '1', pois: [] }) {
  return new Response(new URL(url).searchParams.get('callback') + '(' + JSON.stringify(value) + ');', { headers: { 'content-type': 'application/javascript' } });
}

test('SDK JSONP cache rebinds callbacks while preserving null and zero provider values', async t => {
  let calls = 0;
  let now = 0;
  const { server } = await fixture(t, { mapClock: () => now, mapFetch: async url => { calls++; return provider(url, { status: '1', count: 0, pois: [], location: null }); } });
  const first = await request(server, search({}, 'cb.first'));
  const second = await request(server, search({}, 'cb.second'));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.match(second.text, /^cb\.second\(/);
  assert.doesNotMatch(second.text, /cb\.first/);
  assert.match(second.text, /"count":0/);
  assert.match(second.text, /"location":null/);
  assert.equal(calls, 1);
  now += 3600001;
  assert.equal((await request(server, search({}, 'cb.third'))).status, 200);
  assert.equal(calls, 2);
});

test('SDK proxy forwards no browser credentials and uses fixed provider origin metadata', async t => {
  let seen;
  const { server } = await fixture(t, { mapOrigin: 'https://travel.example', mapFetch: async (url, options) => { seen = { url, options }; return provider(url); } });
  assert.equal((await request(server, search({ jscode: 'untrusted-override' }), 'GET', { Authorization: 'Basic private', Cookie: 'session=private', Referer: 'https://private.invalid/share/token', Origin: 'https://untrusted.invalid' })).status, 200);
  assert.equal(seen.url.origin, 'https://restapi.amap.com');
  assert.equal(seen.url.pathname, '/v3/place/text');
  assert.equal(seen.url.searchParams.get('jscode'), securityJsCode);
  assert.deepEqual(seen.options.headers, { Referer: 'https://travel.example/', Origin: 'https://travel.example' });
  assert.equal(seen.options.redirect, 'error');
});

test('proxy rejects unbounded, arbitrary and executable query shapes before provider requests', async t => {
  let calls = 0;
  const { server } = await fixture(t, { mapFetch: async url => { calls++; return provider(url); } });
  for (const path of [search({ keywords: '其他地点' }), search({ city: '北京' }), search({ page: '2' }), search({ offset: '100' }), search({ citylimit: 'false' }), search({ extensions: 'all' }), search({ extensions: '' }), search({ url: 'https://example.invalid/' }), search({}, 'x);alert(1)//'), search() + '&callback=other', search() + '&s=1&s=2&s=3']) {
    assert.equal((await request(server, path)).status, 403);
  }
  for (const path of ['/_AMapService/v3/geocode/geo?key=' + key, '/_AMapService/v3/direction/driving?key=' + key, '/_AMapService/https://example.invalid/']) assert.equal((await request(server, path)).status, 404);
  assert.equal(calls, 0);
  assert.equal((await request(server, search() + '&s=1&s=2')).status, 200);
});

test('the deployed SDK PlaceSearch base extension is accepted without widening its query contract', async t => {
  let seen;
  const { server } = await fixture(t, { mapFetch: async url => { seen = new URL(url); return provider(url); } });
  const sdkPath = search({ extensions: 'base', platform: 'JS', logversion: '2.0', sdkversion: '2.0', appname: 'travel', csid: 'synthetic', language: 'zh_cn', children: '1', type_: '', antiCrab: 'true' }) + '&s=first&s=second';
  const result = await request(server, sdkPath);
  assert.equal(result.status, 200);
  assert.equal(seen.searchParams.get('extensions'), 'base');
  assert.deepEqual(seen.searchParams.getAll('s'), ['first', 'second']);
  assert.equal(seen.searchParams.get('keywords'), place.query);
  assert.equal(seen.searchParams.get('city'), place.city);
});

test('provider failures, reflected secrets, oversized and invalid JSONP are sanitized', async t => {
  let mode = 'http';
  const { server } = await fixture(t, { mapFetch: async url => {
    if (mode === 'http') return new Response('private upstream error', { status: 503 });
    if (mode === 'secret') return new Response(securityJsCode);
    if (mode === 'key') return new Response(key);
    if (mode === 'large') return new Response('x'.repeat(1024 * 1024 + 1));
    if (mode === 'invalid') return new Response('alert(1)');
    throw new Error('private upstream exception');
  } });
  for (mode of ['http', 'secret', 'key', 'large', 'invalid', 'throw']) {
    const response = await request(server, search());
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(response.text), { error: 'MAP_PROVIDER_UNAVAILABLE' });
    assert.doesNotMatch(response.text, /private|bbbbbbbb|aaaaaaaa|alert/);
  }
});

test('upstream timeout and global request budget remain bounded', async t => {
  const { server } = await fixture(t, { mapTimeoutMs: 25, mapFetch: async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true })) });
  const started = Date.now();
  assert.equal((await request(server, search())).status, 502);
  assert.ok(Date.now() - started < 2000);
  for (let count = 1; count < 120; count++) {
    const response = await request(server, search({ keywords: 'not authored' }));
    assert.equal(response.status, 403);
  }
  const fast = await fixture(t, { mapFetch: async url => provider(url) });
  for (let count = 0; count < 120; count++) assert.equal((await request(fast.server, search())).status, 200);
  const limited = await request(fast.server, search());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
});

test('place query authorization is rechecked before serving cached provider responses', async t => {
  let calls = 0;
  const { server, dataDir } = await fixture(t, { mapFetch: async url => { calls++; return provider(url); } });
  assert.equal((await request(server, search())).status, 200);
  await writeFile(join(dataDir, 'test-2026.json'), JSON.stringify({ tripId: 'test-2026', places: [] }));
  assert.equal((await request(server, search())).status, 403);
  assert.equal(calls, 1);
});
