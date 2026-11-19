import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile, rm, symlink, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BusinessService, itineraryResourceId } from '../src/business.js';
import { canonical } from '../src/itinerary-store.js';
import { getPlaceDetails } from '../src/place-display.js';
import { fixture, itinerary, spaceId } from './business-fixture.js';

const rejected = (promise, code, status) => assert.rejects(promise, error => error.code === code && (!status || error.status === status));
const duration = { kind: 'minutes', minMinutes: 90, maxMinutes: 120 };
const update = (f, details = { duration }, extra = {}) => f.request('update_place_details', { expectedRevision: '0', idempotencyKey: 'save-1', input: { placeId: 'first', details }, ...extra });

function withoutDetails(data) {
  const value = structuredClone(data);
  for (const place of value.places) delete place.details;
  return value;
}

test('raw seed reads include a separate editable projection without changing content hashes or private storage', async t => {
  const f = await fixture(t, { secondTrip: true });
  const bytes = await readFile(join(f.seedDir, 'test-2026.json'));
  const listed = await f.invoke(f.request('list_itineraries'));
  assert.equal(listed.items.length, 1); assert.equal(listed.items[0].revision, '0');
  assert.equal((await f.invoke(f.request('list_itineraries'), { resources: ['*'] })).items.length, 2);
  const read = await f.invoke(f.request('read_itinerary'));
  assert.equal(read.revision, '0'); assert.equal(read.contentHash, createHash('sha256').update(canonical(read.itinerary)).digest('hex'));
  assert.deepEqual(read.itinerary, itinerary());
  assert.deepEqual(read.editablePlaceDetails, read.itinerary.places.map(place => ({ placeId: place.id, details: getPlaceDetails(place) })));
  assert.deepEqual(await readdir(f.dataDir), []);
  assert.deepEqual(await readFile(join(f.seedDir, 'test-2026.json')), bytes);
  const rotated = new BusinessService({ ...f.options, key: Buffer.alloc(48, 22) });
  assert.equal([...rotated.stores.keys()][0], f.resourceId);
  assert.equal(itineraryResourceId(spaceId, 'test-2026'), f.resourceId);
});

test('typed partial updates preserve every legacy field and have durable revision, idempotency and metadata-only receipts', async t => {
  const f = await fixture(t);
  const original = itinerary(), originalDetails = getPlaceDetails(original.places[0]);
  const before = await readFile(join(f.seedDir, 'test-2026.json'));
  const request = update(f);
  const result = await f.invoke(request);
  assert.equal(result.revision, '1'); assert.equal(result.replayed, false); assert.equal(result.placeId, 'first');
  const store = f.service.stores.get(f.resourceId);
  assert.equal((await stat(store.file)).mode & 0o777, 0o600);
  assert.equal((await stat(dirname(store.file))).mode & 0o777, 0o700);
  const stored = JSON.parse(await readFile(store.file));
  assert.deepEqual(stored.places[0].details, { ...originalDetails, duration });
  delete stored._business;
  assert.deepEqual(withoutDetails(stored), original);
  assert.deepEqual(stored.places[1], original.places[1]);
  const raw = JSON.parse(await readFile(store.file));
  assert.doesNotMatch(JSON.stringify(raw._business), /汉字公园|北京午饭|openingHours|minMinutes/);
  assert.equal(raw._business.receipts.length, 1);
  const restarted = new BusinessService(f.options);
  const replayed = await f.invoke(request, {}, restarted);
  assert.equal(replayed.replayed, true); assert.equal(replayed.revision, '1'); assert.equal(replayed.contentHash, result.contentHash);
  const read = await f.invoke(f.request('read_itinerary'), {}, restarted);
  assert.equal(read.contentHash, result.contentHash); assert.deepEqual(withoutDetails(read.itinerary), original);
  await rejected(f.invoke(update(f, { duration: { kind: 'unknown' } })), 'IDEMPOTENCY_CONFLICT', 409);
  await rejected(f.invoke(update(f, { duration }, { idempotencyKey: 'save-2' })), 'CONFLICT', 409);
  await f.invoke(update(f, { price: { kind: 'unknown' } }, { expectedRevision: '1', idempotencyKey: 'save-2' }));
  const second = await f.invoke(f.request('read_itinerary'));
  assert.deepEqual(second.itinerary.places[0].details.duration, duration);
  assert.deepEqual(second.itinerary.places[0].details.openingHours, originalDetails.openingHours);
  assert.deepEqual(second.itinerary.places[0].details.price, { kind: 'unknown' });
  assert.deepEqual(withoutDetails(second.itinerary), original);
  assert.deepEqual(await readFile(join(f.seedDir, 'test-2026.json')), before);
  const events = await f.invoke(f.request('events', { input: { after: 0 } }));
  assert.equal(events.events.length, 2); assert.equal(events.events[0].actor, undefined); assert.equal(events.events[0].operation, 'update_place_details');
});

