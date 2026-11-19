import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from '../src/server.js';
import { BusinessService, loadBusinessService } from '../src/business.js';
import { fixture, itinerary, key, spaceId } from './business-fixture.js';
import { formatDuration } from '../src/place-display.js';

function request(server, path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, res => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString(), headers: res.headers })); });
    req.on('error', reject); req.end(body);
  });
}
async function serve(t, options) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return server;
}

async function metadata(f) {
  await writeFile(join(f.seedDir, 'trips.json'), JSON.stringify({ trips: [{ id: 'test-2026', title: '中文旅行', days: Array.from({ length: 7 }, () => ({ title: '日期' })) }] }));
  await writeFile(join(f.seedDir, 'routes.json'), JSON.stringify({ routes: [{ id: 'test-2026', title: '中文旅行', status: 'upcoming', startDate: '2026-12-24', endDate: '2026-12-30', placeCount: 2, cityCount: 1, editedAt: '2026-11-14', cover: 'cover.png', coverAlt: '旅行封面' }] }));
  await writeFile(join(f.seedDir, 'photo-credits.json'), '[]');
  await mkdir(join(f.publicDir, 'archived-example'));
  await writeFile(join(f.publicDir, 'archived-example/index.html'), 'Synthetic published guide');
}

test('native guide HTML, catalog and map metadata read the same copy-on-write facts without build or read writes', async t => {
  const f = await fixture(t); await metadata(f);
  const server = await serve(t, { businessService: f.service, publicDir: f.publicDir, dataDir: f.seedDir });
  assert.match((await request(server, '/test-2026/')).text, /汉字公园/);
  assert.equal((await request(server, '/routes.json')).status, 200);
  assert.deepEqual(await readdir(f.dataDir), []);
  const before = await readFile(join(f.seedDir, 'test-2026.json'));
  const duration = { kind: 'minutes', minMinutes: 90, maxMinutes: 120 };
  await f.invoke(f.request('update_place_details', { expectedRevision: '0', idempotencyKey: 'save', input: { placeId: 'first', details: { duration } } }));
  const page = await request(server, '/test-2026/index.html');
  assert.equal(page.status, 200); assert.match(page.text, /汉字公园/); assert.ok(page.text.includes(formatDuration(duration))); assert.doesNotMatch(page.text, /_business|scopeKey|requestHash/);
  const map = JSON.parse((await request(server, '/test-2026/map/places')).text);
  assert.equal(map.places[0].position, undefined); assert.equal(map.places[0].query, '汉字公园');
  assert.equal((await request(server, '/archived-example/')).text, 'Synthetic published guide');
  assert.deepEqual(await readFile(join(f.seedDir, 'test-2026.json')), before);
  assert.equal((await request(server, '/private/' + f.resourceId + '.json')).status, 404);
});

