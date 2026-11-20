export function createTravelSchema(z, dependencies = {}) {

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const poiId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

const duration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('minutes'), minMinutes: z.number().int().min(0).max(10080), maxMinutes: z.number().int().min(0).max(10080) }).strict(),
  z.object({ kind: z.literal('nights'), nights: z.number().int().min(1).max(30) }).strict(),
  z.object({ kind: z.literal('unknown') }).strict(),
]).refine(value => value.kind !== 'minutes' || value.minMinutes <= value.maxMinutes, 'Minimum duration cannot exceed maximum duration.');
const opens = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const closes = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/);
const periods = z.array(z.object({ opens, closes, nextDay: z.boolean() }).strict()).min(1).max(4).superRefine((values, context) => {
  const intervals = values.map((value, index) => {
    const minutes = text => text.split(':').map(Number).reduce((hours, minute) => hours * 60 + minute);
    const start = minutes(value.opens), end = minutes(value.closes) + (value.nextDay ? 1440 : 0);
    if (value.closes === '24:00' && value.nextDay || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 1440) context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: 'An opening period must span more than zero and at most 24 hours; 24:00 cannot use nextDay.' });
    return { start, end };
  });
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    if ([-1440, 0, 1440].some(offset => intervals[i].start < intervals[j].end + offset && intervals[j].start + offset < intervals[i].end)) context.addIssue({ code: z.ZodIssueCode.custom, path: [j], message: 'Opening periods must not overlap, including across midnight.' });
  }
});
const openingHours = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hours'), periods }).strict(),
  ...['always', 'appointment', 'closed', 'unknown'].map(kind => z.object({ kind: z.literal(kind) }).strict()),
]);
const currency = z.enum(['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP', 'ISK']);
const basis = z.enum(['person', 'group', 'room_night', 'vehicle', 'item']);
const price = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('amount'), amountCents: amount, currency, basis }).strict(),
  z.object({ kind: z.literal('range'), minCents: amount, maxCents: amount, currency, basis }).strict(),
  z.object({ kind: z.literal('from'), amountCents: amount, currency, basis }).strict(),
  z.object({ kind: z.literal('included'), includedIn: z.enum(['room', 'admission']) }).strict(),
  z.object({ kind: z.literal('free') }).strict(), z.object({ kind: z.literal('unknown') }).strict(),
]).refine(value => value.kind !== 'range' || value.minCents <= value.maxCents, 'Minimum price cannot exceed maximum price.');
const travelPlaceIdSchema = slug;
const travelPlaceDetailsSchema = z.object({ duration: duration.optional(), openingHours: openingHours.optional(), price: price.optional() }).strict().refine(value => Object.values(value).some(item => item !== undefined), 'At least one typed place detail is required.');

const travelRevisionSchema = z.string().max(16).regex(/^(0|[1-9]\d*)$/).refine(value => Number.isSafeInteger(Number(value)), 'Revision must be a safe nonnegative integer string.');
const travelPoiIdSchema = poiId;
const travelCoordinateSchema = z.string().max(40).regex(/^-?\d{1,3}(?:\.\d{1,6})?,-?\d{1,2}(?:\.\d{1,6})?$/).refine(value => {
  const [lng, lat] = value.split(',').map(Number);
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}, 'Coordinates must be bounded GCJ02 longitude and latitude.');

const serviceText = max => z.string().max(2048).refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed.').transform(value => value.trim()).pipe(z.string().min(1).max(max).refine(value => !value.startsWith('-'), 'Option-like values are not allowed.'));
const serviceLocation = serviceText(40), serviceQuery = serviceText(200);
const serviceDate = date.refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'A valid calendar date is required.');
const travelServicesInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hotel'), city: serviceLocation, checkIn: serviceDate, checkOut: serviceDate, keyword: serviceQuery.optional() }).strict(),
  z.object({ kind: z.literal('flight'), origin: serviceLocation, destination: serviceLocation, date: serviceDate }).strict(),
  z.object({ kind: z.literal('train'), origin: serviceLocation, destination: serviceLocation, date: serviceDate }).strict(),
  z.object({ kind: z.literal('restaurant'), city: serviceLocation, query: serviceQuery }).strict(),
]);
// The MCP SDK requires an object at the schema root. The input decoder below
// enforces the strict discriminated union after this discoverable field shape.
const travelServicesFields = {
  kind: z.enum(['hotel', 'flight', 'train', 'restaurant']), city: serviceLocation.optional(), checkIn: serviceDate.optional(), checkOut: serviceDate.optional(),
  keyword: serviceQuery.optional(), origin: serviceLocation.optional(), destination: serviceLocation.optional(), date: serviceDate.optional(), query: serviceQuery.optional(),
};

return { travelPlaceIdSchema, travelPlaceDetailsSchema, travelRevisionSchema, travelPoiIdSchema, travelCoordinateSchema, travelServicesInputSchema, travelServicesFields };
}
