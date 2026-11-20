import { createWebIntegration } from './praxis/web.mjs';
import { createStorageIntegration } from './praxis/storage.mjs';
import { createDeploymentIntegration } from './praxis/deployment.mjs';
import { createTravelSchema } from './praxis/travel-schema.mjs';
import { createTravelPlanningSchema } from './praxis/travel-planning-schema.mjs';

export function createIntegration({ z }) {
const businessError=(status,code)=>Object.assign(new Error(code),{status,code});
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(value);
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/);
const common = { spaceId: id }, mutation = { ...common, idempotencyKey: id };
const target = { ...mutation, resourceId: id, expectedRevision: z.string().min(1).max(200) };
function planningInput(schema, args) {
  const { spaceId: ignoredSpace, resourceId: ignoredResource, expectedRevision: ignoredRevision, idempotencyKey: ignoredKey, ...input } = args;
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw businessError(400, 'INVALID_INPUT');
  return parsed.data;
}
const travelSchema = createTravelSchema(z);
const { travelPlaceIdSchema, travelPlaceDetailsSchema, travelRevisionSchema, travelPoiIdSchema, travelCoordinateSchema, travelServicesInputSchema, travelServicesFields } = travelSchema;
const travelPlanningSchema = createTravelPlanningSchema(z, travelSchema);
const { travelPlacePatchSchema, travelDayFields, travelDayPlanSchema, travelBudgetFields, travelBudgetItemSchema } = travelPlanningSchema;
const travelUpsertPlaceInput = z.object({ placeId: travelPlaceIdSchema, patch: travelPlacePatchSchema }).strict();
const travelPlanningInputs={upsert_place:travelUpsertPlaceInput,set_day_plan:travelDayPlanSchema,set_budget_item:travelBudgetItemSchema};
const operationActions={"list_itineraries":"read","read_itinerary":"read","update_place_details":"update","upsert_place":"update","set_day_plan":"update","set_budget_item":"update","search_places":"read","get_place":"read","plan_route":"read","query_travel_services":"read","events":"read"};
const operations=Object.fromEntries(Object.entries(operationActions).map(([name,action])=>[name,{action,mutation:action!=='read'}]));
const observedCapabilities={"list_itineraries":"read","read_itinerary":"read","update_place_details":"update","upsert_place":"update","set_day_plan":"update","set_budget_item":"update","search_places":"search","get_place":"read","plan_route":"read","query_travel_services":"read","events":"read"};
for(const [name,definition]of Object.entries(operations))definition.capability=observedCapabilities[name];
function validateInvocation(request) {
const {appId,operation,spaceId,resourceId}=request;const action=operationActions[operation];
if(request.sourceResourceId!==undefined)throw businessError(400,'INVALID_REQUEST');
if (appId === 'travel') {
    if (!['list_itineraries', 'events'].includes(operation) && !resourceId) throw businessError(400, 'RESOURCE_REQUIRED');
    if (action === 'update' && (typeof request.expectedRevision !== 'string' || !/^(0|[1-9]\d*)$/.test(request.expectedRevision) || !Number.isSafeInteger(Number(request.expectedRevision)))) throw businessError(400, 'INVALID_REVISION');
  }
if (appId === 'travel' && Object.hasOwn(travelPlanningInputs, operation) && !travelPlanningInputs[operation].safeParse(request.input).success) throw businessError(400, 'INVALID_INPUT');
}
return {schemaVersion:1,appId:"travel",web:createWebIntegration(),storage:createStorageIntegration(),deployment:createDeploymentIntegration(),business:{adapterId:"travel",actions:["read","update"],scopes:{"travel:read":["read"],"travel:write":["update"]},targetedCreate:false,operations,tools:[
{ name: 'travel_list_itineraries', appId: 'travel', operation: 'list_itineraries', action: 'read', description: 'List only itinerary summaries authorized in one space. Use the returned opaque resource ID and current revision for subsequent operations.', schema: z.object(common).strict() },
{ name: 'travel_read_itinerary', appId: 'travel', operation: 'read_itinerary', action: 'read', description: 'Read one authorized itinerary and its current revision. No application files or other itineraries are exposed.', schema: z.object({ ...common, resourceId: id }).strict() },
{ name: 'travel_update_place_details', appId: 'travel', operation: 'update_place_details', action: 'update', description: 'Update only one place’s typed duration, opening hours or price within one authorized itinerary. Send a nonempty partial details object using the documented kinds and numeric units; use unknown for unknown facts. Requires its current revision and one stable idempotency key. Legacy text, route, dates, budget and all other fields remain unchanged.', schema: z.object({ ...target, placeId: travelPlaceIdSchema, expectedRevision: travelRevisionSchema, details: travelPlaceDetailsSchema }).strict(), input: args => ({ placeId: args.placeId, details: args.details }) },
{ name: 'travel_upsert_place', appId: 'travel', operation: 'upsert_place', action: 'update', description: 'Create or update one stable place ID in one authorized itinerary using only its typed, allowlisted fields. New places require name, type and query. Coordinates must be explicit GCJ02; image may only be null. Changing the place identity without a new position removes stale coordinates. Requires the current revision and one stable idempotency key; no HTML, arbitrary files or whole-itinerary replacement.', schema: z.object({ ...target, expectedRevision: travelRevisionSchema, placeId: travelPlaceIdSchema, patch: travelPlacePatchSchema }).strict(), input: args => planningInput(travelUpsertPlaceInput, args) },
{ name: 'travel_set_day_plan', appId: 'travel', operation: 'set_day_plan', action: 'update', description: 'Replace the ordered stop list and adjacent transport metrics for one existing itinerary date only. Stops must reference existing place IDs and ascending HH:mm times; supply exactly one leg per adjacent pair. Use numeric seconds/meters or null for unknown metrics. Does not change trip dates, other days or bookings. Requires the current revision and one stable idempotency key.', schema: z.object({ ...target, expectedRevision: travelRevisionSchema, ...travelDayFields }).strict(), input: args => planningInput(travelDayPlanSchema, args) },
{ name: 'travel_set_budget_item', appId: 'travel', operation: 'set_budget_item', action: 'update', description: 'Create or update one estimated budget item in one authorized itinerary. Amounts are integer minor units (cents) in the itinerary currency; dates must belong to the itinerary and be unique and ascending. No booking or payment state may be supplied. Requires the current revision and one stable idempotency key.', schema: z.object({ ...target, expectedRevision: travelRevisionSchema, ...travelBudgetFields }).strict(), input: args => planningInput(travelBudgetItemSchema, args) },
{ name: 'travel_search_places', appId: 'travel', operation: 'search_places', action: 'read', openWorld: true, description: 'Search public AMap places within an authorized itinerary context. Results are observations at checkedAt, not guarantees about future opening, price, availability or weather.', schema: z.object({ ...common, resourceId: id, keywords: z.string().trim().min(1).max(80), city: z.string().trim().min(1).max(40) }).strict(), input: args => ({ keywords: args.keywords, city: args.city }) },
{ name: 'travel_get_place', appId: 'travel', operation: 'get_place', action: 'read', openWorld: true, description: 'Read public AMap details for one POI in an authorized itinerary context. Missing details remain unknown; retain the returned limitations and observation time when planning.', schema: z.object({ ...common, resourceId: id, poiId: travelPoiIdSchema }).strict(), input: args => ({ poiId: args.poiId }) },
{ name: 'travel_plan_route', appId: 'travel', operation: 'plan_route', action: 'read', openWorld: true, description: 'Query driving or walking distance, duration and geometry point count for two explicit GCJ02 endpoints in an authorized itinerary context. This does not save or book anything.', schema: z.object({ ...common, resourceId: id, mode: z.enum(['driving', 'walking']), origin: travelCoordinateSchema, destination: travelCoordinateSchema, crs: z.literal('GCJ02') }).strict(), input: args => ({ mode: args.mode, origin: args.origin, destination: args.destination, crs: args.crs }) },
{ name: 'travel_search_services', appId: 'travel', operation: 'query_travel_services', action: 'read', openWorld: true, description: 'Read Fliggy reference offers in one authorized itinerary context. Choose exactly one kind: hotel requires city/checkIn/checkOut and optional keyword; flight or train requires origin/destination/date; restaurant requires city/query. Do not mix fields between kinds. Dates must fall within the next 365 days; hotel stays must be 1–30 nights. Offers are unconfirmed observations, not availability guarantees, orders or bookings.', schema: z.object({ ...common, resourceId: id, ...travelServicesFields }).strict(), input: args => {
    const { spaceId: ignoredSpace, resourceId: ignoredResource, ...input } = args;
    const parsed = travelServicesInputSchema.safeParse(input);
    if (!parsed.success) throw businessError(400, 'INVALID_INPUT');
    return parsed.data;
  } }
],skill:{name:"mcp-travel",path:"skills/mcp-travel/SKILL.md"},instructions:[],validateInvocation,schemas:{travelPlaceIdSchema,travelPlaceDetailsSchema,travelRevisionSchema,travelPoiIdSchema,travelCoordinateSchema,travelServicesInputSchema,travelServicesFields,travelPlacePatchSchema,travelDayFields,travelDayPlanSchema,travelBudgetFields,travelBudgetItemSchema},events:{operation:'events',resourceListOperation:'list_itineraries'}}};
}
