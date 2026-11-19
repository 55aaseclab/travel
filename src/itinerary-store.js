import { createHash, randomUUID } from 'node:crypto';
import { readFile, lstat, mkdir, open, unlink, realpath } from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, relative, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DATA_DIR } from './itinerary-map-service.js';
import { fail, TravelError, validateTravelItinerary, validatePlanningMutation, identifier, tripPattern, resourcePattern, object, fields } from './itinerary-schema.js';
import { validatePlaceDetails, getPlaceDetails } from './place-display.js';
import { projectLegacyItinerary } from './legacy-itinerary.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => Array.isArray(value) ? value.map(normalize) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
export const canonical = value => JSON.stringify(normalize(value));
export function itineraryResourceId(spaceId, tripId) {
  if (!identifier(spaceId) || typeof tripId !== 'string' || tripId.length > 80 || !tripPattern.test(tripId)) throw new Error('Invalid itinerary resource identity');
  return 'trv_' + hash(canonical(['travel', spaceId, tripId])).slice(0, 32);
}
const MAX_FILE = 16 * 1024 * 1024;

async function safeRead(file, max) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max) fail('Data source is unsafe', 422, 'CORRUPT_DATA');
  const raw = await readFile(file);
  if (raw.length > max) fail('Data source is too large', 422, 'CORRUPT_DATA');
  return raw;
}

export class ItineraryStore {
  constructor({ dataDir, seedDir = DATA_DIR, spaceId, tripId, key, now = Date.now }) {
    if (typeof dataDir !== 'string' || !isAbsolute(dataDir) || !identifier(spaceId) || typeof tripId !== 'string' || tripId.length > 80 || !tripPattern.test(tripId) || !Buffer.isBuffer(key) || key.length < 32) throw new Error('Invalid itinerary store configuration');
    this.dataDir = resolve(dataDir); this.seedDir = resolve(seedDir); this.spaceId = spaceId; this.tripId = tripId; this.now = now;
    this.resourceId = itineraryResourceId(spaceId, tripId);
    this.file = join(this.dataDir, hash(spaceId).slice(0, 24), tripId + '.json');
    this.seedFile = join(this.seedDir, tripId + '.json');
  }

