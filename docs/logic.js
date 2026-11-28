// Clash tracker logic. Pure functions only (no DOM), so Node tests can run them.
//
// The whole match is an event log: every tap the user makes is one event with the
// match time it happened at. Elixir and cycle are worked out from that log each
// time they are shown, so undo is just "drop the last event".

// Game numbers. These are my best knowledge as of mid 2026 and can change with
// balance updates, so they live in one place and the page lets you edit them.
//   secPerElixir 2.8 : ClashRoyaleAi measured 2.80 s on a real recording.
//   startElixir 5, cap 10 : common knowledge, not measured here.
//   2x elixir in the last minute of regular time, overtime 2x then 3x in its
//   final minute : matches ClashRoyaleAi's ladder schedule; overtime length varies
//   by mode, so check it.
const DEFAULTS = {
  startElixir: 5,
  maxElixir: 10,
  secPerElixir: 2.8,
  regularS: 180,
  doubleAtS: 120,
  overtimeS: 120,
  tripleLastS: 60,
};

const HAND = 4, DECK = 8, QUEUE = DECK - HAND;

// Elixir multiplier at `s` seconds after the match clock started.
function multiplierAt(s, cfg = DEFAULTS) {
  if (s < cfg.doubleAtS) return 1;
  if (s < cfg.regularS) return 2;
  if (s < cfg.regularS + cfg.overtimeS - cfg.tripleLastS) return 2;
  return 3;
}

// Times where the multiplier can change, in order.
function breakpoints(cfg = DEFAULTS) {
  return [cfg.doubleAtS, cfg.regularS, cfg.regularS + cfg.overtimeS - cfg.tripleLastS];
}

// Elixir regenerated between t0 and t1 (no cap), integrating across phase changes.
function regenBetween(t0, t1, cfg = DEFAULTS) {
  if (t1 <= t0) return 0;
  let total = 0, a = t0;
  for (const b of breakpoints(cfg).concat(Infinity)) {
    if (b <= a) continue;
    const end = Math.min(b, t1);
    total += (end - a) * multiplierAt(a, cfg) / cfg.secPerElixir;
    a = end;
    if (a >= t1) break;
  }
  return total;
}

// What an event costs the opponent. Mirror costs one more than the card it copies.
function eventCost(ev, prevPlay) {
  if (ev.type === 'play' && ev.card === 'Mirror') return prevPlay ? prevPlay.cost + 1 : null;
  if (ev.type === 'play' || ev.type === 'ability' || ev.type === 'spend') return ev.cost;
  return 0;
}

// Opponent elixir at time t, replaying every event up to t.
// Returns the estimate plus two honesty signals:
//   leaked   : elixir they wasted sitting at the cap
//   negative : times the estimate went below zero, which means a play was logged
//              too early, a cost is wrong, or the start time is off.
function elixirAt(events, t, cfg = DEFAULTS) {
  let value = cfg.startElixir, at = 0, leaked = 0, prevPlay = null;
  const negative = [];
  const advance = (to) => {
    const gain = regenBetween(at, to, cfg);
    const room = cfg.maxElixir - value;
    if (gain > room) { leaked += gain - Math.max(room, 0); value = Math.max(value, cfg.maxElixir); }
    else value += gain;
    at = to;
  };
  for (const ev of events) {
    if (ev.t > t) break;
    advance(Math.max(ev.t, at));
    if (ev.type === 'set') { value = Math.max(0, Math.min(cfg.maxElixir, ev.value)); continue; }
    if (ev.type === 'adjust') { value = Math.max(0, Math.min(cfg.maxElixir, value + ev.delta)); continue; }
    const cost = eventCost(ev, prevPlay);
    if (ev.type === 'play') prevPlay = { ...ev, cost: cost == null ? 0 : cost };
    if (cost == null) continue;
    value -= cost;
    if (value < -0.15) negative.push({ t: ev.t, value });
    if (value < 0) value = 0;
  }
  advance(Math.max(t, at));
  return { elixir: value, leaked, negative };
}

// What each event actually cost, in log order (Mirror resolved from the play
// before it). null when unknown, e.g. a Mirror logged before any other play.
function resolvedCosts(events) {
  let prevPlay = null;
  return events.map((ev) => {
    const cost = eventCost(ev, prevPlay);
    if (ev.type === 'play') prevPlay = { ...ev, cost: cost == null ? 0 : cost };
    return cost;
  });
}

// Seconds until the opponent reaches `target` elixir from `current`, at time t.
function secondsUntil(current, target, t, cfg = DEFAULTS) {
  if (current >= target) return 0;
  let need = target - current, s = 0, now = t;
  for (const b of breakpoints(cfg).concat(Infinity)) {
    if (b <= now) continue;
    const rate = multiplierAt(now, cfg) / cfg.secPerElixir;
    const span = b - now;
    if (span * rate >= need) return s + need / rate;
    need -= span * rate; s += span; now = b;
  }
  return s;
}

