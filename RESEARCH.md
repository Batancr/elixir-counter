# Elixir and cycle tracker: research notes

Written 15 Oct 2026. Covers the terms-of-service question, what the two reference repos actually do, and a plan for automatic card reading.

## 1. Could this get your account banned?

**Short answer: a live screen-reading helper used in real matches is a real ban risk. A manual counter is lower risk but not clearly allowed. Reviewing your own recordings after a match is the safe use.**

What I found (I could not open supercell.com from my environment, so this comes from search results quoting the pages; please read them yourself):

- **Terms of Service, "Use Limitations"**: players may not "use or take part (directly or indirectly) in the use of cheats, exploits, automation software, emulators, bots, hacks, mods or any unauthorized third-party software designed to modify or interfere with the Service". Search results show the same wording in the 2022-08-12, 2023-02-24 and 2024-09-01 versions. I could not confirm whether a newer version changed it. Source: [supercell.com/en/terms-of-service](https://supercell.com/en/terms-of-service/).
- **Safe and Fair Play policy**: says third-party software (hacks, mods, bots and similar) used to gain an advantage leads to a permanent ban, and that Supercell checks leaderboards and tournament entrants. Sources: [Safe and Fair Play](https://supercell.com/en/safe-and-fair-play/), [Clash Royale "Fair Play 2021" post](https://supercell.com/en/games/clashroyale/blog/news/fair-play-2021).
- Hasty-CR's own README says plainly that automating Clash Royale is against the terms and can get an account banned.

How I read it for this tool (my interpretation, not legal advice):

| Use | Risk | Why |
|---|---|---|
| Watching a recording after the match (Replay mode) | Low | Nothing runs while you play; it is like reviewing a VOD. |
| Manual tap counter on a second device during a match | Unclear, probably low | It does not touch the game, but it is "third-party software" giving an advantage, which the fair-play policy targets. I found no statement either way about manual counters. |
| Screen-reading overlay during real matches | High | Reads the game screen live to give an advantage. Running the game in an emulator is itself listed in the ToS clause. |
| Anything that taps for you | Do not | That is a bot; explicitly banned. |

So I built the counter with **no screen reading at all** for live use, and kept automatic reading as a plan for Replay mode only.

## 2. What the reference repos do

Both are MIT licensed. I read them; nothing was copied. Ideas reused are credited in comments.

### ClashRoyaleAi (itzik123)
A C++ battle simulator plus a `perception/` folder that reads a real match from screen recordings. The most useful parts for us:

- **Elixir regen measured at 2.80 s per elixir** from a real recording. That is the default in our counter.
- **Opponent cycle is pure bookkeeping** (`track/cycle.py`): the queue is the last 4 cards played, the hand is the other 4. Same rule our `cycleState()` uses.
- **Opponent elixir is derived, not read** (`track/opp_elixir.py`): start value, regen, minus costs. If it goes below zero, a play was missed. We show the same warning.
- **Match start** (`live/match_state.py`, `clock/match_clock.py`): a screen classifier says "in game", debounced over a few frames, then the clock free-runs and is corrected by reading the on-screen timer. Their measured catch: the "in game" signal fired about **10 s late** compared with the clock reaching 3:00, and their clock-digit reader only worked at one resolution (97% at 1920×1080, 37% on smaller live capture). Our "Sync to clock" button is the manual version of their resync.
- **Your own hand** is read from the card slots with high accuracy (100% on one deck after they built per-deck templates). Lessons they recorded: a selected card lifts about 11 px, unaffordable cards turn greyscale, and stock card art does not match the in-game slot crop.
- **Opponent card recognition is NOT solved there.** Their status table lists opponent placement detection as "blocked on data". The unit detector they vendor (from ClashRoyaleBuildABot, MIT) misnamed about 15% of units in their hand-labelled check, and inventing Knights from player avatars was a known bug.
- Phase timing they use: 1x for 2 minutes, 2x for the last minute, overtime at 2x then 3x in its last minute. They say these move with balance updates; so do I.

### Hasty-CR (hastylmao)
A Python simulator, PPO training and a live bot. For live play it uses a YOLO detector they trained (they report 0.959 mAP50) or the BuildABot one, on an Android emulator with a GPU. It has much less written up about elixir or match-start timing than ClashRoyaleAi. Its `research/REFERENCE_LICENSES.md` is a good example of noting licences before reusing anything.

### Takeaway
The counting maths is easy, as you said. The hard part, reading which card the **opponent** played, is not done reliably in either repo. Your own hand is much easier because the slots are in a fixed place.

## 3. Plan for automatic reading (Replay mode only)

In order of effort, each step useful on its own:

1. **Auto match start from a recording.** Detect when the elixir bar first appears and the clock reads 3:00 (template-match the digits at your phone's resolution). Lets Replay mode set the start without you pausing on the right frame.
2. **Clock resync.** Read the timer every few seconds and correct drift, as ClashRoyaleAi does.
3. **Opponent plays.** Two options:
   - Use an existing unit detector (BuildABot's ONNX model, MIT) and map units to cards. Expect wrong names and double counts; the negative-elixir and cycle-conflict warnings already in the counter are the cheap way to catch them.
   - Train a small detector on your own recordings with your phone's resolution. More work, better results.
4. Feed detected plays into the same event log, marked "auto" so you can correct them.

This would run in Python on a laptop against a video file, not in the browser.

## 4. Numbers to check against the current game

All from memory as of mid 2026 unless marked measured. Supercell changes these.

- 1 elixir per **2.8 s** at 1x (measured by ClashRoyaleAi).
- Start **5** elixir, cap **10**.
- 2x elixir in the last minute of regular time; overtime 2x, then 3x in its last minute. **Overtime length** varies by mode; the default is 2 minutes and is editable.
- Card costs in `repo/docs/cards.js`. Ones marked `check` are newer cards or ones I am least sure of: Goblin Curse, Suspicious Bush, Berserker, Void, Goblin Demolisher, Rune Giant, Goblinstein, Goblin Machine, Boss Bandit, Barbarian Hut. Some 2025–2026 cards are probably missing; add them in Settings.
- Champion and hero ability costs vary by card, so the Ability button asks each time.
- Whether the in-game clock rounds up or down affects "Sync to clock" by up to 1 s. I assumed it rounds up.

## 5. Detector: first real test (15 Oct 2026)

Ran `detector/detect.py` on the 15-second gameplay clip in Hasty-CR (`docs/assets/bot-showcase.mp4`). It is not a fair test: the opponent had already left the match (zero real plays) and the clip has Hasty-CR's own labels drawn over the game.

- Before filters: 8 false "opponent plays". The causes were the enemy Princess tower troop read as a Princess, The Log and a Fireball on my side read as Wall Breakers/Bats/Miner, a UI element at the screen edge, and my own Ice Golem classed as enemy.
- After the filters (tower troops, screen edges, nothing deployable first seen on your side, at least 3 sightings) and with `--my-cards`: 3 false plays left (Bats ×2, Spear Goblins), all near the drawn-on labels.
- Speed: about 5 checked frames per second on one CPU, so a 3-minute match at 4 frames/s takes roughly 2–3 minutes.

What this does not tell us: how many real plays it catches on a clean phone recording. That needs your recordings.
