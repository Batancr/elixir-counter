// Card names and elixir costs, written from memory as of mid 2026. Not copied from
// either reference repo. Costs change with balance updates and new cards keep
// arriving, so `check: true` marks the ones I am least sure of, and the page lets
// you change any cost or add a missing card (saved on your device).
// Mirror has no fixed cost: it costs one more than the card it copies.
const CARDS = [
  ['Skeletons', 1], ['Ice Spirit', 1], ['Fire Spirit', 1], ['Electro Spirit', 1], ['Heal Spirit', 1],
  ['Mirror', null],
  ['Zap', 2], ['The Log', 2], ['Giant Snowball', 2], ['Barbarian Barrel', 2], ['Rage', 2],
  ['Goblin Curse', 2, true],
  ['Bats', 2], ['Goblins', 2], ['Spear Goblins', 2], ['Ice Golem', 2], ['Wall Breakers', 2],
  ['Bomber', 2], ['Suspicious Bush', 2, true], ['Berserker', 2, true],
  ['Arrows', 3], ['Tornado', 3], ['Earthquake', 3], ['Goblin Barrel', 3], ['Royal Delivery', 3],
  ['Clone', 3], ['Void', 3, true],
  ['Knight', 3], ['Archers', 3], ['Minions', 3], ['Skeleton Army', 3], ['Goblin Gang', 3],
  ['Firecracker', 3], ['Guards', 3], ['Ice Wizard', 3], ['Princess', 3], ['Dart Goblin', 3],
  ['Mega Minion', 3], ['Miner', 3], ['Bandit', 3], ['Royal Ghost', 3], ['Fisherman', 3],
  ['Elixir Golem', 3], ['Skeleton Barrel', 3], ['Little Prince', 3],
  ['Tombstone', 3], ['Cannon', 3],
  ['Fireball', 4], ['Poison', 4], ['Freeze', 4],
  ['Valkyrie', 4], ['Musketeer', 4], ['Mini P.E.K.K.A', 4], ['Hog Rider', 4], ['Battle Ram', 4],
  ['Baby Dragon', 4], ['Dark Prince', 4], ['Flying Machine', 4], ['Zappies', 4],
  ['Skeleton Dragons', 4], ['Electro Wizard', 4], ['Hunter', 4], ['Inferno Dragon', 4],
  ['Lumberjack', 4], ['Magic Archer', 4], ['Night Witch', 4], ['Battle Healer', 4],
  ['Mother Witch', 4], ['Golden Knight', 4], ['Skeleton King', 4], ['Mighty Miner', 4],
  ['Phoenix', 4], ['Goblin Demolisher', 4, true], ['Rune Giant', 4, true],
  ['Tesla', 4], ['Mortar', 4], ['Bomb Tower', 4], ['Goblin Cage', 4], ['Furnace', 4],
  ['Goblin Drill', 4],
  ['Graveyard', 5],
  ['Barbarians', 5], ['Minion Horde', 5], ['Rascals', 5], ['Prince', 5], ['Witch', 5],
  ['Wizard', 5], ['Executioner', 5], ['Balloon', 5], ['Bowler', 5], ['Giant', 5],
  ['Royal Hogs', 5], ['Ram Rider', 5], ['Electro Dragon', 5], ['Cannon Cart', 5],
  ['Archer Queen', 5], ['Monk', 5], ['Goblinstein', 5, true], ['Goblin Machine', 5, true],
  ['Inferno Tower', 5], ['Goblin Hut', 5],
  ['Lightning', 6], ['Rocket', 6],
  ['Royal Giant', 6], ['Elite Barbarians', 6], ['Giant Skeleton', 6], ['Sparky', 6],
  ['Goblin Giant', 6], ['Boss Bandit', 6, true],
  ['Barbarian Hut', 6, true], ['Elixir Collector', 6], ['X-Bow', 6],
  ['P.E.K.K.A', 7], ['Mega Knight', 7], ['Lava Hound', 7], ['Electro Giant', 7], ['Royal Recruits', 7],
  ['Golem', 8],
  ['Three Musketeers', 9],
].map(([name, cost, check]) => ({ name, cost, check: !!check }));

if (typeof module !== 'undefined') module.exports = CARDS;
else window.CARDS = CARDS;
