import { installTravelLocale, readTravelLanguage } from './interface-locale.js';
import { getPlaceDetails, formatDuration, formatOpeningHours, formatPrice, formatTravelLeg } from './place-display.js';
import { mapStyles, renderMapInterface, createItineraryMap } from './itinerary-map.js';
import { createLeafletMap } from './leaflet-map.js';
import { createMapPresentation } from './map-presentation.js';
import { preparationStyles, validatePreparation, renderPreparation, memoLinksScript } from './preparation.js';
import { placeSearchStyles, renderPlaceSearch } from './place-search.js';
import { placeIcon } from './place-icons.js';
import { appStyles } from './app-styles.js';
import { budgetStyles, budgetTotal, renderBudget } from './budget.js';
import { catalogStyles, categorySidebar, renderRouteCard } from './route-catalog.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const names = ['第一天', '第二天', '第三天', '第四天', '第五天', '第六天', '第七天'];
const dateLabel = date => Number(date.slice(5, 7)) + '月' + Number(date.slice(8)) + '日';

function placeLabel(place) {
  return placeIcon(place.type) + escape(place.name);
}

function routeLine(stops, places) {
  return stops.map(stop => '<span class="route-stop">' + placeLabel(places.get(stop.place)) + '</span>').join('<span class="route-arrow" aria-hidden="true">→</span>');
}

export function navigationUrl(from, to, mode, region) {
  const display = formatTravelLeg({ mode }), navigationMode = display.routeMode || ({ '景区车': 'driving', '接驳车': 'driving' })[display.modeLabel];
  if (!navigationMode) return null;
  const url = new URL('https://api.map.baidu.com/direction');
  url.search = new URLSearchParams({ origin: from, destination: to, mode: navigationMode, ...(region ? {region} : {}), output: 'html', coord_type: 'bd09ll', src: 'webapp.praxis.travel' });
  return url.href;
}

function legRow(leg, from, to, region) {
  const display = formatTravelLeg(leg), english = formatTravelLeg(leg, 'en');
  if ([display.modeLabel, display.durationLabel, display.distanceLabel].every(value => value === '—')) return '';
  const url = navigationUrl(from, to, leg.mode, region);
  const navigation = url ? '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer" data-travel-en-label="Directions from ' + escape(from) + ' to ' + escape(to) + '" aria-label="从' + escape(from) + '导航至' + escape(to) + '">导航 <span aria-hidden="true">↗</span></a>' : '';
  return '<div class="travel-leg"><span><span data-travel-en="' + escape(english.modeLabel + ' ' + english.durationLabel) + '">' + escape(display.modeLabel) + ' ' + escape(display.durationLabel) + '</span><span class="leg-separator">·</span><span data-travel-en="' + escape(english.distanceLabel) + '">' + escape(display.distanceLabel) + '</span></span>' + navigation + '</div>';
}

