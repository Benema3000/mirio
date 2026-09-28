import test from 'node:test';
import assert from 'node:assert/strict';
import {personalBestKey} from '../js/course-version.js';

let moduleId = 0;
const fixtureContexts = new WeakSet();
async function fixture(t, storage) {
  if (!fixtureContexts.has(t)) {
    fixtureContexts.add(t);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    t.after(() => {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    });
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { if (storage instanceof Error) throw storage; return storage; },
  });
  return import(`../js/time-records.js?test=${++moduleId}`);
}

function store(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { entries, writes: 0, getItem: key => entries.get(key) ?? null,
    setItem(key, value) { this.writes++; entries.set(key, value); } };
}

test('run times show stable hundredths across minute and 24-hour boundaries', async t => {
  const { formatRunTime } = await fixture(t);
  for (const [value, text] of [[0, '00:00.00'], [9.99, '00:00.00'], [10, '00:00.01'], [999, '00:00.99'],
    [59999, '00:59.99'], [60000, '01:00.00'], [61349, '01:01.34'], [3600000, '60:00.00'], [86400000, '1440:00.00']]) {
    assert.equal(formatRunTime(value), text);
  }
  for (const value of [NaN, Infinity, -Infinity, -1, '60000', null, undefined]) assert.equal(formatRunTime(value), '--:--.--');
});

test('the first real result becomes a best, with each level isolated', async t => {
  const storage = store();
  const { readPersonalBest, savePersonalBest } = await fixture(t, storage);
  for (const level of ['adventure', 'sky', 'ribbon', 'kart']) assert.equal(readPersonalBest(level), null, 'there are no seeded best times');
  assert.deepEqual(savePersonalBest('adventure', 95001), { best: 95001, previous: null, isNew: true });
  assert.deepEqual(savePersonalBest('sky', 25005), { best: 25005, previous: null, isNew: true });
  assert.deepEqual(savePersonalBest('ribbon', 8100), { best: 8100, previous: null, isNew: true });
  assert.deepEqual(savePersonalBest('kart', 48000), { best: 48000, previous: null, isNew: true });
  assert.deepEqual(['adventure', 'sky', 'ribbon', 'kart'].map(readPersonalBest), [95001, 25005, 8100, 48000]);
  const reloaded = await import(`../js/time-records.js?test=${++moduleId}`);
  assert.deepEqual(['adventure', 'sky', 'ribbon', 'kart'].map(reloaded.readPersonalBest), [95001, 25005, 8100, 48000], 'persisted results survive a new module/session');
});

test('only a strictly faster time replaces the personal best', async t => {
  const storage = store();
  const { savePersonalBest } = await fixture(t, storage);
  savePersonalBest('sky', 35000);
  assert.deepEqual(savePersonalBest('sky', 35000), { best: 35000, previous: 35000, isNew: false });
  assert.deepEqual(savePersonalBest('sky', 40000), { best: 35000, previous: 35000, isNew: false });
  assert.equal(storage.writes, 1, 'ties and slower runs do not write storage');
  assert.deepEqual(savePersonalBest('sky', 34999), { best: 34999, previous: 35000, isNew: true });
  assert.equal(storage.writes, 2);
});

test('Klangkugel saves separately without replacing existing course records', async t => {
  const storage = store({'mirio-time-best-v2:kart': '42000', 'mirio-time-best-v1:sky': '21000'});
  const records = await fixture(t, storage);
  assert.equal(records.savePersonalBest('marble', 61000).isNew, true);
  assert.equal(records.readPersonalBest('marble'), 61000);
  assert.equal(records.readPersonalBest('kart'), null);
  assert.equal(storage.entries.get('mirio-time-best-v2:kart'), '42000');
  assert.equal(storage.entries.get('mirio-time-best-v1:sky'), '21000');
  const reloaded = await import(`../js/time-records.js?test=${++moduleId}`);
  assert.equal(reloaded.readPersonalBest('marble'), 61000);
});

test('Seifenstern persists its own best while keeping musical and legacy times', async t => {
  const storage = store({'mirio-time-best-v2:marble': '52380', 'mirio-time-best-v1:sky': '21000'});
  const records = await fixture(t, storage);
  assert.equal(records.savePersonalBest('tilt', 66000).isNew, true);
  assert.equal(records.readPersonalBest('tilt'), 66000);
  assert.equal(records.readPersonalBest('marble'), null);
  assert.equal(storage.entries.get('mirio-time-best-v2:marble'), '52380');
  assert.equal(storage.entries.get('mirio-time-best-v1:sky'), '21000');
  const reloaded = await import(`../js/time-records.js?test=${++moduleId}`);
  assert.equal(reloaded.readPersonalBest('tilt'), 66000);
});

