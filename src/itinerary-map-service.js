import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const TRIP_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const PLACE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const CALLBACK = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,5}$/;
const MAX_FILE = 1024 * 1024;
const MAX_RESPONSE = 1024 * 1024;
const COMMON = ['key', 'jscode', 'callback', 'appname', 'csid', 'platform', 's', 'sdkversion', 'logversion'];
const PARAMS = {
  '/v3/log/init': new Set([...COMMON, 'dpr', 'eventId', 'mob', 'product', 'resolution', 'scale', 't', 'vt']),
  '/v3/place/text': new Set([...COMMON, 'antiCrab', 'children', 'city', 'citylimit', 'extensions', 'keywords', 'language', 'offset', 'page', 'type_']),
};
const cleanText = (value, max = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const pair = (query, city) => JSON.stringify([query, city]);

function send(req, res, status, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

function originHeader(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

async function readBounded(file, max) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max) throw new Error('Invalid map file.');
  const body = await readFile(file);
  if (body.length > max) throw new Error('Invalid map file.');
  return body;
}

async function readCredentials(file) {
  if (!file || !isAbsolute(file)) return null;
  try {
    const info = await lstat(file);
    if ((info.mode & 0o077) !== 0) return null;
    const value = JSON.parse(await readBounded(file, 16384));
    if (!/^[a-f0-9]{32}$/i.test(value.key) || !/^[a-f0-9]{32}$/i.test(value.securityJsCode)) return null;
    return { key: value.key, securityJsCode: value.securityJsCode };
  } catch { return null; }
}

function mapPlaces(value, tripId) {
  if (!value || value.tripId !== tripId || !Array.isArray(value.places) || value.places.length > 200) throw new Error('Invalid map itinerary.');
  const ids = new Set();
  return value.places.map(place => {
    if (!place || !PLACE_ID.test(place.id) || ids.has(place.id)) throw new Error('Invalid map place.');
    ids.add(place.id);
    const item = { id: place.id, status: 'unavailable' };
    if (cleanText(place.query) && cleanText(place.city, 80)) {
      item.query = place.query.trim();
      item.city = place.city.trim();
      item.status = 'unresolved';
    }
    const position = place.position;
    if (position && position.crs === 'GCJ02' && typeof position.lng === 'number' && Number.isFinite(position.lng) && Math.abs(position.lng) <= 180 && typeof position.lat === 'number' && Number.isFinite(position.lat) && Math.abs(position.lat) <= 90) {
      item.status = 'resolved';
      item.position = { lng: position.lng, lat: position.lat };
    }
    return item;
  });
}

async function responseBytes(response, signal) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error('Map request timed out.');
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE) throw new Error('Map response is too large.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

function decodeProvider(bytes, callback) {
  let text = bytes.toString('utf8').trim();
  if (text.startsWith(callback + '(')) {
    text = text.slice(callback.length + 1).replace(/\);?\s*$/, '');
  }
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid map response.');
  return value;
}

