import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

const webServiceKey = 'c'.repeat(32);
const search = values => '/trip-2026/map/search?' + new URLSearchParams({ keywords: '广场', city: '成都', ...values });
const route = values => '/trip-2026/map/route?' + new URLSearchParams({ mode: 'driving', origin: '104,30', destination: '104.1,30.1', crs: 'GCJ02', ...values });
const poi = { id: 'poi-1', name: '广场', address: '市中心', cityname: '成都', type: '风景名胜', location: '104.1,30.1' };
const response = value => new Response(JSON.stringify({ status: '1', ...value }));

function request(server, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method }, res => {
      const chunks = [];
      res.on('data', value => chunks.push(value));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'travel-web-service-unit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicDir = join(directory, 'public'), dataDir = join(directory, 'data'), mapConfigFile = join(directory, 'credentials.json');
  await mkdir(publicDir); await mkdir(dataDir);
  const tripFile = join(dataDir, 'trip-2026.json');
  await writeFile(tripFile, JSON.stringify({ tripId: 'trip-2026', places: [] }));
  await writeFile(mapConfigFile, JSON.stringify({ webServiceKey }), { mode: 0o600 });
  const server = createServer({ publicDir, dataDir, mapConfigFile, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, tripFile };
}

test('POI results are bounded typed projections rather than raw provider data', async t => {
  const { server } = await fixture(t, { mapFetch: async () => response({ pois: [
    { ...poi, location: '0,0', privateProviderField: 'not projected' },
    { ...poi, id: 'invalid', location: 'Infinity,30' },
    ...Array.from({ length: 20 }, (_, index) => ({ ...poi, id: 'poi-' + index })),
  ], extra: 'not projected' }) });
  const result = await request(server, search());
  assert.equal(result.status, 200);
  const value = JSON.parse(result.text);
  assert.equal(value.pois.length, 9);
  assert.deepEqual(value.pois[0], { id: 'poi-1', name: '广场', address: '市中心', city: '成都', category: '风景名胜', position: { lng: 0, lat: 0 } });
  assert.doesNotMatch(result.text, /privateProviderField|not projected|Infinity/);
  const head = await request(server, search(), 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(result.text));
});

test('route projection retains actual zero, unknown metrics and first-path geometry honestly', async t => {
  let value = { paths: [{ distance: '0', cost: { duration: '0' }, steps: [{ polyline: '104,30;104.1,30.1' }, { polyline: '104.1,30.1;104.2,30.2' }] }, { distance: '999' }] };
  const { server } = await fixture(t, { mapFetch: async () => response({ route: value }) });
  let result = JSON.parse((await request(server, route())).text);
  assert.deepEqual(result.route, { distanceMeters: 0, durationSeconds: 0, polyline: [{ lng: 104, lat: 30 }, { lng: 104.1, lat: 30.1 }, { lng: 104.2, lat: 30.2 }] });
  value = { paths: [{ distance: '', cost: {}, steps: [] }] };
  result = JSON.parse((await request(server, route({ mode: 'walking' }))).text);
  assert.deepEqual(result.route, { distanceMeters: null, durationSeconds: null, polyline: [] });
  value = { paths: [] };
  result = JSON.parse((await request(server, route({ destination: '104.3,30.3' }))).text);
  assert.equal(result.route, null);
});

test('read-only requests reject unknown keys, unsupported coordinates and alternate upstream controls', async t => {
  let calls = 0;
  const { server } = await fixture(t, { mapFetch: async () => { calls++; return response({ pois: [] }); } });
  const invalid = [
    search({ keywords: '' }), search({ keywords: '字'.repeat(81) }), search({ city: '字'.repeat(41) }), search({ key: 'injected' }), search({ page: '2' }), search({ callback: 'execute' }), search({ url: 'https://example.invalid/' }), search() + '&city=other',
    route({ mode: 'transit' }), route({ crs: 'WGS84' }), route({ origin: '181,30' }), route({ origin: '104,91' }), route({ origin: '104.1234567,30' }), route({ origin: 'NaN,30' }), route({ origin: '1e2,30' }), route({ origin: ' 104,30' }), route({ waypoints: '104,30' }), route() + '&crs=GCJ02',
  ];
  for (const path of invalid) {
    const result = await request(server, path);
    assert.equal(result.status, 400);
    assert.deepEqual(JSON.parse(result.text), { error: 'INVALID_WEB_SERVICE_REQUEST' });
  }
  assert.equal(calls, 0);
  assert.equal((await request(server, search(), 'POST')).status, 405);
});

test('provider success caching has distinct route lifetimes and never bypasses current trip existence', async t => {
  let now = 0, calls = 0;
  const { server, tripFile } = await fixture(t, { mapClock: () => now, mapFetch: async url => {
    calls++;
    return new URL(url).pathname.includes('/place/') ? response({ pois: [poi] }) : response({ route: { paths: [] } });
  } });
  for (const path of [search(), route(), route({ mode: 'walking' })]) {
    assert.equal((await request(server, path)).status, 200);
    assert.equal((await request(server, path)).status, 200);
  }
  assert.equal(calls, 3);
  now = 300001;
  assert.equal((await request(server, route())).status, 200);
  assert.equal((await request(server, search())).status, 200);
  assert.equal((await request(server, route({ mode: 'walking' }))).status, 200);
  assert.equal(calls, 4);
  now = 3600001;
  assert.equal((await request(server, search())).status, 200);
  assert.equal((await request(server, route({ mode: 'walking' }))).status, 200);
  assert.equal(calls, 6);
  await rm(tripFile);
  assert.equal((await request(server, search())).status, 404);
  assert.equal(calls, 6);
});

test('provider failures, malformed routes, oversized responses and encoded secret reflections are sanitized', async t => {
  let mode;
  const { server } = await fixture(t, { mapFetch: async () => {
    if (mode === 'http') return new Response('private provider failure', { status: 500 });
    if (mode === 'denied') return response({ status: '0', info: 'private provider message' });
    if (mode === 'json') return new Response('private invalid JSON');
    if (mode === 'large') return new Response('x'.repeat(1024 * 1024 + 1));
    if (mode === 'secret') return new Response('{"status":"1","pois":[],"encoded":"' + '\\u0063'.repeat(32) + '"}');
    if (mode === 'geometry') return response({ route: { paths: [{ steps: [{ polyline: '181,30' }] }] } });
    if (mode === 'points') return response({ route: { paths: [{ steps: [{ polyline: Array.from({ length: 8193 }, (_, index) => `104.${index.toString().padStart(6, '0')},30`).join(';') }] }] } });
    throw new Error('private exception');
  } });
  for (mode of ['http', 'denied', 'json', 'large', 'secret', 'geometry', 'points', 'exception']) {
    const result = await request(server, ['geometry', 'points'].includes(mode) ? route() : search());
    assert.equal(result.status, 502, mode);
    assert.deepEqual(JSON.parse(result.text), { error: 'MAP_PROVIDER_UNAVAILABLE' });
    assert.doesNotMatch(result.text, /private|cccccccc/);
  }
});

test('REST request duration and global request budget are bounded independently of SDK traffic', async t => {
  const timed = await fixture(t, { mapTimeoutMs: 25, mapFetch: async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic timeout')), { once: true })) });
  const started = Date.now();
  assert.equal((await request(timed.server, search())).status, 502);
  assert.ok(Date.now() - started < 2000);
  const limited = await fixture(t, { mapFetch: async () => response({ pois: [] }) });
  for (let count = 0; count < 60; count++) assert.equal((await request(limited.server, search())).status, 200);
  const result = await request(limited.server, search());
  assert.equal(result.status, 429);
  assert.equal(result.headers['retry-after'], '60');
});

test('only two provider requests run concurrently and capacity returns after completion', async t => {
  const waiting = [];
  let arrived;
  const both = new Promise(resolve => { arrived = resolve; });
  const { server } = await fixture(t, { mapFetch: async () => new Promise(resolve => {
    waiting.push(resolve);
    if (waiting.length === 2) arrived();
  }) });
  const first = request(server, search({ keywords: '第一处' }));
  const second = request(server, search({ keywords: '第二处' }));
  await both;
  assert.equal((await request(server, search({ keywords: '第三处' }))).status, 429);
  for (const resolve of waiting) resolve(response({ pois: [] }));
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
  assert.equal((await request(server, search({ keywords: '第一处' }))).status, 200);
});
