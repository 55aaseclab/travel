import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

const key = 'a'.repeat(32);
const securityJsCode = 'b'.repeat(32);
const trip = {
  tripId: 'fixture-2026',
  privateNote: 'This field must not be returned.',
  places: [
    { id: 'square', name: '广场', query: '广场', city: '成都', position: { lng: 104, lat: 30, crs: 'GCJ02' } },
    { id: 'river', name: '河边', query: '河边', city: '成都', position: { lng: 104.1, lat: 30.1, crs: 'WGS84' } },
    { id: 'unknown', name: '未定位地点' },
  ],
};

function request(server, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'travel-map-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicDir = join(directory, 'public');
  const dataDir = join(directory, 'data');
  const mapConfigFile = join(directory, 'credentials.json');
  await Promise.all([mkdir(publicDir), mkdir(dataDir)]);
  const dataFile = join(dataDir, 'fixture-2026.json');
  const source = JSON.stringify(trip);
  await Promise.all([
    writeFile(join(publicDir, 'index.html'), '<!doctype html><title>Travel fixture</title>'),
    writeFile(dataFile, source),
    writeFile(mapConfigFile, JSON.stringify({ key, securityJsCode }), { mode: 0o600 }),
  ]);
  const server = createServer({ publicDir, dataDir, mapConfigFile, ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, directory, publicDir, dataDir, dataFile, source };
}

function proxyPath(extra = {}) {
  const params = new URLSearchParams({ key, callback: 'AMap.fixtureCallback', city: '成都', keywords: '广场', citylimit: 'true', page: '1', offset: '3', extensions: 'base', ...extra });
  params.append('s', 'sdk-first');
  params.append('s', 'sdk-second');
  return '/_AMapService/v3/place/text?' + params;
}

test('HTTP map metadata exposes only authored locations and explicit GCJ02 coordinates without changing its source', async t => {
  const { server, dataFile, source } = await fixture(t);
  const config = await request(server, '/fixture-2026/map/config');
  assert.equal(config.status, 200);
  assert.deepEqual(JSON.parse(config.body), { enabled: true, provider: 'amap', key, servicePath: '../_AMapService' });
  assert.equal(config.headers['cache-control'], 'no-store');
  assert.equal(config.headers['x-content-type-options'], 'nosniff');
  assert.ok(!config.body.includes(securityJsCode));
  const response = await request(server, '/fixture-2026/map/places');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    provider: 'amap', crs: 'GCJ02', places: [
      { id: 'square', status: 'resolved', query: '广场', city: '成都', position: { lng: 104, lat: 30 } },
      { id: 'river', status: 'unresolved', query: '河边', city: '成都' },
      { id: 'unknown', status: 'unavailable' },
    ],
  });
  const head = await request(server, '/fixture-2026/map/places', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], response.headers['content-length']);
  assert.equal(await readFile(dataFile, 'utf8'), source);
});

test('HTTP provider bridge binds authored search and never forwards browser identity or capability headers', async t => {
  const calls = [];
  const { server, dataFile, source } = await fixture(t, {
    mapOrigin: 'https://travel.example.test',
    mapFetch: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return new Response('AMap.fixtureCallback({"status":"1","pois":[{"id":"synthetic-poi","location":"104,30"}]});');
    },
  });
  const response = await request(server, proxyPath({ jscode: 'untrusted-browser-code' }), {
    headers: { Cookie: 'session=synthetic', Authorization: 'Bearer synthetic', Referer: 'https://travel.example.test/share/travel/synthetic-capability/', 'X-Praxis-Assertion': 'synthetic' },
  });
  assert.equal(response.status, 200);
  assert.match(response.body, /^AMap\.fixtureCallback\(/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://restapi.amap.com');
  assert.equal(calls[0].url.pathname, '/v3/place/text');
  assert.equal(calls[0].url.searchParams.get('jscode'), securityJsCode);
  assert.equal(calls[0].url.searchParams.getAll('s').length, 2);
  assert.deepEqual(calls[0].options.headers, { Referer: 'https://travel.example.test/', Origin: 'https://travel.example.test' });
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(response.headers['cross-origin-resource-policy'], 'same-origin');
  assert.match(response.headers['cache-control'], /no-store/);
  assert.ok(!response.body.includes(securityJsCode));
  assert.ok(!response.body.includes(key));
  assert.equal(await readFile(dataFile, 'utf8'), source);
});

test('HTTP routing denies arbitrary searches, proxy routes, private files and escaped itinerary sources', async t => {
  let calls = 0;
  const { server, directory, dataDir } = await fixture(t, { mapFetch: async () => { calls++; return new Response('{}'); } });
  await writeFile(join(dataDir, 'mismatched-2026.json'), JSON.stringify({ ...trip, tripId: 'other-2026' }));
  await writeFile(join(directory, 'outside.json'), JSON.stringify({ ...trip, tripId: 'escaped-2026' }));
  await symlink(join(directory, 'outside.json'), join(dataDir, 'escaped-2026.json'));
  for (const path of ['/credentials.json', '/data/fixture-2026.json', '/missing-2026/map/config', '/mismatched-2026/map/config', '/escaped-2026/map/places']) {
    assert.equal((await request(server, path)).status, 404, path);
  }
  assert.equal((await request(server, '/fixture-2026/map/config?redirect=https://untrusted.test')).status, 400);
  assert.equal((await request(server, '/fixture-2026/map/config', { method: 'POST' })).status, 405);
  for (const path of [proxyPath({ keywords: '未经作者选择的地点' }), proxyPath({ key: 'c'.repeat(32) }), proxyPath({ callback: 'alert(1)' }), proxyPath({ url: 'https://untrusted.test/' }), proxyPath({ extensions: 'all' })]) {
    assert.equal((await request(server, path)).status, 403);
  }
  assert.equal((await request(server, '/_AMapService/v3/direction/walking?' + new URLSearchParams({ key, callback: 'AMap.fixtureCallback' }))).status, 404);
  assert.equal(calls, 0);
});

test('missing configuration and provider failure preserve static reading and return sanitized failures', async t => {
  const disabled = await fixture(t, { mapConfigFile: null });
  assert.deepEqual(JSON.parse((await request(disabled.server, '/fixture-2026/map/config')).body), { enabled: false, provider: 'amap' });
  assert.equal((await request(disabled.server, '/')).status, 200);
  assert.equal((await request(disabled.server, '/_AMapService/v3/log/init')).status, 503);
  const failed = await fixture(t, { mapFetch: async () => { throw new Error('Synthetic provider failure with private detail.'); } });
  const response = await request(failed.server, proxyPath());
  assert.equal(response.status, 502);
  assert.deepEqual(JSON.parse(response.body), { error: 'MAP_PROVIDER_UNAVAILABLE' });
  assert.equal((await request(failed.server, '/')).status, 200);
  assert.equal(await readFile(failed.dataFile, 'utf8'), failed.source);
});
