import { loadEvents, saveEvent, eventKey } from './calendar-events.js';
const $ = (id) => document.getElementById(id);
const key = (d) =>
  [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(
    '-'
  );
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const requestedDay = new URL(location.href).searchParams.get('date');
const parseDay = value => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null; const [year, month, day] = value.split('-').map(Number), date = new Date(year, month - 1, day); return key(date) === value ? date : null; };
let selected = parseDay(requestedDay) || midnight(new Date()),
  items = [],
  state = '',
  revision = 0,
  ownerId = '', localEvents = [], draftEventId = '', draftOwner = '';
const standaloneOwner = 'standalone:' + location.origin;
const managed = location.pathname.startsWith('/apps/calendar/');
const language = () => (localStorage.getItem('praxis.locale') === 'zh' ? 'zh-CN' : 'en');
const tr = (en, zh) => (language() === 'en' ? en : zh);
const format = (date, options) => new Intl.DateTimeFormat(language(), options).format(date);
function monthStep(step) {
  const first = new Date(selected.getFullYear(), selected.getMonth() + step, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(last, selected.getDate()));
  selected = first;
  render();
}
function render() {
  document.documentElement.lang = language();
  document.title = $('brand').textContent = tr('Calendar', '日历');
  $('language').textContent = tr('中文', 'English');
  $('prev').ariaLabel = tr('Previous month', '上个月');
  $('next').ariaLabel = tr('Next month', '下个月');
  $('today').textContent = tr('Today', '今天');
  $('new').textContent = tr('New event', '新建日程');
  $('new').disabled = managed && !ownerId;
  $('summary-label').textContent = tr('Event title', '日程名称');
  $('start-label').textContent = tr('Start', '开始');
  $('end-label').textContent = tr('End', '结束');
  $('download').textContent = tr('Download .ics', '下载日程 .ics');
  $('cancel').textContent = tr('Cancel', '取消');
  $('month').textContent = format(selected, { year: 'numeric', month: 'long' });
  $('day').textContent = format(selected, { weekday: 'long', month: 'short', day: 'numeric' });
  const year = selected.getFullYear(),
    month = selected.getMonth(),
    grid = $('grid');
  const days = new Date(year, month + 1, 0).getDate(),
    offset = (new Date(year, month, 1).getDay() + 6) % 7;
  $('weekdays').replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => {
      const el = document.createElement('span');
      el.textContent = format(new Date(2024, 0, 1 + i), { weekday: 'short' });
      return el;
    })
  );
  grid.replaceChildren();
  for (let i = 0; i < offset; i++) grid.append(document.createElement('span'));
  const entries = [...items, ...localEvents.map(event => ({ title: event.title, date: event.start.replace('T', ' '), localId: event.id }))];
  const dated = new Set(entries.map((item) => item.date?.slice(0, 10)));
  for (let i = 1; i <= days; i++) {
    const date = new Date(year, month, i),
      iso = key(date),
      el = document.createElement('button');
    el.type = 'button';
    el.textContent = String(i);
    el.ariaLabel = format(date, { dateStyle: 'full' });
    el.setAttribute('aria-pressed', String(i === selected.getDate()));
    if (iso === key(new Date())) el.setAttribute('aria-current', 'date');
    if (dated.has(iso)) el.className = 'marked';
    el.onclick = () => {
      selected = date;
      render();
      grid.querySelector('[aria-pressed=true]').focus();
    };
    grid.append(el);
  }
  const matches = entries
    .filter((item) => item.date?.slice(0, 10) === key(selected))
    .sort((a, b) => a.date.localeCompare(b.date));
  $('status').textContent =
    state === 'error'
      ? tr('Could not load reminders.', '无法读取提醒。')
      : state === 'partial'
        ? tr('Some reminders are unavailable.', '部分提醒暂不可用。')
        : !matches.length
          ? tr('No scheduled items for this day.', '当天没有日程。')
          : '';
  $('agenda').replaceChildren(
    ...matches.map((item) => {
      const el = document.createElement('li'),
        a = document.createElement('a');
      a.href = item.localId ? '?'+new URLSearchParams({ date: item.date.slice(0, 10), source: 'event:'+item.localId }) : '/business/reminder/?' + new URLSearchParams({ space: item.spaceId, item: item.resourceId });
      el.dataset.source = item.localId ? 'event:'+item.localId : 'reminder:'+item.spaceId+':'+item.resourceId; el.tabIndex = -1;
      a.textContent = [item.date.slice(11), item.title].filter(Boolean).join(' · ');
      el.append(a);
      return el;
    })
  );
}
async function refresh() {
  if (!managed) { ownerId = standaloneOwner; localEvents = loadEvents(ownerId); render(); return; }
  const run = ++revision;
  try {
    const accountResponse = await fetch('/api/business/account/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!accountResponse.ok) throw Error();
    const account = await accountResponse.json();
    if (typeof account.user?.id !== 'string') throw Error();
    if (run !== revision) return;
    if (ownerId && ownerId !== account.user.id) { $('editor').hidden = true; $('new').hidden = false; $('summary').value = ''; draftEventId = ''; draftOwner = ''; }
    ownerId = account.user.id; localEvents = loadEvents(ownerId);
    const response = await fetch('./api/agenda', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw Error();
    const result = await response.json();
    if (run !== revision) return;
    if (!Array.isArray(result.items)) throw Error();
    items = result.items;
    state = result.partial ? 'partial' : '';
  } catch {
    if (run !== revision) return;
    items = []; localEvents = []; ownerId = '';
    state = 'error';
  }
  $('new').disabled = managed && !ownerId;
  render();
  const source = new URL(location.href).searchParams.get('source');
  if (source) [...$('agenda').children].find(node => node.dataset.source === source)?.focus();
}
$('prev').onclick = () => monthStep(-1);
$('next').onclick = () => monthStep(1);
$('today').onclick = () => {
  selected = midnight(new Date());
  render();
};
$('language').onclick = () => {
  const next = language() === 'en' ? 'zh' : 'en';
  localStorage.setItem('praxis.locale', next);
  document.cookie = 'praxis_locale=' + next + '; Path=/; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
  render();
  dispatchEvent(new Event('praxis-locale-change'));
};
$('new').onclick = () => {
  if (!ownerId) return;
  draftEventId = crypto.randomUUID(); draftOwner = ownerId;
  $('editor').hidden = false;
  $('new').hidden = true;
  $('start').value = key(selected) + 'T09:00';
  $('end').value = key(selected) + 'T10:00';
  $('summary').focus();
};
$('cancel').onclick = () => {
  $('editor').hidden = true;
  $('new').hidden = false;
  $('new').focus();
};
$('end').oninput = $('start').oninput = () => $('end').setCustomValidity('');
$('editor').onsubmit = async (event) => {
  event.preventDefault();
  const start = new Date($('start').value),
    end = new Date($('end').value);
  if (end <= start) {
    $('end').setCustomValidity(tr('End must follow start.', '结束时间须晚于开始时间。'));
    $('end').reportValidity();
    return;
  }
  if (!ownerId || draftOwner !== ownerId) return;
  if (managed) {
    try { const response = await fetch('/api/business/account/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(7000) }); const account = response.ok && await response.json(); if (account?.user?.id !== draftOwner) { await refresh(); $('status').textContent = tr('Your account changed. Open a new event to continue.', '账号已变化，请重新打开新建日程。'); return; } }
    catch { $('status').textContent = tr('Could not confirm your account. Try again.', '暂时无法确认账号，请重试。'); return; }
  }
  try { localEvents = saveEvent(ownerId, { id: draftEventId || crypto.randomUUID(), title: $('summary').value, start: $('start').value, end: $('end').value, updatedAt: new Date().toISOString() }); }
  catch { $('status').textContent = tr('Could not save this browser event. No invitation was downloaded.', '无法保存此浏览器日程，本次未下载邀请。'); return; }
  render();
  dispatchEvent(new Event('praxis-calendar-events-change'));
  const utc = (d) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const escape = (s) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/[;,]/g, (m) => '\\' + m);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Praxis//Calendar//EN',
    'BEGIN:VEVENT',
    'UID:' + draftEventId + '@praxis',
    'DTSTAMP:' + utc(new Date()),
    'DTSTART:' + utc(start),
    'DTEND:' + utc(end),
    'SUMMARY:' + escape($('summary').value),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  const bytes = new TextEncoder();
  const folded = lines.map((line) => {
    let out = '',
      count = 0;
    for (const c of line) {
      const n = bytes.encode(c).length;
      if (count + n > 75) {
        out += '\r\n ';
        count = 1;
      }
      out += c;
      count += n;
    }
    return out;
  });
  const url = URL.createObjectURL(
    new Blob([folded.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'event.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
addEventListener('storage', (e) => {
  if (e.key === 'praxis.locale') render();
  if (ownerId && (e.key === eventKey(ownerId) || e.key === null)) { localEvents = loadEvents(ownerId); render(); }
});
addEventListener('pageshow', (e) => {
  if (e.persisted) void refresh();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
if (managed) setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
render();
void refresh();
