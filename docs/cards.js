// Card names and elixir costs. Written from memory in mid 2026, then checked on
// 28 Nov 2026 against the elixirCost the official API reports in ~200 CrlScout
// battle-log files (every card here except Mirror appeared there). Event-only
// cards (Super ..., Party ..., Terry) are left out. Costs change with balance
// updates, so the page lets you change any cost or add a card (saved on your
// device). `check: true` marks a cost that is still unconfirmed.
// Mirror has no fixed cost: it costs one more than the card it copies.
const CARDS = [
  ['Skeletons', 1], ['Ice Spirit', 1], ['Fire Spirit', 1], ['Electro Spirit', 1], ['Heal Spirit', 1],
  ['Mirror', null],
  ['Zap', 2], ['The Log', 2], ['Giant Snowball', 2], ['Barbarian Barrel', 2], ['Rage', 2],
  ['Goblin Curse', 2],
  ['Bats', 2], ['Goblins', 2], ['Spear Goblins', 2], ['Ice Golem', 2], ['Wall Breakers', 2],
  ['Bomber', 2], ['Suspicious Bush', 2], ['Berserker', 2],
  ['Arrows', 3], ['Tornado', 3], ['Earthquake', 3], ['Goblin Barrel', 3], ['Royal Delivery', 3],
  ['Clone', 3], ['Void', 3], ['Vines', 3],
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
  ['Phoenix', 4], ['Goblin Demolisher', 4], ['Rune Giant', 4], ['Minion Giant', 4],
  ['Tesla', 4], ['Mortar', 4], ['Bomb Tower', 4], ['Goblin Cage', 4], ['Furnace', 4],
  ['Goblin Drill', 4], ['Goblin Hut', 4],
  ['Graveyard', 5],
  ['Barbarians', 5], ['Minion Horde', 5], ['Rascals', 5], ['Prince', 5], ['Witch', 5],
  ['Wizard', 5], ['Executioner', 5], ['Balloon', 5], ['Bowler', 5], ['Giant', 5],
  ['Royal Hogs', 5], ['Ram Rider', 5], ['Electro Dragon', 5], ['Cannon Cart', 5],
  ['Archer Queen', 5], ['Monk', 5], ['Goblinstein', 5], ['Goblin Machine', 5],
  ['Inferno Tower', 5], ['Ronin', 5],
  ['Lightning', 6], ['Rocket', 6],
  ['Royal Giant', 6], ['Elite Barbarians', 6], ['Giant Skeleton', 6], ['Sparky', 6],
  ['Goblin Giant', 6], ['Boss Bandit', 6], ['Spirit Empress', 6],
  ['Barbarian Hut', 6], ['Elixir Collector', 6], ['X-Bow', 6],
  ['P.E.K.K.A', 7], ['Mega Knight', 7], ['Lava Hound', 7], ['Electro Giant', 7], ['Royal Recruits', 7],
  ['Golem', 8],
  ['Three Musketeers', 9],
].map(([name, cost, check]) => ({ name, cost, check: !!check }));

if (typeof module !== 'undefined') module.exports = CARDS;
else window.CARDS = CARDS;
