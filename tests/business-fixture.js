import { createHmac, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessService, itineraryResourceId } from '../src/business.js';

export const key = Buffer.alloc(48, 17);
export const spaceId = 'shared-guide';
export function itinerary(tripId = 'test-2026') {
  const place = (id, name) => ({ id, name, type: 'attraction', city: '北京', query: name, image: 'snow.png', duration: '1小时', openingHours: '待核实', price: '待核实' });
  return { schemaVersion: 1, tripId, travelers: 2, places: [place('first', '汉字公园'), place('second', '北京午饭')], days: Array.from({ length: 7 }, (_, index) => ({ date: `2026-12-${24 + index}`, title: '一天的安排', stops: [{ place: 'first', time: '09:00' }, { place: 'second', time: '12:00' }], legs: [{ mode: '步行', duration: '待核实', distance: '待核实' }] })), budget: { currency: 'CNY', groups: [] }, preparation: { beforeDeparture: [], moments: [] } };
}
export async function fixture(t, { now = Date.now, mapOptions, secondTrip = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'travel-business-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seedDir = join(root, 'seed'), dataDir = join(root, 'private'), publicDir = join(root, 'public');
  for (const dir of [seedDir, dataDir, publicDir]) await mkdir(dir, { mode: 0o700 });
  const tripIds = ['test-2026', ...(secondTrip ? ['other-2026'] : [])];
  for (const tripId of tripIds) await writeFile(join(seedDir, tripId + '.json'), JSON.stringify(itinerary(tripId)));
  const options = { key, dataDir, seedDir, spaces: { [spaceId]: tripIds }, webSpace: spaceId, now, mapOptions };
  const service = new BusinessService(options);
  const resourceId = itineraryResourceId(spaceId, 'test-2026');
  const request = (operation, extra = {}) => ({ operation, spaceId, ...(operation !== 'list_itineraries' ? { resourceId } : {}), ...extra });
  const invoke = (request, overrides = {}, target = service) => {
    const raw = Buffer.from(JSON.stringify(request));
    const claims = { v: 1, appId: 'travel', userId: 'reader', clientId: 'client', grantId: 'grant', spaceId, action: request.operation === 'update_place_details' ? 'update' : 'read', resources: [resourceId], expiresAt: now() + 15000, requestId: 'request-1', method: 'POST', path: '/api/business', bodyHash: createHash('sha256').update(raw).digest('hex'), ...overrides };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const assertion = payload + '.' + createHmac('sha256', key).update(payload).digest('base64url');
    return target.handle(raw, assertion);
  };
  return { root, seedDir, dataDir, publicDir, service, options, resourceId, request, invoke };
}