const styles = `
[hidden]{display:none!important}.detail-heading{margin-bottom:6px}.detail-heading h1{margin:0}.detail-local-tabs{display:flex;flex-wrap:wrap;gap:0 24px;border-bottom:1px solid var(--line);margin:0 0 20px;font-size:.875rem}.detail-local-tabs a{display:inline-flex;align-items:center;min-height:44px;padding:4px 2px 10px;border-bottom:2px solid transparent;color:var(--muted);text-decoration:none}.detail-local-tabs a[aria-selected=true]{border-bottom-color:var(--ink);color:var(--ink);font-weight:600}.detail-local-tabs a:hover{color:var(--ink)}.day-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.day-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:6px 15px;background:#f0f0f4;border:1px solid transparent;border-radius:999px;color:var(--muted);text-decoration:none;font-size:.8125rem;white-space:nowrap}.day-tabs a[aria-selected=true]{background:var(--ink);color:white;font-weight:600}.day-tabs a:hover{border-color:#9b9ba4}.plan-meta{color:var(--muted);font-size:.8125rem;margin:0 0 18px}.overview-days{display:grid;gap:12px}.overview-day-card{display:block;padding:16px 18px;background:white;border:1px solid var(--line);border-radius:10px;color:var(--ink);text-decoration:none}.overview-day-card:hover{background:#f7f7f9;border-color:#b9bac4;text-decoration:none}.overview-day-top{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin-bottom:10px}.overview-day-top strong{font-size:.875rem;font-weight:600}.overview-day-top time{color:var(--muted);font-size:.75rem}.overview-day-top .day-theme{margin-left:auto;font-size:.8125rem;color:var(--muted)}.day-route{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:.875rem;line-height:1.8}.route-stop{display:inline-flex;align-items:center;gap:4px}.route-arrow{color:#76767f;margin:0 2px}.place-type{display:inline-flex;align-items:center;justify-content:center;width:1.125rem;height:1.125rem;flex-shrink:0;color:var(--muted)}.place-icon{display:block;width:100%;height:100%;fill:currentColor}.day.day-panel{padding:0;border:0;max-width:none}.day-panel h2{font-size:1.125rem;margin:0 0 8px}.day-plan{padding:0 0 20px;margin-bottom:22px;border-bottom:1px solid var(--line)}.timeline{position:relative;--timeline-axis:61.5px}.timeline-item{position:relative}.timeline-item:not(:last-child)::before{content:'';position:absolute;left:calc(var(--timeline-axis) - .5px);top:20.5px;bottom:-20.5px;border-left:1px dashed #c1c1ca}.timeline-stop{position:relative;display:grid;grid-template-columns:66px minmax(0,1fr);gap:16px;align-items:start}.timeline-stop:before{content:'';position:absolute;left:calc(var(--timeline-axis) - 3.5px);top:17px;width:7px;height:7px;border-radius:50%;background:#8d8d97;z-index:1;box-shadow:0 0 0 4px var(--paper)}.stop-time{font-size:.75rem;font-weight:500;font-variant-numeric:tabular-nums;color:var(--muted);padding-top:11px}.place-card{display:grid;grid-template-columns:140px minmax(0,1fr);align-items:center;gap:18px;padding:12px;background:#fff;border:1px solid var(--line);border-radius:10px;min-width:0}.place-card img{display:block;width:140px;height:112px;object-fit:cover;border-radius:6px;background:var(--selection)}.place-card-copy{min-width:0}.place-card h3{display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:1rem;font-weight:600}.place-card p{font-size:.8125rem;color:var(--muted);margin:0 0 4px}.place-card p:last-child{margin-bottom:0}.place-schedule{display:flex;flex-wrap:wrap;gap:2px 14px}.place-card .place-price{color:var(--ink)}.travel-leg{position:relative;display:flex;align-items:center;flex-wrap:nowrap;gap:4px 14px;min-height:36px;padding:2px 0 2px 94px;font-size:.75rem;color:var(--muted)}.travel-leg>span{min-width:0}.travel-leg a{flex-shrink:0;display:inline-flex;align-items:center;min-height:32px;gap:3px}.leg-separator{margin:0 8px}.arrival-leg{margin-bottom:4px}.arrival-leg .travel-leg{padding-left:94px;min-height:44px}.arrival-label{font-size:.75rem;color:var(--muted);padding-left:82px;margin-bottom:0}.photo-credits{font-size:.75rem;color:var(--muted);overflow-wrap:anywhere}.photo-credits summary{cursor:pointer;min-height:36px;padding:8px 0}.photo-credits ul{padding-left:18px}.photo-credits li{margin-bottom:8px}.visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.scope-heading{margin-bottom:0}
@media(max-width:760px){.detail-heading{margin-bottom:6px}.day-tabs{gap:5px}.day-tabs a{min-height:44px;padding:7px 12px}.overview-day-card{padding:14px}.overview-day-top .day-theme{width:100%;margin:0}.timeline-stop{grid-template-columns:46px minmax(0,1fr);gap:10px}.timeline{--timeline-axis:43px}.place-card{grid-template-columns:80px minmax(0,1fr);padding:10px;gap:10px}.place-card img{width:80px;height:96px}.place-card h3{font-size:.875rem;margin-bottom:8px;overflow-wrap:anywhere}.place-card p{font-size:.75rem}.stop-time{font-size:.6875rem}.travel-leg,.arrival-leg .travel-leg{padding-left:66px;gap:2px 10px;min-height:44px;padding-top:0;padding-bottom:0;font-size:.6875rem}.arrival-label{padding-left:56px}.leg-separator{margin:0 5px}.travel-leg a{min-height:44px}.day-route{font-size:.8125rem}.plan-meta{margin-bottom:20px}.day-plan{margin-bottom:18px}.route-stop{max-width:100%;overflow-wrap:anywhere}}
@media print{.day-tabs,.detail-local-tabs,.scope-catalog{display:none!important}[data-main-panel][hidden],.trip-panel[hidden],.day-panel[hidden]{display:block!important}.place-card{break-inside:avoid}.photo-credits{display:block}.timeline-stop{break-inside:avoid}}
`;

