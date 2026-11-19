import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, stat, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFliggyClient, FLIGGY_CLI_FILE, validateServiceQuery } from '../src/fliggy-client.js';
import { BusinessService } from '../src/business.js';
import { fixture as businessFixture } from './business-fixture.js';

const apiKey = 'synthetic-flyai-key-123456789';
const initial = Date.parse('2026-11-14T00:00:00.000Z');
const hotel = { kind: 'hotel', city: '成都', checkIn: '2026-12-24', checkOut: '2026-12-25', keyword: '双床房' };
const flight = { kind: 'flight', origin: '广州', destination: '成都', date: '2026-12-24' };
const train = { ...flight, kind: 'train' };
const restaurant = { kind: 'restaurant', city: '成都', query: '北京午饭' };
const segment = { depCityName: '广州', depStationName: '广州南', depDateTime: '2026-12-24 08:00', arrCityName: '成都', arrStationName: '成都东', arrDateTime: '2026-12-24 12:00', duration: '4小时', marketingTransportNo: 'G123', seatClassName: '二等座', transportType: 'train' };
const items = {
  hotel: { shId: 'hotel-id', name: '汉字酒店', address: '成都', brandName: '酒店品牌', price: '¥ 129.50', rate: '4.7', star: '4', latitude: '30.6', longitude: '104.1', detailUrl: 'https://router.feizhu.com/hotel?id=1', commission: 'not a business fact' },
  flight: { ticketPrice: '1280.25', jumpUrl: 'https://www.fliggy.com/flight', totalDuration: '4小时', journeys: [{ totalDuration: '4小时', segments: [segment] }] },
  train: { price: '暂无报价', jumpUrl: 'https://router.feizhu.com/train', totalDuration: '4小时', journeys: [{ totalDuration: '4小时', segments: [segment] }] },
  restaurant: { info: { title: '汉字餐饮', price: '88元', rate: '4.5', star: '4', jumpUrl: 'https://h5.m.taobao.com/restaurant' } },
};
const output = (item, extra = {}) => ({ stdout: JSON.stringify({ status: 0, message: 'success', data: { itemList: [item] }, ...extra }), stderr: '' });
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'travel-fliggy-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configFile = join(root, 'config.json'), tempRoot = join(root, 'temporary');
  await mkdir(tempRoot, { mode: 0o700 }); await writeFile(configFile, JSON.stringify({ apiKey }), { mode: 0o600 });
  const clockState = { now: initial };
  const settings = { configFile, tempRoot, clock: () => clockState.now, ...options };
  return { root, configFile, tempRoot, clockState, settings, client: createFliggyClient(settings) };
}
const rejected = (promise, code, status) => assert.rejects(promise, error => error.code === code && (!status || error.status === status) && !error.message.includes(apiKey));

test('four read-only categories use fixed commands and a private clean environment with no inherited overrides', async t => {
  const captured = [];
  const previous = Object.fromEntries(['NODE_OPTIONS', 'DEBUG_FLYAI_MCP_URL', 'DEBUG_FLYAI_API_KEY', 'FLYAI_SIGN_SECRET', 'HTTPS_PROXY'].map(name => [name, process.env[name]]));
  Object.assign(process.env, { NODE_OPTIONS: '--require=/private/unsafe.js', DEBUG_FLYAI_MCP_URL: 'https://untrusted.invalid/', DEBUG_FLYAI_API_KEY: 'untrusted', FLYAI_SIGN_SECRET: 'untrusted', HTTPS_PROXY: 'https://untrusted.invalid/' });
  t.after(() => { for (const [name, value] of Object.entries(previous)) if (value === undefined) delete process.env[name]; else process.env[name] = value; });
  const f = await fixture(t, { execFile: async (file, args, options) => {
    captured.push({ file, args, options });
    assert.equal((await stat(options.cwd)).mode & 0o777, 0o700);
    const kind = args[1] === 'keyword-search' ? 'restaurant' : args[1].slice('search-'.length);
    return output(items[kind]);
  } });
  for (const input of [hotel, flight, train, restaurant]) {
    const result = await f.client.query(input, { expiresAt: initial + 20000 });
    assert.equal(result.kind, input.kind); assert.equal(result.source, 'fliggy'); assert.equal(result.availability, 'unconfirmed'); assert.equal(result.offers.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /commission|synthetic-flyai-key/);
  }
  assert.deepEqual(captured.map(item => item.args[1]), ['search-hotel', 'search-flight', 'search-train', 'keyword-search']);
  for (const item of captured) {
    assert.equal(item.file, process.execPath); assert.equal(item.args[0], FLIGGY_CLI_FILE); assert.equal(item.options.shell, false);
    assert.deepEqual(Object.keys(item.options.env).sort(), ['FLYAI_API_KEY', 'FLYAI_JSON', 'HOME', 'LANG', 'TMPDIR']);
    assert.equal(item.options.env.FLYAI_API_KEY, apiKey); assert.equal(item.options.env.HOME, item.options.cwd); assert.equal(item.options.env.TMPDIR, item.options.cwd);
    assert.equal(item.options.timeout, 12000); assert.equal(item.options.maxBuffer, 1024 * 1024); assert.equal(item.options.killSignal, 'SIGKILL');
    assert.equal(item.args.includes(apiKey), false);
    await assert.rejects(access(item.options.cwd));
  }
  assert.deepEqual(await readdir(f.tempRoot), []);
});

