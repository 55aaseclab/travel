import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DATA_DIR } from './itinerary-map-service.js';

const MAX_BODY = 1024 * 1024;
const MAX_POINTS = 8192;
const TRIP_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const COORDINATE = /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?,-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/;

function send(req, res, status, value) {
  if (res.destroyed) return;
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

async function readBounded(file, max) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max) throw new Error('Invalid map source.');
  const bytes = await readFile(file);
  if (bytes.length > max) throw new Error('Invalid map source.');
  return bytes;
}

export async function readWebServiceCredentials(file) {
  if (!file || !isAbsolute(file)) return null;
  try {
    const info = await lstat(file);
    if (info.mode & 0o077) return null;
    const value = JSON.parse(await readBounded(file, 16384));
    if (typeof value.webServiceKey !== 'string' || !/^[a-f0-9]{32}$/i.test(value.webServiceKey)) return null;
    return { key: value.webServiceKey, secrets: ['key', 'securityJsCode', 'webServiceKey'].map(name => value[name]).filter(secret => typeof secret === 'string' && /^[a-f0-9]{32}$/i.test(secret)) };
  } catch { return null; }
}

function position(value, strict = false) {
  if (typeof value !== 'string' || value.length > 64 || strict && !COORDINATE.test(value)) return null;
  const parts = value.split(',');
  if (parts.length !== 2 || parts.some(part => !part.trim() || !/^-?\d+(?:\.\d+)?$/.test(part))) return null;
  const [lng, lat] = parts.map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? { lng, lat } : null;
}

function text(value, max, required = false) {
  if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) || [...value].length > max || required && !value.trim()) return null;
  return value.trim();
}

export function requestValues(operation, params) {
  const keys = operation === 'search' ? ['keywords', 'city'] : ['mode', 'origin', 'destination', 'crs'];
  if ([...params.keys()].length !== keys.length || keys.some(key => params.getAll(key).length !== 1) || [...params.keys()].some(key => !keys.includes(key))) return null;
  if (operation === 'search') {
    const keywords = text(params.get('keywords'), 80, true);
    const city = text(params.get('city'), 40, true);
    return keywords && city ? { keywords, city } : null;
  }
  const mode = params.get('mode');
  const origin = position(params.get('origin'), true);
  const destination = position(params.get('destination'), true);
  return ['driving', 'walking'].includes(mode) && params.get('crs') === 'GCJ02' && origin && destination ? { mode, origin, destination } : null;
}

export function upstreamUrl(operation, values, key) {
  const url = new URL(operation === 'search' ? '/v5/place/text' : `/v5/direction/${values.mode}`, 'https://restapi.amap.com');
  url.searchParams.set('key', key);
  url.searchParams.set('output', 'json');
  if (operation === 'search') {
    for (const [name, value] of Object.entries({ keywords: values.keywords, region: values.city, city_limit: 'true', page_size: '10', page_num: '1' })) url.searchParams.set(name, value);
  } else {
    url.searchParams.set('origin', `${values.origin.lng},${values.origin.lat}`);
    url.searchParams.set('destination', `${values.destination.lng},${values.destination.lat}`);
    url.searchParams.set('show_fields', 'cost,polyline');
    if (values.mode === 'driving') url.searchParams.set('strategy', '32');
    else { url.searchParams.set('alternative_route', '1'); url.searchParams.set('isindoor', '0'); }
  }
  return url;
}

function number(value) {
  if (!(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) || typeof value === 'number' && Number.isFinite(value))) return null;
  const parsed = Number(value);
  return parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

export function searchResult(value) {
  if (!Array.isArray(value.pois)) throw new Error('Invalid map provider response.');
  const pois = [];
  for (const item of value.pois.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue;
    const id = text(item.id, 128, true), name = text(item.name, 200, true), point = position(item.location);
    if (!id || !name || !point) continue;
    pois.push({ id, name, address: text(item.address, 500) || '', city: text(item.cityname, 80) || '', category: text(item.type, 200) || '', position: point });
  }
  return { provider: 'amap', crs: 'GCJ02', pois };
}

export function routeResult(value, mode) {
  if (!value.route || !Array.isArray(value.route.paths)) throw new Error('Invalid map provider response.');
  const path = value.route.paths[0];
  if (!path) return { provider: 'amap', crs: 'GCJ02', mode, route: null };
  if (typeof path !== 'object' || path.steps !== undefined && !Array.isArray(path.steps)) throw new Error('Invalid map provider response.');
  const polyline = [];
  for (const step of path.steps || []) {
    if (!step || typeof step !== 'object' || step.polyline === undefined || step.polyline === '') continue;
    if (typeof step.polyline !== 'string') throw new Error('Invalid map provider path.');
    for (const coordinates of step.polyline.split(';')) {
      const point = position(coordinates);
      if (!point) throw new Error('Invalid map provider path.');
      const previous = polyline.at(-1);
      if (!previous || previous.lng !== point.lng || previous.lat !== point.lat) polyline.push(point);
      if (polyline.length > MAX_POINTS) throw new Error('Map provider path is too large.');
    }
  }
  return { provider: 'amap', crs: 'GCJ02', mode, route: { distanceMeters: number(path.distance), durationSeconds: number(path.cost?.duration), polyline } };
}

