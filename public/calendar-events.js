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

export const DATABASE_NAME = 'praxis.calendar.v2';
export const databaseEventKey = ownerId => `IndexedDB: ${DATABASE_NAME}/events:${encodeURIComponent(ownerId || '*')}`;
const legacyLoadEvents = loadEvents;
function database() {
  if (!globalThis.indexedDB) return Promise.reject(Error('Browser event database is unavailable'));
  return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('events'))db.createObjectStore('events',{keyPath:['ownerId','id']}).createIndex('owner','ownerId');if(!db.objectStoreNames.contains('imports'))db.createObjectStore('imports',{keyPath:'ownerId'});};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close older Calendar tabs and try again'));request.onsuccess=()=>resolve(request.result);});
}
const requested = request => new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function withEvents(ownerId,callback) {
  const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['events','imports'],'readwrite');let result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Event transaction failed'));callback(tx,value=>result=value);});}finally{db.close();}
}
export async function loadDatabaseEvents(ownerId,storage=globalThis.localStorage) {
  if(!ownerId)return[];
  const raw=storage?.getItem(eventKey(ownerId))||null,legacy=legacyLoadEvents(ownerId,storage);if(raw){const original=JSON.parse(raw);if(original?.version!==1||original.ownerId!==ownerId||!Array.isArray(original.events)||original.events.length!==legacy.length)throw Error('Existing calendar data needs recovery before import');}
  await withEvents(ownerId,(tx,done)=>{const events=tx.objectStore('events'),imports=tx.objectStore('imports'),request=imports.get(ownerId);request.onsuccess=()=>{const prior=request.result;if(raw&&prior?.raw!==raw){for(const event of legacy){const existing=events.get([ownerId,event.id]);existing.onsuccess=()=>{const current=existing.result;if(!current||event.updatedAt&&event.updatedAt>(current.event.updatedAt||''))events.put({ownerId,id:event.id,event});};}imports.put({ownerId,raw,previousRaw:prior?.raw||null,importedAt:new Date().toISOString()});}done(true);};});
  const db=await database();try{return(await requested(db.transaction('events','readonly').objectStore('events').index('owner').getAll(ownerId))).map(row=>row.event);}finally{db.close();}
}
export async function saveDatabaseEvent(ownerId,event,storage=globalThis.localStorage) {
  // Reuse the native field validator without writing a second authoritative copy.
  const memory={getItem:()=>null,setItem(){}};saveEvent(ownerId,event,memory);await loadDatabaseEvents(ownerId,storage);
  await withEvents(ownerId,(tx,done)=>{const store=tx.objectStore('events'),count=store.index('owner').count(ownerId);count.onsuccess=()=>{const existing=store.get([ownerId,event.id]);existing.onsuccess=()=>{if(!existing.result&&count.result>=1000){tx.abort();return;}store.put({ownerId,id:event.id,event:{id:event.id,title:event.title,start:event.start,end:event.end,updatedAt:event.updatedAt}});done(true);};};});
  storage?.setItem('praxis.calendar.db-change',JSON.stringify({ownerId,at:Date.now()}));return loadDatabaseEvents(ownerId,storage);
}
