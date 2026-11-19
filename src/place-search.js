const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function placeSearchUrls(place) {
  const keyword = (typeof place.query === 'string' && place.query.trim()) || place.name;
  if (typeof keyword !== 'string' || !keyword.trim()) throw new Error('Place search requires a name or query.');
  const xiaohongshu = new URL('https://www.xiaohongshu.com/search_result');
  xiaohongshu.searchParams.set('keyword', keyword);
  const baidu = new URL('https://image.baidu.com/search/index');
  baidu.search = new URLSearchParams({ tn: 'baiduimage', word: keyword });
  return { xiaohongshu: xiaohongshu.href, baidu: baidu.href };
}

export function renderPlaceSearch(place) {
  const urls = placeSearchUrls(place);
  return '<div class="place-actions"><a href="' + escape(urls.xiaohongshu) + '" target="_blank" rel="noopener noreferrer" data-travel-en-label="Search Xiaohongshu for ' + escape(place.name) + '" aria-label="在小红书搜索' + escape(place.name) + '">小红书 <span aria-hidden="true">↗</span></a><a href="' + escape(urls.baidu) + '" target="_blank" rel="noopener noreferrer" data-travel-en-label="Search Baidu Images for ' + escape(place.name) + '" aria-label="在百度图片搜索' + escape(place.name) + '">百度图片 <span aria-hidden="true">↗</span></a></div>';
}

export const placeSearchStyles = `
.place-actions{display:flex;align-items:center;flex-wrap:wrap;gap:4px 16px;margin-top:4px;font-size:.75rem}.place-actions a{display:inline-flex;align-items:center;gap:3px;min-height:30px;white-space:nowrap}.place-card-copy{min-width:0}
@media(max-width:760px){.place-actions{gap:0 10px;margin-top:0}.place-actions a{min-height:44px;gap:2px}}
`;