test('unknown levels and invalid durations cannot create or replace records', async t => {
  const storage = store();
  const { readPersonalBest, savePersonalBest } = await fixture(t, storage);
  for (const level of ['other', '__proto__', 'constructor', '', 0, null, undefined]) {
    assert.equal(readPersonalBest(level), null);
    assert.deepEqual(savePersonalBest(level, 30000), { best: null, previous: null, isNew: false });
  }
  savePersonalBest('adventure', 45000);
  for (const time of [0, -1, 1.2, NaN, Infinity, '30000', null, undefined, 86400001, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(savePersonalBest('adventure', time), { best: 45000, previous: 45000, isNew: false });
  }
  assert.equal(storage.writes, 1);
  assert.deepEqual(savePersonalBest('ribbon', 86400000), { best: 86400000, previous: null, isNew: true }, '24 hours is an inclusive duration limit');
});

test('malformed local entries and unrelated legacy scores are ignored', async t => {
  for (const bad of ['', '0', '-3', '3.4', 'NaN', 'Infinity', '86000oops', '86400001', '{}', 'null', ' 30000 ']) {
    const storage = store({ [personalBestKey('sky')]: bad, 'mirio-best': '1' });
    const records = await fixture(t, storage);
    assert.equal(records.readPersonalBest('sky'), null, `damaged value ${JSON.stringify(bad)}`);
    assert.equal(records.savePersonalBest('sky', 40000).isNew, true);
    assert.equal(storage.entries.get('mirio-best'), '1');
  }
});

test('a blocked storage getter still supports bests for the current session', async t => {
  const { readPersonalBest, savePersonalBest } = await fixture(t, new Error('SecurityError'));
  assert.equal(readPersonalBest('adventure'), null);
  assert.equal(savePersonalBest('adventure', 68000).isNew, true);
  assert.equal(readPersonalBest('adventure'), 68000);
  assert.equal(savePersonalBest('adventure', 69000).isNew, false);
  assert.deepEqual(savePersonalBest('adventure', 67000), { best: 67000, previous: 68000, isNew: true });
});

test('quota failures retain a new best despite a stale persisted value', async t => {
  const storage = store({ [personalBestKey('ribbon')]: '15000' });
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const { readPersonalBest, savePersonalBest } = await fixture(t, storage);
  assert.equal(readPersonalBest('ribbon'), 15000);
  assert.deepEqual(savePersonalBest('ribbon', 14000), { best: 14000, previous: 15000, isNew: true });
  assert.equal(readPersonalBest('ribbon'), 14000, 'stale storage must not undo the in-memory improvement');
  storage.entries.set(personalBestKey('ribbon'), '13000');
  assert.equal(readPersonalBest('ribbon'), 13000, 'a better result from another tab remains visible');
});

test('missing storage and read failures both keep levels usable', async t => {
  const noStorage = await fixture(t);
  assert.equal(noStorage.savePersonalBest('sky', 40000).best, 40000);
  assert.equal(noStorage.readPersonalBest('sky'), 40000);
  const unreadable = await fixture(t, { getItem() { throw new Error('blocked'); }, setItem() {} });
  assert.equal(unreadable.savePersonalBest('ribbon', 12000).best, 12000);
  assert.equal(unreadable.readPersonalBest('ribbon'), 12000);
  assert.equal(unreadable.readPersonalBest('sky'), null);
});


test('changed courses preserve old records without ranking them', async t => {
  const storage = store({'mirio-time-best-v1:sky': '21000'});
  const records = await fixture(t, storage);
  assert.equal(records.readPersonalBest('sky'), null);
  assert.equal(records.savePersonalBest('sky', 74000).previous, null);
  assert.equal(storage.entries.get('mirio-time-best-v1:sky'), '21000');
  assert.equal(storage.entries.get(personalBestKey('sky')), '74000');
});

test('changed discovery, classic race and pinball courses exclude earlier times without deleting them', async t => {
  const old = {'mirio-time-best-v2:adventure': '160000', 'mirio-time-best-v2:kart': '31000', 'mirio-time-best-v2:marble': '52000', 'mirio-time-best-v2:tilt': '65000'};
  const storage = store(old), records = await fixture(t, storage);
  for (const id of ['adventure', 'kart', 'marble']) assert.equal(records.readPersonalBest(id), null);
  assert.equal(records.readPersonalBest('tilt'), 65000);
  records.savePersonalBest('kart', 39000);
  for (const [key, value] of Object.entries(old)) assert.equal(storage.entries.get(key), value);
});

test('the optional branching race never competes with the classic race', async t => {
  const records = await fixture(t, store());
  const {COURSE} = await import('../js/course-version.js');
  records.savePersonalBest('kart', 35000);
  records.savePersonalBest('kart', 40000, {course: COURSE.BRANCHES});
  assert.equal(records.readPersonalBest('kart'), 35000);
  assert.equal(records.readPersonalBest('kart', {course: COURSE.BRANCHES}), 40000);
  const reloaded = await import(`../js/time-records.js?test=${++moduleId}`);
  assert.equal(reloaded.readPersonalBest('kart'), 35000);
  assert.equal(reloaded.readPersonalBest('kart', {course: COURSE.BRANCHES}), 40000);
});

test('revised postal and garden journeys preserve but exclude their earlier times', async t => {
  const old = {'mirio-time-best-v2:sky': '65000', 'mirio-time-best-v2:ribbon': '81000', 'mirio-time-best-v2:tilt': '66000'};
  const storage = store(old), records = await fixture(t, storage);
  for (const [level, duration] of [['sky', 72000], ['ribbon', 92000]]) {
    assert.equal(records.readPersonalBest(level), null, `${level} must not rank the old layout`);
    assert.deepEqual(records.savePersonalBest(level, duration), {best: duration, previous: null, isNew: true});
    assert.equal(storage.entries.get(personalBestKey(level)), String(duration));
  }
  assert.equal(records.readPersonalBest('tilt'), 66000, 'unchanged gameplay keeps its record');
  for (const [key, value] of Object.entries(old)) assert.equal(storage.entries.get(key), value);
});
