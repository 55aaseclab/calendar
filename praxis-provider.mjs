const metadata = { version: 1, appId: 'calendar', name: 'Calendar', cards: { supported: true, execution: 'browser' }, nativeReads: ['/api/agenda'], dataSources: [
  { id: 'reminder-dates', label: 'Authorized Reminder dates', labels: { zh: '获授权的 Reminder 日期' }, kind: 'derived', location: { kind: 'derived' }, description: 'A date view derived from reminders the current account can read.' },
  { id: 'local-events', label: 'Events created in this browser', labels: { zh: '在此浏览器创建的日程' }, kind: 'browser', location: { kind: 'browser', storageKey: 'IndexedDB: praxis.calendar.v2/events:*' } },
  { id: 'ics-files', label: 'Downloaded calendar invitations', labels: { zh: '已下载的日历邀请' }, kind: 'external', location: { kind: 'external' }, description: 'Downloaded .ics files belong to the browser download destination or the calendar into which the person imports them.' },
] };
export const EVENT_KEY = 'praxis.calendar.events.v1';
export const eventKey = ownerId => `${EVENT_KEY}:${encodeURIComponent(ownerId)}`;
export function describe() { return structuredClone(metadata); }
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number), date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
export async function readLocalEvents(ownerId, storage) {
  if (!storage && globalThis.indexedDB) { const module=await import('/apps/calendar/calendar-events.js'); return module.loadDatabaseEvents(ownerId); }
  storage ??= globalThis.localStorage;
  if (typeof ownerId !== 'string' || !ownerId || !storage) return [];
  try {
    const value = JSON.parse(storage.getItem(eventKey(ownerId)) || 'null');
    if (value?.version !== 1 || value.ownerId !== ownerId || !Array.isArray(value.events) || value.events.length > 1000) return [];
    return value.events.filter(item => typeof item?.id === 'string' && item.id && typeof item.title === 'string' && item.title && item.title.length <= 300 && typeof item.start === 'string' && validDay(item.start.slice(0, 10)) && Number.isFinite(Date.parse(item.start)) && Number.isFinite(Date.parse(item.end)) && Date.parse(item.end) > Date.parse(item.start)).map(item => ({ id: item.id, title: item.title, start: item.start, end: item.end, ...(item.updatedAt && { updatedAt: item.updatedAt }) }));
  } catch { return []; }
}
async function digest(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
export async function getCards(context) {
  if (!context?.identity?.userId || typeof context.read !== 'function') return { status: 'unavailable', items: [], message: { en: 'Open Calendar from your signed-in workbench.', zh: '请从已登录的工作台打开日历。' } };
  let agenda = [], failed = false;
  try {
    const value = await context.read('api/agenda');
    if (!Array.isArray(value?.items) || value.items.length > 20000) throw Error('Invalid authorized agenda');
    agenda = value.items.filter(item => typeof item?.title === 'string' && typeof item.resourceId === 'string' && typeof item.date === 'string' && validDay(item.date.slice(0, 10))).map(item => ({ id: `reminder:${item.spaceId || ''}:${item.resourceId}`, title: item.title, date: item.date, source: 'Reminder', sourceId: item.resourceId }));
    failed = value.partial === true;
  } catch { failed = true; }
  const local = (await readLocalEvents(context.identity.userId, context.storage)).map(item => ({ id: `event:${item.id}`, title: item.title, date: item.start.replace('T', ' '), source: 'Calendar', sourceId: item.id, end: item.end }));
  const days = new Map();
  for (const item of [...agenda, ...local]) { const day = item.date.slice(0, 10); if (!days.has(day)) days.set(day, []); days.get(day).push(item); }
  const items = [];
  for (const [day, entries] of [...days].sort(([a], [b]) => a.localeCompare(b)).slice(0, 120)) {
    entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const href = `/apps/calendar/?date=${day}`, revision = await digest(entries);
    items.push({ id: `calendar:day:${day}`, appId: 'calendar', spaceId: context.identity.userId, resourceId: day, revision, kind: 'result', title: day,
      preview: entries.slice(0, 3).map(entry => [entry.date.slice(11, 16), entry.title].filter(Boolean).join(' ')).join('\n'),
      reason: { en: 'Scheduled items for this day.', zh: '当天已安排的事项。' }, source: { name: 'Calendar' }, date: day,
      primaryAction: { label: { en: 'Open day', zh: '打开当天' }, href },
      evidence: entries.slice(0, 12).map(entry => ({ label: entry.source, excerpt: `${entry.date} ${entry.title}`, href: href + '&' + new URLSearchParams({ source: entry.id }), revision })) });
  }
  return { status: failed ? items.length ? 'partial' : 'unavailable' : items.length ? 'ready' : 'empty', items, ...(failed && { message: { en: 'Some authorized dates could not be refreshed.', zh: '部分已授权日期暂时无法刷新。' } }) };
}
export async function getDataInventory(context = {}) {
  const items = [];
  for (const source of metadata.dataSources) {
    let resolved = {};
    if (typeof context.resolveDataSource === 'function') {
      try { resolved = await context.resolveDataSource(structuredClone(source)) || {}; } catch { resolved = { status: 'unavailable' }; }
    } else if (source.kind === 'browser') resolved = { storageKey: context.identity?.userId ? 'IndexedDB: praxis.calendar.v2/events:'+encodeURIComponent(context.identity.userId) : EVENT_KEY + ':*' };
    items.push({ id: source.id, appId: 'calendar', label: source.label, labels: source.labels, kind: source.kind, ...resolved, ...(source.description && !resolved.description && { description: source.description }) });
  }
  return { status: items.some(item => item.status === 'unavailable') ? 'partial' : 'ready', items };
}
