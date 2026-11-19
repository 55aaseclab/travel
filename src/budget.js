const categories = [
  { id: 'attractions', name: '景点' },
  { id: 'transport', name: '交通' },
  { id: 'stays', name: '住宿' },
  { id: 'food', name: '餐饮' },
];
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const isAmount = value => Number.isSafeInteger(value) && value >= 0;
const isName = value => typeof value === 'string' && value.trim().length > 0;

function validateDates(dates) {
  if (!Array.isArray(dates) || dates.length === 0) throw new Error('Budget dates must be a nonempty array.');
  let previous = '';
  for (const date of dates) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid budget date.');
    const [year, month, day] = date.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error('Invalid budget date.');
    if (previous && date <= previous) throw new Error('Budget dates must be unique and ascending.');
    previous = date;
  }
}

function dateLabels(dates) {
  validateDates(dates);
  const crossingYears = new Set(dates.map(date => date.slice(0, 4))).size > 1;
  return dates.map(date => {
    const [year, month, day] = date.split('-').map(Number);
    return { date, label: (crossingYears ? year + '年' : '') + month + '月' + day + '日' };
  });
}

export function formatBudgetDates(dates) {
  return dateLabels(dates).map(item => item.label).join('、');
}

export function validateBudget(budget) {
  if (!budget || budget.currency !== 'CNY' || !Array.isArray(budget.groups)) throw new Error('Invalid budget currency or groups.');
  const groupIds = new Set();
  const itemIds = new Set();
  for (const group of budget.groups) {
    if (!group || !categories.some(category => category.id === group.id) || groupIds.has(group.id) || !isName(group.name) || !Array.isArray(group.items)) throw new Error('Invalid or duplicate budget group.');
    groupIds.add(group.id);
    for (const item of group.items) {
      if (!item || !isName(item.id) || itemIds.has(item.id) || !isName(item.name)) throw new Error('Invalid or duplicate budget item.');
      itemIds.add(item.id);
      validateDates(item.dates);
      if (!['booked', 'unbooked', 'estimated'].includes(item.status)) throw new Error('Invalid budget booking status.');
      if (!isAmount(item.estimatedAmount)) throw new Error('Invalid estimated budget amount.');
      if (item.estimatedMaxAmount !== undefined && (!isAmount(item.estimatedMaxAmount) || item.estimatedMaxAmount < item.estimatedAmount)) throw new Error('Invalid maximum estimated budget amount.');
      if (item.status === 'booked' ? !isAmount(item.bookedAmount) : item.bookedAmount !== null) throw new Error('Invalid booked budget amount.');
    }
  }
  return budget;
}

export function budgetTotal(budget) {
  validateBudget(budget);
  let total = 0, maximum = 0;
  for (const group of budget.groups) {
    for (const item of group.items) {
      total += item.status === 'booked' ? item.bookedAmount : item.estimatedAmount;
      maximum += item.status === 'booked' ? item.bookedAmount : item.estimatedMaxAmount ?? item.estimatedAmount;
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(maximum)) throw new Error('Budget total exceeds the safe integer range.');
    }
  }
  return total;
}

export function formatAmount(cents) {
  if (!isAmount(cents)) throw new Error('Invalid currency amount.');
  const whole = Math.floor(cents / 100).toLocaleString('zh-CN');
  const fraction = cents % 100;
  return '¥' + whole + (fraction ? '.' + String(fraction).padStart(2, '0') : '');
}

export function renderBudget(budget) {
  const total = budgetTotal(budget);
  const hasItems = budget.groups.some(group => group.items.length > 0);
  const complete = ['attractions', 'transport', 'stays'].every(id => budget.groups.some(group => group.id === id && group.items.length > 0));
  const maximum = budget.groups.flatMap(group => group.items).reduce((sum, item) => sum + (item.status === 'booked' ? item.bookedAmount : item.estimatedMaxAmount ?? item.estimatedAmount), 0);
  if (!Number.isSafeInteger(maximum)) throw new Error('Budget total exceeds the safe integer range.');
  const groups = categories.filter(category => category.id !== 'food' || budget.groups.some(group => group.id === 'food')).map(category => {
    const items = budget.groups.find(group => group.id === category.id)?.items || [];
    const rows = items.map(item => {
      const booked = item.status === 'booked';
      const amount = booked ? item.bookedAmount : item.estimatedAmount;
      const dates = dateLabels(item.dates).map(({date, label}) => '<time datetime="' + escape(date) + '">' + escape(label) + '</time>').join('、');
      const amountLabel = !booked && item.estimatedMaxAmount > amount ? formatAmount(amount) + '–' + formatAmount(item.estimatedMaxAmount) : formatAmount(amount);
      return '<li class="budget-row" data-status="' + item.status + '"><div class="budget-item-copy"><span class="budget-item-name">' + escape(item.name) + '</span><div class="budget-item-meta"><span class="budget-dates">' + dates + '</span><span aria-hidden="true">·</span><span class="budget-status">' + (booked ? '已预订' : item.status === 'estimated' ? '预估' : '待预订') + '</span></div></div><span class="budget-price">' + amountLabel + '</span></li>';
    }).join('');
    return '<section class="budget-group" aria-labelledby="budget-' + category.id + '"><h2 id="budget-' + category.id + '">' + category.name + '</h2>' + (items.length ? '<ul class="budget-list">' + rows + '</ul>' : '<p class="budget-empty">暂无预算项</p>') + '</section>';
  }).join('');
  const amount = hasItems ? formatAmount(total) + (maximum > total ? '–' + formatAmount(maximum) : '') : '—';
  return '<div class="budget-total"><span>' + (complete ? '行程总费用' : '已列预算') + '</span><strong>' + amount + '</strong></div><div class="budget-groups">' + groups + '</div>';
}

export const budgetStyles = `
.budget-total{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px 20px;padding:0 0 22px;margin-bottom:28px;border-bottom:1px solid var(--line);font-size:.9375rem}.budget-total strong{margin-left:auto;font-size:1.5rem;font-weight:650;line-height:1.4;font-variant-numeric:tabular-nums}.app-main .budget-group{margin-bottom:28px}.budget-group h2{font-size:1rem;margin:0 0 8px}.budget-list{list-style:none;padding:0;margin:0}.budget-row{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;padding:16px 0;border-bottom:1px solid var(--line);color:var(--ink)}.budget-item-copy{min-width:0;overflow-wrap:anywhere}.budget-item-name{display:block;font-size:.875rem}.budget-item-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:3px 6px;margin-top:3px;font-size:.75rem;color:var(--muted)}.budget-dates{min-width:0;overflow-wrap:anywhere}.budget-status{font-size:.75rem;color:inherit}.budget-row[data-status="unbooked"] .budget-item-meta{color:#707079}.budget-price{margin-left:auto;flex-shrink:0;font-size:.9375rem;font-variant-numeric:tabular-nums;white-space:nowrap}.budget-row[data-status="unbooked"]{color:#707079}.budget-row[data-status="unbooked"] .budget-status{color:#707079}.budget-empty{font-size:.8125rem;color:var(--muted);padding:12px 0}.budget-groups{min-width:0}
@media(max-width:760px){.budget-total{padding-bottom:18px;margin-bottom:24px}.budget-row{gap:10px 12px;padding:14px 0}.budget-total strong{font-size:1.375rem}.budget-price{font-size:.875rem}}
@media(max-width:360px){.budget-row{flex-wrap:wrap}.budget-price{max-width:100%;white-space:normal;overflow-wrap:anywhere}}
`;
