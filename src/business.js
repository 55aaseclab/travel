import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, join } from 'node:path';
import { ItineraryStore, itineraryResourceId, canonical } from './itinerary-store.js';
import { DATA_DIR } from './itinerary-map-service.js';
import { resolveContentPaths } from './content-paths.js';
import { createAMapClient } from './amap-client.js';
import { createFliggyClient } from './fliggy-client.js';
import { fail, fields, identifier, object, resourcePattern, tripPattern, validatePlanningMutation } from './itinerary-schema.js';
import { validatePlaceDetails, getPlaceDetails } from './place-display.js';

const actions = Object.freeze({ list_itineraries: 'read', read_itinerary: 'read', update_place_details: 'update', upsert_place:'update', set_day_plan:'update', set_budget_item:'update', search_places: 'read', get_place: 'read', plan_route: 'read', query_travel_services: 'read', events: 'read', integrity: 'read' });
const hash = value => createHash('sha256').update(value).digest('hex');
export { itineraryResourceId };

export function verifyAssertion(raw, assertion, key, now = Date.now()) {
  const invalid = () => fail('A valid business assertion is required', 401, 'INVALID_ASSERTION');
  if (typeof assertion !== 'string' || assertion.length > 32768) invalid();
  const parts = assertion.split('.');
  if (parts.length !== 2 || parts.some(value => !/^[A-Za-z0-9_-]+$/.test(value))) invalid();
  const signature = Buffer.from(parts[1], 'base64url'), expected = createHmac('sha256', key).update(parts[0]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) invalid();
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { invalid(); }
  const keys = ['v', 'appId', 'userId', 'clientId', 'grantId', 'spaceId', 'action', 'resources', 'expiresAt', 'requestId', 'method', 'path', 'bodyHash'];
  if (!object(claims) || Object.keys(claims).length !== keys.length || keys.some(name => !Object.hasOwn(claims, name))) invalid();
  if (claims.v !== 1 || claims.appId !== 'travel' || claims.method !== 'POST' || claims.path !== '/api/business' || claims.bodyHash !== hash(raw) || !['read', 'update'].includes(claims.action)) invalid();
  if (!['userId', 'clientId', 'grantId', 'spaceId', 'requestId'].every(name => identifier(claims[name])) || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= now || claims.expiresAt > now + 30000) invalid();
  if (!Array.isArray(claims.resources) || !claims.resources.length || claims.resources.length > 1000 || new Set(claims.resources).size !== claims.resources.length || claims.resources.some(id => id !== '*' && !resourcePattern.test(id)) || claims.resources.includes('*') && claims.resources.length !== 1) invalid();
  return claims;
}

export function loadBusinessService(env = process.env, options = {}) {
  const names = ['TRAVEL_DATA_DIR', 'TRAVEL_BUSINESS_KEY_FILE', 'TRAVEL_BUSINESS_CONFIG_FILE'];
  if (names.every(name => !env[name])) return null;
  if (names.some(name => typeof env[name] !== 'string' || !isAbsolute(env[name]))) throw new Error('Travel business mode requires absolute data, key and configuration paths');
  for (const name of names.slice(1)) {
    const info = lstatSync(env[name]);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077) throw new Error('Travel business key and configuration must be private regular files');
  }
  const configBytes = readFileSync(env.TRAVEL_BUSINESS_CONFIG_FILE);
  if (configBytes.length > 16384) throw new Error('Travel business configuration is too large');
  let config;
  try { config = JSON.parse(configBytes); } catch { throw new Error('Travel business configuration must contain valid JSON'); }
  if (!object(config) || Object.keys(config).some(name => !['version', 'webSpace', 'spaces'].includes(name)) || config.version !== 1) throw new Error('Travel business configuration version is invalid');
  return new BusinessService({ seedDir: resolveContentPaths(env).seedDir, ...options, key: readFileSync(env.TRAVEL_BUSINESS_KEY_FILE), dataDir: env.TRAVEL_DATA_DIR, spaces: config.spaces, webSpace: config.webSpace });
}

