/** App-owned Leaflet adapter. Coordinates remain the source's [latitude, longitude]. */
export function createLeafletMap({ onVisit = () => {}, createPresentation, t = (english) => english } = {}) {
  const empty = { select() {}, collapse() {} };
  let path;
  try { path = decodeURIComponent(location.pathname); } catch { return empty; }
  if (/^\/share\/travel(?:\/|$)/.test(path)) return empty;
  const workspace = document.querySelector('[data-itinerary-workspace]'), stage = document.querySelector('[data-travel-map]');
  const canvas = document.querySelector('#travel-map-canvas'), frame = document.querySelector('[data-map-frame]');
  const toggle = document.querySelector('[data-map-toggle]'), status = document.querySelector('[data-map-status]');
  const details = document.querySelector('[data-itinerary-details]'), strip = document.querySelector('[data-map-cards]');
  if (!workspace || !stage || !canvas || !toggle || !details || !strip) return empty;
  const visits = [...document.querySelectorAll('[data-map-visit]')].map(node => ({
    id: node.id, day: Number(node.dataset.mapDay), position: Number(node.dataset.mapPosition), place: node.dataset.mapPlace,
    name: node.dataset.mapName, localName: node.dataset.mapLocalName, dayLabel: t(node.dataset.mapDayLabelEn || node.dataset.mapDayLabel,node.dataset.mapDayLabel), metaLabel: t(node.dataset.mapDayLabelEn || node.dataset.mapDayLabel,node.dataset.mapDayLabel),
    point: [Number(node.dataset.mapLat), Number(node.dataset.mapLng)], image: node.querySelector('.place-card img')?.getAttribute('src'), node,
  }));
  const colors = ['#2d7d93', '#6f8b55', '#9a7621', '#c85f3d', '#2f6f9f', '#7c6f3d'];
  let map, layer, selected = 'overview', active = false, expanded = false, failed = false, loading, chosen, records = [], reading, layoutPending = false;
  const rows = () => visits.filter(visit => selected === 'overview' || selected === 'day-' + visit.day);
  const presentation = createPresentation({ t, strip, workspace, details, toggle, getRows: rows, getSelected: () => chosen, getDay: () => selected, isExpanded: () => expanded, onSelect: selectVisit, onDetails: showDetails });
  function resize() { requestAnimationFrame(() => { if (map && active) map.invalidateSize({ pan: false, animate: false }); }); }
  function height() { if (presentation.fitHeight()) resize(); }
  function scheduleLayout() {
    if (layoutPending) return;
    layoutPending = true;
    requestAnimationFrame(() => { layoutPending = false; height(); resize(); });
  }
  function collapse({ restore = true } = {}) {
    if (!expanded) return;
    expanded = false; presentation.setExpanded(false);
    if (matchMedia('(pointer:coarse)').matches) map?.dragging.disable();
    resize();
    if (restore) presentation.restoreReading(reading);
  }
  function showDetails(visit) { map?.closePopup(); collapse({ restore: false }); onVisit(visit); }
  function selectVisit(id, { scroll = true, pan = false } = {}) {
    const current = rows(), visit = current.find(value => value.id === id);
    if (!visit) return;
    chosen = id;
    presentation.select(id, { scroll });
    for (const record of records) {
      const target = record.group.find(value => value.id === id), displayed = target || record.group[0];
      record.pin.textContent = String(current.findIndex(value => value.id === displayed.id) + 1);
      record.pin.classList.toggle('is-active', Boolean(target)); record.pin.setAttribute('aria-pressed', String(Boolean(target)));
      record.marker.setZIndexOffset(target ? 300 : 0);
    }
    if (pan && expanded && map) {
      const point = map.latLngToContainerPoint(visit.point), limit = canvas.clientHeight - strip.offsetHeight - 44;
      if (point.x < 48 || point.x > canvas.clientWidth - 48 || point.y < 48 || point.y > limit) map.panTo(visit.point, { animate: false });
    }
  }
  function cards() {
    const current = rows(); if (!current.some(visit => visit.id === chosen)) chosen = current[0]?.id;
    presentation.render(); selectVisit(chosen);
  }
  function draw(fit = false) {
    if (!map || !active || failed) return;
    layer.clearLayers(); records = [];
    const current = rows(), byDay = new Map(), groups = new Map();
    for (const visit of current) {
      if (!byDay.has(visit.day)) byDay.set(visit.day, []); byDay.get(visit.day).push(visit.point);
      if (!groups.has(visit.place)) groups.set(visit.place, []); groups.get(visit.place).push(visit);
    }
    for (const [day, points] of byDay) if (points.length > 1) L.polyline(points, { color: colors[(day - 1) % colors.length], weight: 4, opacity: .85, dashArray: '7 6' }).addTo(layer);
    for (const group of groups.values()) {
      const visit = group[0], pin = document.createElement('button'); pin.type = 'button'; pin.className = 'travel-map-pin'; pin.setAttribute('aria-label', visit.name); pin.setAttribute('aria-pressed', 'false');
      const marker = L.marker(visit.point, { icon: L.divIcon({ html: pin, className: 'itinerary-marker', iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false }).addTo(layer);
      const popup = document.createElement('div'); popup.className = 'map-popup';
      const heading = document.createElement('h3'); heading.textContent = visit.name; popup.append(heading);
      const local = document.createElement('p'); local.textContent = visit.localName; popup.append(local);
      for (const item of group) {
        const row = document.createElement('div'); row.className = 'map-popup-visit';
        const text = document.createElement('span'); text.textContent = item.dayLabel;
        const detail = document.createElement('button'); detail.type = 'button'; detail.textContent = t('View details', '查看详情'); detail.addEventListener('click', () => showDetails(item)); row.append(text, detail); popup.append(row);
      }
      const links = visit.node.querySelector('[data-map-links]')?.cloneNode(true); if (links) popup.append(links);
      marker.bindPopup(popup); pin.addEventListener('click', () => { selectVisit(group.find(value => value.id === chosen)?.id || visit.id, { pan: true }); marker.openPopup(); });
      records.push({ group, pin, marker });
    }
    cards();
    if (fit && current.length) map.fitBounds(L.latLngBounds(current.map(visit => visit.point)), { padding: [34, 34], maxZoom: 12, animate: false });
  }
  function expand() {
    if (!map || failed) return;
    reading = presentation.captureReading();
    expanded = true; presentation.setExpanded(true); map.dragging.enable(); height(); cards();
    requestAnimationFrame(() => requestAnimationFrame(() => { height(); resize(); }));
  }
  function unavailable() {
    failed = true; collapse({ restore: false }); toggle.disabled = true; frame.hidden = true; stage.classList.add('map-unavailable'); status.hidden = false; status.textContent = t('Map unavailable. You can still read the itinerary.', '地图暂不可用，行程仍可正常阅读。'); map?.remove(); map = null;
  }
  async function load() {
    stage.hidden = false;
    try {
      if (!globalThis.L?.map) await new Promise((resolve, reject) => {
        const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; style.referrerPolicy = 'no-referrer'; document.head.append(style);
        const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.referrerPolicy = 'no-referrer';
        const timer = setTimeout(() => reject(new Error('Map unavailable.')), 12000);
        script.onload = () => { clearTimeout(timer); globalThis.L?.map ? resolve() : reject(new Error('Map unavailable.')); };
        script.onerror = () => { clearTimeout(timer); reject(new Error('Map unavailable.')); }; document.head.append(script);
      });
      if (failed) return;
      map = L.map(canvas, { scrollWheelZoom: false, dragging: !matchMedia('(pointer:coarse)').matches, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([64.9, -18.6], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      layer = L.layerGroup().addTo(map); toggle.disabled = false; status.hidden = true; draw(true); resize();
    } catch { unavailable(); }
  }
  toggle.addEventListener('click', () => expanded ? collapse() : expand());
  addEventListener('keydown', event => { if (event.key === 'Escape' && expanded) { collapse(); toggle.focus({ preventScroll: true }); } });
  addEventListener('resize', scheduleLayout); addEventListener('scroll', () => { if (expanded) scheduleLayout(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLayout);
  if (globalThis.ResizeObserver) new ResizeObserver(scheduleLayout).observe(document.body);
  return {
    select(day, visible) {
      const changed = day !== selected, wasActive = active; selected = day; active = visible;
      if (!visible) { collapse({ restore: false }); return; }
      if (!loading && !failed) loading = load();
      if (map) { map.invalidateSize({ pan: false, animate: false }); if (changed || !records.length) draw(true); else if (!wasActive) cards(); resize(); }
    }, collapse,
  };
}