// Card cycle from the plays alone.
// Clash Royale deals from a queue: the card you play goes to the back, and the
// front card fills the empty hand slot. So once someone has made 4 plays:
//   queue = their last 4 plays, oldest first (oldest comes back next)
//   hand  = the other 4 cards of their deck
// Before 4 plays the front of the queue is cards we have never seen.
function cycleState(events) {
  const plays = events.filter((e) => e.type === 'play');
  const deck = [];
  for (const p of plays) if (!deck.includes(p.card)) deck.push(p.card);

  const recent = plays.slice(-QUEUE).map((p) => p.card);
  const queue = Array(QUEUE - recent.length).fill(null).concat(recent); // null = unseen
  const hand = deck.filter((c) => !recent.includes(c));
  const unknownInHand = HAND - hand.length;

  // A card played while it should still be waiting in the queue means a play was
  // missed or mis-tapped. Flag it instead of guessing which.
  const conflicts = [];
  for (let i = 1; i < plays.length; i++) {
    const before = plays.slice(Math.max(0, i - QUEUE), i).map((p) => p.card);
    if (before.includes(plays[i].card)) conflicts.push({ index: i, card: plays[i].card, t: plays[i].t });
  }

  return {
    deck,                       // cards seen so far, in the order they appeared
    deckComplete: deck.length >= DECK,
    tooMany: deck.length > DECK,  // more than 8 different cards: one was logged by mistake
    hand,                       // cards we know are in their hand right now
    unknownInHand: Math.max(0, unknownInHand),
    queue,                      // oldest first; queue[0] is the next card into their hand
    next: queue[0],
    plays: plays.length,
    conflicts,
  };
}

// For each card in the queue, how many more plays until it is back in hand.
function playsUntilBack(queue) {
  return queue.map((card, i) => ({ card, plays: i + 1 }));
}

// "2:41" or "0:05" -> seconds remaining. Overtime clocks read the same way.
function parseClock(text) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text || '');
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s >= 0 && Number(m[2]) < 60 ? s : null;
}

// Elapsed match seconds -> what the in-game clock shows, and the phase.
function clockFace(elapsed, cfg = DEFAULTS) {
  const overtime = elapsed >= cfg.regularS;
  const left = overtime ? cfg.regularS + cfg.overtimeS - elapsed : cfg.regularS - elapsed;
  const shown = Math.max(0, Math.ceil(left - 1e-9));
  const label = Math.floor(shown / 60) + ':' + String(shown % 60).padStart(2, '0');
  return { label, overtime, multiplier: multiplierAt(elapsed, cfg), ended: left <= 0 && overtime };
}

// Reading the game clock as "m:ss" -> elapsed seconds, so the user can resync.
function elapsedFromClock(remaining, overtime, cfg = DEFAULTS) {
  // The clock shows whole seconds counting down. I assume it rounds up like
  // clockFace does (3:00 stays up for the first second), so "2:41" means between
  // 160 and 161 s left; take the middle. Unverified: if the game rounds down this
  // is 1 s off, which the ½s nudge buttons can correct.
  const left = Math.max(0, remaining - 0.5);
  return overtime ? cfg.regularS + cfg.overtimeS - left : cfg.regularS - left;
}


// ---------- demo match ----------
// A made-up opponent playing a 2.6 Hog deck, simulated with the real dealing
// rule so the demo can show the tracker's guess next to the true hidden hand.
// Seeded, so the same seed always gives the same match.
const DEMO_DECK = [
  ['Hog Rider', 4], ['Musketeer', 4], ['Ice Golem', 2], ['Skeletons', 1],
  ['Ice Spirit', 1], ['Cannon', 3], ['Fireball', 4], ['The Log', 2],
];
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function demoMatch(seed = 7, lengthS = 180, cfg = DEFAULTS) {
  const r = rng(seed);
  const cost = Object.fromEntries(DEMO_DECK);
  const order = DEMO_DECK.map((c) => c[0]);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const hand = order.slice(0, HAND), queue = order.slice(HAND);
  const events = [], truth = [{ t: 0, hand: hand.slice(), queue: queue.slice() }];
  let elixir = cfg.startElixir, last = -10, target = 6 + r() * 4;
  for (let step = 1; step <= lengthS * 10; step++) {
    const t = step / 10;
    elixir = Math.min(cfg.maxElixir, elixir + regenBetween(t - 0.1, t, cfg));
    // They wait until they have `target` elixir (or are about to leak), with a
    // gap of at least 2.5 s between plays, then play something they can afford.
    if (t - last < 2.5 || elixir < Math.min(target, cfg.maxElixir - 0.2)) continue;
    const options = hand.map((c, i) => i).filter((i) => cost[hand[i]] <= elixir);
    if (!options.length) continue;
    const i = options[Math.floor(r() * options.length)];
    const card = hand[i];
    elixir -= cost[card];
    hand[i] = queue.shift(); queue.push(card);
    events.push({ type: 'play', t, card, cost: cost[card] });
    truth.push({ t, hand: hand.slice(), queue: queue.slice() });
    last = t; target = 3 + r() * 7;
  }
  return { deck: DEMO_DECK.map((c) => c[0]), events, truth };
}
// The true hand at time t, for the demo's "actual" row.
function truthAt(truth, t) {
  let cur = truth[0];
  for (const x of truth) { if (x.t <= t + 1e-6) cur = x; else break; }
  return cur;
}

