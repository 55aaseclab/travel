import { formatBudgetDates } from './budget.js';

const sceneIds = new Set(['air-in', 'air-out', 'hotel-in', 'hotel-out', 'taxi-in']);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const hasText = value => typeof value === 'string' && value.trim().length > 0;

export function validatePreparation(preparation) {
  if (!preparation || typeof preparation !== 'object' || !Array.isArray(preparation.beforeDeparture) || !Array.isArray(preparation.moments)) throw new Error('Invalid preparation groups.');
  const ids = new Set();
  for (const item of [...preparation.beforeDeparture, ...preparation.moments]) {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || ids.has(item.id) || !hasText(item.title) || !hasText(item.description)) throw new Error('Invalid or duplicate preparation item.');
    ids.add(item.id);
  }
  for (const moment of preparation.moments) {
    if (!sceneIds.has(moment.memoScene)) throw new Error('Unknown preparation Memo scene.');
    formatBudgetDates(moment.dates);
  }
  return preparation;
}

export function memoUrl(locationHref, scene) {
  const allowed = ['air-in', 'air-out', 'hotel-in', 'hotel-out', 'taxi-in'];
  if (!allowed.includes(scene)) return null;
  let current;
  try { current = new URL(locationHref); } catch { return null; }
  if (!['http:', 'https:'].includes(current.protocol)) return null;
  let path;
  try { path = decodeURIComponent(current.pathname); } catch { return null; }
  if (/^\/share\/travel(?:\/|$)/.test(path)) return null;
  const target = /^\/apps\/travel(?:\/|$)/.test(path) ? new URL('/apps/memo/', current.origin) : new URL(current.origin);
  if (!/^\/apps\/travel(?:\/|$)/.test(path)) target.port = '4325';
  target.username = '';
  target.password = '';
  target.search = '';
  target.hash = '/c/' + scene;
  return target.href;
}

function dateMarkup(dates) {
  const crossingYears = new Set(dates.map(date => date.slice(0, 4))).size > 1;
  return dates.map(date => '<time datetime="' + date + '">' + (crossingYears ? Number(date.slice(0, 4)) + '年' : '') + formatBudgetDates([date]) + '</time>').join('、');
}

export function renderPreparation(preparation) {
  validatePreparation(preparation);
  const tips = preparation.beforeDeparture.map(item => '<li class="preparation-tip"><h3>' + escape(item.title) + '</h3><p>' + escape(item.description) + '</p></li>').join('');
  const moments = preparation.moments.map(moment => '<li class="preparation-moment" data-memo-scene="' + moment.memoScene + '"><div class="preparation-copy"><h3>' + escape(moment.title) + '</h3><div class="preparation-dates">' + dateMarkup(moment.dates) + '</div><p>' + escape(moment.description) + '</p></div></li>').join('');
  return '<section class="preparation-group" aria-labelledby="preparation-before-title"><h2 id="preparation-before-title">出发前</h2>' + (tips ? '<ul class="preparation-list">' + tips + '</ul>' : '<p class="preparation-empty">暂无准备提示</p>') + '</section><section class="preparation-group" aria-labelledby="preparation-moments-title"><h2 id="preparation-moments-title">关键时刻</h2><p class="preparation-intro">出发、入住和离开前，把重要的事检查一遍。</p>' + (moments ? '<ul class="preparation-list">' + moments + '</ul>' : '<p class="preparation-empty">暂无关键时刻</p>') + '</section>';
}

export const memoLinksScript = `
if (!/^\\/share\\/travel(?:\\/|$)/.test(location.pathname)) {
  const preparationMemoUrl = ${memoUrl.toString()};
  for (const row of document.querySelectorAll('[data-memo-scene]')) {
    if (row.querySelector('.memo-link')) continue;
    const href = preparationMemoUrl(location.href, row.dataset.memoScene);
    if (!href) continue;
    const link = document.createElement('a');
    link.className = 'memo-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '打开 Memo';
    link.setAttribute('aria-label', '在 Memo 打开' + (row.querySelector('h3')?.textContent || '检查卡'));
    row.appendChild(link);
  }
}
`;

export const preparationStyles = `
.app-main .preparation-group{margin-bottom:28px}.preparation-group h2{font-size:1rem;margin:0 0 8px}.preparation-list{list-style:none;padding:0;margin:0}.preparation-tip,.preparation-moment{padding:16px 0;border-bottom:1px solid var(--line)}.preparation-group h3{font-size:.875rem;font-weight:600;margin:0 0 5px}.preparation-group p{font-size:.8125rem;color:var(--muted);margin:0;max-width:76ch}.preparation-moment{display:flex;align-items:center;justify-content:space-between;gap:12px 20px}.preparation-copy{min-width:0;overflow-wrap:anywhere}.preparation-dates{color:var(--muted);font-size:.75rem;margin-bottom:6px;overflow-wrap:anywhere}.preparation-group .preparation-intro{margin:0 0 8px}.preparation-empty{padding:16px 0}.memo-link{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-height:36px;padding:4px 0;font-size:.8125rem;white-space:nowrap}
@media(max-width:760px){.preparation-tip,.preparation-moment{padding:14px 0}.preparation-moment{gap:10px 12px}.memo-link{min-height:44px}}
@media(max-width:360px){.preparation-moment{flex-wrap:wrap}.memo-link{margin-left:auto}}
`;