export const itineraryStyles = styles;

export const itineraryScript = `<script data-travel-itinerary>
(() => {
  const lang = (${readTravelLanguage.toString()})();
  const t = (english,chinese) => lang === 'en' ? english : chinese;
  const panels = [...document.querySelectorAll('[data-trip-panel]')];
  const tabs = [...document.querySelectorAll('.day-tabs a')];
  const mainPanels = [...document.querySelectorAll('[data-main-panel]')];
  const mainTabs = [...document.querySelectorAll('.detail-local-tabs a')];
  const detail = document.querySelector('[data-detail]');
  const catalog = document.querySelector('.scope-catalog');
  const sidebar = [...document.querySelectorAll('.section-nav a')];
  const categories = {all:'全部路线',upcoming:'待出行',past:'已出行'};
  const shared = location.pathname.startsWith('/share/travel/');
  let selectedDay = 'overview';
  const mapFactory = document.querySelector('[data-itinerary-workspace]').dataset.mapProvider === 'leaflet' ? (${createLeafletMap.toString()}) : (${createItineraryMap.toString()});
  const mapController = mapFactory({ t, createPresentation: ${createMapPresentation.toString()}, onVisit(visit) {
    const hash = '#day-' + visit.day;
    if (location.hash !== hash) history.pushState(null, '', hash);
    select();
    requestAnimationFrame(() => {
      const target = document.getElementById(visit.id);
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      const heading = target.querySelector('h3');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    });
  } });
  function enhanceTabs(selector, links, targets) {
    const nav = document.querySelector(selector);
    nav.setAttribute('role','tablist');
    for(const tab of links) {
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-controls',tab.hash.slice(1));
    }
    for(const panel of targets) panel.setAttribute('role','tabpanel');
    nav.addEventListener('keydown',event => {
      const index = links.indexOf(event.target);
      if(index < 0) return;
      let next;
      if(event.key === 'ArrowRight') next = (index+1)%links.length;
      if(event.key === 'ArrowLeft') next = (index-1+links.length)%links.length;
      if(event.key === 'Home') next = 0;
      if(event.key === 'End') next = links.length-1;
      if(next === undefined) return;
      event.preventDefault();
      links[next].click(); links[next].focus();
    });
  }
  function markTabs(links,id) {
    for(const tab of links) {
      const selected = tab.hash === '#' + id;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }
  enhanceTabs('.detail-local-tabs',mainTabs,mainPanels);
  enhanceTabs('.day-tabs',tabs,panels);
  function select() {
    const requested = location.hash.slice(1), aliases = {route:'overview',days:'day-1',booking:'budget',todo:'preparation'};
    const hash = aliases[requested] || requested;
    const category = Object.hasOwn(categories,hash) ? hash : null;
    document.querySelector('main').setAttribute('aria-labelledby',category ? 'scope-title' : 'page-title');
    detail.hidden = Boolean(category);
    catalog.hidden = !category;
    document.querySelector('#scope-title').textContent = categories[category] || '全部路线';
    const emptyCategory = Boolean(category && category !== 'all' && category !== catalog.querySelector('.route-card').dataset.status);
    catalog.querySelector('.route-card').hidden = emptyCategory;
    catalog.querySelector('.catalog-empty').hidden = !emptyCategory;
    const mode = ['budget','preparation'].includes(hash) ? hash : 'itinerary';
    for(const panel of mainPanels) panel.hidden = panel.id !== mode;
    markTabs(mainTabs,mode);
    if (mode === 'itinerary' && !category) {
      if (panels.some(panel => panel.id === hash)) selectedDay = hash;
      else if (hash !== 'itinerary') selectedDay = 'overview';
    }
    const id = selectedDay;
    for(const panel of panels) panel.hidden = panel.id !== id;
    markTabs(tabs,id);
    mapController.select(id, mode === 'itinerary' && !category);
    const currentTab = tabs.find(tab => tab.hash === '#' + id), strip = document.querySelector('.day-tabs');
    if (currentTab && strip) {
      const left = currentTab.offsetLeft - strip.offsetLeft, right = left + currentTab.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
    }
    for(const link of sidebar) {
      const selected = link.hash === '#' + (category || 'all');
      link.classList.toggle('active',selected);
      if(selected) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    }

  }
  document.addEventListener('click',event => {
    const link = event.target.closest('a[href^="#"]');
    if(!link || !link.matches('.detail-local-tabs a,.day-tabs a,.overview-day-card,.scope-catalog .route-card,.section-nav a') || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if(location.hash !== link.hash) history.pushState(null,'',link.hash);
    select();
    if(link.matches('.overview-day-card,.scope-catalog .route-card')) document.querySelector('.day-tabs a[aria-selected="true"]').focus({preventScroll:true});
    if(!link.matches('.day-tabs a,.detail-local-tabs a')) window.scrollTo({top:0,behavior:'instant'});
  });
  addEventListener('hashchange',select);
  addEventListener('popstate',select);
  select();
  ${memoLinksScript.trim()}
  if(!shared) {
    for(const link of sidebar) {
      link.href = '../' + link.hash;
      const counter = link.querySelector('.nav-count');
      counter.hidden = true;
    }
    fetch(new URL('../routes.json',location.href), {credentials:'same-origin'})
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Catalog unavailable.')))
      .then(({routes}) => {
        if(!Array.isArray(routes)) return;
        for(const link of sidebar) {
          const category = link.hash.slice(1);
          const count = category === 'all' ? routes.length : routes.filter(route => route.status === category).length;
          const counter = link.querySelector('.nav-count');
          counter.textContent = count; counter.setAttribute('aria-label',count + t(count === 1 ? ' route' : ' routes',' 条路线'));
          counter.hidden = false;
        }
      }).catch(() => {});
  }
  (${installTravelLocale.toString()})(lang);
})();
</script>`;

