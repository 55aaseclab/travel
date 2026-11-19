import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server.js';

const browserKey = 'a'.repeat(32);
const securityJsCode = 'b'.repeat(32);
const webServiceKey = 'c'.repeat(32);
const searchPath = '/fixture-2026/map/search?' + new URLSearchParams({ keywords: '新的公开景点', city: '成都' });
const routePath = mode => '/fixture-2026/map/route?' + new URLSearchParams({ mode, origin: '104,30', destination: '104.1,30.1', crs: 'GCJ02' });
const providerSearch = {
  status: '1', infocode: '10000', count: '1', privateField: 'SYNTHETIC_PRIVATE_PROVIDER_FIELD',
  pois: [{ id: 'synthetic-poi', name: '公开景点', address: '合成地址', cityname: '成都市', type: '风景名胜', location: '104.05,30.05', privateField: 'SYNTHETIC_PRIVATE_POI_FIELD' }],
};
const providerRoute = {
  status: '1', infocode: '10000', privateField: 'SYNTHETIC_PRIVATE_PROVIDER_FIELD',
  route: { origin: '104,30', destination: '104.1,30.1', paths: [{ distance: '1200', duration: '180', cost: { duration: '180' }, steps: [{ polyline: '104,30;104.05,30.05;104.1,30.1', instruction: 'SYNTHETIC_PRIVATE_INSTRUCTION' }] }] },
};

function request(server, path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

async function fixture(t, { credentials = { key: browserKey, securityJsCode, webServiceKey }, ...options } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'travel-web-service-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicDir = join(directory, 'public'), dataDir = join(directory, 'data'), mapConfigFile = join(directory, 'credentials.json');
  await Promise.all([mkdir(publicDir), mkdir(dataDir)]);
  const dataFile = join(dataDir, 'fixture-2026.json'), source = JSON.stringify({ tripId: 'fixture-2026', places: [{ id: 'authored', query: '原地点', city: '成都' }] });
  await Promise.all([
    writeFile(dataFile, source),
    writeFile(mapConfigFile, JSON.stringify(credentials), { mode: 0o600 }),
    writeFile(join(publicDir, 'index.html'), '<!doctype html><title>Travel</title><p>Readable itinerary</p>'),
  ]);
  const server = createServer({ publicDir, dataDir, mapConfigFile, ...options });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, dataFile, source };
}

test('HTTP exploratory search uses the private Web service key with a fixed bounded upstream and normalized results', async t => {
  let seen;
  const { server, dataFile, source } = await fixture(t, { mapFetch: async (url, options) => { seen = { url: new URL(url), options }; return Response.json(providerSearch); } });
  const result = await request(server, searchPath, { headers: { Cookie: 'session=synthetic', Authorization: 'Bearer synthetic', Referer: 'https://private.test/share/synthetic-capability', 'X-Praxis-Assertion': 'synthetic' } });
  assert.equal(result.status, 200);
  const value = JSON.parse(result.text);
  assert.equal(value.provider, 'amap');
  assert.equal(value.crs, 'GCJ02');
  assert.equal(value.pois.length, 1);
  assert.equal(value.pois[0].id, 'synthetic-poi');
  assert.equal(value.pois[0].name, '公开景点');
  assert.equal(value.pois[0].category, '风景名胜');
  assert.deepEqual(value.pois[0].position, { lng: 104.05, lat: 30.05 });
  assert.equal(seen.url.origin, 'https://restapi.amap.com');
  assert.equal(seen.url.pathname, '/v5/place/text');
  assert.equal(seen.url.searchParams.get('key'), webServiceKey);
  assert.equal(seen.url.searchParams.get('keywords'), '新的公开景点');
  assert.equal(seen.url.searchParams.get('region'), '成都');
  assert.equal(seen.url.searchParams.get('city_limit'), 'true');
  assert.equal(seen.url.searchParams.get('page_size'), '10');
  assert.equal(seen.url.searchParams.get('page_num'), '1');
  assert.equal(seen.url.searchParams.has('jscode'), false);
  assert.equal(seen.url.searchParams.has('callback'), false);
  assert.equal(seen.options.redirect, 'error');
  const headers = new Headers(seen.options.headers);
  for (const name of ['cookie', 'authorization', 'referer', 'x-praxis-assertion']) assert.equal(headers.has(name), false, name);
  assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  for (const hidden of [browserKey, securityJsCode, webServiceKey, 'SYNTHETIC_PRIVATE']) assert.ok(!result.text.includes(hidden));
  assert.equal(await readFile(dataFile, 'utf8'), source);
});

