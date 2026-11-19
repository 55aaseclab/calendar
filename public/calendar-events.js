// Browser event records are separate for every native Praxis identity.
export const EVENT_KEY = 'praxis.calendar.events.v1';
export const eventKey = ownerId => `${EVENT_KEY}:${encodeURIComponent(ownerId)}`;
export function loadEvents(ownerId, storage = localStorage) {
  if (!ownerId) return [];
  try {
    const value = JSON.parse(storage.getItem(eventKey(ownerId)) || 'null');
    return value?.version === 1 && value.ownerId === ownerId && Array.isArray(value.events) ? value.events.filter(event => typeof event?.id === 'string' && typeof event.title === 'string' && Number.isFinite(Date.parse(event.start)) && Number.isFinite(Date.parse(event.end)) && Date.parse(event.end) > Date.parse(event.start)) : [];
  } catch { return []; }
}
export function saveEvent(ownerId, event, storage = localStorage) {
  if (!ownerId || typeof event?.id !== 'string' || !event.id || typeof event.title !== 'string' || !event.title || event.title.length > 300 || !Number.isFinite(Date.parse(event.start)) || !Number.isFinite(Date.parse(event.end)) || Date.parse(event.end) <= Date.parse(event.start)) throw Error('Invalid browser calendar event');
  const events = loadEvents(ownerId, storage).filter(item => item.id !== event.id);
  if (events.length >= 1000) throw Error('Browser calendar event limit reached');
  events.push({ id: event.id, title: event.title, start: event.start, end: event.end, updatedAt: event.updatedAt });
  storage.setItem(eventKey(ownerId), JSON.stringify({ version: 1, ownerId, events }));
  return events;
}
