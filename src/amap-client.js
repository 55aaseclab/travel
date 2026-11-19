import { readWebServiceCredentials, requestValues, upstreamUrl, searchResult, routeResult, providerJson } from './amap-web-service.js';
import { fields, fail } from './itinerary-schema.js';

const limitations = ['future-opening-hours-unconfirmed', 'ticket-prices-unconfirmed', 'booking-availability-unconfirmed', 'weather-unconfirmed', 'temporary-closures-unconfirmed'];
const optionalText = value => typeof value === 'string' && value.trim() && value.length <= 500 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;

export function createAMapClient({ mapConfigFile = process.env.TRAVEL_AMAP_CONFIG, mapFetch = globalThis.fetch, mapClock = Date.now, mapTimeoutMs = 8000 } = {}) {
  const configured = readWebServiceCredentials(mapConfigFile);
  const cache = new Map();
  let count = 0, started = mapClock(), active = 0, cacheBytes = 0;
  return {
    async query(operation, input, { expiresAt = Infinity } = {}) {
      let values;
      if (operation === 'detail') {
        fields(input, ['poiId']);
        if (typeof input.poiId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.poiId)) fail('A single valid POI identifier is required');
        values = { poiId: input.poiId };
      } else {
        if (!['search', 'route'].includes(operation)) fail('Unsupported map query');
        fields(input, operation === 'search' ? ['keywords', 'city'] : ['mode', 'origin', 'destination', 'crs']);
        if (Object.values(input).some(value => typeof value !== 'string')) fail('Invalid map query fields');
        values = requestValues(operation, new URLSearchParams(input));
        if (!values) fail('Invalid map query fields');
      }
      const config = await configured;
      if (!config) fail('Web service is not configured', 503, 'WEB_SERVICE_NOT_CONFIGURED');
      if (expiresAt <= mapClock()) fail('Business assertion expired', 401, 'INVALID_ASSERTION');
      if (mapClock() - started >= 60000) { started = mapClock(); count = 0; }
      if (++count > 60) fail('Map request budget exceeded', 429, 'MAP_RATE_LIMITED');
      const key = JSON.stringify([operation, values]), cached = cache.get(key);
      if (cached && cached.expiresAt > mapClock()) return structuredClone(cached.value);
      if (cached) { cache.delete(key); cacheBytes -= cached.bytes; }
      if (active >= 2) fail('Map request concurrency exceeded', 429, 'MAP_RATE_LIMITED');
      let url;
      if (operation === 'detail') {
        url = new URL('https://restapi.amap.com/v5/place/detail');
        for (const [name, value] of Object.entries({ key: config.key, id: values.poiId, output: 'json', show_fields: 'business,navi' })) url.searchParams.set(name, value);
      } else url = upstreamUrl(operation, values, config.key);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(mapTimeoutMs, 25000, expiresAt - mapClock()))); timer.unref?.();
      active++;
      try {
        const response = await mapFetch(url, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
        const raw = await providerJson(response, controller.signal, config.secrets);
        let result;
        if (operation === 'detail') {
          const place = searchResult(raw).pois.find(poi => poi.id === values.poiId) || null;
          const item = Array.isArray(raw.pois) ? raw.pois.find(poi => poi?.id === values.poiId) : null;
          if (place) place.business = {
            openingHoursToday: optionalText(item?.business?.opentime_today), openingHoursWeek: optionalText(item?.business?.opentime_week),
            telephone: optionalText(item?.business?.tel), averageCost: optionalText(item?.business?.cost), rating: optionalText(item?.business?.rating),
          };
          result = { provider: 'amap', crs: 'GCJ02', place };
        } else {
          result = operation === 'search' ? searchResult(raw) : routeResult(raw, values.mode);
          if (operation === 'route' && result.route) {
            const { distanceMeters, durationSeconds, polyline } = result.route;
            result.route = { distanceMeters, durationSeconds, geometryPointCount: polyline.length };
          }
        }
        result.checkedAt = new Date(mapClock()).toISOString(); result.limitations = [...limitations];
        if (expiresAt <= mapClock()) fail('Business assertion expired before delivery', 401, 'INVALID_ASSERTION');
        const bytes = Buffer.byteLength(JSON.stringify(result));
        while (cache.size >= 64 || cacheBytes + bytes > 8 * 1024 * 1024) { const first = cache.keys().next().value; cacheBytes -= cache.get(first).bytes; cache.delete(first); }
        cache.set(key, { value: result, bytes, expiresAt: mapClock() + (operation === 'route' && values.mode === 'driving' ? 300000 : 3600000) }); cacheBytes += bytes;
        return structuredClone(result);
      } catch (error) {
        if (error.code === 'INVALID_ASSERTION') throw error;
        fail('Map provider is unavailable', 502, 'MAP_PROVIDER_UNAVAILABLE');
      } finally { clearTimeout(timer); active--; }
    },
  };
}