export async function providerJson(response, signal, secrets) {
  if (!response.ok || !response.body) throw new Error('Map provider unavailable.');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('Map provider timed out.');
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY) throw new Error('Map provider response is too large.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = Buffer.concat(chunks).toString('utf8');
  if (secrets.some(secret => body.toLowerCase().includes(secret.toLowerCase()))) throw new Error('Unsafe map provider response.');
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value) || String(value.status) !== '1') throw new Error('Map provider unavailable.');
  const normalized = JSON.stringify(value).toLowerCase();
  if (secrets.some(secret => normalized.includes(secret.toLowerCase()))) throw new Error('Unsafe map provider response.');
  return value;
}

export function createWebServiceHandler({ dataDir = DATA_DIR, mapConfigFile = process.env.TRAVEL_AMAP_CONFIG, mapFetch = globalThis.fetch, mapClock = Date.now, mapTimeoutMs = 8000, mapReadItinerary } = {}) {
  const root = resolve(dataDir);
  const config = readWebServiceCredentials(mapConfigFile);
  const cache = new Map();
  let cacheBytes = 0, active = 0, rateCount = 0, rateStart = mapClock();

  async function knownTrip(id) {
    if (!TRIP_ID.test(id)) return false;
    try {
      const winning = mapReadItinerary && await mapReadItinerary(id);
      if (winning) return winning.tripId === id && Array.isArray(winning.places);
      const file = join(root, id + '.json');
      const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
      const path = relative(realRoot, realFile);
      if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) return false;
      const value = JSON.parse(await readBounded(file, MAX_BODY));
      return value && value.tripId === id && Array.isArray(value.places) && value.places.length <= 200;
    } catch { return false; }
  }

  function cached(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expiresAt <= mapClock()) { cache.delete(key); cacheBytes -= item.bytes; return null; }
    cache.delete(key); cache.set(key, item);
    return item.value;
  }

  function remember(key, value, operation, mode) {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > MAX_BODY) return;
    const previous = cache.get(key);
    if (previous) { cacheBytes -= previous.bytes; cache.delete(key); }
    while (cache.size >= 64 || cacheBytes + bytes > 8 * MAX_BODY) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      cacheBytes -= cache.get(first).bytes; cache.delete(first);
    }
    cache.set(key, { value, bytes, expiresAt: mapClock() + (operation === 'route' && mode === 'driving' ? 300000 : 3600000) });
    cacheBytes += bytes;
  }

  return async function handleWebService(req, res, pathname) {
    const match = /^\/([a-z0-9][a-z0-9-]{0,79})\/map\/(search|route)$/.exec(pathname);
    if (!match) return false;
    if (!['GET', 'HEAD'].includes(req.method)) { send(req, res, 405, { error: 'METHOD_NOT_ALLOWED' }); return true; }
    let url;
    try { url = new URL(req.url, 'http://travel.invalid'); } catch { send(req, res, 400, { error: 'INVALID_WEB_SERVICE_REQUEST' }); return true; }
    const operation = match[2];
    const values = req.url.length <= 4096 ? requestValues(operation, url.searchParams) : null;
    if (!values) { send(req, res, 400, { error: 'INVALID_WEB_SERVICE_REQUEST' }); return true; }
    if (!await knownTrip(match[1])) { send(req, res, 404, { error: 'MAP_ITINERARY_UNAVAILABLE' }); return true; }
    const configured = await config;
    if (!configured) { send(req, res, 503, { error: 'WEB_SERVICE_NOT_CONFIGURED' }); return true; }
    if (mapClock() - rateStart >= 60000) { rateStart = mapClock(); rateCount = 0; }
    if (++rateCount > 60) { res.setHeader('Retry-After', '60'); send(req, res, 429, { error: 'MAP_RATE_LIMITED' }); return true; }
    const key = JSON.stringify([operation, values]);
    let result = cached(key);
    if (!result) {
      if (active >= 2) { res.setHeader('Retry-After', '1'); send(req, res, 429, { error: 'MAP_RATE_LIMITED' }); return true; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(20, Math.min(mapTimeoutMs, 25000)));
      timer.unref?.();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', disconnected);
      active++;
      try {
        const response = await mapFetch(upstreamUrl(operation, values, configured.key), { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
        const value = await providerJson(response, controller.signal, configured.secrets);
        result = operation === 'search' ? searchResult(value) : routeResult(value, values.mode);
        remember(key, result, operation, values.mode);
      } catch { send(req, res, 502, { error: 'MAP_PROVIDER_UNAVAILABLE' }); return true; }
      finally { active--; clearTimeout(timer); res.off('close', disconnected); }
    }
    send(req, res, 200, result);
    return true;
  };
}