test('prices, supplier links, unverified hotel coordinates and transport dates are represented honestly', async t => {
  let next;
  const f = await fixture(t, { execFile: async () => output(next) });
  next = items.hotel;
  const stay = (await f.client.query(hotel)).offers[0];
  assert.deepEqual(stay.price, { label: '¥ 129.50', amountCents: 12950, currency: 'CNY' }); assert.equal(stay.position.crs, 'unknown');
  assert.equal(stay.jumpUrl, 'https://router.feizhu.com/hotel?id=1');
  next = { ...items.flight, ticketPrice: '0.00', journeys: [{ segments: [{ ...segment, depDateTime: '2026-12-23 08:00' }] }], jumpUrl: 'https://fliggy.com.evil.invalid/path' };
  const ticket = (await f.client.query(flight)).offers[0];
  assert.equal(ticket.price.amountCents, 0); assert.equal(ticket.dateMatch, 'mismatched'); assert.equal(ticket.jumpUrl, null);
  next = items.train;
  const rail = await f.client.query(train);
  assert.equal(rail.referenceOnly, true); assert.equal(rail.offers[0].price.amountCents, null); assert.ok(rail.limitations.includes('train-date-outside-presale-reference-only'));
  next = { info: { title: '餐饮套餐', price: '88-128元', jumpUrl: 'https://user:password@router.feizhu.com/item' } };
  const meal = await f.client.query(restaurant);
  assert.equal(meal.offers[0].price.amountCents, null); assert.equal(meal.offers[0].jumpUrl, null); assert.equal(meal.offers[0].rating, null);
  assert.ok(meal.limitations.includes('keyword-results-do-not-confirm-restaurant-reservations'));
});

test('strict input validation rejects command injection, unknown operations and unsupported dates without execution', async t => {
  let calls = 0;
  const f = await fixture(t, { execFile: async () => { calls++; return output(items.hotel); } });
  for (const input of [
    { ...hotel, command: 'config' }, { ...hotel, city: '--debug' }, { ...hotel, city: '\n成都' }, { ...hotel, city: '字'.repeat(41) }, { ...hotel, keyword: '字'.repeat(201) },
    { ...hotel, checkIn: '2026-11-13' }, { ...hotel, checkOut: hotel.checkIn }, { ...hotel, checkOut: '2027-02-01' }, { ...hotel, checkIn: '2026-02-31' },
    { ...flight, kind: 'book-flight' }, { ...flight, date: '2027-11-15' }, { ...restaurant, query: ' --api-key=other' },
  ]) await rejected(f.client.query(input), 'INVALID_INPUT', 400);
  assert.equal(calls, 0); assert.deepEqual(await readdir(f.tempRoot), []);
  assert.equal(validateServiceQuery({ ...hotel, city: "西安's" }, () => initial).city, "西安's");
});