// ---------- voice ----------
// Turns what the speech recogniser heard into actions. A card name logs a play
// (so the cycle updates too); a bare number logs elixir spent with no card.
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// Words the recogniser often writes instead of a number. They only count as a
// number when the whole phrase is numbers, so "go to the log" stays one play.
const SOUND_ALIKES = { won: 1, to: 2, too: 2, for: 4, fore: 4, ate: 8 };
const ALIASES = {
  'hog': 'Hog Rider', 'log': 'The Log', 'the log': 'The Log', 'musk': 'Musketeer', 'pekka': 'P.E.K.K.A',
  'mini pekka': 'Mini P.E.K.K.A', 'mini p': 'Mini P.E.K.K.A', 'skarmy': 'Skeleton Army', 'skelly army': 'Skeleton Army',
  'skellies': 'Skeletons', 'skeleton': 'Skeletons', 'x bow': 'X-Bow', 'xbow': 'X-Bow', 'crossbow': 'X-Bow',
  'barrel': 'Goblin Barrel', 'gob barrel': 'Goblin Barrel', 'gang': 'Goblin Gang', 'gob gang': 'Goblin Gang',
  'mk': 'Mega Knight', 'e wiz': 'Electro Wizard', 'e giant': 'Electro Giant', 'e drag': 'Electro Dragon',
  'e spirit': 'Electro Spirit', 'ice spirit': 'Ice Spirit', 'snowball': 'Giant Snowball', 'barb barrel': 'Barbarian Barrel',
  'barbs': 'Barbarians', 'e barbs': 'Elite Barbarians', 'elite barbs': 'Elite Barbarians', 'horde': 'Minion Horde',
  'goblins': 'Goblins', 'spear gobs': 'Spear Goblins', 'drill': 'Goblin Drill', 'quake': 'Earthquake',
  'rg': 'Royal Giant', 'loon': 'Balloon', 'lava': 'Lava Hound', 'hound': 'Lava Hound', 'bandit': 'Bandit',
  'nado': 'Tornado', 'ram': 'Battle Ram', 'healer': 'Battle Healer', 'queen': 'Archer Queen', 'aq': 'Archer Queen',
  'gk': 'Golden Knight', 'sk': 'Skeleton King', 'recruits': 'Royal Recruits', 'hogs': 'Royal Hogs',
  'collector': 'Elixir Collector', 'pump': 'Elixir Collector', 'sparky': 'Sparky', 'zap': 'Zap', 'rocket': 'Rocket',
};
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function parseVoice(text, cardNames) {
  let rest = ' ' + norm(text) + ' ';
  const found = [];
  // Every way of saying a card, longest first so "mini pekka" beats "pekka".
  const names = new Map();
  for (const n of cardNames) names.set(norm(n), n);
  for (const [a, n] of Object.entries(ALIASES)) if (cardNames.includes(n)) names.set(a, n);
  // Plural/singular slips: "musketeers", "hog riders".
  for (const n of cardNames) names.set(norm(n) + 's', n);
  const keys = [...names.keys()].sort((a, b) => b.length - a.length);
  for (const k of keys) {
    let at;
    while ((at = rest.indexOf(' ' + k + ' ')) >= 0) {
      found.push({ at, action: { type: 'card', name: names.get(k) } });
      rest = rest.slice(0, at) + ' ' + '_'.repeat(k.length) + ' ' + rest.slice(at + k.length + 2);
    }
  }
  if (/ (undo|cancel|scratch that) /.test(rest)) found.push({ at: rest.search(/ (undo|cancel|scratch that) /), action: { type: 'undo' } });
  // A number said with a card is that card's cost ("hog four"), not a second
  // spend, so numbers only count when no card was named.
  const cardSaid = found.some((f) => f.action.type === 'card');
  const words = norm(text).split(' ');
  const allNumbers = words.every((w) => /^\d+$/.test(w) || w in NUMBER_WORDS || w in SOUND_ALIKES || w === 'and' || w === 'then');
  if (!cardSaid) {
    rest.replace(/ (\d{1,2}|[a-z]+)(?= )/g, (m, w, at) => {
      const n = /^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w] ?? (allNumbers ? SOUND_ALIKES[w] : undefined);
      if (n >= 1 && n <= 10) found.push({ at, action: { type: 'spend', cost: n } });
      return m;
    });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.action);
}

const api = { DEFAULTS, HAND, DECK, QUEUE, multiplierAt, regenBetween, elixirAt, secondsUntil,
  cycleState, resolvedCosts, playsUntilBack, parseClock, clockFace, elapsedFromClock, eventCost, demoMatch, truthAt, parseVoice };
if (typeof module !== 'undefined') module.exports = api;
else window.Logic = api;
