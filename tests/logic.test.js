// Run from the repo root:  node tests/logic.test.js
// Expected values are worked out by hand in the comments next to each check.
const assert = require('assert');
const L = require('../docs/logic.js');
const CARDS = require('../docs/cards.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const play = (t, card, cost) => ({ type: 'play', t, card, cost });

// ---------- elixir ----------
test('phases: 1x, then 2x at 2:00 elapsed, overtime 2x, then 3x', () => {
  assert.deepStrictEqual([0, 119.9, 120, 179, 180, 239.9, 240, 299].map((s) => L.multiplierAt(s)),
    [1, 1, 2, 2, 2, 2, 3, 3]);
});
test('starts at 5 and gains 1 every 2.8 s', () => {
  near(L.elixirAt([], 0).elixir, 5);
  near(L.elixirAt([], 2.8).elixir, 6); // 5 + 2.8 / 2.8
  near(L.elixirAt([], 14).elixir, 10); // 5 + 14 / 2.8 = 10 exactly
});
test('caps at 10 and counts the leak', () => {
  const r = L.elixirAt([], 16.8); // would be 11 -> 1 leaked
  near(r.elixir, 10); near(r.leaked, 1);
});
test('a play subtracts its cost', () => {
  // 4.0 s: 5 + 4/2.8 = 6.4286, minus 4 for Hog Rider = 2.4286; then +1 by 6.8 s
  near(L.elixirAt([play(4, 'Hog Rider', 4)], 6.8).elixir, 5 + 4 / 2.8 - 4 + 1);
});
test('regen across the 2x boundary', () => {
  // 118 s -> 122 s: 2 s at 1x (0.714) + 2 s at 2x (1.4286) = 2.1429
  near(L.regenBetween(118, 122), 2 / 2.8 + 4 / 2.8);
});
test('overspending is flagged, not hidden', () => {
  const r = L.elixirAt([play(0.5, 'Golem', 8)], 1); // only ~5.2 available
  assert.strictEqual(r.negative.length, 1);
  near(r.elixir, 0.5 / 2.8, 1e-9); // clamped to 0 at 0.5 s, then regen 0.5 s
});
test('Mirror costs one more than the card before it', () => {
  const ev = [play(10, 'Fireball', 4), play(14, 'Mirror', null)];
  // 5 + 14/2.8 = 10 gained by 14 s, minus 4 and minus 5 (Mirrored Fireball) = 1
  near(L.elixirAt(ev, 14).elixir, 1);
});
test('manual adjust and set', () => {
  near(L.elixirAt([{ type: 'set', t: 2, value: 3 }], 2).elixir, 3);
  near(L.elixirAt([{ type: 'adjust', t: 0, delta: -2 }], 0).elixir, 3);
});
test('champion ability spends elixir but is not a card play', () => {
  const ev = [play(3, 'Archer Queen', 5), { type: 'ability', t: 20, cost: 1 }];
  assert.strictEqual(L.cycleState(ev).plays, 1);
  near(L.elixirAt(ev, 20).elixir, 5 + 20 / 2.8 - 5 - 1); // never hits the cap
});
test('seconds until a target', () => {
  near(L.secondsUntil(2, 5, 0), 3 * 2.8);
  near(L.secondsUntil(0, 2, 118), 2 + 1.8); // 2 s at 1x gives 0.714, the other 1.286 at 2x takes 1.8 s
});

// ---------- cycle ----------
const DECK = ['Hog Rider', 'Musketeer', 'Ice Golem', 'Skeletons', 'Ice Spirit', 'Cannon', 'Fireball', 'The Log'];
test('before any play everything is unknown', () => {
  const c = L.cycleState([]);
  assert.deepStrictEqual(c.queue, [null, null, null, null]);
  assert.strictEqual(c.unknownInHand, 4);
});
test('first plays sit at the back of the queue', () => {
  const c = L.cycleState([play(1, 'Hog Rider', 4), play(5, 'Skeletons', 1)]);
  assert.deepStrictEqual(c.queue, [null, null, 'Hog Rider', 'Skeletons']);
  assert.strictEqual(c.next, null);
  assert.deepStrictEqual(c.hand, []); // every seen card is still in the queue
});
test('after 8 plays the hand is the first 4 and Hog is next', () => {
  // Play 8 distinct cards: queue = last 4, hand = first 4
  const ev = DECK.map((c, i) => play(i * 3, c, 1));
  const c = L.cycleState(ev);
  assert.ok(c.deckComplete);
  assert.deepStrictEqual(c.queue, ['Ice Spirit', 'Cannon', 'Fireball', 'The Log']);
  assert.deepStrictEqual(c.hand, ['Hog Rider', 'Musketeer', 'Ice Golem', 'Skeletons']);
  assert.strictEqual(c.next, 'Ice Spirit');
  assert.strictEqual(c.conflicts.length, 0);
});
test('cards in hand after 5 plays with 5 seen', () => {
  const ev = DECK.slice(0, 5).map((c, i) => play(i, c, 1));
  const c = L.cycleState(ev);
  assert.deepStrictEqual(c.hand, ['Hog Rider']);
  assert.strictEqual(c.unknownInHand, 3);
  assert.strictEqual(c.next, 'Musketeer');
});
test('replaying a card still in the queue is flagged', () => {
  const ev = [play(1, 'Hog Rider', 4), play(2, 'Skeletons', 1), play(3, 'Hog Rider', 4)];
  assert.deepStrictEqual(L.cycleState(ev).conflicts.map((x) => x.card), ['Hog Rider']);
});

// ---------- clock ----------
test('clock text', () => {
  assert.strictEqual(L.parseClock('2:41'), 161);
  assert.strictEqual(L.parseClock('0:05'), 5);
  assert.strictEqual(L.parseClock('2:75'), null);
  assert.strictEqual(L.clockFace(0).label, '3:00');
  assert.strictEqual(L.clockFace(19.2).label, '2:41');
  assert.strictEqual(L.clockFace(185).label, '1:55'); // overtime counts its own 2:00
  assert.ok(L.clockFace(185).overtime);
});
test('resync from the clock', () => {
  near(L.elapsedFromClock(161, false), 19.5); // 180 - 160.5
  near(L.elapsedFromClock(115, true), 185.5); // 300 - 114.5
  assert.strictEqual(L.clockFace(L.elapsedFromClock(161, false)).label, '2:41');
});

// ---------- cards ----------
test('card list has unique names and sane costs', () => {
  const names = CARDS.map((c) => c.name);
  assert.strictEqual(new Set(names).size, names.length);
  for (const c of CARDS) assert.ok(c.cost === null || (c.cost >= 1 && c.cost <= 9), c.name);
});

// ---------- demo ----------
test('demo match: never overspends, and the tracker matches the true hand', () => {
  for (const seed of [1, 7, 42, 99]) {
    const d = L.demoMatch(seed);
    assert.ok(d.events.length > 20, 'plays ' + d.events.length);
    assert.strictEqual(L.elixirAt(d.events, 180).negative.length, 0);
    // Once all 8 cards are seen (and so 4+ plays made), the tracked hand is exact.
    for (let k = 1; k <= d.events.length; k++) {
      const evs = d.events.slice(0, k), c = L.cycleState(evs);
      assert.strictEqual(c.conflicts.length, 0);
      const truth = L.truthAt(d.truth, evs[k - 1].t);
      assert.deepStrictEqual(c.queue.filter(Boolean), truth.queue.slice(4 - c.queue.filter(Boolean).length));
      if (c.deckComplete) assert.deepStrictEqual(c.hand.slice().sort(), truth.hand.slice().sort());
    }
  }
});

// ---------- voice ----------
const NAMES = CARDS.map((c) => c.name);
test('voice: numbers become elixir spent', () => {
  assert.deepStrictEqual(L.parseVoice('four', NAMES), [{ type: 'spend', cost: 4 }]);
  assert.deepStrictEqual(L.parseVoice('3', NAMES), [{ type: 'spend', cost: 3 }]);
  assert.deepStrictEqual(L.parseVoice('two then five', NAMES), [{ type: 'spend', cost: 2 }, { type: 'spend', cost: 5 }]);
  assert.deepStrictEqual(L.parseVoice('eleven', NAMES), []);
});
test('voice: card names and slang become plays', () => {
  assert.deepStrictEqual(L.parseVoice('Hog Rider', NAMES), [{ type: 'card', name: 'Hog Rider' }]);
  assert.deepStrictEqual(L.parseVoice('hog', NAMES), [{ type: 'card', name: 'Hog Rider' }]);
  assert.deepStrictEqual(L.parseVoice('mini pekka', NAMES), [{ type: 'card', name: 'Mini P.E.K.K.A' }]);
  assert.deepStrictEqual(L.parseVoice('three musketeers', NAMES), [{ type: 'card', name: 'Three Musketeers' }]);
  assert.deepStrictEqual(L.parseVoice('log and fireball', NAMES), [{ type: 'card', name: 'The Log' }, { type: 'card', name: 'Fireball' }]);
});
test('voice: undo', () => {
  assert.deepStrictEqual(L.parseVoice('undo', NAMES), [{ type: 'undo' }]);
});
test('a spend costs elixir but does not cycle', () => {
  const ev = [{ type: 'spend', t: 14, cost: 4 }];
  near(L.elixirAt(ev, 14).elixir, 6);
  assert.strictEqual(L.cycleState(ev).plays, 0);
});

test('voice: a number said with a card is its cost, not a second spend', () => {
  assert.deepStrictEqual(L.parseVoice('hog four', NAMES), [{ type: 'card', name: 'Hog Rider' }]);
  assert.deepStrictEqual(L.parseVoice('fireball 4', NAMES), [{ type: 'card', name: 'Fireball' }]);
});
test('voice: "to" and "for" are only numbers when nothing else was said', () => {
  assert.deepStrictEqual(L.parseVoice('go to the log', NAMES), [{ type: 'card', name: 'The Log' }]);
  assert.deepStrictEqual(L.parseVoice('for', NAMES), [{ type: 'spend', cost: 4 }]);
  assert.deepStrictEqual(L.parseVoice('wait for it', NAMES), []);
});
test('adjust and set stay between 0 and 10', () => {
  near(L.elixirAt([{ type: 'adjust', t: 0, delta: -9 }], 0).elixir, 0);
  near(L.elixirAt([{ type: 'set', t: 0, value: 14 }], 0).elixir, 10);
});
test('Mirror shows what it really cost', () => {
  assert.deepStrictEqual(L.resolvedCosts([play(1, 'Mirror', null), play(5, 'Hog Rider', 4), play(9, 'Mirror', null)]), [null, 4, 5]);
});
test('a ninth different card is flagged', () => {
  const names = CARDS.slice(10, 19).map((c) => c.name);
  assert.strictEqual(L.cycleState(names.map((n, i) => play(i * 5, n, 1))).tooMany, true);
  assert.strictEqual(L.cycleState(names.slice(0, 8).map((n, i) => play(i * 5, n, 1))).tooMany, false);
});
test('cards confirmed from the battle logs', () => {
  const cost = Object.fromEntries(CARDS.map((c) => [c.name, c.cost]));
  assert.deepStrictEqual([cost['Goblin Hut'], cost['Vines'], cost['Ronin'], cost['Minion Giant'], cost['Spirit Empress']], [4, 3, 5, 4, 6]);
});

console.log(`\n${passed} passed`);
