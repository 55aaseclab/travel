import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { renderItinerary, itineraryScript } from '../src/render-itinerary.js';
import { createItineraryMap, renderMapInterface } from '../src/itinerary-map.js';

function fixture() {
  const route = { id: 'synthetic-route', title: '合成旅行', status: 'upcoming', startDate: '2026-12-24', endDate: '2026-12-30', editedAt: '2026-11-14', placeCount: 1, cityCount: 1, coverAlt: '合成照片' };
  const trip = { title: route.title, days: Array.from({ length: 7 }, (_, index) => ({ title: `合成第${index + 1}天` })) };
  const data = { tripId: route.id, travelers: 2, budget: { currency: 'CNY', groups: [] }, preparation: { beforeDeparture: [], moments: [] }, places: [{ id: 'shared-place', name: '合成住宿', query: '合成住宿', city: '合成城市', type: 'stay', image: 'synthetic.jpeg', openingHours: '全天', duration: '一晚', price: '待确认' }], days: trip.days.map((day, index) => ({ title: day.title, date: `2026-12-${24 + index}`, stops: [{ place: 'shared-place', time: '18:00' }], legs: [] })) };
  return { route, trip, data };
}

test('map enhancement stays within the original three itinerary tabs and preserves distinct day visits', () => {
  const { route, trip, data } = fixture(), before = JSON.stringify(data);
  const html = renderItinerary(trip, data, route, []);
  assert.match(html, /data-itinerary-workspace/); assert.match(html, /data-itinerary-details/);
  assert.ok(html.indexOf('data-travel-map') < html.indexOf('<nav class="day-tabs"'));
  assert.equal((html.match(/data-map-visit data-map-day=/g) || []).length, 7);
  for (let day = 1; day <= 7; day++) assert.ok(html.includes(`id="visit-${day}-1"`));
  assert.equal((html.match(/data-map-place="shared-place"/g) || []).length, 7);
  assert.match(html, /id="tab-itinerary"/); assert.match(html, /id="tab-budget"/); assert.match(html, /id="tab-preparation"/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal(JSON.stringify(data), before);
  assert.doesNotMatch(html, /data-map-coordinate|data-map-lng|data-map-lat/);
});

test('authored place strings cannot add HTML through map visit metadata', () => {
  const { route, trip, data } = fixture(); data.places[0].name = '\" onpointerdown=alert(1)><script>alert(2)</script>';
  const html = renderItinerary(trip, data, route, []);
  assert.match(html, /data-map-name="&quot; onpointerdown=alert\(1\)&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt;"/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
});

test('shared capability locations return before DOM access, SDK loading or map metadata requests', () => {
  for (const pathname of ['/share/travel/token/synthetic-route/', '/share/travel', '/sh%61re/travel/token/synthetic-route/']) {
    const sandbox = { location: { pathname } };
    for (const name of ['document', 'window', 'fetch']) Object.defineProperty(sandbox, name, { get() { throw new Error('Private map integration must not run on shared pages.'); } });
    const controller = new Script(`(${createItineraryMap.toString()})()`).runInNewContext(sandbox);
    assert.doesNotThrow(() => controller.select('day-1', true));
    assert.doesNotThrow(() => controller.collapse());
  }
});

test('map UI is progressive and the combined inline controller is valid JavaScript', () => {
  const html = renderMapInterface();
  assert.match(html, /data-travel-map hidden/); assert.match(html, /data-map-toggle[^>]*disabled/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<script|<iframe|<link|https?:/);
  assert.doesNotThrow(() => new Script(itineraryScript.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')));
});


test('map cards reuse safe authored visit content and keep outgoing transport attached to each visit', () => {
  const { route, trip, data } = fixture();
  route.placeCount = 2;
  data.places.push({ ...data.places[0], id: 'second-place', name: '合成景点', type: 'attraction', image: 'second.jpeg', duration: '2小时' });
  data.days[0].stops = [{ place: 'shared-place', time: '09:00' }, { place: 'second-place', time: '12:00' }, { place: 'shared-place', time: '18:00' }];
  data.days[0].legs = [{ mode: '步行', duration: '20分钟', distance: '1公里' }, { mode: '景区车', duration: '30分钟', distance: '3公里' }];
  const before = JSON.stringify(data), html = renderItinerary(trip, data, route, []);
  assert.match(html, /id="visit-1-1"[^>]+data-map-leg-mode="walking"/);
  assert.match(html, /id="visit-1-2"[^>]+data-map-leg-mode=""/);
  assert.match(html, /id="visit-1-3"[^>]+data-map-leg-mode=""/);
  assert.match(html, /data-map-cards role="region" aria-label="行程地点" hidden/);
  assert.equal((html.match(/id="visit-1-[123]"/g) || []).length, 3);
  assert.equal(JSON.stringify(data), before);
  data.days[0].legs[0].mode = '\" onclick=alert(1)';
  const escaped = renderItinerary(trip, data, route, []);
  assert.doesNotMatch(escaped, /onclick=alert/);
  assert.match(escaped, /id="visit-1-1"[^>]+data-map-leg-mode=""/);
  assert.equal((escaped.match(/<script\b/g) || []).length, 1);
});


test('map uses one accessible floating icon without a visible heading or textual expand label', () => {
  const html = renderMapInterface();
  assert.doesNotMatch(html, /<h[1-6]\b|map-heading/);
  assert.match(html, /data-map-toggle aria-label="展开地图" title="展开地图"/);
  const button = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/)[1];
  assert.match(button, /<svg[^>]*aria-hidden="true"/);
  assert.doesNotMatch(button, /展开地图|收起地图/);
  assert.match(html, /aria-describedby="travel-map-legend"/);
});
