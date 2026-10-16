"""Turn per-frame unit detections into opponent card plays.

Pure functions, no model and no video, so it can be tested on made-up input.

The detector names *units* on the board, not cards, so three things happen here:

1. Track each enemy unit across frames, so one Hog Rider running to the tower
   is one unit, not a new one every frame.
2. Group units that appear together into one play (5 Barbarians = 1 card) and
   name the card from the unit and how many appeared.
3. Drop units that are spawned by something already on the board (Tombstone
   skeletons, Witch skeletons, Furnace fire spirits, death spawns).

Spells (Fireball, Zap, The Log, Arrows...) are not units, so the detector never
sees them. Those still need a tap in the page.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Unit name -> card name (names match docs/cards.js). Units whose card depends on
# how many appeared together are handled in `name_play`.
UNIT_TO_CARD = {
    "archer": "Archers", "archer_queen": "Archer Queen", "balloon": "Balloon", "bandit": "Bandit",
    "barbarian": "Barbarians", "barbarian_hut": "Barbarian Hut", "bat": "Bats",
    "battle_healer": "Battle Healer", "battle_ram": "Battle Ram", "bomb_tower": "Bomb Tower",
    "bomber": "Bomber", "bowler": "Bowler", "cannon": "Cannon", "cannon_cart": "Cannon Cart",
    "dark_prince": "Dark Prince", "dart_goblin": "Dart Goblin", "electro_dragon": "Electro Dragon",
    "electro_giant": "Electro Giant", "electro_spirit": "Electro Spirit", "electro_wizard": "Electro Wizard",
    "elite_barbarian": "Elite Barbarians", "elixir_collector": "Elixir Collector",
    "elixir_golem_large": "Elixir Golem", "executioner": "Executioner", "fire_spirit": "Fire Spirit",
    "firecracker": "Firecracker", "fisherman": "Fisherman", "flying_machine": "Flying Machine",
    "furnace": "Furnace", "giant": "Giant", "giant_skeleton": "Giant Skeleton",
    "giant_snowball": "Giant Snowball", "goblin": "Goblins", "goblin_cage": "Goblin Cage",
    "goblin_drill": "Goblin Drill", "goblin_hut": "Goblin Hut", "golden_knight": "Golden Knight",
    "golem": "Golem", "guard": "Guards", "heal_spirit": "Heal Spirit", "hog_rider": "Hog Rider",
    "baby_dragon": "Baby Dragon", "hunter": "Hunter", "ice_golem": "Ice Golem", "ice_spirit": "Ice Spirit",
    "ice_wizard": "Ice Wizard", "inferno_dragon": "Inferno Dragon", "inferno_tower": "Inferno Tower",
    "knight": "Knight", "lava_hound": "Lava Hound", "little_prince": "Little Prince",
    "lumberjack": "Lumberjack", "magic_archer": "Magic Archer", "mega_knight": "Mega Knight",
    "mega_minion": "Mega Minion", "mighty_miner": "Mighty Miner", "miner": "Miner", "minion": "Minions",
    "minipekka": "Mini P.E.K.K.A", "monk": "Monk", "mortar": "Mortar", "mother_witch": "Mother Witch",
    "musketeer": "Musketeer", "night_witch": "Night Witch", "pekka": "P.E.K.K.A",
    "phoenix_large": "Phoenix", "prince": "Prince", "princess": "Princess", "ram_rider": "Ram Rider",
    "rascal_boy": "Rascals", "rascal_girl": "Rascals", "royal_ghost": "Royal Ghost",
    "royal_giant": "Royal Giant", "royal_hog": "Royal Hogs", "royal_recruit": "Royal Recruits",
    "skeleton": "Skeletons", "skeleton_dragon": "Skeleton Dragons", "skeleton_king": "Skeleton King",
    "sparky": "Sparky", "spear_goblin": "Spear Goblins", "tesla": "Tesla", "tombstone": "Tombstone",
    "valkyrie": "Valkyrie", "wall_breaker": "Wall Breakers", "witch": "Witch", "wizard": "Wizard",
    "x_bow": "X-Bow", "zappy": "Zappies",
}

# Never a play on their own: death spawns, stages, and side units of other cards.
NEVER_A_PLAY = {
    "golemite", "lava_pup", "elixir_golem_medium", "elixir_golem_small", "phoenix_egg",
    "phoenix_small", "royal_guardian", "brawler", "hog",
}

# While one of these is alive on their side, new units of the listed kinds are
# its spawns, not new plays.
SPAWNERS = {
    "tombstone": {"skeleton"}, "witch": {"skeleton"}, "skeleton_king": {"skeleton"},
    "night_witch": {"bat"}, "goblin_hut": {"spear_goblin"}, "furnace": {"fire_spirit"},
    "barbarian_hut": {"barbarian"}, "goblin_drill": {"goblin"}, "goblin_cage": {"brawler"},
    "giant_skeleton": set(), "elixir_golem_large": {"elixir_golem_medium"},
}

# Units that arrive together as one card.
GROUPS = [
    ({"goblin", "spear_goblin"}, "Goblin Gang"),
    ({"rascal_boy", "rascal_girl"}, "Rascals"),
]


# Units that can first appear on YOUR side of the river, and the card that puts
# them there (Goblins landing at your tower came from a Goblin Barrel).
CAN_START_ON_MY_SIDE = {"miner": "Miner", "goblin_drill": "Goblin Drill", "goblin": "Goblin Barrel"}

# Where the four Princess towers sit, as fractions of the game screen. Tower
# troops (the Princess skin especially) get detected as units standing there.
TOWERS = [(0.24, 0.16), (0.76, 0.16), (0.24, 0.62), (0.76, 0.62)]


@dataclass
class Det:
    """One enemy detection in one frame. x, y are the box centre as a fraction
    of the frame width and height, so they do not depend on resolution."""
    unit: str
    x: float
    y: float
    conf: float


@dataclass
class Track:
    unit: str
    born: float
    last: float
    x: float
    y: float
    hits: int = 1
    conf: float = 0.0
    counted: bool = False
    y0: float = 0.0              # where it was first seen


@dataclass
class Settings:
    min_conf: float = 0.5        # ignore weaker detections
    min_hits: int = 3            # a unit must be seen in this many frames to count
    max_gap_s: float = 2.0       # how long a unit can vanish (behind others) and keep its track
    max_jump: float = 0.12       # how far (fraction of width) it can move between sightings
    group_s: float = 1.2         # units born this close together are one play
    repeat_s: float = 6.0        # the same card again this soon is a re-detection, not a play
    river_y: float = 0.42        # river line as a fraction of screen height; their side is above it
    edge_x: float = 0.04         # ignore things hugging the left/right edge (UI, decorations)
    tower_r: float = 0.07        # radius around a tower where "princess" is the tower troop


def plausible(d: Det, s: Settings) -> bool:
    """Cheap filters for the false hits seen on real footage."""
    if d.x < s.edge_x or d.x > 1 - s.edge_x:
        return False
    if d.unit == "princess" and any(((d.x - tx) ** 2 + (d.y - ty) ** 2) ** 0.5 < s.tower_r for tx, ty in TOWERS):
        return False
    return True


def track_units(frames: list[tuple[float, list[Det]]], s: Settings = Settings()):
    """frames: [(t, [Det...]), ...] in time order. Returns confirmed new units as
    [(born_t, unit, conf)], skipping spawns of units already on the board."""
    tracks: list[Track] = []
    births = []
    for t, dets in frames:
        alive = [k for k in tracks if t - k.last <= s.max_gap_s]
        tracks = alive
        used = set()
        for d in sorted((d for d in dets if d.conf >= s.min_conf and plausible(d, s)), key=lambda d: -d.conf):
            best, best_dist = None, s.max_jump
            for i, k in enumerate(tracks):
                if i in used or k.unit != d.unit or k.last == t:
                    continue
                dist = ((k.x - d.x) ** 2 + (k.y - d.y) ** 2) ** 0.5
                if dist <= best_dist:
                    best, best_dist = i, dist
            if best is None:
                tracks.append(Track(d.unit, t, t, d.x, d.y, 1, d.conf, y0=d.y))
                used.add(len(tracks) - 1)
            else:
                k = tracks[best]
                k.last, k.x, k.y, k.hits, k.conf = t, d.x, d.y, k.hits + 1, max(k.conf, d.conf)
                used.add(best)
        for k in tracks:
            if k.counted or k.hits < s.min_hits:
                continue
            k.counted = True
            if k.unit in NEVER_A_PLAY:
                continue
            # They can only deploy on their own half (pockets after a tower falls
            # are missed by this; spells' visuals on your side get dropped by it).
            if k.y0 > s.river_y and k.unit not in CAN_START_ON_MY_SIDE:
                continue
            # A spawn of something of theirs that was already standing there.
            if any(o.hits >= s.min_hits and k.unit in SPAWNERS.get(o.unit, ()) and o.born < k.born - 0.3
                   for o in tracks):
                continue
            unit = k.unit
            if k.y0 > s.river_y and unit == "goblin":
                unit = "goblin_barrel"  # pseudo-unit, named in name_play
            births.append((k.born, unit, k.conf))
    return sorted(births)


def name_play(units: list[str]) -> str | None:
    """Units born together -> the card they came from."""
    kinds = set(units)
    if "goblin_barrel" in kinds:
        return "Goblin Barrel"
    for need, card in GROUPS:
        if need <= kinds:
            return card
    unit = max(kinds, key=units.count)
    n = units.count(unit)
    if unit == "skeleton" and n >= 6:
        return "Skeleton Army"
    if unit == "minion" and n >= 5:
        return "Minion Horde"
    if unit == "musketeer" and n >= 2:
        return "Three Musketeers"
    return UNIT_TO_CARD.get(unit)


def group_plays(births, s: Settings = Settings()):
    """Merge units born within `group_s` of each other into single plays, then
    drop the same card detected again within `repeat_s` (a unit that vanished
    and came back, not a new card: it would still be in their queue)."""
    plays, cur = [], []
    for b in births:
        # Different kinds of unit born together are usually two different cards
        # (or a group card like Goblin Gang), so only same-family units merge.
        if cur and b[0] - cur[0][0] <= s.group_s and (
                b[1] == cur[0][1] or any({b[1], cur[0][1]} <= g for g, _ in GROUPS)):
            cur.append(b)
            continue
        if cur:
            plays.append(cur)
        cur = [b]
    if cur:
        plays.append(cur)

    out = []
    for p in plays:
        card = name_play([u for _, u, _ in p])
        if card is None:
            continue
        play = {"t": round(p[0][0], 2), "card": card, "units": len(p),
                "conf": round(min(c for _, _, c in p), 2)}
        recent = [o for o in out if o["card"] == card and play["t"] - o["t"] < s.repeat_s]
        if recent:
            continue
        out.append(play)
    return out