test('private business HTTP rejects missing assertions, unsafe methods, malformed envelopes and interrupted uploads', async t => {
  const f = await fixture(t);
  const server = await serve(t, { businessService: f.service, publicDir: f.publicDir, dataDir: f.seedDir });
  assert.equal((await request(server, '/api/business')).status, 405);
  assert.equal((await request(server, '/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await request(server, '/api/business?other=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Praxis-Assertion': 'invalid' }, body: '{}' })).status, 400);
  assert.equal((await request(server, '/api/business', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Praxis-Assertion': 'invalid' }, body: '{' })).status, 401);
  await new Promise(resolve => { const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/business', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Praxis-Assertion': 'invalid' } }); req.on('error', () => resolve()); req.write('{'); setTimeout(() => { req.destroy(); resolve(); }, 10); });
  assert.equal((await request(server, '/api/business')).status, 405);
  assert.deepEqual(await readdir(f.dataDir), []);
});

test('signed provider queries are scoped and return nullable observations rather than future guarantees', async t => {
  const f = await fixture(t);
  const credentials = join(f.root, 'map.json'); await writeFile(credentials, JSON.stringify({ webServiceKey: 'a'.repeat(32) }), { mode: 0o600 });
  let calls = 0, seen;
  const service = new BusinessService({ ...f.options, mapOptions: { mapConfigFile: credentials, mapFetch: async (url, options) => { calls++; seen = { url, options }; return new Response(JSON.stringify({ status: '1', pois: [{ id: 'B000TEST', name: '公开公园', cityname: '成都', address: '市中心', type: '风景名胜', location: '104,30', business: { cost: '0', rating: '4.5' } }] })); } } });
  const result = await f.invoke(f.request('get_place', { input: { poiId: 'B000TEST' } }), {}, service);
  assert.equal(result.place.id, 'B000TEST'); assert.equal(result.place.business.openingHoursToday, null); assert.equal(result.place.business.averageCost, '0');
  assert.ok(Number.isFinite(Date.parse(result.checkedAt))); assert.ok(result.limitations.includes('booking-availability-unconfirmed'));
  assert.equal(seen.url.origin, 'https://restapi.amap.com'); assert.equal(seen.url.pathname, '/v5/place/detail'); assert.equal(seen.url.searchParams.get('show_fields'), 'business,navi');
  assert.deepEqual(seen.options.headers, { Accept: 'application/json' });
  await assert.rejects(f.invoke(f.request('get_place', { input: { poiId: 'B000TEST|B000OTHER' } }), {}, service), { code: 'INVALID_INPUT' });
  await assert.rejects(f.invoke(f.request('get_place', { input: { poiId: 'B000TEST' } }), { resources: ['trv_' + '0'.repeat(32)] }, service), { code: 'NOT_FOUND' });
  assert.equal(calls, 1); assert.deepEqual(await readdir(f.dataDir), []);
});

test('private route tools return concise metrics while the public map retains complete geometry', async t => {
  const f = await fixture(t);
  const credentials = join(f.root, 'route-map.json'); await writeFile(credentials, JSON.stringify({ webServiceKey: 'a'.repeat(32) }), { mode: 0o600 });
  const mapOptions = { mapConfigFile: credentials, mapFetch: async () => new Response(JSON.stringify({ status: '1', route: { paths: [{ distance: '800', cost: { duration: '600' }, steps: [{ polyline: '104,30;104.1,30.1' }, { polyline: '104.1,30.1;104.2,30.2' }] }] } })) };
  const service = new BusinessService({ ...f.options, mapOptions });
  const result = await f.invoke(f.request('plan_route', { input: { mode: 'walking', origin: '104,30', destination: '104.2,30.2', crs: 'GCJ02' } }), {}, service);
  assert.deepEqual(result.route, { distanceMeters: 800, durationSeconds: 600, geometryPointCount: 3 });
  assert.doesNotMatch(JSON.stringify(result), /polyline|104\.1/);
  const server = await serve(t, { businessService: service, publicDir: f.publicDir, dataDir: f.seedDir, ...mapOptions });
  const page = await request(server, '/test-2026/map/route?mode=walking&origin=104,30&destination=104.2,30.2&crs=GCJ02');
  assert.equal(page.status, 200);
  assert.deepEqual(JSON.parse(page.text).route.polyline, [{ lng: 104, lat: 30 }, { lng: 104.1, lat: 30.1 }, { lng: 104.2, lat: 30.2 }]);
});

test('business activation requires exact one-space private configuration and performs no data initialization', async t => {
  const f = await fixture(t);
  const configFile = join(f.root, 'business.json'), keyFile = join(f.root, 'business.key');
  await writeFile(configFile, JSON.stringify({ version: 1, webSpace: spaceId, spaces: { [spaceId]: ['test-2026'] } }), { mode: 0o600 }); await writeFile(keyFile, key, { mode: 0o600 });
  const env = { TRAVEL_DATA_DIR: f.dataDir, TRAVEL_BUSINESS_KEY_FILE: keyFile, TRAVEL_BUSINESS_CONFIG_FILE: configFile };
  assert.equal(loadBusinessService({}), null);
  assert.throws(() => loadBusinessService({ TRAVEL_DATA_DIR: f.dataDir }), /requires absolute/);
  assert.ok(loadBusinessService(env, { seedDir: f.seedDir }) instanceof BusinessService);
  assert.deepEqual(await readdir(f.dataDir), []);
  await writeFile(configFile, JSON.stringify({ version: 1, webSpace: spaceId, spaces: { [spaceId]: ['test-2026'], another: ['test-2026'] } }));
  assert.throws(() => loadBusinessService(env, { seedDir: f.seedDir }), /one explicit/);
});

test('an empty managed space starts without records and later accepts an explicitly imported catalog', async t => {
  const f = await fixture(t);
  for (const [file, data] of [['trips.json', { trips: [] }], ['routes.json', { routes: [] }], ['photo-credits.json', []]]) {
    await writeFile(join(f.seedDir, file), JSON.stringify(data));
  }
  const configFile = join(f.root, 'empty-business.json'), keyFile = join(f.root, 'empty-business.key');
  await writeFile(configFile, JSON.stringify({ version: 1, webSpace: spaceId, spaces: { [spaceId]: [] } }), { mode: 0o600 });
  await writeFile(keyFile, key, { mode: 0o600 });
  const env = { TRAVEL_DATA_DIR: f.dataDir, TRAVEL_BUSINESS_KEY_FILE: keyFile, TRAVEL_BUSINESS_CONFIG_FILE: configFile };
  const empty = loadBusinessService(env, { seedDir: f.seedDir });
  const server = await serve(t, { businessService: empty, publicDir: f.publicDir, dataDir: f.seedDir });
  assert.equal((await request(server, '/health')).status, 200);
  const catalog = await request(server, '/');
  assert.equal(catalog.status, 200);
  assert.doesNotMatch(catalog.text, /汉字公园|中文旅行/);
  assert.deepEqual(JSON.parse((await request(server, '/routes.json')).text), { routes: [] });
  assert.deepEqual(await f.invoke(f.request('list_itineraries'), {}, empty), { spaceId, items: [] });
  const integrity = await f.invoke({ operation: 'integrity', spaceId }, { resources: ['*'] }, empty);
  assert.equal(integrity.resourceCount, 0);
  await assert.rejects(f.invoke(f.request('read_itinerary'), {}, empty), error => error.status === 404 && error.code === 'NOT_FOUND');
  await assert.rejects(f.invoke(f.request('list_itineraries'), { spaceId: 'another-space' }, empty), error => error.status === 403);
  assert.equal((await request(server, '/api/business', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })).status, 401);
  assert.deepEqual(await readdir(f.dataDir), []);

  await metadata(f);
  await writeFile(configFile, JSON.stringify({ version: 1, webSpace: spaceId, spaces: { [spaceId]: ['test-2026'] } }), { mode: 0o600 });
  const activated = loadBusinessService(env, { seedDir: f.seedDir });
  const list = await f.invoke(f.request('list_itineraries'), {}, activated);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].resourceId, f.resourceId);
  const imported = await f.invoke(f.request('read_itinerary'), {}, activated);
  assert.equal(imported.itinerary.tripId, 'test-2026');
  assert.deepEqual(await readdir(f.dataDir), []);
});