test('HTTP driving and walking use explicit GCJ02 endpoints and return real metric and line fields only', async t => {
  const calls = [];
  const { server, dataFile, source } = await fixture(t, { mapFetch: async (url, options) => { calls.push({ url: new URL(url), options }); return Response.json(providerRoute); } });
  for (const mode of ['driving', 'walking']) {
    const response = await request(server, routePath(mode));
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), { provider: 'amap', crs: 'GCJ02', mode, route: { distanceMeters: 1200, durationSeconds: 180, polyline: [{ lng: 104, lat: 30 }, { lng: 104.05, lat: 30.05 }, { lng: 104.1, lat: 30.1 }] } });
    assert.ok(!response.text.includes('SYNTHETIC_PRIVATE'));
    assert.ok(!response.text.includes(webServiceKey));
    const call = calls.at(-1);
    assert.equal(call.url.origin, 'https://restapi.amap.com');
    assert.equal(call.url.pathname, '/v5/direction/' + mode);
    assert.equal(call.url.searchParams.get('key'), webServiceKey);
    assert.equal(call.url.searchParams.get('origin'), '104,30');
    assert.equal(call.url.searchParams.get('destination'), '104.1,30.1');
    assert.equal(call.url.searchParams.get('show_fields'), 'cost,polyline');
  }
  assert.equal(calls.length, 2);
  assert.equal(await readFile(dataFile, 'utf8'), source);
});

test('HTTP Web service rejects unknown, duplicate, injected, unbounded and invalid-coordinate inputs before upstream access', async t => {
  let calls = 0;
  const { server } = await fixture(t, { mapFetch: async () => { calls++; return Response.json(providerSearch); } });
  const paths = [
    searchPath + '&keywords=duplicate', searchPath + '&key=' + webServiceKey,
    searchPath + '&jscode=override', searchPath + '&callback=code', searchPath + '&url=https://untrusted.test/',
    '/fixture-2026/map/search?' + new URLSearchParams({ keywords: '甲'.repeat(81), city: '成都' }),
    '/fixture-2026/map/search?' + new URLSearchParams({ keywords: '景点', city: '甲'.repeat(41) }),
    '/fixture-2026/map/search?keywords=&city=',
    ...[
      { mode: 'transit' }, { origin: 'NaN,30' }, { origin: 'Infinity,30' }, { origin: '181,30' },
      { destination: '104,-91' }, { destination: '104,30,20' }, { crs: 'WGS84' }, { crs: '' },
      { providerURL: 'https://untrusted.test/' }, { key: webServiceKey },
    ].map(extra => '/fixture-2026/map/route?' + new URLSearchParams({ mode: 'driving', origin: '104,30', destination: '104.1,30.1', crs: 'GCJ02', ...extra })),
    routePath('walking') + '&origin=104,30',
  ];
  for (const path of paths) {
    const response = await request(server, path);
    assert.equal(response.status, 400, path);
    assert.deepEqual(JSON.parse(response.text), { error: 'INVALID_WEB_SERVICE_REQUEST' });
  }
  assert.equal((await request(server, searchPath.replace('fixture-2026', 'unknown-2026'))).status, 404);
  assert.equal((await request(server, searchPath, { method: 'POST' })).status, 405);
  assert.equal(calls, 0);
});

test('Web service configuration is independent of the existing browser SDK and neither private key is exposed', async t => {
  const sdk = await fixture(t, { credentials: { key: browserKey, securityJsCode }, mapFetch: async url => new Response(new URL(url).searchParams.get('callback') + '({"status":"1"});') });
  const config = await request(sdk.server, '/fixture-2026/map/config');
  assert.deepEqual(JSON.parse(config.text), { enabled: true, provider: 'amap', key: browserKey, servicePath: '../_AMapService' });
  assert.equal((await request(sdk.server, searchPath)).status, 503);
  assert.equal((await request(sdk.server, '/_AMapService/v3/log/init?' + new URLSearchParams({ key: browserKey, callback: 'AMap.callback' }))).status, 200);
  const rest = await fixture(t, { credentials: { webServiceKey }, mapFetch: async () => Response.json(providerSearch) });
  const restConfig = await request(rest.server, '/fixture-2026/map/config');
  assert.deepEqual(JSON.parse(restConfig.text), { enabled: false, provider: 'amap' });
  assert.equal((await request(rest.server, searchPath)).status, 200);
  assert.ok(!restConfig.text.includes(webServiceKey));
});

test('provider rejection and empty results are distinguished without exposing upstream content or fabricating a route', async t => {
  let mode = 'failed';
  const { server, dataFile, source } = await fixture(t, { mapFetch: async () => {
    if (mode === 'failed') return Response.json({ status: '0', infocode: '10001', info: 'SYNTHETIC_PRIVATE_PROVIDER_ERROR', key: webServiceKey });
    if (mode === 'emptySearch') return Response.json({ status: '1', pois: [] });
    return Response.json({ status: '1', route: { paths: [] } });
  } });
  const failed = await request(server, searchPath);
  assert.equal(failed.status, 502);
  assert.deepEqual(JSON.parse(failed.text), { error: 'MAP_PROVIDER_UNAVAILABLE' });
  mode = 'emptySearch';
  assert.deepEqual(JSON.parse((await request(server, searchPath)).text), { provider: 'amap', crs: 'GCJ02', pois: [] });
  mode = 'emptyRoute';
  assert.deepEqual(JSON.parse((await request(server, routePath('walking'))).text), { provider: 'amap', crs: 'GCJ02', mode: 'walking', route: null });
  assert.equal(await readFile(dataFile, 'utf8'), source);
});