test('nonzero provider status, malformed data, oversized output and secret reflection become fixed errors and clean temporary state', async t => {
  let mode;
  const f = await fixture(t, { execFile: async () => {
    if (mode === 'status') return output(items.hotel, { status: 1, systemMessage: 'private provider diagnostics' });
    if (mode === 'malformed') return { stdout: 'private non-json diagnostics', stderr: '' };
    if (mode === 'oversized') return { stdout: 'x'.repeat(1024 * 1024 + 1), stderr: '' };
    if (mode === 'secret') return output({ ...items.hotel, name: apiKey });
    if (mode === 'encoded') return { stdout: JSON.stringify({ status: 0, data: { itemList: [{ ...items.hotel, name: apiKey }] } }).replace('synthetic', '\\u0073ynthetic'), stderr: '' };
    if (mode === 'url-encoded') return output({ ...items.hotel, detailUrl: 'https://router.feizhu.com/hotel?key=' + [...apiKey].map(character => '%' + character.charCodeAt(0).toString(16)).join('') });
    if (mode === 'stderr') return { stdout: '{}', stderr: apiKey };
    throw Object.assign(new Error(apiKey + ' private stderr'), { code: 'ETIMEDOUT' });
  } });
  for (mode of ['status', 'malformed', 'oversized', 'secret', 'encoded', 'url-encoded', 'stderr', 'exception']) {
    await rejected(f.client.query(hotel), 'FLIGGY_UNAVAILABLE', 502);
    assert.deepEqual(await readdir(f.tempRoot), []);
  }
});

test('cache and deadline checks retain the original observation time and never return expired authorization', async t => {
  let calls = 0;
  const f = await fixture(t, { execFile: async () => { calls++; return output(items.hotel); } });
  const first = await f.client.query(hotel, { expiresAt: initial + 20000 });
  f.clockState.now += 1000;
  const cached = await f.client.query(hotel, { expiresAt: initial + 20000 });
  assert.equal(cached.checkedAt, first.checkedAt); assert.equal(calls, 1);
  await rejected(f.client.query(hotel, { expiresAt: f.clockState.now + 499 }), 'INVALID_ASSERTION', 401);
  f.clockState.now += 300001;
  await f.client.query(hotel); assert.equal(calls, 2);
  const expired = await fixture(t, { execFile: async () => { expired.clockState.now += 10000; return output(items.hotel); } });
  await rejected(expired.client.query(hotel, { expiresAt: initial + 5000 }), 'INVALID_ASSERTION', 401);
  assert.deepEqual(await readdir(expired.tempRoot), []);
});

test('concurrency and request budgets are bounded while a timed-out execution releases capacity', async t => {
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { execFile: async () => new Promise(resolve => { release = resolve; started(); }) });
  const first = f.client.query(hotel);
  await ready;
  await rejected(f.client.query({ ...hotel, city: '北京' }), 'FLIGGY_RATE_LIMITED', 429);
  release(output(items.hotel)); await first;
  assert.deepEqual(await readdir(f.tempRoot), []);
  const budget = await fixture(t, { execFile: async () => output(items.hotel) });
  for (let count = 0; count < 30; count++) await budget.client.query(hotel);
  await rejected(budget.client.query(hotel), 'FLIGGY_RATE_LIMITED', 429);
});

test('optional credentials disable only this query and scoped business reads do not write itinerary data', async t => {
  const f = await businessFixture(t);
  const missing = createFliggyClient({ configFile: join(f.root, 'missing.json') });
  await rejected(missing.query(hotel), 'FLIGGY_NOT_CONFIGURED', 503);
  const configFile = join(f.root, 'flyai.json'); await writeFile(configFile, JSON.stringify({ apiKey }), { mode: 0o600 });
  let calls = 0;
  const service = new BusinessService({ ...f.options, fliggyOptions: { configFile, execFile: async () => { calls++; return output(items.hotel); }, clock: () => initial } });
  const result = await f.invoke(f.request('query_travel_services', { input: hotel }), {}, service);
  assert.equal(result.offers[0].name, '汉字酒店'); assert.equal(result.resourceId, f.resourceId);
  await assert.rejects(f.invoke(f.request('query_travel_services', { input: hotel }), { resources: ['trv_' + '0'.repeat(32)] }, service), { code: 'NOT_FOUND' });
  assert.equal(calls, 1); assert.deepEqual(await readdir(f.dataDir), []);
});
