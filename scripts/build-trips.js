import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCatalogPage } from '../src/route-catalog.js';
import { renderItinerary } from '../src/render-itinerary.js';
import { projectLegacyItinerary, itineraryRouteInfo } from '../src/legacy-itinerary.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seed = resolve(process.env.TRAVEL_SEED_DIR || join(root, 'data'));
const out = resolve(process.env.TRAVEL_PUBLIC_DIR || join(root, 'public'));
const read = async file => JSON.parse(await readFile(join(seed,file),'utf8'));
const [{trips},{routes},credits] = await Promise.all(['trips.json','routes.json','photo-credits.json'].map(read));
if (!Array.isArray(trips) || !Array.isArray(routes) || !Array.isArray(credits)) throw new Error('Invalid catalog.');
await mkdir(out,{recursive:true});
const catalog = [];
for(const route of routes) {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route.id))throw new Error('Invalid route identifier.');
  const trip=trips.find(item=>item.id===route.id);
  if(!trip)throw new Error('Missing trip metadata.');
  let data;
  try {data=await read(trip.id+'.json');}
  catch(error){if(error.code!=='ENOENT')throw error;data=projectLegacyItinerary(trip,route);}
  const enriched=itineraryRouteInfo(route,data);
  const page=renderItinerary(trip,data,enriched,credits.filter(credit=>credit.tripId===trip.id),{cover:route.cover||null});
  await mkdir(join(out,trip.id),{recursive:true});
  await writeFile(join(out,trip.id,'index.html'),page);
  catalog.push(enriched);
}
await writeFile(join(out,'index.html'),renderCatalogPage(catalog));
await writeFile(join(out,'routes.json'),JSON.stringify({routes:catalog},null,2)+'\n');
console.log('Built travel catalog with '+catalog.length+' itineraries.');
