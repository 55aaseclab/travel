import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, mkdtemp, chmod, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fail, fields, object } from './itinerary-schema.js';

export const FLIGGY_CLI_FILE = fileURLToPath(new URL('../node_modules/@fly-ai/flyai-cli/dist/flyai-bundle.cjs', import.meta.url));
const execute = promisify(execFile);
const MAX_OUTPUT = 1024 * 1024;
const supplierDomains = ['fliggy.com', 'feizhu.com', 'taobao.com', 'alitrip.com'];
const commonLimitations = ['availability-unconfirmed', 'prices-and-schedules-can-change', 'no-booking-or-payment-performed'];
const safeText = (value, max = 500) => {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  return typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
};
function inputText(value, max = 40) {
  const result = safeText(value, max);
  if (!result || typeof value !== 'string' || result.startsWith('-')) fail('Invalid travel query text');
  return result;
}
function today(clock) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(clock());
  return ['year', 'month', 'day'].map(name => parts.find(part => part.type === name).value).join('-');
}
function day(value, current) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid travel query date');
  const offset = (Date.parse(value) - Date.parse(current)) / 86400000;
  if (offset < 0 || offset > 365) fail('Travel query date is outside the supported future window');
  return value;
}
export function validateServiceQuery(input, clock = Date.now) {
  if (!object(input)) fail('Travel service input must be an object');
  const current = today(clock);
  if (input.kind === 'hotel') {
    fields(input, ['kind', 'city', 'checkIn', 'checkOut'], ['keyword']);
    const value = { kind: input.kind, city: inputText(input.city), checkIn: day(input.checkIn, current), checkOut: day(input.checkOut, current) };
    const nights = (Date.parse(value.checkOut) - Date.parse(value.checkIn)) / 86400000;
    if (nights < 1 || nights > 30) fail('Hotel stays must be between one and thirty nights');
    if (input.keyword !== undefined) value.keyword = inputText(input.keyword, 200);
    return value;
  }
  if (['flight', 'train'].includes(input.kind)) {
    fields(input, ['kind', 'origin', 'destination', 'date']);
    return { kind: input.kind, origin: inputText(input.origin), destination: inputText(input.destination), date: day(input.date, current) };
  }
  if (input.kind === 'restaurant') {
    fields(input, ['kind', 'city', 'query']);
    return { kind: input.kind, city: inputText(input.city), query: inputText(input.query, 200) };
  }
  fail('Unsupported travel service category');
}
function command(input) {
  if (input.kind === 'hotel') return ['search-hotel', '--dest-name', input.city, '--check-in-date', input.checkIn, '--check-out-date', input.checkOut, ...(input.keyword ? ['--key-words', input.keyword] : [])];
  if (input.kind === 'restaurant') return ['keyword-search', '--query', `${input.city} 餐饮 ${input.query}`];
  return ['search-' + input.kind, '--origin', input.origin, '--destination', input.destination, '--dep-date', input.date];
}
async function credentials(file) {
  if (!file || !isAbsolute(file)) return null;
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size > 16384) return null;
    const raw = await readFile(file); if (raw.length > 16384) return null;
    const value = JSON.parse(raw);
    if (!object(value) || Object.keys(value).length !== 1 || typeof value.apiKey !== 'string' || value.apiKey !== value.apiKey.trim() || value.apiKey.length < 16 || value.apiKey.length > 1024 || /[\x00-\x20\x7f]/.test(value.apiKey)) return null;
    return value.apiKey;
  } catch { return null; }
}
function jumpUrl(value) {
  if (typeof value !== 'string' || value.length > 4000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || !supplierDomains.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) return null;
    return url.href;
  } catch { return null; }
}
function revealsSecret(value, secret) {
  const pending = [value], expected = secret.toLowerCase();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      let decoded = item;
      for (let count = 0; count < 3; count++) {
        if (decoded.toLowerCase().includes(expected)) return true;
        try { const next = decodeURIComponent(decoded); if (next === decoded) break; decoded = next; } catch { break; }
      }
    } else if (Array.isArray(item)) pending.push(...item);
    else if (object(item)) pending.push(...Object.values(item));
  }
  return false;
}
function price(value) {
  const label = safeText(value, 80);
  const match = label?.match(/^(?:(?:¥|￥|RMB|CNY)\s*)?(\d+)(?:\.(\d{1,2}))?(?:\s*元)?$/i);
  let amountCents = null;
  if (match && match[1].length <= 14) {
    const cents = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
    if (cents <= BigInt(Number.MAX_SAFE_INTEGER)) amountCents = Number(cents);
  }
  return { label, amountCents, currency: 'CNY' };
}
function coordinates(item) {
  const lng = typeof item.longitude === 'string' && item.longitude.trim() ? Number(item.longitude) : NaN;
  const lat = typeof item.latitude === 'string' && item.latitude.trim() ? Number(item.latitude) : NaN;
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? { lng, lat, crs: 'unknown' } : null;
}
function journeys(value) {
  if (!Array.isArray(value) || value.length > 4) return [];
  return value.map(journey => {
    if (!object(journey) || !Array.isArray(journey.segments) || !journey.segments.length || journey.segments.length > 8) return null;
    const segments = journey.segments.map(item => !object(item) ? null : ({ originCity: safeText(item.depCityName), originStation: safeText(item.depStationName), departureTime: safeText(item.depDateTime, 80), destinationCity: safeText(item.arrCityName), destinationStation: safeText(item.arrStationName), arrivalTime: safeText(item.arrDateTime, 80), durationText: safeText(item.duration, 80), serviceNumber: safeText(item.marketingTransportNo, 80), seatClass: safeText(item.seatClassName, 80), transportType: safeText(item.transportType, 80) }));
    return segments.some(item => !item) ? null : { durationText: safeText(journey.totalDuration, 80), segments };
  }).filter(Boolean);
}
function offer(item, input) {
  if (!object(item)) return null;
  if (input.kind === 'hotel') {
    const name = safeText(item.name); if (!name) return null;
    return { id: safeText(item.shId, 128), name, address: safeText(item.address), brand: safeText(item.brandName), price: price(item.price), rating: safeText(item.rate, 80), stars: safeText(item.star, 80), position: coordinates(item), jumpUrl: jumpUrl(item.detailUrl) };
  }
  if (input.kind === 'restaurant') {
    const value = object(item.info) ? item.info : {}, name = safeText(value.title); if (!name) return null;
    return { name, price: price(value.price), rating: safeText(value.rate, 80), stars: safeText(value.star, 80), jumpUrl: jumpUrl(value.jumpUrl) };
  }
  const trips = journeys(item.journeys); if (!trips.length) return null;
  const departure = trips[0].segments[0].departureTime?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return { price: price(input.kind === 'flight' ? item.ticketPrice : item.price), durationText: safeText(item.totalDuration, 80), journeys: trips, dateMatch: departure ? departure === input.date ? 'matched' : 'mismatched' : 'unknown', jumpUrl: jumpUrl(item.jumpUrl) };
}
export function createFliggyClient({ configFile = process.env.TRAVEL_FLIGGY_CONFIG, execFile: run = execute, clock = Date.now, tempRoot = tmpdir() } = {}) {
  const key = credentials(configFile), cache = new Map();
  let active = false, count = 0, started = clock();
  return {
    async query(rawInput, { expiresAt = Infinity } = {}) {
      const input = validateServiceQuery(rawInput, clock), apiKey = await key;
      if (!apiKey) fail('Travel service queries are not configured', 503, 'FLIGGY_NOT_CONFIGURED');
      if (expiresAt - clock() <= 500) fail('Business assertion expires before the query can run', 401, 'INVALID_ASSERTION');
      if (clock() - started >= 60000) { started = clock(); count = 0; }
      if (++count > 30) fail('Travel service request budget exceeded', 429, 'FLIGGY_RATE_LIMITED');
      const cacheKey = JSON.stringify(input), cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > clock()) {
        const result = structuredClone(cached.value);
        if (expiresAt <= clock()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
        return result;
      }
      if (cached) cache.delete(cacheKey);
      if (active) fail('Another travel service query is running', 429, 'FLIGGY_RATE_LIMITED');
      active = true;
      let home;
      try {
        home = await mkdtemp(join(tempRoot, 'travel-flyai-')); await chmod(home, 0o700);
        const timeout = Math.floor(Math.min(12000, expiresAt - clock() - 500));
        if (timeout < 1) fail('Business assertion expired before execution', 401, 'INVALID_ASSERTION');
        const result = await run(process.execPath, [FLIGGY_CLI_FILE, ...command(input)], { shell: false, cwd: home, env: { HOME: home, TMPDIR: home, LANG: 'C.UTF-8', FLYAI_API_KEY: apiKey, FLYAI_JSON: '1' }, timeout, killSignal: 'SIGKILL', maxBuffer: MAX_OUTPUT, encoding: 'utf8', windowsHide: true });
        if (expiresAt <= clock()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
        if (typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > MAX_OUTPUT || result.stderr !== undefined && typeof result.stderr !== 'string' || typeof result.stderr === 'string' && Buffer.byteLength(result.stderr) > MAX_OUTPUT || revealsSecret(result.stdout, apiKey) || revealsSecret(result.stderr, apiKey)) fail('Travel service returned an unsafe response', 502, 'FLIGGY_UNAVAILABLE');
        const value = JSON.parse(result.stdout);
        if (revealsSecret(value, apiKey) || !object(value) || ![0, '0'].includes(value.status) || !object(value.data) || !Array.isArray(value.data.itemList)) fail('Travel service provider rejected the query', 502, 'FLIGGY_UNAVAILABLE');
        const offers = value.data.itemList.slice(0, 10).map(item => offer(item, input)).filter(Boolean);
        const referenceOnly = input.kind === 'train' && (Date.parse(input.date) - Date.parse(today(clock))) / 86400000 >= 15;
        const normalized = { source: 'fliggy', kind: input.kind, checkedAt: new Date(clock()).toISOString(), availability: 'unconfirmed', referenceOnly, offers, limitations: [...commonLimitations, ...(referenceOnly ? ['train-date-outside-presale-reference-only'] : []), ...(input.kind === 'restaurant' ? ['keyword-results-do-not-confirm-restaurant-reservations'] : [])] };
        if (expiresAt <= clock()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
        if (cache.size >= 32) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { value: normalized, expiresAt: clock() + 300000 });
        return structuredClone(normalized);
      } catch (error) {
        if (['INVALID_ASSERTION', 'FLIGGY_UNAVAILABLE'].includes(error.code)) throw error;
        fail('Travel service provider is unavailable', 502, 'FLIGGY_UNAVAILABLE');
      } finally {
        try { if (home) await rm(home, { recursive: true, force: true, maxRetries: 2, retryDelay: 20 }); }
        catch { fail('Unable to clean isolated travel service state', 503, 'FLIGGY_UNAVAILABLE'); }
        finally { active = false; }
      }
    },
  };
}