export function createMapHandler({
  dataDir = DATA_DIR,
  mapConfigFile = process.env.TRAVEL_AMAP_CONFIG,
  mapFetch = globalThis.fetch,
  mapClock = Date.now,
  mapOrigin = process.env.TRAVEL_AMAP_ORIGIN,
  mapTimeoutMs = 10000,
  mapReadItinerary,
} = {}) {
  const root = resolve(dataDir);
  const credentials = readCredentials(mapConfigFile);
  const publicOrigin = originHeader(mapOrigin);
  const cache = new Map();
  let cacheBytes = 0;
  let rateStart = mapClock();
  let rateCount = 0;
  let active = 0;

  async function itinerary(tripId) {
    if (!TRIP_ID.test(tripId)) throw new Error('Invalid itinerary.');
    const winning = mapReadItinerary && await mapReadItinerary(tripId);
    if (winning) return mapPlaces(winning, tripId);
    const file = join(root, tripId + '.json');
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
    const path = relative(realRoot, realFile);
    if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) throw new Error('Invalid itinerary.');
    return mapPlaces(JSON.parse(await readBounded(file, MAX_FILE)), tripId);
  }

  async function authoredPairs() {
    const names = await readdir(root);
    if (names.length > 256) throw new Error('Too many map files.');
    const allowed = new Set();
    for (const name of names) {
      const id = name.endsWith('.json') ? name.slice(0, -5) : '';
      if (!TRIP_ID.test(id)) continue;
      let places;
      try { places = await itinerary(id); } catch { continue; }
      for (const place of places) if (place.query && place.city) allowed.add(pair(place.query, place.city));
    }
    return allowed;
  }

  function cacheGet(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expiresAt <= mapClock()) { cache.delete(key); cacheBytes -= item.bytes; return null; }
    cache.delete(key); cache.set(key, item);
    return item.value;
  }

  function cacheSet(key, value) {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (bytes > MAX_RESPONSE) return;
    const previous = cache.get(key);
    if (previous) { cacheBytes -= previous.bytes; cache.delete(key); }
    while (cache.size >= 128 || cacheBytes + bytes > 8 * MAX_RESPONSE) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      cacheBytes -= cache.get(first).bytes;
      cache.delete(first);
    }
    cache.set(key, { value, bytes, expiresAt: mapClock() + 60 * 60 * 1000 });
    cacheBytes += bytes;
  }

  return async function handleMap(req, res, pathname) {
    const route = /^\/([a-z0-9][a-z0-9-]{0,79})\/map\/(config|places)$/.exec(pathname);
    const proxy = pathname === '/_AMapService' || pathname.startsWith('/_AMapService/');
    if (!route && !proxy) return false;
    if (!['GET', 'HEAD'].includes(req.method)) { send(req, res, 405, { error: 'METHOD_NOT_ALLOWED' }); return true; }
    const configured = await credentials;
    const url = new URL(req.url, 'http://travel.invalid');
    if (route) {
      if (url.search) { send(req, res, 400, { error: 'INVALID_MAP_REQUEST' }); return true; }
      let places;
      try { places = await itinerary(route[1]); }
      catch { send(req, res, 404, { error: 'MAP_ITINERARY_UNAVAILABLE' }); return true; }
      if (route[2] === 'config') send(req, res, 200, { enabled: Boolean(configured), provider: 'amap', ...(configured ? { key: configured.key, servicePath: '../_AMapService' } : {}) });
      else send(req, res, 200, { provider: 'amap', crs: 'GCJ02', places });
      return true;
    }
    if (!configured) { send(req, res, 503, { error: 'MAP_NOT_CONFIGURED' }); return true; }
    const path = pathname.slice('/_AMapService'.length);
    const allowedKeys = PARAMS[path];
    if (!allowedKeys || req.url.length > 4096) { send(req, res, 404, { error: 'MAP_ROUTE_NOT_FOUND' }); return true; }
    const params = url.searchParams;
    const callback = params.get('callback') || '';
    const counts = new Map();
    let invalid = !CALLBACK.test(callback) || params.get('key') !== configured.key;
    for (const [name, value] of params) {
      counts.set(name, (counts.get(name) || 0) + 1);
      if (!allowedKeys.has(name) || value.length > (name === 'appname' ? 1024 : 256) || /[\x00-\x1f\x7f]/.test(value) || counts.get(name) > (name === 's' ? 2 : 1)) invalid = true;
    }
    if (invalid) { send(req, res, 403, { error: 'MAP_REQUEST_NOT_ALLOWED' }); return true; }
    if (mapClock() - rateStart >= 60000) { rateStart = mapClock(); rateCount = 0; }
    if (++rateCount > 120 || active >= 4) { res.setHeader('Retry-After', '60'); send(req, res, 429, { error: 'MAP_RATE_LIMITED' }); return true; }
    if (path === '/v3/place/text') {
      let pairs;
      try { pairs = await authoredPairs(); } catch { pairs = new Set(); }
      if (!pairs.has(pair(params.get('keywords'), params.get('city'))) || !['1', 'true'].includes(params.get('citylimit')) || params.get('page') !== '1' || !/^[1-3]$/.test(params.get('offset') || '') || params.has('extensions') && params.get('extensions') !== 'base') invalid = true;
    }
    if (invalid) { send(req, res, 403, { error: 'MAP_REQUEST_NOT_ALLOWED' }); return true; }
    const cacheKey = path === '/v3/place/text' ? JSON.stringify(['keywords', 'city', 'citylimit', 'children', 'extensions', 'language', 'offset', 'page', 'type_'].map(name => params.get(name))) : null;
    let value = cacheKey ? cacheGet(cacheKey) : null;
    if (!value) {
      const upstream = new URL(path, 'https://restapi.amap.com');
      upstream.search = url.search;
      upstream.searchParams.set('jscode', configured.securityJsCode);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(Math.max(mapTimeoutMs, 20), 25000));
      timer.unref?.();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.once('close', disconnected);
      active++;
      try {
        const headers = publicOrigin ? { Referer: publicOrigin + '/', Origin: publicOrigin } : {};
        const response = await mapFetch(upstream, { method: 'GET', headers, redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error('Map provider unavailable.');
        const bytes = await responseBytes(response, controller.signal);
        const text = bytes.toString('utf8').toLowerCase();
        if (text.includes(configured.securityJsCode.toLowerCase()) || text.includes(configured.key.toLowerCase())) throw new Error('Unsafe map response.');
        value = decodeProvider(bytes, callback);
        if (cacheKey && value.status === '1') cacheSet(cacheKey, value);
      } catch {
        send(req, res, 502, { error: 'MAP_PROVIDER_UNAVAILABLE' });
        return true;
      } finally { active--; clearTimeout(timer); res.off('close', disconnected); }
    }
    const bytes = Buffer.from(callback + '(' + JSON.stringify(value) + ');');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=0, no-store', 'Cross-Origin-Resource-Policy': 'same-origin' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
    return true;
  };
}
