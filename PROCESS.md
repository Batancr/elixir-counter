# Elixir Counter: work log

Read this before changing the project. Newest first.

## How this repo works
- One repo. `docs/` is the site, readable code, no build step. GitHub Pages (when on) serves `main` / `docs`.
- `docs/logic.js` is pure maths (no DOM), tested by `tests/logic.test.js` in Node.
- `docs/app.js` wires the page; `tests/browser/page.spec.js` drives it in Chromium (Playwright).
- Run both test suites before every push.

## 28 Nov 2026: polish pass (Claude Code)
Brought it up to the standard of the other sites. Fixed:
- Undo removed the latest event by time, not your last action: in Replay that could be a detector play that came straight back, and a removed log row could not be brought back. Now a real one-step-back history (taps, removed rows, syncs, nudges, restarts).
- Voice: "hog four" logged Hog Rider and then took 4 more elixir; "go to the log" also took 2 ("to" = two). A number said with a card is now ignored, and sound-alikes (to, for, won, ate) count only when the whole phrase is numbers.
- Replay: number keys and the card picker used the whole log rather than what is visible at the scrubbed time.
- Tapping Live/Replay/Demo mid-match wiped the match with no warning: now needs a second tap.
- A reload or a locked phone lost the match: the live match is saved as you go and restored; the screen is kept on (Wake Lock) until the match ends.
- The clock ran on forever after overtime: it stops at the end and shows End.
- −1 or Set could push elixir below 0 or above 10. Settings closed with Esc lost the changes; 0 s per elixir divided by zero. Now saved on close and clamped.
- Mirror showed "+1" in the log instead of what it actually cost.
- Card costs checked against the official API costs in ~200 CrlScout battle-log files: Goblin Hut was 5 (it is 4); added Vines (3), Ronin (5), Minion Giant (4), Spirit Empress (6); every `check` card confirmed.
- Phones: the deck (what you tap) now comes before hand/queue; long names no longer break mid-word.
- Added: offline support and home-screen install (manifest, icon, network-first service worker), a warning for a 9th different card, keyboard removal of log rows, removable cost changes in Settings, browser tests.

## 15–16 Oct 2026: first version
Counter, Replay mode, demo, voice, and the Python detector. See RESEARCH.md for the terms-of-service notes and why live play has no screen reading.
