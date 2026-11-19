const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unknown = () => ({ kind: 'unknown' });
export const PRICE_CURRENCIES = Object.freeze(['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP', 'ISK']);
export const PRICE_BASES = Object.freeze(['person', 'group', 'room_night', 'vehicle', 'item']);
function invalid() { throw Object.assign(new Error('Invalid typed place details.'), { status: 400, code: 'INVALID_PLACE_DETAILS' }); }
function shape(value, keys) { if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !own(value, key))) invalid(); }
const integer = (value, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
function validateDuration(value) {
  if (!object(value)) invalid();
  if (value.kind === 'unknown') shape(value, ['kind']);
  else if (value.kind === 'minutes') { shape(value, ['kind', 'minMinutes', 'maxMinutes']); if (!integer(value.minMinutes, 10080) || !integer(value.maxMinutes, 10080) || value.minMinutes > value.maxMinutes) invalid(); }
  else if (value.kind === 'nights') { shape(value, ['kind', 'nights']); if (!integer(value.nights, 30) || value.nights < 1) invalid(); }
  else invalid();
  return value;
}
function clock(value, close = false) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) { if (close && value === '24:00') return 1440; invalid(); }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function validateHours(value) {
  if (!object(value)) invalid();
  if (['always', 'appointment', 'closed', 'unknown'].includes(value.kind)) shape(value, ['kind']);
  else if (value.kind === 'hours') {
    shape(value, ['kind', 'periods']);
    if (!Array.isArray(value.periods) || value.periods.length < 1 || value.periods.length > 4) invalid();
    const segments = [];
    for (const period of value.periods) {
      shape(period, ['opens', 'closes', 'nextDay']);
      if (typeof period.nextDay !== 'boolean' || period.closes === '24:00' && period.nextDay) invalid();
      const start = clock(period.opens), end = clock(period.closes, true) + (period.nextDay ? 1440 : 0);
      if (end <= start || end - start > 1440) invalid();
      if (end > 1440) segments.push([start, 1440], [0, end - 1440]); else segments.push([start, end]);
    }
    segments.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < segments.length; index++) if (segments[index][0] < segments[index - 1][1]) invalid();
  } else invalid();
  return value;
}
function validatePrice(value) {
  if (!object(value)) invalid();
  if (['free', 'unknown'].includes(value.kind)) shape(value, ['kind']);
  else if (value.kind === 'included') { shape(value, ['kind', 'includedIn']); if (!['room', 'admission'].includes(value.includedIn)) invalid(); }
  else if (['amount', 'range', 'from'].includes(value.kind)) {
    const ranged = value.kind === 'range';
    shape(value, ['kind', ...(ranged ? ['minCents', 'maxCents'] : ['amountCents']), 'currency', 'basis']);
    if (!PRICE_CURRENCIES.includes(value.currency) || !PRICE_BASES.includes(value.basis)) invalid();
    if (ranged ? !integer(value.minCents) || !integer(value.maxCents) || value.minCents > value.maxCents : !integer(value.amountCents)) invalid();
  } else invalid();
  return value;
}
export function validatePlaceDetails(details, { partial = false } = {}) {
  if (!object(details) || !Object.keys(details).length || Object.keys(details).some(key => !['duration', 'openingHours', 'price'].includes(key)) || !partial && ['duration', 'openingHours', 'price'].some(key => !own(details, key))) invalid();
  if (own(details, 'duration')) validateDuration(details.duration);
  if (own(details, 'openingHours')) validateHours(details.openingHours);
  if (own(details, 'price')) validatePrice(details.price);
  return details;
}
function accepted(value, validate) { try { return validate(value); } catch { return unknown(); } }
function legacyDuration(value) {
  if (typeof value !== 'string' || value.length > 40) return unknown();
  if (value === '一晚') return { kind: 'nights', nights: 1 };
  let match = /^ *(\d{1,2}) *晚 *$/.exec(value);
  if (match) return accepted({ kind: 'nights', nights: Number(match[1]) }, validateDuration);
  match = /^ *(?:约 *)?(\d{1,3}) *小时 *(\d{1,2}) *分钟 *$/.exec(value);
  if (match) { const minutes = Number(match[2]); return minutes < 60 ? accepted({ kind: 'minutes', minMinutes: Number(match[1]) * 60 + minutes, maxMinutes: Number(match[1]) * 60 + minutes }, validateDuration) : unknown(); }
  match = /^ *(?:约 *)?(\d{1,5}) *(?:[–-] *(\d{1,5}) *)?分钟 *$/.exec(value);
  if (match) return accepted({ kind: 'minutes', minMinutes: Number(match[1]), maxMinutes: Number(match[2] ?? match[1]) }, validateDuration);
  match = /^ *(?:约 *)?(\d{1,3}(?:\.5)?) *(?:[–-] *(\d{1,3}(?:\.5)?) *)?小时 *$/.exec(value);
  if (match) return accepted({ kind: 'minutes', minMinutes: Number(match[1]) * 60, maxMinutes: Number(match[2] ?? match[1]) * 60 }, validateDuration);
  return unknown();
}
function legacyHours(value) {
  if (typeof value !== 'string' || value.length > 100) return unknown();
  const fixed = { '全天': 'always', '全天开放': 'always', '24小时': 'always', '24小时接待': 'always', '需预约': 'appointment', '预约开放': 'appointment', '关闭': 'closed' };
  if (own(fixed, value)) return { kind: fixed[value] };
  const pieces = value.split('、');
  if (pieces.length > 4) return unknown();
  const periods = [];
  for (const piece of pieces) {
    const match = /^ *(\d{2}:\d{2}) *[–-] *(次日 *)?(\d{2}:\d{2}) *$/.exec(piece);
    if (!match) return unknown();
    periods.push({ opens: match[1], closes: match[3], nextDay: Boolean(match[2]) });
  }
  return accepted({ kind: 'hours', periods }, validateHours);
}
function cents(value) {
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole.split(',').join('')) * 100 + Number(fraction.padEnd(2, '0'));
  return integer(result) ? result : null;
}
const legacyMoney = '(?:0|[1-9]\\d{0,13}|[1-9]\\d{0,2}(?:,\\d{3}){1,4})(?:\\.\\d{1,2})?';
function legacyPrice(value, placeType) {
  if (typeof value !== 'string' || value.length > 80) return unknown();
  if (/^ *免费 *$/.test(value)) return { kind: 'free' };
  const included = /^ *(房费包含|景区门票包含) *$/.exec(value);
  if (included) return { kind: 'included', includedIn: included[1] === '房费包含' ? 'room' : 'admission' };
  const flight = new RegExp(`^ *机票 *[¥￥] *(${legacyMoney}) *起 *$`).exec(value);
  if (flight) { const amount = cents(flight[1]); return amount === null ? unknown() : { kind: 'from', amountCents: amount, currency: 'CNY', basis: 'item' }; }
  const coverage = new RegExp(`^ *门票及观光车 *[¥￥] *(${legacyMoney}) */ *人 *$`).exec(value);
  if (coverage) { const amount = cents(coverage[1]); return amount === null ? unknown() : { kind: 'amount', amountCents: amount, currency: 'CNY', basis: 'person' }; }
  const match = new RegExp(`^ *(?:约 *)?[¥￥] *(${legacyMoney}) *(?:[–-] *(${legacyMoney}) *)?/ *(人|组|间 *[·/] *晚|晚|车|项) *$`).exec(value);
  if (!match || match[3] === '晚' && placeType !== 'stay') return unknown();
  const amount = cents(match[1]), high = match[2] === undefined ? null : cents(match[2]);
  if (amount === null || match[2] !== undefined && high === null) return unknown();
  const basis = match[3] === '晚' || /^间 *[·/] *晚$/.test(match[3]) ? 'room_night' : { '人': 'person', '组': 'group', '车': 'vehicle', '项': 'item' }[match[3]];
  return accepted(match[2] === undefined ? { kind: 'amount', amountCents: amount, currency: 'CNY', basis } : { kind: 'range', minCents: amount, maxCents: high, currency: 'CNY', basis }, validatePrice);
}