export class BusinessService {
  constructor({ key, dataDir, spaces, webSpace, seedDir = DATA_DIR, now = Date.now, mapOptions = {}, fliggyOptions = {} }) {
    if (!Buffer.isBuffer(key) || key.length < 32 || key.length > 4096 || typeof dataDir !== 'string' || !isAbsolute(dataDir)) throw new Error('Travel business key and working directory are invalid');
    if (!object(spaces) || Object.keys(spaces).length !== 1 || !identifier(webSpace) || !Object.hasOwn(spaces, webSpace)) throw new Error('Travel pilot requires one explicit shared-guide web space');
    const ids = spaces[webSpace];
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || id.length > 80 || !tripPattern.test(id))) throw new Error('Travel business space requires unique declared trip IDs');
    this.key = Buffer.from(key); this.now = now; this.seedDir = resolve(seedDir); this.webSpace = webSpace;
    this.stores = new Map(ids.map(tripId => { const store = new ItineraryStore({ key, dataDir, seedDir, spaceId: webSpace, tripId, now }); return [store.resourceId, store]; }));
    this.mapClient = createAMapClient({ ...mapOptions, mapClock: mapOptions.mapClock || now });
    this.fliggyClient = createFliggyClient({ ...fliggyOptions, clock: fliggyOptions.clock || now });
  }

  hasTrip(tripId) { return [...this.stores.values()].some(store => store.tripId === tripId); }
  async readSharedTrip(tripId) {
    const store = [...this.stores.values()].find(item => item.tripId === tripId);
    if (!store) fail('Itinerary not found', 404, 'NOT_FOUND');
    return store.read();
  }
  async title(tripId) {
    try {
      const raw = await readFile(join(this.seedDir, 'trips.json'));
      if (raw.length > 1024 * 1024) return tripId;
      const value = JSON.parse(raw);
      const trip = Array.isArray(value.trips) && value.trips.find(item => item.id === tripId);
      return typeof trip?.title === 'string' && trip.title.length <= 200 ? trip.title : tripId;
    } catch { return tripId; }
  }

  async handle(raw, assertion) {
    const claims = verifyAssertion(raw, assertion, this.key, this.now());
    let request;
    try { request = JSON.parse(raw.toString('utf8')); } catch { fail('Business request must contain valid JSON'); }
    fields(request, ['operation', 'spaceId'], ['resourceId', 'input', 'expectedRevision', 'idempotencyKey']);
    if (typeof request.operation !== 'string' || !Object.hasOwn(actions, request.operation)) fail('Unsupported business operation');
    if (request.spaceId !== this.webSpace || claims.spaceId !== request.spaceId || claims.action !== actions[request.operation]) fail('Business scope is not authorized', 403, 'FORBIDDEN');
    const input = request.input === undefined ? {} : request.input;
    if (!object(input)) fail('Business input must be an object');
    const allowed = id => claims.resources.includes('*') || claims.resources.includes(id);
    if (request.operation === 'list_itineraries' || request.operation === 'integrity') {
      if (request.resourceId !== undefined || request.expectedRevision !== undefined || request.idempotencyKey !== undefined) fail('List operations do not accept a target or mutation controls');
      fields(input, []);
      if (request.operation === 'integrity' && !claims.resources.includes('*')) fail('Integrity requires whole-space read scope', 403, 'FORBIDDEN');
      const items = [];
      for (const [id, store] of this.stores) if (allowed(id)) { const snapshot = await store.read(); items.push({ resourceId: id, revision: snapshot.revision, tripId: store.tripId, title: await this.title(store.tripId), updatedAt: snapshot.updatedAt }); }
      if (claims.expiresAt <= this.now()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
      return request.operation === 'integrity' ? { spaceId: request.spaceId, resourceCount: items.length, revisions: items.map(({ resourceId, revision }) => ({ resourceId, revision })) } : { spaceId: request.spaceId, items };
    }
    if (typeof request.resourceId !== 'string' || !resourcePattern.test(request.resourceId)) fail('An itinerary resource ID is required');
    const store = this.stores.get(request.resourceId);
    if (!store || !allowed(request.resourceId)) fail('Itinerary not found', 404, 'NOT_FOUND');
    if (['update_place_details','upsert_place','set_day_plan','set_budget_item'].includes(request.operation)) {
      if (request.operation === 'update_place_details') {
      fields(input, ['placeId', 'details']);
      if (typeof input.placeId !== 'string' || input.placeId.length > 80 || !tripPattern.test(input.placeId)) fail('A valid place identifier is required');
      validatePlaceDetails(input.details, { partial: true });
      } else validatePlanningMutation(request.operation,input);
      if (typeof request.expectedRevision !== 'string' || !/^(?:0|[1-9]\d{0,14})$/.test(request.expectedRevision)) fail('An itinerary revision is required', 428, 'REVISION_REQUIRED');
      if (!identifier(request.idempotencyKey)) fail('An idempotency key is required', 428, 'IDEMPOTENCY_REQUIRED');
      return store.mutate(request, claims);
    }
    if (request.expectedRevision !== undefined || request.idempotencyKey !== undefined) fail('Read operations do not accept mutation controls');
    const snapshot = await store.read();
    let result;
    if (request.operation === 'read_itinerary') { fields(input, []); result = { spaceId: request.spaceId, resourceId: request.resourceId, revision: snapshot.revision, contentHash: hash(canonical(snapshot.itinerary)), itinerary: snapshot.itinerary, editablePlaceDetails: snapshot.itinerary.places.map(place => ({ placeId: place.id, details: getPlaceDetails(place) })) }; }
    else if (request.operation === 'events') {
      fields(input, [], ['after']);
      const after = input.after ?? 0;
      if (!Number.isSafeInteger(after) || after < 0) fail('Event cursor must be a nonnegative integer');
      const minCursor = snapshot.state.events[0]?.cursor ?? snapshot.cursor + 1;
      const resetRequired = after < minCursor - 1 || after > snapshot.cursor;
      result = { spaceId: request.spaceId, resourceId: request.resourceId, revision: snapshot.revision, cursor: snapshot.cursor, minCursor, resetRequired, events: resetRequired ? [] : snapshot.state.events.filter(item => item.cursor > after).map(({ actor, ...item }) => item) };
    } else if (request.operation === 'query_travel_services') {
      result = { spaceId: request.spaceId, resourceId: request.resourceId, ...await this.fliggyClient.query(input, { expiresAt: claims.expiresAt }) };
    } else {
      result = { spaceId: request.spaceId, resourceId: request.resourceId, ...await this.mapClient.query({ search_places: 'search', get_place: 'detail', plan_route: 'route' }[request.operation], input, { expiresAt: claims.expiresAt }) };
    }
    if (claims.expiresAt <= this.now()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
    return result;
  }
}
