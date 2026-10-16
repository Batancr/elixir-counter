# Elixir Counter

A personal Clash Royale helper that tracks the opponent's elixir and card cycle from taps. No screen reading, no game access.

## Use it

Open `docs/index.html` in a browser (phone or laptop). No build step, no server.

**Live mode**
1. Tap **Start** when the match clock starts counting.
2. Tap **Sync to clock** and type what the game clock shows (for example `2:41`) to tighten the start time. The ½s buttons nudge it.
3. When the opponent plays a card, tap it. The first time, pick it from the list; after that it has its own button. Keys 1–8 work on a keyboard.
4. Read off their elixir, which cards are in their hand, and which card comes next.

**Voice**
After Start, press **Voice** and say what they play: a cost ("four") takes that much elixir off; a card name ("hog rider", "log", "skarmy") logs the card so the cycle updates too; "undo" removes the last entry. Uses the browser's speech recognition (Chrome sends the audio to Google to turn it into text). Microphones are blocked inside the claude.ai preview, so open the page from its own web address (GitHub Pages) or a local server for voice.

**Replay mode**
Load a screen recording, pause on the frame the clock starts, press **Match starts here**, then play and tap. Elixir follows the video time, so pausing and scrubbing work.

Extras: **Ability** for champion/hero abilities (costs elixir, no cycle), **−1 / +1 / Set** to correct elixir (Elixir Collector, Elixir Golem pick-ups, a leak you saw), **Undo**, and Mirror costs one more than the card before it.

Two warnings help you catch mistakes: elixir going below zero (a play logged early, a wrong cost, or the start time is off) and a card played while it should still be in their queue (a missed play or a double tap).

## Card detector (recordings only)

`detector/detect.py` finds the opponent's plays in a screen recording, after the match:

```
pip install onnxruntime opencv-python-headless numpy
python3 detector/get_models.py      # once: downloads the two models (~31 MB)
python3 detector/detect.py match.mp4 --my-cards "Hog Rider,Musketeer,Ice Golem,Skeletons,Ice Spirit,Cannon,Fireball,The Log"
```

It writes `match.plays.json`. In the page, choose Replay, load the video and the detections file, then set the match start. Detected plays show in the log marked "auto"; tap a row to remove a wrong one, and tap cards for anything it missed.

How it works: an object detector names the units on the board each frame (4 frames/s), a second small model says ally or enemy, then `detector/plays.py` tracks units across frames, groups units that arrive together into one card (5 Barbarians, Goblin Gang, Skeleton Army by count) and drops spawns, death spawns, tower troops and things first seen on your side of the river.

What it cannot see: spells (Fireball, Zap, The Log, Arrows, Rage...), because they are not units. Tap those yourself. Passing `--my-cards` matters, because the ally/enemy model is often wrong.

`--debug` saves labelled frames every 5 s; `--replan` re-runs the play finding on a saved `.plays.json` without the model.

Tests: `python3 detector/test_plays.py`

## How it works

- `docs/logic.js` is all the maths, pure functions. The match is an event log; elixir and cycle are replayed from it each time, so undo is just dropping the last event.
- Elixir: start 5, +1 every 2.8 s at 1x, 2x in the last minute, overtime 2x then 3x, cap 10. Editable in Settings because balance updates move them.
- Cycle: the card played goes to the back of a 4-card queue, so after 4 plays the queue is their last 4 plays and their hand is the other 4 cards of the deck.
- `docs/cards.js` is the card list with costs, written from memory as of mid 2026. Cards marked `check` need confirming. Cost changes and new cards can be added in Settings (saved on your device only).

## Tests

```
node tests/logic.test.js
```

## Credits and terms

The detector models (`detector/models/`) are from [ClashRoyaleBuildABot](https://github.com/Pbatch/ClashRoyaleBuildABot) by Peter Batchelor, MIT licence (copy in `detector/models/`), taken from the copy vendored in ClashRoyaleAi. The class list was read from that project's code. The pre-processing in `detect.py` re-implements theirs; the tracking and play logic is new.

Ideas (not code) from [ClashRoyaleAi](https://github.com/itzik123/ClashRoyaleAi) (MIT): the 2.8 s measured regen, queue-based cycle bookkeeping, negative-elixir as a missed-play alarm, and clock resync. See `RESEARCH.md` for the terms-of-service notes: a live screen-reading helper could break Supercell's rules; this tool deliberately does not read the screen.

Not affiliated with or endorsed by Supercell.