export function getPlaceDetails(place) {
  if (!object(place)) invalid();
  if (own(place, 'details')) return validatePlaceDetails(place.details);
  return { duration: legacyDuration(place.duration), openingHours: legacyHours(place.openingHours), price: legacyPrice(place.price, place.type) };
}
function minuteLabel(min, max) {
  if (min === max) return min >= 60 && min % 60 === 0 ? `${min / 60}小时` : `${min}分钟`;
  return min >= 60 && min % 60 === 0 && max % 60 === 0 ? `${min / 60}–${max / 60}小时` : `${min}–${max}分钟`;
}
export function formatDuration(value, language = 'zh') {
  validateDuration(value);
  if (value.kind === 'unknown') return '—';
  if (language !== 'en') return value.kind === 'nights' ? `${value.nights}晚` : minuteLabel(value.minMinutes, value.maxMinutes);
  if (value.kind === 'nights') return `${value.nights} ${value.nights === 1 ? 'night' : 'nights'}`;
  const hours = value.minMinutes >= 60 && value.minMinutes % 60 === 0 && value.maxMinutes % 60 === 0;
  const min = hours ? value.minMinutes / 60 : value.minMinutes, max = hours ? value.maxMinutes / 60 : value.maxMinutes;
  return (min === max ? String(min) : min + '–' + max) + (hours ? ' h' : ' min');
}
export function formatOpeningHours(value, language = 'zh') {
  validateHours(value);
  if (language === 'en') {
    if (value.kind !== 'hours') return {always:'Open all day',appointment:'By appointment',closed:'Closed',unknown:'—'}[value.kind];
    return [...value.periods].sort((a,b)=>clock(a.opens)-clock(b.opens)).map(period=>period.opens+'–'+period.closes+(period.nextDay?' (next day)':'')).join(', ');
  }
  if (value.kind !== 'hours') return { always: '全天', appointment: '需预约', closed: '关闭', unknown: '—' }[value.kind];
  return [...value.periods].sort((a, b) => clock(a.opens) - clock(b.opens)).map(period => `${period.opens}–${period.nextDay ? '次日' : ''}${period.closes}`).join('、');
}
const symbols = { CNY: '¥', USD: 'US$', EUR: '€', HKD: 'HK$', JPY: 'JP¥', GBP: '£', ISK: 'ISK ' };
const bases = { person: '/人', group: '/组', room_night: '/间·晚', vehicle: '/车', item: '/项' };
function amountLabel(value) { return `${Math.floor(value / 100).toLocaleString('en-US')}${value % 100 ? '.' + String(value % 100).padStart(2, '0') : ''}`; }
export function formatPrice(value, language = 'zh') {
  validatePrice(value);
  if (value.kind === 'unknown') return '—';
  if (value.kind === 'included') return language === 'en' ? (value.includedIn === 'room' ? 'Included in room rate' : 'Included in admission') : (value.includedIn === 'room' ? '房费包含' : '景区门票包含');
  if (value.kind === 'free' || value.kind === 'amount' && value.amountCents === 0 || value.kind === 'range' && value.maxCents === 0) return language === 'en' ? 'Free' : '免费';
  const number = value.kind !== 'range' ? amountLabel(value.amountCents) : value.minCents === value.maxCents ? amountLabel(value.minCents) : `${amountLabel(value.minCents)}–${amountLabel(value.maxCents)}`;
  if (language === 'en') {
    const basis = {person:' / person', group:' / group', room_night:' / room per night', vehicle:' / vehicle', item:' / item'};
    return (value.kind === 'from' ? 'From ' : '') + symbols[value.currency] + number + (value.kind === 'from' && value.basis === 'item' ? '' : basis[value.basis]);
  }
  if (value.kind === 'from') return symbols[value.currency] + number + '起' + (value.basis === 'item' ? '' : bases[value.basis]);
  return symbols[value.currency] + number + bases[value.basis];
}
const modes = Object.freeze({ '步行': ['步行', 'walking'], walking: ['步行', 'walking'], '驾车': ['驾车', 'driving'], driving: ['驾车', 'driving'], '自驾': ['驾车', 'driving'], '包车': ['包车', 'driving'], '打车': ['打车', 'driving'], '出租车': ['出租车', 'driving'], '网约车': ['网约车', 'driving'], '景区车': ['景区车', null], '接驳车': ['接驳车', null], '火车': ['火车', null], train: ['火车', null], '高铁': ['高铁', null], '飞机': ['飞机', null], flight: ['飞机', null], '公交': ['公交', null], bus: ['公交', null], shuttle: ['接驳车', null], unknown: ['—', null] });
const englishModes = { '步行':'Walk', '驾车':'Drive', '包车':'Chartered car', '打车':'Taxi', '出租车':'Taxi', '网约车':'Ride service', '景区车':'Park shuttle', '接驳车':'Shuttle', '火车':'Train', '高铁':'High-speed rail', '飞机':'Flight', '公交':'Bus' };
export function formatTravelLeg(leg, language = 'zh') {
  const [modeLabel, routeMode] = typeof leg.mode === 'string' && own(modes, leg.mode) ? modes[leg.mode] : ['—', null];
  const seconds = leg.durationSeconds, meters = leg.distanceMeters;
  const duration = own(leg, 'durationSeconds') ? typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= Number.MAX_SAFE_INTEGER ? { kind: 'minutes', minMinutes: Math.ceil(seconds / 60), maxMinutes: Math.ceil(seconds / 60) } : unknown() : legacyDuration(leg.duration);
  let durationLabel = '—';
  if (duration.kind === 'minutes' && duration.maxMinutes <= 10080) durationLabel = formatDuration(duration,language);
  let distanceLabel = '—';
  if (own(leg, 'distanceMeters')) { if (typeof meters === 'number' && Number.isFinite(meters) && meters >= 0 && meters <= Number.MAX_SAFE_INTEGER) distanceLabel = meters >= 1000 ? `${Number((meters / 1000).toFixed(1))}公里` : `${Math.ceil(meters)}米`; }
  else if (typeof leg.distance === 'string') {
    const match = /^ *(?:约 *)?((?:0|[1-9]\d{0,6}|[1-9]\d{0,2}(?:,\d{3}){1,2})(?:\.\d{1,3})?) *(米|公里) *$/.exec(leg.distance);
    if (match) distanceLabel = `${Number(match[1].split(',').join(''))}${match[2]}`;
  }
  if (language === 'en') {
    return { modeLabel: englishModes[modeLabel] || '—', routeMode, durationLabel, distanceLabel: distanceLabel.replace(/公里$/, ' km').replace(/米$/, ' m') };
  }
  return { modeLabel, routeMode, durationLabel, distanceLabel };
}
