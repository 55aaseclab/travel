import { validateItinerary } from './render-itinerary.js';
import { validatePlaceDetails } from './place-display.js';

export class TravelError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; }
}
export const fail = (message, status = 400, code = 'INVALID_INPUT') => { throw new TravelError(message, status, code); };
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/.test(value);
export const tripPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const resourcePattern = /^trv_[a-f0-9]{32}$/;
export function fields(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('Object contains missing or unsupported fields');
}
function text(value, max = 500) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail('Invalid text field'); }
function list(value, max, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > max) fail('Invalid list length'); }
function id(value) { if (typeof value !== 'string' || value.length > 80 || !tripPattern.test(value)) fail('Invalid content identifier'); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1 || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('Invalid date');
}
function iso(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('Invalid observation timestamp'); }
function nonnegative(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) fail('Invalid nonnegative number'); }
function point(value) {
  fields(value, ['lng', 'lat', 'crs']);
  if (value.crs !== 'GCJ02' || typeof value.lng !== 'number' || !Number.isFinite(value.lng) || Math.abs(value.lng) > 180 || typeof value.lat !== 'number' || !Number.isFinite(value.lat) || Math.abs(value.lat) > 90) fail('Position must use valid explicit GCJ02 coordinates');
}
const planningModes = ['walking', 'driving', 'train', 'flight', 'bus', 'shuttle', 'unknown'];
function short(value, max = 80) { if (typeof value !== 'string' || !value.length || value.length > max || value.trim() !== value || /[\x00-\x1f\x7f<>]/.test(value)) fail('A bounded single-line name is required'); }
function planningLeg(value) {
  fields(value, ['mode', 'durationSeconds', 'distanceMeters']);
  if (!planningModes.includes(value.mode)) fail('Invalid transport mode');
  for (const [key, maximum] of [['durationSeconds', 604800], ['distanceMeters', 50000000]]) if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > maximum)) fail('Invalid transport metric');
}

export function validatePlanningMutation(operation, input) {
  if (operation === 'upsert_place') {
    fields(input, ['placeId', 'patch']); id(input.placeId);
    fields(input.patch, [], ['name', 'type', 'query', 'city', 'county', 'position', 'poiId', 'image', 'details']);
    if (!Object.keys(input.patch).length) fail('At least one allowed place field is required');
    for (const field of ['name', 'city', 'county']) if (input.patch[field] !== undefined) short(input.patch[field]);
    if (input.patch.query !== undefined) short(input.patch.query, 160);
    if (input.patch.type !== undefined && !['attraction', 'food', 'shopping', 'stay', 'transport'].includes(input.patch.type)) fail('Invalid place type');
    if (input.patch.position !== undefined) point(input.patch.position);
    if (input.patch.poiId !== undefined && (typeof input.patch.poiId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(input.patch.poiId))) fail('Invalid POI identifier');
    if (input.patch.image !== undefined && input.patch.image !== null) fail('New place images must use the app placeholder');
    if (input.patch.details !== undefined) validatePlaceDetails(input.patch.details, { partial:true });
  } else if (operation === 'set_day_plan') {
    fields(input, ['date', 'stops', 'legs'], ['title']); date(input.date); if (input.title !== undefined) short(input.title);
    list(input.stops, 50); list(input.legs, 49);
    if (input.legs.length !== Math.max(0, input.stops.length - 1)) fail('Leg count must match adjacent stop pairs');
    let previous = '';
    for (const stop of input.stops) { fields(stop, ['placeId', 'time']); id(stop.placeId); if (typeof stop.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(stop.time) || previous && stop.time < previous) fail('Invalid planned stop time'); previous = stop.time; }
    input.legs.forEach(planningLeg);
  } else if (operation === 'set_budget_item') {
    fields(input, ['itemId', 'category', 'name', 'dates', 'estimatedAmount'], ['estimatedMaxAmount']); id(input.itemId); short(input.name);
    if (!['attractions', 'transport', 'stays', 'food'].includes(input.category)) fail('Invalid budget category');
    list(input.dates, 7, 1); let previous = '';
    for (const entry of input.dates) { date(entry); if (previous && entry <= previous) fail('Budget dates must be unique and ascending'); previous = entry; }
    for (const field of ['estimatedAmount', 'estimatedMaxAmount']) if (field === 'estimatedAmount' || input[field] !== undefined) { if (!Number.isSafeInteger(input[field]) || input[field] < 0) fail('Invalid estimated budget amount'); }
    if (input.estimatedMaxAmount !== undefined && input.estimatedMaxAmount < input.estimatedAmount) fail('Invalid estimated budget range');
  } else fail('Unsupported itinerary mutation');
  return input;
}
function leg(value, arrival = false) {
  if (!object(value)) fail('Invalid transport object');
  if (!arrival && !Object.hasOwn(value, 'duration') && !Object.hasOwn(value, 'distance')) { planningLeg(value); return; }
  fields(value, ['mode', 'duration', 'distance', ...(arrival ? ['from', 'query'] : [])], ['distanceMeters', 'durationSeconds']);
  for (const key of ['mode', 'duration', 'distance', ...(arrival ? ['from', 'query'] : [])]) text(value[key], key === 'query' ? 200 : 500);
  for (const key of ['distanceMeters', 'durationSeconds']) if (value[key] !== undefined) nonnegative(value[key]);
}

