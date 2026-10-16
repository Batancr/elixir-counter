"""Run from the repo root:  python3 detector/test_plays.py
Made-up detection sequences, so the play logic is checked without a model or video."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from plays import Det, track_units, group_plays

passed = failed = 0
def test(name, fn):
    global passed, failed
    try:
        fn(); passed += 1; print("ok   " + name)
    except AssertionError as e:
        print("FAIL " + name + "\n     " + str(e)); failed += 1

def run(frames):
    return group_plays(track_units(frames))

def walk(unit, t0, t1, x, y0, dy=0.01, fps=4):
    """A unit seen every frame from t0 to t1, walking down the screen."""
    out, t, y = [], t0, y0
    while t <= t1 + 1e-9:
        out.append((round(t, 2), Det(unit, x, y, 0.9)))
        t += 1 / fps; y += dy
    return out

def merge(*seqs):
    by_t = {}
    for seq in seqs:
        for t, d in seq:
            by_t.setdefault(t, []).append(d)
    return sorted(by_t.items())

def t_one_unit_is_one_play():
    plays = run(merge(walk("hog_rider", 10, 18, 0.3, 0.2)))
    assert [p["card"] for p in plays] == ["Hog Rider"], plays
    assert plays[0]["t"] == 10

def t_single_frame_flicker_ignored():
    plays = run([(5.0, [Det("knight", 0.5, 0.3, 0.9)])])
    assert plays == [], plays

def t_low_confidence_ignored():
    plays = run([(t / 4, [Det("pekka", 0.5, 0.3, 0.3)]) for t in range(20)])
    assert plays == [], plays

def t_five_barbarians_one_play():
    seqs = [walk("barbarian", 20, 24, 0.4 + i * 0.04, 0.25) for i in range(5)]
    plays = run(merge(*seqs))
    assert [p["card"] for p in plays] == ["Barbarians"], plays
    assert plays[0]["units"] == 5

def t_skeleton_army_vs_skeletons():
    army = run(merge(*[walk("skeleton", 30, 32, 0.3 + i * 0.03, 0.3) for i in range(12)]))
    small = run(merge(*[walk("skeleton", 30, 32, 0.3 + i * 0.05, 0.3) for i in range(3)]))
    assert [p["card"] for p in army] == ["Skeleton Army"], army
    assert [p["card"] for p in small] == ["Skeletons"], small

def t_goblin_gang():
    seqs = [walk("goblin", 40, 43, 0.3 + i * 0.05, 0.3) for i in range(3)] + \
           [walk("spear_goblin", 40.25, 43, 0.6 + i * 0.05, 0.25) for i in range(3)]
    assert [p["card"] for p in run(merge(*seqs))] == ["Goblin Gang"]

def t_tombstone_spawns_are_not_plays():
    seqs = [walk("tombstone", 50, 80, 0.5, 0.3, dy=0)] + \
           [walk("skeleton", 55 + i * 3, 57 + i * 3, 0.5, 0.33) for i in range(5)]
    assert [p["card"] for p in run(merge(*seqs))] == ["Tombstone"]

def t_golem_death_spawn_ignored():
    seqs = [walk("golem", 60, 80, 0.5, 0.2)] + [walk("golemite", 80.25, 85, 0.45, 0.4), walk("golemite", 80.25, 85, 0.55, 0.4)]
    assert [p["card"] for p in run(merge(*seqs))] == ["Golem"]

def t_unit_hidden_briefly_keeps_its_track():
    seq = walk("hog_rider", 10, 12, 0.3, 0.2) + walk("hog_rider", 13.5, 16, 0.3, 0.32)
    assert [p["card"] for p in run(merge(seq))] == ["Hog Rider"]

def t_same_card_again_later_is_two_plays():
    seq = walk("hog_rider", 10, 14, 0.3, 0.2) + walk("hog_rider", 30, 34, 0.7, 0.2)
    plays = run(merge(seq))
    assert [p["card"] for p in plays] == ["Hog Rider", "Hog Rider"], plays

def t_two_cards_at_once_stay_separate():
    seqs = [walk("giant", 70, 76, 0.3, 0.2), walk("musketeer", 70.5, 76, 0.35, 0.15)]
    assert [p["card"] for p in run(merge(*seqs))] == ["Giant", "Musketeer"]

def t_unit_first_seen_on_my_side_is_dropped():
    # e.g. The Log rolling on my side read as Wall Breakers
    assert run(merge(walk("wall_breaker", 5, 7, 0.3, 0.7))) == []

def t_miner_can_start_on_my_side():
    assert [p["card"] for p in run(merge(walk("miner", 5, 8, 0.3, 0.6, dy=0)))] == ["Miner"]

def t_goblins_landing_on_my_side_are_a_barrel():
    seqs = [walk("goblin", 9, 11, 0.7 + i * 0.03, 0.6) for i in range(3)]
    assert [p["card"] for p in run(merge(*seqs))] == ["Goblin Barrel"]

def t_princess_tower_troop_ignored():
    assert run(merge(walk("princess", 0, 20, 0.76, 0.16, dy=0))) == []

for name, fn in list(globals().items()):
    if name.startswith("t_"):
        test(name[2:].replace("_", " "), fn)
print(f"\n{passed} passed")
sys.exit(1 if failed else 0)
