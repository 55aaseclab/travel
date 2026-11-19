// Apply labels only to renderer-owned navigation and controls. A trip title or note
// may coincide with a label and is still user content.
export function readTravelLanguage() {
  try { return localStorage.getItem('praxis.locale') === 'zh' ? 'zh-CN' : 'en'; } catch { return 'en'; }
}
export function installTravelLocale(lang) {
  const sidebar = document.querySelector('.app-sidebar');
  if (!sidebar) return;
  document.documentElement.lang = lang;
  const picker = document.createElement('button');
  picker.type = 'button';
  picker.textContent = lang === 'en' ? '简体中文' : 'English';
  picker.style.minHeight = '44px';
  picker.onclick = () => {
    const next = lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('praxis.locale', next); } catch { return; }
    document.cookie = 'praxis_locale=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
    location.reload();
  };
  sidebar.append(picker);
  if (lang !== 'en') return;
  for (const node of document.querySelectorAll('[data-travel-en]')) node.textContent = node.dataset.travelEn;
  for (const node of document.querySelectorAll('[data-travel-en-label]')) node.setAttribute('aria-label',node.dataset.travelEnLabel);
  const attributes = [
    ['.itinerary-map','Itinerary map'], ['.travel-map-canvas','Map of itinerary places'],
    ['.map-place-strip','Places on this itinerary'], ['.detail-local-tabs','Itinerary views'], ['.day-tabs','Itinerary days'],
  ];
  for (const [selector,label] of attributes) document.querySelector(selector)?.setAttribute('aria-label',label);
  const toggle = document.querySelector('[data-map-toggle]');
  if (toggle) {
    const label = toggle.getAttribute('aria-expanded') === 'true' ? 'Collapse map' : 'Expand map';
    toggle.setAttribute('aria-label',label); toggle.title=label;
  }
  const mapStatus = document.querySelector('[data-map-status]');
  if (mapStatus?.textContent.trim() === '正在加载地图…') mapStatus.textContent = 'Loading map…';
  const labels = {
    '#travel-map-legend': document.querySelector('[data-itinerary-workspace]')?.dataset.mapProvider === 'leaflet'
      ? 'Dashed lines show the order of stops, not a driving route.'
      : 'Solid lines show road routes. Dashed lines connect stops.',
    '#overview > h2.visually-hidden':'Itinerary overview',
    '.skip-link': 'Skip to content', '.app-name span': 'Trip planner',
    '.section-nav a[href="#all"] .nav-label': 'All routes',
    '.section-nav a[href="#past"] .nav-label': 'Past trips',
    '.section-nav a[href="#upcoming"] .nav-label': 'Upcoming trips',
    '#tab-itinerary':'Itinerary','#tab-budget':'Budget','#tab-preparation':'Preparation',
    '#tab-overview':'Overview','#preparation-before-title':'Before departure',
    '#preparation-moments-title':'Key moments','.photo-credits summary':'Photo credits',
    '.catalog-empty':'No routes in this view.'
  };
  for (const [selector, label] of Object.entries(labels)) {
    for (const node of document.querySelectorAll(selector)) node.textContent = label;
  }
  sidebar.setAttribute('aria-label','Route navigation');
  sidebar.querySelector('nav')?.setAttribute('aria-label','Trip categories');
  for (const node of document.querySelectorAll('.section-nav .nav-count')) node.ariaLabel = node.textContent + ' routes';
  const dayNames = { '抵达日': 'Arrival day', '离开日': 'Departure day', '返程日':'Return day', '第一天':'Day 1', '第二天':'Day 2', '第三天':'Day 3', '第四天':'Day 4', '第五天':'Day 5', '第六天':'Day 6', '第七天':'Day 7' };
  for (const node of document.querySelectorAll('.day-tabs a[id^="tab-day-"], .overview-day-top strong, [data-trip-panel] h2 > [data-day-label]')) {
    if (Object.hasOwn(dayNames,node.textContent)) node.textContent=dayNames[node.textContent];
  }
  const words = {
    '出发前':'Before departure','关键时刻':'Key moments','暂无预算项':'No budget items.',
    '暂无准备提示':'No preparation notes.','暂无关键时刻':'No checkpoints.',
    '已预订':'Booked','预估':'Estimated','待预订':'To book','行程总费用':'Total trip cost',
    '已列预算':'Budgeted total','交通':'Transport','住宿':'Lodging','餐饮':'Meals','其他':'Other',
    '最后编辑：':'Last edited: ','导航':'Directions','小红书':'Xiaohongshu','百度图片':'Baidu Images',
    '查看详情':'View details','打开 Memo':'Open Memo'
  };
  const fixed = '.travel-leg a,.budget-status,.budget-empty,.budget-group h2,.budget-total>span,.route-edited,.preparation-empty,.place-actions a,.memo-link,.leg-row a';
  for (const el of document.querySelectorAll(fixed)) {
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const raw = node.textContent.trim();
      if (Object.hasOwn(words, raw)) node.textContent = words[raw] + (el.children.length ? ' ' : '');
    }
  }
  for (const count of document.querySelectorAll('.route-card-facts span')) {
    const match = /^(\d+) 个(地点|城市)$/.exec(count.textContent.trim());
    if (match) count.textContent = match[1] + (match[2] === '地点' ? ' places' : ' cities');
  }
  for (const el of document.querySelectorAll('.budget-dates time,.preparation-dates time,.overview-day-top time')) {
    const iso=el.getAttribute('datetime');
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) el.textContent = new Intl.DateTimeFormat('en',{dateStyle:'medium'}).format(new Date(iso+'T12:00:00'));
  }
  for (const link of document.querySelectorAll('.memo-link')) {
    const name=link.closest('.preparation-moment')?.querySelector('h3')?.textContent;
    if (name) link.setAttribute('aria-label','Open '+name+' in Memo');
  }
  const intro=document.querySelector('.preparation-intro'); if (intro) intro.textContent='Review these checks before departure, check-in and checkout.';
  const categoryHeading = document.querySelector('#scope-title, .catalog-anchor #page-title');
  if (categoryHeading) {
    const values = {'全部路线':'All routes','待出行':'Upcoming trips','已出行':'Past trips'};
    const update = () => { const label=values[categoryHeading.textContent]; if(label) categoryHeading.textContent=label; };
    update(); new MutationObserver(update).observe(categoryHeading,{childList:true});
  }
}
export const travelLocaleScript = '(' + installTravelLocale.toString() + ')((' + readTravelLanguage.toString() + ')());';
