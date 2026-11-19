const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const brand = '<div class="app-name">Travel<span>旅行计划</span></div>';

export function sectionLink(id, label, icon, count, countLabel, active = false) {
  return '<a href="#' + escape(id) + '"' + (active ? ' class="active" aria-current="location"' : '') + '><span class="nav-icon" aria-hidden="true">' + icon + '</span><span class="nav-label">' + escape(label) + '</span><span class="nav-count" aria-label="' + escape(count + ' ' + countLabel) + '">' + count + '</span></a>';
}