export function validateTravelItinerary(data, expectedTripId) {
  try { if (Buffer.byteLength(JSON.stringify(data)) > 512 * 1024) fail('Itinerary is too large', 413, 'TOO_LARGE'); }
  catch (error) { if (error instanceof TravelError) throw error; fail('Itinerary must be JSON'); }
  fields(data, ['schemaVersion', 'tripId', 'travelers', 'places', 'days', 'budget', 'preparation'], ['evidence', 'verification']);
  id(data.tripId);
  if (data.schemaVersion !== 1 || data.tripId !== expectedTripId || !Number.isSafeInteger(data.travelers) || data.travelers < 1 || data.travelers > 20) fail('Invalid itinerary identity or traveler count');
  list(data.places, 100); list(data.days, 7, 7);
  const places = new Set(), subjects = new Set(['trip:' + data.tripId]);
  for (const place of data.places) {
    fields(place, ['id', 'name', 'type', 'query', 'image'], ['duration', 'openingHours', 'price', 'city', 'county', 'position', 'poiId', 'details']);
    id(place.id); if (places.has(place.id)) fail('Duplicate place identifier'); places.add(place.id); subjects.add('place:' + place.id);
    if (!['attraction', 'food', 'shopping', 'stay', 'transport'].includes(place.type)) fail('Invalid place type');
    for (const key of ['name', 'query']) text(place[key], 200);
    const legacy = ['duration', 'openingHours', 'price'].filter(key => Object.hasOwn(place, key));
    if (legacy.length && legacy.length !== 3 || !legacy.length && place.details === undefined) fail('Place facts require typed details or complete legacy fields');
    for (const key of legacy) text(place[key], key === 'openingHours' ? 80 : 500);
    if (place.city !== undefined) text(place.city, 80);
    if (place.image !== null && (typeof place.image !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,79}\.(?:jpe?g|png|webp|avif|svg)$/.test(place.image) || place.image.includes('..'))) fail('Invalid local photo filename');
    if (place.county !== undefined) text(place.county, 80);
    if (place.poiId !== undefined && (typeof place.poiId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(place.poiId))) fail('Invalid POI identifier');
    if (place.position !== undefined) point(place.position);
    if (place.details !== undefined) validatePlaceDetails(place.details);
  }
  let previous = '';
  for (const day of data.days) {
    fields(day, ['date', 'title', 'stops', 'legs'], ['arrival']); date(day.date); text(day.title);
    if (previous && Date.parse(day.date) - Date.parse(previous) !== 86400000) fail('Itinerary days must be consecutive'); previous = day.date;
    list(day.stops, 50); list(day.legs, 49);
    if (day.legs.length !== Math.max(0, day.stops.length - 1)) fail('Invalid itinerary leg count');
    let time = '';
    for (const stop of day.stops) {
      fields(stop, ['place', 'time']);
      if (!places.has(stop.place) || typeof stop.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(stop.time) || time && stop.time < time) fail('Invalid stop reference or time');
      time = stop.time;
    }
    for (const [index, value] of day.legs.entries()) { leg(value); subjects.add(`leg:${day.date}:${index}`); }
    if (day.arrival !== undefined) { leg(day.arrival, true); subjects.add('arrival:' + day.date); }
  }
  fields(data.budget, ['currency', 'groups']); list(data.budget.groups, 4);
  let budgetCount = 0;
  for (const group of data.budget.groups) {
    fields(group, ['id', 'name', 'items']); text(group.name, 100); list(group.items, 100);
    for (const item of group.items) {
      fields(item, ['id', 'name', 'dates', 'status', 'estimatedAmount', 'bookedAmount'], ['estimatedMaxAmount']); id(item.id); text(item.name); list(item.dates, 31, 1); item.dates.forEach(date); subjects.add('budget:' + item.id);
      if (++budgetCount > 200) fail('Too many budget entries');
    }
  }
  fields(data.preparation, ['beforeDeparture', 'moments']); list(data.preparation.beforeDeparture, 100); list(data.preparation.moments, 100);
  for (const [group, entries] of Object.entries(data.preparation)) for (const item of entries) {
    fields(item, ['id', 'title', 'description', ...(group === 'moments' ? ['memoScene', 'dates'] : [])]); id(item.id); text(item.title); text(item.description, 2000);
    if (group === 'moments') { list(item.dates, 31, 1); item.dates.forEach(date); }
  }
  const evidenceIds = new Set();
  if (data.evidence !== undefined) {
    list(data.evidence, 200);
    for (const item of data.evidence) {
      fields(item, ['id', 'provider', 'checkedAt', 'fields'], ['url', 'poiId', 'note']); id(item.id);
      if (evidenceIds.has(item.id) || !['amap', 'fliggy', 'official', 'user'].includes(item.provider)) fail('Invalid evidence identity or provider'); evidenceIds.add(item.id); iso(item.checkedAt);
      list(item.fields, 20, 1); item.fields.forEach(value => text(value, 80));
      if (item.url !== undefined) { let url; try { url = new URL(item.url); } catch { fail('Invalid evidence URL'); } if (url.protocol !== 'https:' || url.username || url.password || item.url.length > 2000) fail('Evidence URLs must use HTTPS'); }
      if (item.poiId !== undefined && (typeof item.poiId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(item.poiId))) fail('Invalid evidence POI identifier');
      if (item.note !== undefined) text(item.note, 2000);
    }
  }
  if (data.verification !== undefined) {
    list(data.verification, 300);
    for (const item of data.verification) {
      fields(item, ['subject', 'field', 'status', 'evidenceIds', 'note']);
      if (!subjects.has(item.subject) || !['name', 'position', 'openingHours', 'price', 'availability', 'reservation', 'duration', 'distance', 'weather', 'photo', 'transport', 'other'].includes(item.field) || !['observed', 'unconfirmed', 'conflicting'].includes(item.status)) fail('Invalid verification subject, field or status');
      list(item.evidenceIds, 20); if (new Set(item.evidenceIds).size !== item.evidenceIds.length || item.evidenceIds.some(value => !evidenceIds.has(value))) fail('Invalid verification evidence reference');
      if (item.status === 'observed' && !item.evidenceIds.length) fail('Observed facts require evidence'); text(item.note, 2000);
    }
  }
  try { validateItinerary(data, { id: data.tripId, placeCount: data.places.length, cityCount: new Set(data.places.map(place => place.city).filter(Boolean)).size }, { allowMissingPhotos:true, allowEmptyPlans:true }); }
  catch (error) { if (error instanceof TravelError) throw error; fail('Itinerary does not satisfy the app data contract'); }
  return data;
}
