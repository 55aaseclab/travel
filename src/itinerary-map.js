export const mapStyles = `
.place-photo-placeholder{display:grid;place-items:center;width:140px;height:112px;border-radius:6px;background:var(--selection);color:#8d8d97}.place-photo-placeholder svg,.map-card-placeholder svg{width:32px;height:32px;fill:currentColor}.map-card-placeholder{display:grid;place-items:center;width:96px;height:96px;border-radius:5px;background:var(--selection);color:#8d8d97}[data-map-provider=leaflet] .travel-map-canvas{position:relative;z-index:0}[data-map-provider=leaflet] .leaflet-container{font-family:inherit}[data-map-provider=leaflet] .leaflet-control-attribution{font-size:10px!important}
@media(max-width:760px){.place-photo-placeholder{width:80px;height:96px}.map-card-placeholder{width:80px;height:80px}}

.app-main .itinerary-map{position:relative;min-width:0;margin:0 0 16px}.map-toggle{position:absolute;z-index:112;top:12px;right:12px;display:grid;place-items:center;width:44px;height:44px;font:inherit;min-height:44px;padding:0;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:#fff;cursor:pointer}.map-toggle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.map-toggle[aria-expanded=true] .map-expand-icon,.map-toggle[aria-expanded=false] .map-collapse-icon{display:none}.map-toggle:disabled{cursor:default;opacity:.5}.map-frame{position:relative;height:clamp(220px,32vh,320px);overflow:hidden;border:1px solid var(--line);border-radius:10px;background:#f0f0f4}.travel-map-canvas{height:100%;width:100%;touch-action:pan-y}.map-status{position:absolute;z-index:111;top:12px;left:12px;max-width:calc(100% - 84px);margin:0;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:.75rem;color:var(--muted);line-height:1.6}.map-unavailable .map-status{position:static;max-width:none;padding:0;border:0;background:transparent}.map-popup{font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#252529;max-width:260px}.map-popup h3{font-size:14px;margin:0 0 8px}.map-popup-visit{display:flex;align-items:center;justify-content:space-between;gap:14px}.map-popup-visit button{font:inherit;min-height:44px;padding:6px 8px;border:0;background:transparent;color:#1672d4;cursor:pointer}.travel-map-pin{display:grid;place-items:center;width:44px;height:44px;border:3px solid #fff;border-radius:50%;background:#1672d4;color:#fff;box-shadow:0 1px 5px #0004;font:600 13px/1 sans-serif;cursor:pointer}.map-expanded{display:flex;flex-direction:column;min-height:0}.map-expanded .itinerary-map{display:flex;flex:1;flex-direction:column;min-height:0;margin-bottom:0}.map-expanded .map-frame{height:auto;flex:1;min-height:0}.map-expanded .day-tabs{flex-shrink:0;margin:12px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);min-height:44px}.map-expanded .travel-map-canvas{touch-action:none}.map-expanded [data-itinerary-details]{display:none!important}.day-tabs{flex-wrap:nowrap!important;overflow-x:auto;min-width:0;scrollbar-width:thin}.day-tabs a{flex-shrink:0}.map-toggle:focus-visible,.map-popup button:focus-visible,.travel-map-pin:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.travel-map-pin.is-active{transform:scale(1.22);background:#1257a1;box-shadow:0 2px 8px #0005}.map-place-strip{position:absolute;z-index:110;bottom:32px;left:0;right:0;display:flex;gap:12px;max-height:calc(100% - 96px);overflow-x:auto;overflow-y:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:16px;padding:8px 16px;scrollbar-width:thin;touch-action:pan-x pan-y;pointer-events:auto}.map-place-strip::before,.map-place-strip::after{content:"";flex:0 0 max(0px,calc((100% - 344px)/2))}.map-place-card{position:relative;align-self:flex-start;flex:0 0 320px;scroll-snap-align:center;border:2px solid transparent;border-radius:10px;background:#fff;box-shadow:0 2px 8px #0003;overflow:hidden}.map-place-card[aria-current=true]{border-color:#1672d4}.map-card-select{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start;width:100%;min-height:112px;padding:8px;border:0;background:transparent;color:#252529;text-align:left;font:inherit;cursor:pointer}.map-card-select img{width:96px;height:96px;align-self:center;object-fit:cover;border-radius:5px;background:#f0f0f4}.map-card-copy{min-width:0;padding-bottom:44px}.map-card-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.8125rem;font-weight:600;line-height:1.3;margin-bottom:4px;overflow-wrap:anywhere}.map-card-meta{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.75rem;line-height:1.4;color:#606069}.map-card-duration{font:inherit}.map-card-details{position:absolute;right:8px;bottom:4px;min-width:80px;min-height:44px;border:0;background:#fff;color:#1672d4;font:inherit;font-size:.75rem;cursor:pointer}.map-card-select:focus-visible,.map-card-details:focus-visible{outline:3px solid #1672d4;outline-offset:-3px}.map-expanded .map-frame{min-height:230px}
@media(max-width:760px){.map-place-strip{gap:10px;scroll-padding-inline:12px;padding-inline:12px}.map-place-strip::before{display:none}.map-place-strip::after{flex-basis:max(0px,calc(100% - 280px))}.map-place-card{flex-basis:270px;scroll-snap-align:start}.map-card-select{grid-template-columns:80px minmax(0,1fr);gap:10px}.map-card-select img{width:80px;height:80px}.map-frame{height:clamp(180px,28vh,240px)}.map-toggle{min-height:44px}}
@media print{.itinerary-map{display:none!important}.map-expanded{display:block!important;height:auto!important}.map-expanded [data-itinerary-details]{display:block!important}}
`;