test('independent writer instances serialize and only one concurrent expected revision commits', async t => {
  const f = await fixture(t), other = new BusinessService(f.options);
  const result = await Promise.allSettled([f.invoke(update(f)), f.invoke(update(f, { duration: { kind: 'unknown' } }, { idempotencyKey: 'other-save' }), {}, other)]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(result.find(item => item.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal((await f.invoke(f.request('read_itinerary'))).revision, '1');
  const stored = await f.service.stores.get(f.resourceId).read();
  assert.equal(stored.state.receipts.length, 1); assert.equal(stored.state.events.length, 1);
});

test('separate Node processes cannot both commit the same itinerary revision', async t => {
  const f = await fixture(t);
  const worker = `import {BusinessService,itineraryResourceId} from ${JSON.stringify(new URL('../src/business.js', import.meta.url).href)};
    import {createHmac,createHash} from 'node:crypto';
    const key=Buffer.alloc(48,17),root=process.argv[1],name=process.argv[2];
    const service=new BusinessService({key,dataDir:root+'/private',seedDir:root+'/seed',spaces:{'shared-guide':['test-2026']},webSpace:'shared-guide'});
    const request={operation:'update_place_details',spaceId:'shared-guide',resourceId:itineraryResourceId('shared-guide','test-2026'),expectedRevision:'0',idempotencyKey:name,input:{placeId:'first',details:{duration:{kind:'minutes',minMinutes:name==='writer-one'?90:120,maxMinutes:120}}}};
    const raw=Buffer.from(JSON.stringify(request)),claims={v:1,appId:'travel',userId:'writer',clientId:'worker',grantId:'grant',spaceId:'shared-guide',action:'update',resources:[request.resourceId],expiresAt:Date.now()+15000,requestId:name,method:'POST',path:'/api/business',bodyHash:createHash('sha256').update(raw).digest('hex')};
    const payload=Buffer.from(JSON.stringify(claims)).toString('base64url');
    try{const result=await service.handle(raw,payload+'.'+createHmac('sha256',key).update(payload).digest('base64url'));console.log(JSON.stringify({revision:result.revision}));}catch(error){console.log(JSON.stringify({code:error.code}));}`;
  const execute = promisify(execFile);
  const outputs = await Promise.all(['writer-one', 'writer-two'].map(name => execute(process.execPath, ['--input-type=module', '-e', worker, f.root, name], { env: { PATH: process.env.PATH }, maxBuffer: 2000 })));
  const results = outputs.map(item => JSON.parse(item.stdout));
  assert.equal(results.filter(item => item.revision === '1').length, 1);
  assert.equal(results.filter(item => item.code === 'CONFLICT').length, 1);
  assert.equal((await f.service.readSharedTrip('test-2026')).revision, '1');
});

test('assertion, resource, space and action limits reject mutation before creating private files', async t => {
  const f = await fixture(t);
  await rejected(f.invoke(update(f), { action: 'read' }), 'FORBIDDEN', 403);
  await rejected(f.invoke(update(f), { resources: [itineraryResourceId(spaceId, 'other-2026')] }), 'NOT_FOUND', 404);
  await rejected(f.invoke(update(f), { spaceId: 'another-space' }), 'FORBIDDEN', 403);
  await rejected(f.invoke(update(f), { expiresAt: Date.now() - 1 }), 'INVALID_ASSERTION', 401);
  await rejected(f.invoke(update(f), { bodyHash: '0'.repeat(64) }), 'INVALID_ASSERTION', 401);
  await rejected(f.invoke(update(f), { path: '/arbitrary' }), 'INVALID_ASSERTION', 401);
  await rejected(f.service.handle(Buffer.from('{}'), 'unsigned'), 'INVALID_ASSERTION', 401);
  await rejected(f.invoke(f.request('read_itinerary', { input: null })), 'INVALID_INPUT', 400);
  await rejected(f.invoke(f.request('read_itinerary', { input: false })), 'INVALID_INPUT', 400);
  assert.deepEqual(await readdir(f.dataDir), []);
  assert.throws(() => new BusinessService({ ...f.options, spaces: { [spaceId]: ['test-2026'], other: ['test-2026'] } }), /one explicit/);
});

test('full-record operation and arbitrary fields are rejected without changing committed business bytes', async t => {
  const f = await fixture(t); await f.invoke(update(f));
  const store = f.service.stores.get(f.resourceId), before = await readFile(store.file);
  await rejected(f.invoke(f.request('update_itinerary', { input: { itinerary: itinerary() }, expectedRevision: '1', idempotencyKey: 'old-tool' }), { action: 'update' }), 'INVALID_INPUT', 400);
  for (const input of [
    { placeId: 'first', details: { duration }, name: 'changed' }, { placeId: 'first', details: { duration }, image: 'other.png' },
    { placeId: 'first', details: { duration }, days: [] }, { placeId: 'first', details: { duration }, budget: {} },
    { placeId: 'first', details: { duration }, leg: { durationSeconds: 30 } }, { placeId: 'first', details: { duration }, itinerary: itinerary() },
  ]) await rejected(f.invoke(f.request('update_place_details', { expectedRevision: '1', idempotencyKey: 'blocked', input })), 'INVALID_INPUT', 400);
  for (const details of [
    {}, { duration: '建议1小时' }, { openingHours: '08:00-17:00' }, { price: '待核实' },
    { duration: { kind: 'minutes', minMinutes: '90', maxMinutes: 120 } }, { price: { kind: 'amount', amountCents: '100', currency: 'CNY', basis: 'person' } },
    { openingHours: { kind: 'hours', periods: [{ opens: '08:00', closes: '17:00', nextDay: 'false' }] } },
    { duration: { kind: 'minutes', minMinutes: 121, maxMinutes: 120 } }, { duration: { kind: 'nights', nights: 31 } },
    { openingHours: { kind: 'hours', periods: [{ opens: '24:00', closes: '01:00', nextDay: true }] } },
    { openingHours: { kind: 'hours', periods: [{ opens: '08:00', closes: '12:00', nextDay: false }, { opens: '11:00', closes: '13:00', nextDay: false }] } },
    { price: { kind: 'range', minCents: 900, maxCents: 800, currency: 'CNY', basis: 'person' } },
    { price: { kind: 'amount', amountCents: -1, currency: 'CNY', basis: 'person' } },
    { price: { kind: 'amount', amountCents: 100, currency: 'BAD', basis: 'person' } },
    { name: 'changed' }, { duration: { kind: 'unknown', note: 'arbitrary narrative' } }, { price: null },
  ]) await rejected(f.invoke(update(f, details, { expectedRevision: '1', idempotencyKey: 'invalid' })), 'INVALID_PLACE_DETAILS', 400);
  assert.deepEqual(await readFile(store.file), before);
  await rejected(f.invoke(update(f, { duration }, { expectedRevision: '1', idempotencyKey: 'missing-place', input: { placeId: 'absent', details: { duration } } })), 'NOT_FOUND', 404);
  assert.deepEqual(await readFile(store.file), before);
});

test('legacy private v1 data remains unchanged on read and typed invalid data cannot silently use legacy strings', async t => {
  const f = await fixture(t); await f.invoke(update(f));
  const store = f.service.stores.get(f.resourceId);
  const value = JSON.parse(await readFile(store.file)); delete value.places[0].details;
  value._business.events[0].operation = 'update_itinerary'; value._business.receipts[0].result.event.operation = 'update_itinerary';
  await writeFile(store.file, JSON.stringify(value));
  const before = await readFile(store.file), read = await f.invoke(f.request('read_itinerary'));
  assert.equal(read.itinerary.places[0].details, undefined); assert.deepEqual(read.editablePlaceDetails[0].details, getPlaceDetails(value.places[0]));
  assert.deepEqual(await readFile(store.file), before);
  value.places[0].details = { duration: 'bad' }; await writeFile(store.file, JSON.stringify(value));
  await rejected(f.invoke(f.request('read_itinerary')), 'CORRUPT_DATA', 422);
});

test('private corruption and symlinked namespaces fail closed instead of falling back to the seed', async t => {
  const f = await fixture(t); await f.invoke(update(f));
  const store = f.service.stores.get(f.resourceId);
  await writeFile(store.file, '{broken private json');
  await rejected(f.invoke(f.request('read_itinerary')), 'CORRUPT_DATA', 422);
  await rm(dirname(store.file), { recursive: true });
  const outside = join(f.root, 'outside'); await mkdir(outside); await symlink(outside, dirname(store.file));
  await rejected(f.invoke(f.request('read_itinerary')), 'CORRUPT_DATA', 422);
  await rejected(f.invoke(update(f)), 'UNSAFE_DATA_PATH', 503);
});

test('expired commit authorization leaves the seed intact and recovery does not auto-delete stale locks', async t => {
  let now = 1800000000000;
  const f = await fixture(t, { now: () => now });
  const store = f.service.stores.get(f.resourceId), write = store.atomicWrite.bind(store);
  store.atomicWrite = async (...args) => { now += 20000; return write(...args); };
  await rejected(f.invoke(update(f)), 'INVALID_ASSERTION', 401);
  assert.equal((await store.read()).revision, '0');
  assert.equal((await readdir(dirname(store.file))).some(name => name.endsWith('.tmp') || name.endsWith('.lock')), false);
  await writeFile(store.file + '.lock', '2147483647', { mode: 0o600 });
  await rejected(store.lock(async () => {}), 'STALE_LOCK', 503);
  assert.equal(await readFile(store.file + '.lock', 'utf8'), '2147483647');
});
