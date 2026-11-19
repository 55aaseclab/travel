import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderItinerary } from './render-itinerary.js';
import { renderCatalogPage } from './route-catalog.js';
import { itineraryRouteInfo } from './legacy-itinerary.js';
import { fail } from './itinerary-schema.js';

export function createSharedGuideRenderer(service) {
  async function metadata() {
    const read = async name => {
      const raw = await readFile(join(service.seedDir, name));
      if (raw.length > 1024 * 1024) fail('Guide metadata is too large', 503, 'GUIDE_UNAVAILABLE');
      return JSON.parse(raw);
    };
    const [trips, routes, credits] = await Promise.all([read('trips.json'), read('routes.json'), read('photo-credits.json')]);
    if (!Array.isArray(trips.trips) || !Array.isArray(routes.routes) || !Array.isArray(credits)) fail('Guide metadata is invalid', 503, 'GUIDE_UNAVAILABLE');
    return { trips: trips.trips, routes: routes.routes, credits };
  }
  function routeFor(route, snapshot) {
    const data = snapshot.itinerary;
    return { ...itineraryRouteInfo(route,data), ...(snapshot.updatedAt ? { editedAt:snapshot.updatedAt.slice(0,10) } : {}) };
  }
  return async pathname => {
    const match = /^\/([a-z0-9-]+)\/(?:index\.html)?$/.exec(pathname);
    const tripId = match && service.hasTrip(match[1]) ? match[1] : null;
    if (!tripId && !['/', '/index.html', '/routes.json'].includes(pathname)) return null;
    const { trips, routes, credits } = await metadata();
    if (tripId) {
      const trip = trips.find(item => item.id === tripId), route = routes.find(item => item.id === tripId);
      if (!trip || !route) fail('Guide metadata is unavailable', 503, 'GUIDE_UNAVAILABLE');
      const snapshot = await service.readSharedTrip(tripId);
      return { type: 'text/html; charset=utf-8', body: renderItinerary(trip, snapshot.itinerary, routeFor(route, snapshot), credits.filter(credit => credit.tripId === tripId), {cover: route.cover || null}) };
    }
    const current = [];
    for (const route of routes) current.push(service.hasTrip(route.id) ? routeFor(route, await service.readSharedTrip(route.id)) : route);
    return pathname === '/routes.json' ? { type: 'application/json; charset=utf-8', body: JSON.stringify({ routes: current }) + '\n' } : { type: 'text/html; charset=utf-8', body: renderCatalogPage(current) };
  };
}

export async function readBusinessBody(req) {
  return new Promise((resolve, reject) => {
    let length = 0;
    const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const failed = (status, code) => { cleanup(); req.resume(); reject(Object.assign(new Error('Business request body is unavailable'), { status, code })); };
    const data = chunk => { length += chunk.length; if (length > 1024 * 1024) failed(413, 'TOO_LARGE'); else chunks.push(chunk); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const error = () => failed(400, 'INVALID_REQUEST');
    const aborted = () => failed(400, 'INVALID_REQUEST');
    const timer = setTimeout(() => failed(408, 'REQUEST_TIMEOUT'), 2000); timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
  });
}