export function validateItinerary(data, route, { expectedDayCount, allowMissingPhotos = false, allowEmptyPlans = false } = {}) {
  if (!Number.isSafeInteger(data.travelers) || data.travelers < 1) throw new Error('Invalid traveler count.');
  budgetTotal(data.budget);
  validatePreparation(data.preparation);
  if (data.tripId !== route.id || !Array.isArray(data.days) || !data.days.length || data.days.length > 366 || (expectedDayCount !== undefined && data.days.length !== expectedDayCount)) throw new Error('Invalid itinerary identity or day count.');
  const places = new Map(data.places.map(place => [place.id, place]));
  if (places.size !== data.places.length || places.size !== route.placeCount) throw new Error('Invalid itinerary place count.');
  if (route.cityCount !== null && new Set(data.places.map(place => place.city).filter(Boolean)).size !== route.cityCount) throw new Error('Invalid itinerary city count.');
  for (const place of data.places) {
    if (!(allowMissingPhotos && (place.image === null || /^poi\/[a-z0-9.-]+$/.test(place.image))) && !/^[a-z0-9.-]+$/.test(place.image)) throw new Error('Invalid itinerary photo path.');
    getPlaceDetails(place);
  }
  for (const day of data.days) {
    if ((!allowEmptyPlans && !day.stops.length) || day.legs.length !== Math.max(0, day.stops.length - 1)) throw new Error('Invalid itinerary leg count.');
    for (const stop of day.stops) if (!places.has(stop.place)) throw new Error('Unknown itinerary place.');
  }
}