  async seed() {
    try {
      const [root, file] = await Promise.all([realpath(this.seedDir), realpath(this.seedFile)]);
      const path = relative(root, file);
      if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) fail('Seed source is unsafe', 422, 'CORRUPT_DATA');
      const data = JSON.parse(await safeRead(this.seedFile, 512 * 1024));
      return validateTravelItinerary(data, this.tripId);
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          const read = async name => {
            const file = join(this.seedDir, name), path = relative(await realpath(this.seedDir), await realpath(file));
            if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) fail('Seed metadata is unsafe', 422, 'CORRUPT_DATA');
            return JSON.parse(await safeRead(file, 1024 * 1024));
          };
          const [trips, routes] = await Promise.all([read('trips.json'), read('routes.json')]);
          return validateTravelItinerary(projectLegacyItinerary(trips.trips.find(trip => trip.id === this.tripId), routes.routes.find(route => route.id === this.tripId)), this.tripId);
        } catch { fail('Seed itinerary is unavailable', 422, 'CORRUPT_DATA'); }
      }
      if (error instanceof TravelError) throw error; fail('Seed itinerary is unavailable', 422, 'CORRUPT_DATA');
    }
  }

  async read() {
    let raw;
    try {
      const base = await lstat(this.dataDir);
      if (!base.isDirectory() || base.isSymbolicLink() || await realpath(this.dataDir) !== this.dataDir) fail('Working data path is unsafe', 422, 'CORRUPT_DATA');
      const parent = await lstat(dirname(this.file));
      if (!parent.isDirectory() || parent.isSymbolicLink() || await realpath(dirname(this.file)) !== dirname(this.file)) fail('Working namespace is unsafe', 422, 'CORRUPT_DATA');
      raw = await safeRead(this.file, MAX_FILE);
    }
    catch (error) {
      if (error.code === 'ENOENT') return { itinerary: await this.seed(), revision: '0', cursor: 0, updatedAt: null, state: { resourceId: this.resourceId, revision: 0, cursor: 0, updatedAt: null, receipts: [], events: [] } };
      throw error;
    }
    try {
      const value = JSON.parse(raw);
      const state = value._business;
      delete value._business;
      validateTravelItinerary(value, this.tripId);
      if (!object(state) || state.version !== 1 || state.resourceId !== this.resourceId || !resourcePattern.test(state.resourceId) || !Number.isSafeInteger(state.revision) || state.revision < 1 || !Number.isSafeInteger(state.cursor) || state.cursor !== state.revision || typeof state.updatedAt !== 'string' || !Array.isArray(state.receipts) || !Array.isArray(state.events) || state.events.length > 2048) fail('Invalid itinerary control metadata', 422, 'CORRUPT_DATA');
      for (const item of state.receipts) if (!object(item) || !/^[a-f0-9]{64}$/.test(item.scopeKey) || !/^[a-f0-9]{64}$/.test(item.requestHash) || !object(item.result) || item.result.resourceId !== this.resourceId || !/^[1-9]\d{0,14}$/.test(item.result.revision)) fail('Invalid itinerary receipt metadata', 422, 'CORRUPT_DATA');
      return { itinerary: value, revision: String(state.revision), cursor: state.cursor, updatedAt: state.updatedAt, state };
    } catch (error) { if (error instanceof TravelError && error.code === 'CORRUPT_DATA') throw error; fail('Private itinerary is invalid; nothing was overwritten', 422, 'CORRUPT_DATA'); }
  }

  async lock(callback) {
    const base = await realpath(this.dataDir);
    if (base !== this.dataDir) fail('Working data paths must be canonical', 503, 'UNSAFE_DATA_PATH');
    try { await mkdir(dirname(this.file), { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const parent = await realpath(dirname(this.file));
    if (parent !== dirname(this.file)) fail('Working data paths must be canonical', 503, 'UNSAFE_DATA_PATH');
    const lockFile = this.file + '.lock', deadline = Date.now() + 5000;
    let handle;
    while (!handle) {
      try { handle = await open(lockFile, 'wx', 0o600); await handle.writeFile(String(process.pid)); }
      catch (error) {
        if (error.code !== 'EEXIST') { if (handle) { await handle.close(); await unlink(lockFile).catch(() => {}); } throw error; }
        let pid;
        try { pid = Number(await readFile(lockFile, 'utf8')); } catch (readError) { if (readError.code !== 'ENOENT') throw readError; }
        if (Number.isSafeInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (probeError) { if (probeError.code === 'ESRCH') fail('Stale lock requires recovery after all writers stop', 503, 'STALE_LOCK'); }
        }
        if (Date.now() > deadline) fail('Itinerary is being written', 503, 'LOCKED');
        await delay(20);
      }
    }
    try { return await callback(); }
    finally { await handle.close(); await unlink(lockFile).catch(() => {}); }
  }

  async atomicWrite(value, expiresAt) {
    const raw = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (raw.length > MAX_FILE) fail('Itinerary history has reached its storage limit', 507, 'STATE_LIMIT');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    let handle, committed = false;
    try {
      handle = await open(temporary, 'wx', 0o600); await handle.writeFile(raw); await handle.sync(); await handle.close(); handle = null;
      if (expiresAt <= this.now()) fail('Business assertion expired before commit', 401, 'INVALID_ASSERTION');
      renameSync(temporary, this.file); committed = true;
      const directory = await open(dirname(this.file), 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (error) {
      if (committed) fail('The write may have committed; retry with the same idempotency key', 503, 'OUTCOME_UNKNOWN');
      throw error;
    } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
  }

  async updatePlaceDetails(request, claims) {
    if (request.operation !== 'update_place_details') fail('Unsupported itinerary mutation');
    return this.mutate(request, claims);
  }

  async mutate(request, claims) {
    if (request.operation === 'update_place_details') { fields(request.input, ['placeId', 'details']); validatePlaceDetails(request.input.details, { partial:true }); }
    else validatePlanningMutation(request.operation, request.input);
    return this.lock(async () => {
      if (claims.expiresAt <= this.now()) fail('Business assertion expired before commit', 401, 'INVALID_ASSERTION');
      const current = await this.read();
      const scopeKey = hash(canonical([claims.userId, claims.clientId, this.spaceId, request.idempotencyKey]));
      const requestHash = hash(canonical(request));
      const previous = current.state.receipts.find(item => item.scopeKey === scopeKey);
      if (previous) {
        if (previous.requestHash !== requestHash) fail('Idempotency key was reused for a different request', 409, 'IDEMPOTENCY_CONFLICT');
        return { ...previous.result, replayed: true };
      }
      if (request.expectedRevision !== current.revision) fail('Itinerary changed; read the current revision before retrying', 409, 'CONFLICT');
      const itinerary = structuredClone(current.itinerary);
      let targetInfo;
      if (request.operation === 'update_place_details') {
        const target = itinerary.places.find(place => place.id === request.input.placeId);
        if (!target) fail('Place not found', 404, 'NOT_FOUND');
        target.details = { ...getPlaceDetails(target), ...structuredClone(request.input.details) }; validatePlaceDetails(target.details);
        targetInfo = { placeId: target.id };
      } else targetInfo = applyPlanningMutation(itinerary, request.operation, request.input);
      validateTravelItinerary(itinerary, this.tripId);
      const state = current.state;
      const revision = state.revision + 1;
      if (!Number.isSafeInteger(revision) || revision > 999999999999999) fail('Itinerary revision limit reached', 507, 'STATE_LIMIT');
      const committedAt = new Date(this.now()).toISOString();
      const event = { id: randomUUID(), cursor: revision, resourceId: this.resourceId, revision: String(revision), operation: request.operation, requestId: claims.requestId, committedAt };
      const result = { spaceId: this.spaceId, resourceId: this.resourceId, ...targetInfo, revision: String(revision), contentHash: hash(canonical(itinerary)), cursor: revision, event, replayed: false };
      state.version = 1; state.resourceId = this.resourceId; state.revision = revision; state.cursor = revision; state.updatedAt = committedAt;
      state.events.push({ ...event, actor: { userId: claims.userId, clientId: claims.clientId, grantId: claims.grantId } }); state.events = state.events.slice(-2048);
      state.receipts.push({ scopeKey, requestHash, result });
      await this.atomicWrite({ ...itinerary, _business: state }, claims.expiresAt);
      return result;
    });
  }
}

function applyPlanningMutation(itinerary, operation, input) {
  if (operation === 'upsert_place') {
    const patch = structuredClone(input.patch);
    let target = itinerary.places.find(place => place.id === input.placeId);
    if (!target) {
      if (!['name', 'type', 'query'].every(key => Object.hasOwn(patch, key))) fail('New places require a name, type and query');
      target = { id:input.placeId, image:null, details:{duration:{kind:'unknown'},openingHours:{kind:'unknown'},price:{kind:'unknown'}} };
      itinerary.places.push(target);
    }
    const changed = ['name','query','poiId','city','county'].some(key => Object.hasOwn(patch,key) && patch[key] !== target[key]);
    const details = { ...(changed ? {duration:{kind:'unknown'},openingHours:{kind:'unknown'},price:{kind:'unknown'}} : getPlaceDetails(target)), ...(patch.details || {}) };
    if (changed) target.image=null;
    if (changed && !Object.hasOwn(patch,'position')) delete target.position;
    if (changed && !Object.hasOwn(patch,'poiId')) delete target.poiId;
    delete patch.details; Object.assign(target,patch); target.details=details;
    return {placeId:target.id};
  }
  const dates = new Set(itinerary.days.map(day=>day.date));
  if (operation === 'set_day_plan') {
    const day = itinerary.days.find(day=>day.date===input.date);
    if (!day) fail('Only existing itinerary dates can be planned');
    if (input.stops.some(stop=>!itinerary.places.some(place=>place.id===stop.placeId))) fail('Planned stops must reference existing places');
    if (day.stops[0]?.place !== input.stops[0]?.placeId) delete day.arrival;
    if (input.title !== undefined) day.title=input.title;
    day.stops=input.stops.map(stop=>({place:stop.placeId,time:stop.time})); day.legs=structuredClone(input.legs);
    return {date:day.date};
  }
  if (input.dates.some(date=>!dates.has(date))) fail('Budget dates must belong to the itinerary');
  for (const group of itinerary.budget.groups) group.items=group.items.filter(item=>item.id!==input.itemId);
  let group=itinerary.budget.groups.find(group=>group.id===input.category);
  if (!group) { group={id:input.category,name:{attractions:'景点',transport:'交通',stays:'住宿',food:'餐饮'}[input.category],items:[]}; itinerary.budget.groups.push(group); }
  group.items.push({id:input.itemId,name:input.name,dates:[...input.dates],status:'estimated',estimatedAmount:input.estimatedAmount,...(input.estimatedMaxAmount===undefined?{}:{estimatedMaxAmount:input.estimatedMaxAmount}),bookedAmount:null});
  return {itemId:input.itemId};
}
