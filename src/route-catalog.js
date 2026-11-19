import { travelLocaleScript } from './interface-locale.js';
import { appStyles } from './app-styles.js';
import { brand, sectionLink } from './sidebar.js';

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatDate = date => date.replaceAll('-', '.');

export const CATEGORY = [
  { id: 'all', label: '全部路线', icon: '▤' },
  { id: 'upcoming', label: '待出行', icon: '↗' },
  { id: 'past', label: '已出行', icon: '✓' },
];

export function categorySidebar(routes) {
  const links = CATEGORY.map(({ id, label, icon }, index) => {
    const count = id === 'all' ? routes.length : routes.filter(route => route.status === id).length;
    return sectionLink(id, label, icon, count, '条路线', index === 0);
  }).join('');
  return brand + '<nav class="section-nav" aria-label="旅行路线">' + links + '</nav>';
}

export function renderRouteCard(route, { href = route.id + '/', cover = route.cover, coverPrefix = '' } = {}) {
  return '<a class="trip-card route-card" data-status="' + escape(route.status) + '" href="' + escape(href) + '">' +
    (cover === null ? '<span class="route-cover route-cover-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg></span>' : '<img class="route-cover" src="' + escape(coverPrefix + cover) + '" alt="' + escape(route.coverAlt) + '" width="112" height="112" loading="lazy">') +
    '<div class="route-card-copy"><h2>' + escape(route.title) + '</h2>' +
    '<p class="route-card-facts"><span><time datetime="' + escape(route.startDate) + '">' + escape(formatDate(route.startDate)) + '</time> – <time datetime="' + escape(route.endDate) + '">' + escape(formatDate(route.endDate)) + '</time></span><span aria-hidden="true"> · </span><span>' + route.placeCount + ' 个地点</span>' + (Number.isSafeInteger(route.cityCount) ? '<span aria-hidden="true"> · </span><span>' + route.cityCount + ' 座城市</span>' : '') + '</p>' +
    '<p class="route-edited">最后编辑：<time datetime="' + escape(route.editedAt) + '">' + escape(formatDate(route.editedAt)) + '</time></p></div></a>';
}

export const catalogStyles = `
.route-cover-placeholder{display:grid!important;place-items:center;color:#8d8d97}.route-cover-placeholder svg{width:32px;height:32px;fill:currentColor}

.catalog-list{display:grid;gap:14px;margin-top:24px;border:0}.trip-card.route-card{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:center;gap:20px;padding:16px;background:#fff;border:1px solid var(--line);border-radius:10px;color:var(--ink);text-decoration:none;min-width:0}.trip-card.route-card:hover{background:#f7f7f9;border-color:#b9bac4;text-decoration:none}.route-cover{display:block;width:112px;height:112px;aspect-ratio:1;object-fit:cover;border-radius:7px;background:var(--selection)}.route-card-copy{min-width:0}.trip-card.route-card h2{font-size:1.125rem;font-weight:600;color:var(--ink);margin:0 0 9px;overflow-wrap:anywhere}.trip-card.route-card p{font-size:.8125rem;line-height:1.6;margin:0;max-width:none;color:var(--muted)}.route-card-facts{overflow-wrap:anywhere}.trip-card.route-card .route-edited{margin-top:14px;font-size:.75rem}.route-card[hidden],.catalog-empty[hidden]{display:none!important}.catalog-empty{padding:40px 0;color:var(--muted);font-size:.9375rem}.catalog-anchor{scroll-margin-top:24px}
@media(max-width:760px){.catalog-list{margin-top:20px;gap:12px}.trip-card.route-card{grid-template-columns:80px minmax(0,1fr);gap:12px;padding:12px}.route-cover{width:80px;height:80px}.trip-card.route-card h2{font-size:1rem;margin-bottom:6px}.trip-card.route-card p{font-size:.75rem}.trip-card.route-card .route-edited{margin-top:8px}}
@media(max-width:360px){.trip-card.route-card{grid-template-columns:68px minmax(0,1fr);gap:10px;padding:10px}.route-cover{width:68px;height:68px}}
`;

export const catalogScript = `<script data-travel-catalog>
(() => {
  const labels = { all: '全部路线', upcoming: '待出行', past: '已出行' };
  const links = [...document.querySelectorAll('.section-nav a')];
  const cards = [...document.querySelectorAll('.route-card')];
  const title = document.querySelector('#page-title');
  const empty = document.querySelector('.catalog-empty');
  function selectCategory() {
    const requested = location.hash.slice(1);
    const category = Object.hasOwn(labels, requested) ? requested : 'all';
    title.textContent = labels[category];
    let visible = 0;
    for (const card of cards) {
      card.hidden = category !== 'all' && card.dataset.status !== category;
      if (!card.hidden) visible++;
    }
    empty.hidden = visible > 0;
    for (const link of links) {
      const selected = link.hash === '#' + category;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }
  for (const link of links) link.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    selectCategory();
  });
  addEventListener('hashchange', selectCategory);
  addEventListener('popstate', selectCategory);
  selectCategory();
})();
${travelLocaleScript}
</script>`;

export function renderCatalogPage(routes) {
  const body = '<div class="catalog-anchor" id="all"><span id="upcoming"></span><span id="past"></span><h1 id="page-title">全部路线</h1><div class="catalog-list">' + routes.map(route => renderRouteCard(route)).join('') + '</div><p class="catalog-empty" role="status" hidden>这里还没有路线</p></div>';
  return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>旅行路线 · Travel</title><style>' + appStyles + catalogStyles + '</style></head><body><a class="skip-link" href="#main">跳到正文</a><div class="app-shell"><aside class="app-sidebar" aria-label="路线分类">' + categorySidebar(routes) + '</aside><main class="app-main" id="main" aria-labelledby="page-title">' + body + '</main></div>' + catalogScript + '</body></html>\n';
}