export function renderItinerary(trip, data, route, credits, options = {}) {
  options = { allowMissingPhotos:true, allowEmptyPlans:true, ...options };
  validateItinerary(data, route, options);
  const labels = options.dayLabels || data.days.map((_, index) => names[index] || '第' + (index + 1) + '天');
  const dayEnglish = labels.map((label,index) => label === '抵达日' ? 'Arrival day' : !options.dayLabels || names.includes(label) ? 'Day ' + (index + 1) : label);
  const fallbackRegion = route.region || undefined;
  const places = new Map(data.places.map(place => [place.id, place]));
  const tabs = ['<a id="tab-overview" href="#overview">总览</a>', ...data.days.map((day,index) => '<a id="tab-day-' + (index+1) + '" href="#day-' + (index+1) + '">' + labels[index] + '</a>')].join('');
  const overview = data.days.map((day,index) => '<a class="overview-day-card" href="#day-' + (index+1) + '"><div class="overview-day-top"><strong>' + labels[index] + '</strong><time datetime="' + day.date + '">' + dateLabel(day.date) + '</time><span class="day-theme">' + escape(day.title) + '</span></div><div class="day-route">' + routeLine(day.stops,places) + '</div></a>').join('');
  const photos = credits.length ? '<details class="photo-credits"><summary>图片来源</summary><ul>' + credits.map(photo => '<li><a href="' + escape(photo.source) + '" target="_blank" rel="noopener noreferrer">' + escape(photo.title) + '</a> · ' + escape(photo.author) + ' · <a href="' + escape(photo.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + escape(photo.license) + '</a> · 已缩放及裁切展示</li>').join('') + '</ul></details>' : '';
  const daily = data.days.map((day,index) => {
    const arrival = day.arrival ? '<div class="arrival-leg"><p class="arrival-label">从' + escape(day.arrival.from) + '出发</p>' + legRow(day.arrival,day.arrival.query,places.get(day.stops[0].place).query,places.get(day.stops[0].place).city || fallbackRegion) + '</div>' : '';
    const stops = day.stops.map((stop,position) => {
      const place = places.get(stop.place), details = getPlaceDetails(place);
      const duration = formatDuration(details.duration), hours = formatOpeningHours(details.openingHours), price = formatPrice(details.price);
      const image = place.image ? '<img src="assets/' + escape(place.image) + '" alt="' + escape(place.name) + '" width="140" height="112" loading="lazy">' : '<span class="place-photo-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg></span>';
      const schedule = details.duration.kind === 'unknown' && details.openingHours.kind === 'unknown' ? '' : '<p class="place-schedule"><span data-travel-en="' + escape((place.type === 'stay' ? 'Stay: ' : 'Suggested visit: ') + formatDuration(details.duration,'en')) + '">' + (place.type === 'stay' ? '住宿安排：' : '建议停留：') + escape(duration) + '</span><span class="opening-hours" data-travel-en="' + escape('Opening hours: ' + formatOpeningHours(details.openingHours,'en')) + '">开放时间：' + escape(hours) + '</span></p>';
      const priceRow = details.price.kind === 'unknown' ? '' : '<p class="place-price" data-travel-en="' + escape(formatPrice(details.price,'en')) + '">' + escape(price) + '</p>';
      const card = '<div class="timeline-stop"><time class="stop-time"' + (stop.time ? ' datetime="' + day.date + 'T' + stop.time + '"' : '') + '>' + escape(stop.time || '') + '</time><div class="place-card">' + image + '<div class="place-card-copy"><h3>' + placeLabel(place) + '</h3>' + schedule + priceRow + renderPlaceSearch(place) + '</div></div></div>';
      return '<div class="timeline-item" id="visit-' + (index+1) + '-' + (position+1) + '" data-map-visit data-map-day="' + (index+1) + '" data-map-position="' + (position+1) + '" data-map-place="' + escape(place.id) + '" data-map-name="' + escape(place.name) + '" data-map-time="' + escape(stop.time || '') + '" data-map-duration-label="' + escape(duration) + '" data-map-duration-en="' + escape(formatDuration(details.duration,'en')) + '" data-map-leg-mode="' + escape(day.legs[position] ? formatTravelLeg(day.legs[position]).routeMode || '' : '') + '"' + (options.mapProvider === 'leaflet' ? ' data-map-lat="' + place.position.lat + '" data-map-lng="' + place.position.lng + '" data-map-local-name="' + escape(place.localName || place.name) + '" data-map-day-label="' + escape(labels[index] + ' ' + dateLabel(day.date)) + '" data-map-day-label-en="' + escape(dayEnglish[index] + ' ' + day.date) + '"' : '') + '>' + card + (day.legs[position] ? legRow(day.legs[position],place.query,places.get(day.stops[position+1].place).query,places.get(day.stops[position+1].place).city || place.city || fallbackRegion) : '') + '</div>';
    }).join('');
    return '<article class="day day-panel" id="day-' + (index+1) + '" data-trip-panel aria-labelledby="tab-day-' + (index+1) + '"><h2><span data-day-label>' + labels[index] + '</span> · ' + escape(day.title) + '</h2><p class="visually-hidden">' + escape(trip.days[index].title) + '</p><div class="day-plan"><div class="day-route">' + routeLine(day.stops,places) + '</div></div><div class="timeline">' + arrival + stops + '</div></article>';
  }).join('');
  const localCard = renderRouteCard(route,{href:'#overview',cover:Object.hasOwn(options,'cover') ? options.cover : (route.cover || null)});
  const summaryEn = `${route.startDate} – ${route.endDate} · ${data.days.length} days · ${data.days.length - 1} nights · ${data.travelers} ${data.travelers === 1 ? 'traveler' : 'travelers'}`;
  const information = '<p class="plan-meta" data-travel-en="' + escape(summaryEn) + '">' + dateLabel(route.startDate) + ' – ' + dateLabel(route.endDate) + ' · ' + data.days.length + ' 天 ' + (data.days.length - 1) + ' 晚 · ' + data.travelers + ' 人</p>';
  const mainTabs = '<nav class="detail-local-tabs" aria-label="行程功能"><a id="tab-itinerary" href="#itinerary">行程详情</a><a id="tab-budget" href="#budget">预算管理</a><a id="tab-preparation" href="#preparation">出行准备</a></nav>';
  const body = '<div class="scope-catalog" hidden><span id="all"></span><span id="upcoming"></span><span id="past"></span><h2 id="scope-title">全部路线</h2><div class="catalog-list">' + localCard + '</div><p class="catalog-empty" hidden>这里还没有路线</p></div><div data-detail><div class="detail-heading"><h1 id="page-title">' + escape(trip.title) + '</h1></div>' + information + mainTabs + '<div id="itinerary" data-main-panel data-itinerary-workspace' + (options.mapProvider ? ' data-map-provider="' + options.mapProvider + '"' : '') + ' aria-labelledby="tab-itinerary">' + (options.mapProvider === 'leaflet' ? renderMapInterface().replace('实线表示道路路线，虚线仅表示地点连线。', '虚线仅表示地点顺序连线，不代表实际道路路线。') : renderMapInterface()) + '<nav class="day-tabs" aria-label="行程日期">' + tabs + '</nav><div data-itinerary-details><section id="overview" class="trip-panel" data-trip-panel aria-labelledby="tab-overview"><h2 class="visually-hidden">行程总览</h2><div class="overview-days">' + overview + '</div></section>' + daily + '</div></div><section id="budget" data-main-panel aria-labelledby="tab-budget">' + renderBudget(data.budget) + '</section><section id="preparation" data-main-panel aria-labelledby="tab-preparation">' + renderPreparation(data.preparation) + photos + '</section></div>';

  return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>' + escape(trip.title) + ' · Travel</title><style>' + appStyles + catalogStyles + styles + mapStyles + budgetStyles + placeSearchStyles + preparationStyles + '</style></head><body><a class="skip-link" href="#main">跳到正文</a><div class="app-shell"><aside class="app-sidebar" aria-label="路线分类">' + categorySidebar([route]) + '</aside><main class="app-main" id="main" aria-labelledby="page-title">' + body + '</main></div>' + itineraryScript + '</body></html>\n';
}
