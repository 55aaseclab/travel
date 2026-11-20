export function createTravelPlanningSchema(z, dependencies = {}) {
const {travelPlaceDetailsSchema, travelPlaceIdSchema, travelPoiIdSchema} = dependencies;

const shortText = maximum => z.string().min(1).max(maximum).refine(value => value.trim() === value && !/[\x00-\x1f\x7f<>]/.test(value), 'A bounded single-line name is required.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'A valid calendar date is required.');
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const point = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), crs: z.literal('GCJ02') }).strict();
const travelPlacePatchSchema = z.object({
  name: shortText(80).optional(), type: z.enum(['attraction', 'food', 'shopping', 'stay', 'transport']).optional(),
  query: shortText(160).optional(), city: shortText(80).optional(), county: shortText(80).optional(),
  position: point.optional(), poiId: travelPoiIdSchema.optional(), image: z.null().optional(), details: travelPlaceDetailsSchema.optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), 'At least one allowed place field is required.');
const travelDayFields = {
  date, title: shortText(80).optional(),
  stops: z.array(z.object({ placeId: travelPlaceIdSchema, time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/) }).strict()).max(50),
  legs: z.array(z.object({
    mode: z.enum(['walking', 'driving', 'train', 'flight', 'bus', 'shuttle', 'unknown']),
    durationSeconds: z.number().int().min(0).max(604800).nullable(), distanceMeters: z.number().int().min(0).max(50000000).nullable(),
  }).strict()).max(49),
};
const travelDayPlanSchema = z.object(travelDayFields).strict().superRefine((value, context) => {
  if (value.legs.length !== Math.max(0, value.stops.length - 1)) context.addIssue({code:z.ZodIssueCode.custom,path:['legs'],message:'Leg count must match the number of adjacent stop pairs.'});
  for (let index=1; index<value.stops.length; index++) if (value.stops[index].time < value.stops[index-1].time) context.addIssue({code:z.ZodIssueCode.custom,path:['stops',index,'time'],message:'Planned stop times must be ascending.'});
});
const travelBudgetFields = {
  itemId: travelPlaceIdSchema, category: z.enum(['attractions', 'transport', 'stays', 'food']), name: shortText(80),
  dates: z.array(date).min(1).max(7), estimatedAmount: amount, estimatedMaxAmount: amount.optional(),
};
const travelBudgetItemSchema = z.object(travelBudgetFields).strict().superRefine((value, context) => {
  if (value.estimatedMaxAmount !== undefined && value.estimatedMaxAmount < value.estimatedAmount) context.addIssue({code:z.ZodIssueCode.custom,path:['estimatedMaxAmount'],message:'Maximum estimate cannot be below the minimum estimate.'});
  if (value.dates.some((entry,index) => index>0 && entry<=value.dates[index-1])) context.addIssue({code:z.ZodIssueCode.custom,path:['dates'],message:'Budget dates must be unique and ascending.'});
});

return { travelPlacePatchSchema, travelDayFields, travelDayPlanSchema, travelBudgetFields, travelBudgetItemSchema };
}