export function renderMapInterface() {
  return '<section class="itinerary-map" data-travel-map hidden aria-label="行程地图"><p class="map-status" data-map-status role="status">正在加载地图…</p><div class="map-frame" data-map-frame><div id="travel-map-canvas" class="travel-map-canvas" role="region" aria-label="行程地点地图" aria-describedby="travel-map-legend"></div><button type="button" class="map-toggle" data-map-toggle aria-label="展开地图" title="展开地图" aria-expanded="false" aria-controls="travel-map-canvas" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="map-expand-icon" d="M8 3H3v5m13-5h5v5m0 8v5h-5M3 16v5h5"/><path class="map-collapse-icon" d="M3 8h5V3m8 0v5h5m0 8h-5v5M8 21v-5H3"/></svg></button><div class="map-place-strip" data-map-cards role="region" aria-label="行程地点" hidden></div></div><p id="travel-map-legend" class="visually-hidden">实线表示道路路线，虚线仅表示地点连线。</p></section>';
}

/** Self-contained browser controller, embedded only in the existing itinerary page. */
export function createItineraryMap({ onVisit = () => {}, createPresentation, t = (english) => english } = {}) {
  const empty = { select() {}, collapse() {} };
  let pathname; try { pathname = decodeURIComponent(location.pathname); } catch { return empty; }
  if (/^\/share\/travel(?:\/|$)/.test(pathname)) return empty;
  const workspace = document.querySelector('[data-itinerary-workspace]'), stage = document.querySelector('[data-travel-map]');
  const details = document.querySelector('[data-itinerary-details]'), canvas = document.querySelector('#travel-map-canvas');
  const toggle = document.querySelector('[data-map-toggle]'), status = document.querySelector('[data-map-status]'), frame = document.querySelector('[data-map-frame]');
  if (!workspace || !stage || !details || !canvas || !toggle || !status || !frame) return empty;
  const days = ['第一天', '第二天', '第三天', '第四天', '第五天', '第六天', '第七天'].map((label,i) => t('Day ' + (i+1),label));
  const visits = [...document.querySelectorAll('[data-map-visit]')].map(node => ({ id: node.id, day: Number(node.dataset.mapDay), position: Number(node.dataset.mapPosition), place: node.dataset.mapPlace, name: node.dataset.mapName, time: node.dataset.mapTime }));
  const strip = document.querySelector('[data-map-cards]');
  for (const visit of visits) {
    const node = document.getElementById(visit.id);
    visit.mode = node.dataset.mapLegMode || '';
    visit.image = node.querySelector('.place-card img')?.getAttribute('src') || '';
    visit.duration = t(node.dataset.mapDurationEn,node.dataset.mapDurationLabel) || '—';
    visit.metaLabel = `${days[visit.day - 1]} ${visit.time || ''} · `;
  }
  if (!visits.length) return empty;
  const allowed = new Set(visits.map(visit => visit.place));
  const tripURL = new URL('.', location.href), positions = new Map();
  const coarse = matchMedia('(pointer:coarse)').matches;
  const routeCache = new Map(), routeQueue = [];
  let routeRequests = 0, activeVisitId, markerRecords = [], disposed = false;
  const currentVisits = () => visits.filter(visit => selectedDay === 'overview' || `day-${visit.day}` === selectedDay);
  const routeMode = value => value === 'walking' || value === 'driving' ? value : null;
  const coordinateText = point => `${Number(point.lng.toFixed(6))},${Number(point.lat.toFixed(6))}`;
  function segment(from, to) {
    if (from.day !== to.day) return null;
    const origin = positions.get(from.place), destination = positions.get(to.place), mode = routeMode(from.mode);
    if (!origin || !destination) return null;
    const key = `${mode || 'schematic'}:${coordinateText(origin)}:${coordinateText(destination)}`;
    return { key, mode, origin, destination, day: `day-${from.day}` };
  }
  function segments() { const rows = currentVisits(), result = []; for (let i = 1; i < rows.length; i++) { const value = segment(rows[i - 1], rows[i]); if (value) result.push(value); } return result; }
  function pumpRoutes() {
    if (!active || disposed || failed || selectedDay === 'overview') return;
    while (routeRequests < 2 && routeQueue.length) {
      const next = routeQueue.shift(), record = routeCache.get(next.key);
      if (record?.state !== 'queued') continue;
      if (next.day !== selectedDay) { if (segments().some(value => value.key === next.key)) next.day = selectedDay; else { routeCache.delete(next.key); continue; } }
      record.state = 'pending'; routeRequests++;
      const query = new URLSearchParams({ mode: next.mode, origin: coordinateText(next.origin), destination: coordinateText(next.destination), crs: 'GCJ02' });
      void json(`map/route?${query}`).then(value => {
        const path = value?.provider === 'amap' && value.crs === 'GCJ02' && value.mode === next.mode && Array.isArray(value.route?.polyline) ? value.route.polyline : [];
        record.path = path.length >= 2 && path.length <= 20000 && path.every(validPosition) ? path.map(point => [point.lng, point.lat]) : null;
        record.state = record.path ? 'ready' : 'unavailable';
      }).catch(() => { record.state = 'unavailable'; }).finally(() => {
        routeRequests--;
        if (active && !disposed && segments().some(value => value.key === next.key)) draw(false, true);
        pumpRoutes();
      });
    }
  }
  function requestRoutes() {
    if (selectedDay === 'overview') return;
    for (const value of segments()) if (value.mode && !routeCache.has(value.key) && (value.origin.lng !== value.destination.lng || value.origin.lat !== value.destination.lat)) {
      routeCache.set(value.key, { state: 'queued', path: null }); routeQueue.push(value);
    }
    pumpRoutes();
  }
  function showDetails(visit) { popup?.close(); collapse({ restore: false }); onVisit(visit); }
  function selectVisit(id, { scroll = true, pan = false } = {}) {
    const rows = currentVisits(), visit = rows.find(value => value.id === id);
    if (!visit) return;
    activeVisitId = id;
    presentation.select(id, { scroll });
    for (const record of markerRecords) {
      const chosen = record.group.find(value => value.id === id), displayed = chosen || record.group[0];
      record.pin.textContent = String(rows.findIndex(value => value.id === displayed.id) + 1);
      record.pin.classList.toggle('is-active', Boolean(chosen));
      record.pin.setAttribute('aria-pressed', String(Boolean(chosen)));
      record.marker.setzIndex?.(chosen ? 200 : 100);
    }
    const point = positions.get(visit.place);
    if (pan && expanded && point && map) {
      const pixel = map.lngLatToContainer?.([point.lng, point.lat]);
      const height = canvas.clientHeight - (strip?.offsetHeight || 0) - 40;
      if (!pixel || pixel.x < 48 || pixel.x > canvas.clientWidth - 48 || pixel.y < 48 || pixel.y > height) map.panTo?.([point.lng, point.lat]);
    }
  }
  function renderCards() {
    const rows = currentVisits();
    if (!rows.some(visit => visit.id === activeVisitId)) activeVisitId = rows[0]?.id;
    presentation.render(); selectVisit(activeVisitId);
  }
  let map, overlays = [], popup, openPlace, loading, ready = false, failed = false, active = false, selectedDay = 'overview', expanded = false, reading, resizePending = false, syntheticResize = false, cameraTouched = false;
  const presentation = createPresentation({ t, strip, workspace, details, toggle, getRows: currentVisits, getSelected: () => activeVisitId, getDay: () => selectedDay, isExpanded: () => expanded, onSelect: selectVisit, onDetails: showDetails });
  const validPosition = value => value && Number.isFinite(value.lng) && Number.isFinite(value.lat) && Math.abs(value.lng) <= 180 && Math.abs(value.lat) <= 90;
  const normalize = value => String(value || '').replace(/[\s（）()·]/g, '').toLowerCase();
  function message(text) { status.textContent = text; status.hidden = !text; }

  function notifyResize() {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => { resizePending = false; syntheticResize = true; window.dispatchEvent(new Event('resize')); syntheticResize = false; });
  }
  function setHeight() { if (!disposed && presentation.fitHeight()) notifyResize(); }
  function collapse({ restore = true } = {}) {
    if (!expanded) return;
    expanded = false; presentation.setExpanded(false);
    map?.setStatus({ dragEnable: !coarse, scrollWheel: false }); notifyResize();
    if (restore) presentation.restoreReading(reading);
  }
  function expand() {
    if (!ready || failed) return;
    reading = presentation.captureReading();
    expanded = true; presentation.setExpanded(true); renderCards();
    map.setStatus({ dragEnable: true, scrollWheel: !coarse }); setHeight(); requestAnimationFrame(() => requestAnimationFrame(setHeight));
  }
  function unavailable() {
    failed = true; collapse({ restore: false }); toggle.disabled = true; frame.hidden = true; stage.classList.add('map-unavailable');
    map?.destroy(); map = null; ready = false; markerRecords = []; message(t('Map unavailable. You can still read the itinerary.', '地图暂不可用，行程仍可正常阅读。'));
  }
  async function json(path) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try { const response = await fetch(new URL(path, tripURL), { cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal }); if (!response.ok) throw new Error('Map metadata unavailable.'); return await response.json(); }
    finally { clearTimeout(timer); }
  }
  async function sdk(config) {
    const service = new URL(config.servicePath, tripURL), expected = new URL('../_AMapService', tripURL);
    if (service.href !== expected.href || service.origin !== location.origin || typeof config.key !== 'string' || !/^[a-zA-Z0-9_-]{8,256}$/.test(config.key)) throw new Error('Map configuration unavailable.');
    window._AMapSecurityConfig = { serviceHost: service.href };
    if (window.AMap?.Map) return window.AMap;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'), url = new URL('https://webapi.amap.com/maps'); url.searchParams.set('v', '2.0'); url.searchParams.set('key', config.key); script.src = url.href; script.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => reject(new Error('Map SDK unavailable.')), 12000);
      script.onload = () => { clearTimeout(timer); window.AMap?.Map ? resolve() : reject(new Error('Map SDK unavailable.')); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('Map SDK unavailable.')); }; document.head.append(script);
    });
    return window.AMap;
  }
  async function resolveQueries(AMap, records) {
    const pending = records.filter(record => allowed.has(record.id) && record.status === 'unresolved' && typeof record.query === 'string' && record.query.trim() && typeof record.city === 'string' && record.city.trim());
    if (!pending.length) return;
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Place lookup unavailable.')), 12000); AMap.plugin('AMap.PlaceSearch', () => { clearTimeout(timer); typeof AMap.PlaceSearch === 'function' ? resolve() : reject(new Error('Place lookup unavailable.')); }); });
    let cursor = 0; const deadline = Date.now() + 12000;
    async function worker() {
      while (cursor < pending.length && Date.now() < deadline && !failed) {
        const record = pending[cursor++];
        const result = await new Promise(resolve => {
          const timer = setTimeout(() => resolve(null), Math.max(1, Math.min(4000, deadline - Date.now())));
          try { new AMap.PlaceSearch({ city: record.city, citylimit: true, pageSize: 3, pageIndex: 1, extensions: 'base' }).search(record.query, (state, value) => { clearTimeout(timer); resolve(state === 'complete' ? value : null); }); }
          catch { clearTimeout(timer); resolve(null); }
        });
        const candidates = (Array.isArray(result?.poiList?.pois) ? result.poiList.pois : []).filter(poi => validPosition(poi.location));
        const accepted = new Set([normalize(record.query)]), city = normalize(record.city).replace(/市$/, '');
        const query = normalize(record.query);
        if (city && query.startsWith(city)) { const localName = query.slice(city.length).replace(/^市/, ''); if (localName.length >= 2) accepted.add(localName); }
        const exact = candidates.filter(poi => accepted.has(normalize(poi.name)));
        const chosen = candidates.length === 1 && Number(result.poiList.count) === 1 ? candidates[0] : exact.length === 1 ? exact[0] : null;
        if (chosen) { positions.set(record.id, { lng: chosen.location.lng, lat: chosen.location.lat }); if (!map) construct(); else draw(!cameraTouched, true); }
      }
    }
    await Promise.all([worker(), worker()]);
  }
  function openPopup(group) {
    if (openPlace === group[0].place) return;
    popup?.close(); openPlace = group[0].place;
    const content = document.createElement('div'); content.className = 'map-popup';
    const title = document.createElement('h3'); title.textContent = group[0].name; content.append(title);
    for (const visit of group) {
      const row = document.createElement('div'); row.className = 'map-popup-visit'; const label = document.createElement('span'); label.textContent = `${days[visit.day - 1]} ${visit.time || ''}`;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = t('View details', '查看详情'); button.dataset.mapVisitTarget = visit.id;
      button.addEventListener('click', () => showDetails(visit)); row.append(label, button); content.append(row);
    }
    popup = new window.AMap.InfoWindow({ content, offset: new window.AMap.Pixel(0, -20) }); popup.on('close', () => { openPlace = null; });
    const point = positions.get(group[0].place); popup.open(map, [point.lng, point.lat]);
  }
  function draw(fit = false, preservePopup = false) {
    if (!map || !active) return;
    if (!preservePopup) { popup?.close(); openPlace = null; }
    if (overlays.length) map.remove(overlays); overlays = []; markerRecords = [];
    const current = visits.filter(visit => selectedDay === 'overview' || `day-${visit.day}` === selectedDay), groups = new Map();
    for (const visit of current) if (positions.has(visit.place)) { if (!groups.has(visit.place)) groups.set(visit.place, []); groups.get(visit.place).push(visit); }
    if (!current.some(visit => visit.id === activeVisitId)) activeVisitId = current[0]?.id;
    for (const group of groups.values()) {
      const point = positions.get(group[0].place), pin = document.createElement('button'); pin.type = 'button'; pin.className = 'travel-map-pin'; pin.textContent = String(current.findIndex(visit => visit.id === group[0].id) + 1); pin.setAttribute('aria-label', t(group[0].name + ', view on map',group[0].name + '，查看地图地点'));
      const marker = new window.AMap.Marker({ position: [point.lng, point.lat], content: pin, title: group[0].name, anchor: 'center' });
      const choose = () => { const visit = group.find(value => value.id === activeVisitId) || group[0]; selectVisit(visit.id); openPopup(group); };
      pin.addEventListener('click', event => { event.stopPropagation(); choose(); }); marker.on('click', choose); overlays.push(marker); markerRecords.push({ group, pin, marker });
    }
    const palette = ['#1672d4', '#8068b5', '#2b8b78', '#b57628', '#bc5b6c', '#677184', '#4c8795'];
    for (const value of segments()) {
      if (value.origin.lng === value.destination.lng && value.origin.lat === value.destination.lat) continue;
      const road = routeCache.get(value.key)?.path;
      overlays.push(new window.AMap.Polyline({ path: road || [[value.origin.lng, value.origin.lat], [value.destination.lng, value.destination.lat]], strokeColor: palette[Number(value.day.slice(4)) - 1], strokeWeight: 3, strokeOpacity: .8, strokeStyle: road ? 'solid' : 'dashed' }));
    }
    if (overlays.length) { map.add(overlays); if (fit) map.setFitView(overlays, true, [28, 28, expanded ? 210 : 28, 28], 15); }
    selectVisit(activeVisitId, { scroll: false });
    message(ready ? '' : t('Loading map…','正在加载地图…')); requestRoutes();
  }
  function construct() {
    if (map || !active || failed) return;
    const first = positions.values().next().value;
    if (!first || !window.AMap?.Map) return;
    map = new window.AMap.Map(canvas, { viewMode: '2D', center: [first.lng, first.lat], zoom: 10, resizeEnable: true, dragEnable: !coarse, scrollWheel: false, touchZoom: true, animateEnable: false });
    const currentMap = map, timer = setTimeout(() => { if (!ready && !failed && map === currentMap) unavailable(); }, 12000);
    map.on('complete', () => { if (failed || map !== currentMap || ready) return; clearTimeout(timer); ready = true; toggle.disabled = false; message(''); }); draw(true); notifyResize();
  }
  async function initialize() {
    if (loading || failed) return loading;
    stage.hidden = false;
    loading = (async () => {
      const config = await json('map/config'); if (!config.enabled || config.provider !== 'amap') throw new Error('Map unavailable.');
      const [AMap, result] = await Promise.all([sdk(config), json('map/places')]);
      if (result.provider !== 'amap' || result.crs !== 'GCJ02' || !Array.isArray(result.places)) throw new Error('Map locations unavailable.');
      for (const record of result.places) if (allowed.has(record.id) && record.status === 'resolved' && validPosition(record.position)) positions.set(record.id, record.position);
      construct();
      try { await resolveQueries(AMap, result.places); } catch {}
      if (!positions.size) { unavailable(); return; }
      construct(); if (map) draw(!cameraTouched, true);
    })().catch(unavailable);
    return loading;
  }
  canvas.addEventListener('pointerdown', () => { cameraTouched = true; }, { passive: true });
  toggle.addEventListener('click', () => { if (expanded) collapse(); else expand(); });
  document.addEventListener('keydown', event => { if (expanded && event.key === 'Escape') { event.preventDefault(); collapse(); toggle.focus(); } });
  const layoutObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(setHeight) : null;
  layoutObserver?.observe(document.body);
  addEventListener('resize', () => { if (!syntheticResize) { setHeight(); if (expanded) selectVisit(activeVisitId); } }); window.visualViewport?.addEventListener('resize', setHeight);
  addEventListener('scroll', setHeight, { passive: true });
  addEventListener('pagehide', event => { if (!event.persisted) { disposed = true; layoutObserver?.disconnect(); map?.destroy(); } });
  return { select(id, visible) {
    const changed = selectedDay !== id, wasActive = active, hadMap = Boolean(map);
    selectedDay = id; active = visible;
    if (changed) { cameraTouched = false; activeVisitId = null; if (expanded) renderCards(); }
    if (!visible) { collapse({ restore: false }); return; }
    if (!loading) void initialize(); else if (!map) construct();
    if (hadMap && !wasActive) {
      notifyResize();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (active && selectedDay === id) draw(changed || !cameraTouched, !changed); }));
    } else if (changed) draw(true);
  }, collapse };
}
