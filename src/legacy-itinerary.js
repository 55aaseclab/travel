/** Read-only seed projection for plans that have no authored place-level data. */
export function projectLegacyItinerary(trip, route) {
  if (!trip || !route || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trip.id) || trip.id !== route.id || !Array.isArray(trip.days) || !trip.days.length || trip.days.length > 366) throw new Error('Legacy itinerary metadata is invalid');
  const start = Date.parse(route.startDate + 'T00:00:00Z');
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== route.startDate || new Date(start + (trip.days.length - 1) * 86400000).toISOString().slice(0, 10) !== route.endDate) throw new Error('Legacy itinerary dates are invalid');
  const days = trip.days.map((day, index) => ({ date: new Date(start + index * 86400000).toISOString().slice(0, 10), title: day.title, stops: [], legs: [] }));
  return { schemaVersion: 1, tripId: trip.id, travelers: trip.travelers || 1, places: [], days, budget: { currency: 'CNY', groups: [] }, preparation: { beforeDeparture: [], moments: [] } };
}

export function itineraryRouteInfo(route, data) {
  return { ...route, startDate: data.days[0].date, endDate: data.days.at(-1).date, placeCount: data.places.length, cityCount: new Set(data.places.map(place => place.city).filter(Boolean)).size };
}
