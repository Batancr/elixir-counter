// Clash tracker page. All the maths is in logic.js; this file wires taps to the event log.
(function () {
  const L = window.Logic;
  const $ = (id) => document.getElementById(id);

  // ---------- saved settings (this device only) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ct.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ct.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  let cfg = { ...L.DEFAULTS, ...store.get('cfg', {}) };
  let costOverrides = store.get('costs', {});

  function cardList() {
    const list = window.CARDS.map((c) => ({ ...c }));
    for (const [name, cost] of Object.entries(costOverrides)) {
      const hit = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (hit) { hit.cost = cost; hit.check = false; } else list.push({ name, cost, check: false });
    }
    return list.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0) || a.name.localeCompare(b.name));
  }
  const costOf = (name) => { const c = cardList().find((x) => x.name === name); return c ? c.cost : null; };

  // ---------- match state ----------
  let mode = 'live';
  let events = [];
  let startMs = null;        // live: performance.now() at match start
  let videoStart = null;     // replay: video time at match start
  let autoDets = [];         // replay: plays found by detector/detect.py, in video time
  const video = $('video');

  // Undo goes back one step of whatever you did (a tap, a removed row, a sync),
  // not just "the last event by time", which in Replay can be a detector play.
  let history = [];
  function snapshot() {
    history.push({ events: events.map((e) => ({ ...e })), off: autoDets.filter((d) => d.off).map((d) => d.id), startMs, videoStart });
    if (history.length > 200) history.shift();
  }
  function undo() {
    const h = history.pop();
    if (!h) { status('Nothing to undo'); return; }
    events = h.events; startMs = h.startMs; videoStart = h.videoStart;
    for (const d of autoDets) d.off = h.off.includes(d.id);
    if (mode === 'replay') syncAuto();
    saveMatch(); status('Undone'); render();
  }

  // A live match is saved as you go, so a reload or a closed tab mid-match
  // picks up where it was. The start is kept as a wall-clock time.
  const MATCH_KEY = 'match';
  function saveMatch() {
    if (mode !== 'live') return;
    if (startMs == null) { store.set(MATCH_KEY, null); return; }
    store.set(MATCH_KEY, { startEpoch: Date.now() - (performance.now() - startMs), events });
  }
  function restoreMatch() {
    const m = store.get(MATCH_KEY, null);
    if (!m || !Array.isArray(m.events) || !isFinite(m.startEpoch)) return false;
    const elapsed = (Date.now() - m.startEpoch) / 1000;
    if (elapsed < 0 || elapsed > matchLength() + 120) { store.set(MATCH_KEY, null); return false; }
    startMs = performance.now() - elapsed * 1000;
    events = m.events.filter((e) => e && typeof e.t === 'number' && typeof e.type === 'string');
    status('Match restored');
    return true;
  }
  const matchLength = () => cfg.regularS + cfg.overtimeS;

  // Demo: a scripted match that plays itself on a sped-up clock.
  let demo = null, demoT = 0, demoSpeed = 4, demoPlaying = false, demoSeed = 7, lastTick = performance.now();
  function startDemo(seed) {
    demo = L.demoMatch(seed); demoT = 0; demoPlaying = true; events = demo.events.slice(); lastSig = null;
    $('demoPlay').textContent = 'Pause';
  }

  function now() {
    if (mode === 'demo') return demo ? demoT : null;
    if (mode === 'replay') return videoStart == null ? null : video.currentTime - videoStart;
    return startMs == null ? null : Math.min((performance.now() - startMs) / 1000, matchLength());
  }
  const started = () => now() != null;

  // In replay the user can scrub backwards, so only events up to "now" count.
  const visibleEvents = (t) => events.filter((e) => e.t <= t + 1e-6);

  // Detector plays sit in video time; turn them into match-time events whenever
  // the match start moves. Your own taps are kept as they are.
  function syncAuto() {
    events = events.filter((e) => !e.auto);
    if (mode === 'replay' && videoStart != null) {
      for (const d of autoDets) {
        if (d.off || d.vt < videoStart) continue;
        events.push({ type: 'play', t: d.vt - videoStart, card: d.card, cost: d.card === 'Mirror' ? null : costOf(d.card), auto: true, id: d.id });
      }
    }
    events.sort((a, b) => a.t - b.t);
    const on = autoDets.filter((d) => !d.off).length;
    $('detNote').textContent = autoDets.length ? `${on} detected plays` + (videoStart == null ? ', set the match start' : '') : '';
  }

  function log(ev) {
    const t = now();
    if (t == null) { status('Start first'); return; }
    snapshot();
    events.push({ ...ev, t: Math.max(0, t) });
    events.sort((a, b) => a.t - b.t);
    saveMatch(); render();
  }
  function playCard(name) {
    log({ type: 'play', card: name, cost: name === 'Mirror' ? null : costOf(name) });
  }
  function status(msg) { $('status').textContent = msg; }

  // ---------- rendering ----------
  const fmt = (x) => x.toFixed(1);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const costText = (name) => (name === 'Mirror' ? '+1' : (costOf(name) ?? '?'));
  function card(name, right, cls = '', tag = 'div', attrs = '') {
    return `<${tag} class="c ${cls}" ${attrs}><span class="n">${esc(name)}</span><span class="m"><span>${costText(name)}</span><span>${right}</span></span></${tag}>`;
  }
  const empty = (text, tag = 'div', attrs = '') => `<${tag} class="c empty" ${attrs}>${text}</${tag}>`;

  let lastSig = null, lastChart = 0;
  function render() {
    const t = now();
    const tt = t == null ? 0 : Math.max(0, t);
    const evs = visibleEvents(tt);

    const face = L.clockFace(tt, cfg);
    $('clock').textContent = face.ended && mode === 'live' ? 'End' : (face.overtime ? 'OT ' : '') + face.label;
    $('phase').textContent = face.multiplier + 'x';
    if (!armed.start) $('start').textContent = started() ? 'Restart' : 'Start';

    const e = L.elixirAt(evs, tt, cfg);
    $('elx').textContent = fmt(e.elixir);
    $('elxInt').textContent = Math.floor(e.elixir + 1e-9);
    $('bar').innerHTML = Array.from({ length: 10 }, (_, i) => {
      const f = Math.max(0, Math.min(1, e.elixir - i));
      return `<div class="seg10${f > 0 && f < 1 ? ' part' : ''}"><i style="width:${f * 100}%"></i></div>`;
    }).join('');
    const full = L.secondsUntil(e.elixir, cfg.maxElixir, tt, cfg);
    $('fullIn').textContent = !started() ? '–' : e.elixir >= cfg.maxElixir - 1e-6 ? 'full' : Math.ceil(full) + 's';
    $('leak').textContent = fmt(e.leaked);
    $('negWarn').textContent = e.negative.length ? `Elixir went below 0 (${e.negative.length}×): check timing or costs.` : '';

    if (started() && performance.now() - lastChart > 1000) { lastChart = performance.now(); drawChart(evs, tt); }

    // Card sections only change when the log does. Rebuilding them every tick
    // would swap a button out from under a finger mid-tap and lose the tap.
    const sig = evs.length + '|' + JSON.stringify(events) + '|' + JSON.stringify(costOverrides);
    if (sig === lastSig) return;
    lastSig = sig;
    drawChart(evs, tt);

    const c = L.cycleState(evs);
    if (mode === 'demo' && demo) {
      const tr = L.truthAt(demo.truth, tt);
      $('truth').innerHTML = tr.hand.map((n) => card(n, c.hand.includes(n) ? 'known' : '')).join('');
      const exact = c.deckComplete && c.hand.slice().sort().join() === tr.hand.slice().sort().join();
      $('truthMatch').innerHTML = exact ? '<span class="ok">tracker exact</span>' : `${c.hand.length}/4 known`;
      const lastPlay = evs.filter((e) => e.type === 'play').pop();
      $('demoNote').textContent = lastPlay ? `Last play ${L.clockFace(lastPlay.t, cfg).label}: ${lastPlay.card} (${lastPlay.cost})` : 'Example match: opponent plays are scripted';
    }
    $('seen').textContent = `${c.deck.length}/8`;
    $('hand').innerHTML = c.hand.map((n) => card(n, ''))
      .concat(Array.from({ length: c.unknownInHand }, () => empty('?'))).join('');
    $('queue').innerHTML = c.queue.map((n, i) => n
      ? card(n, i === 0 ? 'next' : '+' + (i + 1), i === 0 ? 'next' : 'wait')
      : empty('unseen')).join('');
    $('cycleWarn').textContent = [
      c.tooMany ? `${c.deck.length} different cards logged, a deck has 8: remove the wrong one from the log.` : '',
      c.conflicts.length ? `${c.conflicts.map((x) => x.card).join(', ')} came back too early: missed or double tap?` : '',
    ].filter(Boolean).join(' ');

    const inQueue = new Map(c.queue.map((n, i) => [n, i]));
    const slots = c.deck.map((n) => {
      const q = inQueue.get(n);
      return card(n, q == null ? 'hand' : q === 0 ? 'next' : '+' + (q + 1), q == null ? '' : q === 0 ? 'next' : 'wait', 'button', `data-card="${esc(n)}"`);
    });
    while (slots.length < L.DECK) slots.push(empty('+ card', 'button', 'data-new="1"'));
    $('deck').innerHTML = slots.join('');

    $('logCount').textContent = evs.length;
    const paid = new Map(L.resolvedCosts(evs).map((c, i) => [evs[i], c]));
    $('log').innerHTML = evs.slice().reverse().map((ev) => {
      const what = ev.type === 'play' ? ev.card
        : ev.type === 'ability' ? 'Ability'
        : ev.type === 'spend' ? 'Spent'
        : ev.type === 'adjust' ? 'Adjust'
        : 'Set';
      const val = ev.type === 'play' ? (paid.get(ev) ?? '?') : ev.type === 'ability' || ev.type === 'spend' ? ev.cost
        : ev.type === 'adjust' ? (ev.delta > 0 ? '+' : '') + ev.delta : '=' + ev.value;
      const ix = events.indexOf(ev);
      return `<tr data-ix="${ix}" class="${ev.auto ? 'auto' : ''}" tabindex="0" aria-label="Remove ${esc(what)} at ${L.clockFace(ev.t, cfg).label}"><td>${L.clockFace(ev.t, cfg).label}</td><td>${esc(what)}</td><td>${val}</td></tr>`;
    }).join('');
  }

  // Elixir over the match so far, sampled every half second, plays marked.
  function drawChart(evs, tt) {
    const W = 300, H = 100, span = Math.max(60, tt);
    const x = (s) => (s / span) * W, y = (v) => H - (v / 10) * H;
    const pts = [];
    for (let s = 0; s <= tt; s += 0.5) pts.push([x(s), y(L.elixirAt(evs, s, cfg).elixir)]);
    pts.push([x(tt), y(L.elixirAt(evs, tt, cfg).elixir)]);
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const grid = [0, 5, 10].map((v) => `<line class="gl" x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`).join('');
    const plays = evs.filter((e) => e.type === 'play').map((e) => `<line class="play" x1="${x(e.t)}" x2="${x(e.t)}" y1="0" y2="${H}"/>`).join('');
    $('chart').innerHTML = grid + plays
      + (pts.length > 1 ? `<polygon class="area" points="0,${H} ${line} ${x(tt)},${H}"/><polyline class="line" points="${line}"/>` : '');
    $('axisEnd').textContent = (span >= cfg.regularS ? 'OT ' : '') + L.clockFace(span, cfg).label;
  }

  // ---------- small in-page prompt (browser prompt() is blocked in some views) ----------
  function ask(title, value, cb) {
    $('askTitle').textContent = title; $('askInput').value = value || '';
    $('askForm').onsubmit = (e) => { e.preventDefault(); $('ask').close(); cb($('askInput').value); };
    $('ask').showModal(); setTimeout(() => $('askInput').select(), 30);
  }
  $('askCancel').onclick = () => $('ask').close();

  // Clearing a match takes two taps instead of a confirm() box.
  const armed = {};
  function twoTap(btn, label, fn) {
    if (!events.length || armed[btn.id]) { clearTimeout(armed[btn.id]); armed[btn.id] = 0; btn.textContent = label; fn(); return; }
    btn.textContent = 'Confirm?';
    armed[btn.id] = setTimeout(() => { armed[btn.id] = 0; btn.textContent = label; render(); }, 2500);
  }

  // ---------- picker ----------
  function openPicker() {
    if (!started()) { status('Start first'); return; }
    $('search').value = '';
    fillPicker('');
    $('picker').showModal();
    setTimeout(() => $('search').focus(), 30);
  }
  function fillPicker(q) {
    const seen = new Set(L.cycleState(visibleEvents(now() ?? 0)).deck);
    const items = cardList().filter((c) => !seen.has(c.name) && c.name.toLowerCase().includes(q.toLowerCase()));
    $('pickList').innerHTML = items.map((c) =>
      `<button data-pick="${esc(c.name)}"><span>${esc(c.name)}</span><span class="q">${c.cost ?? '+1'}${c.check ? '?' : ''}</span></button>`).join('')
      || '<span class="muted">No match. Add it in Settings.</span>';
  }
  $('search').addEventListener('input', (e) => fillPicker(e.target.value));
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const b = $('pickList').querySelector('button'); if (b) b.click(); }
  });
  $('pickList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    $('picker').close(); playCard(b.dataset.pick);
  });
  $('closePicker').onclick = () => $('picker').close();

  // ---------- controls ----------
  $('deck').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || mode === 'demo') return;
    if (b.dataset.new) openPicker(); else playCard(b.dataset.card);
  });
  $('start').onclick = () => twoTap($('start'), 'Restart', () => {
    snapshot(); events = [];
    if (mode === 'replay') { videoStart = video.src ? video.currentTime : null; status(video.src ? '' : 'Load a video'); syncAuto(); }
    else { startMs = performance.now(); status(''); }
    saveMatch(); render();
  });
  $('reset').onclick = () => twoTap($('reset'), 'Reset', () => {
    snapshot(); events = []; startMs = null; videoStart = null; status(''); saveMatch(); render();
  });
  $('undo').onclick = undo;
  $('minus1').onclick = () => log({ type: 'adjust', delta: -1 });
  $('plus1').onclick = () => log({ type: 'adjust', delta: 1 });
  $('setElx').onclick = () => ask('Set opp. elixir', '10', (s) => {
    const v = parseFloat(s);
    if (!isNaN(v)) log({ type: 'set', value: Math.max(0, Math.min(10, v)) });
  });
  $('ability').onclick = () => ask('Ability cost', '1', (s) => {
    const v = parseFloat(s);
    if (!isNaN(v)) log({ type: 'ability', cost: v });
  });
  $('sync').onclick = () => ask('Game clock (m:ss, add "ot" in overtime)', '', (text) => {
    if (!text) return;
    const ot = /ot/i.test(text);
    const rem = L.parseClock(text.replace(/ot/i, ''));
    if (rem == null) { status('Use m:ss'); return; }
    const elapsed = L.elapsedFromClock(rem, ot, cfg);
    snapshot();
    if (mode === 'replay') { videoStart = video.currentTime - elapsed; syncAuto(); }
    else startMs = performance.now() - elapsed * 1000;
    status('Synced'); saveMatch(); render();
  });
  const nudge = (s) => {
    if (mode === 'replay' && videoStart != null) { snapshot(); videoStart += s; syncAuto(); }
    else if (startMs != null) { snapshot(); startMs += s * 1000; saveMatch(); }
    render();
  };
  $('nudgeBack').onclick = () => nudge(-0.5);
  $('nudgeFwd').onclick = () => nudge(0.5);

  // ---------- voice ----------
  // Say a cost ("four") or a card ("hog rider") while the clock runs. Uses the
  // browser's speech recognition; in Chrome the audio is sent to Google to be
  // turned into text. The page never hears the game, only your mic.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function setListening(on) {
    listening = on; $('voice').setAttribute('aria-pressed', on);
  }
  function applyVoice(text) {
    const actions = L.parseVoice(text, cardList().map((c) => c.name));
    if (!actions.length) { status(`Heard "${text.trim()}"`); return; }
    for (const a of actions) {
      if (a.type === 'card') playCard(a.name);
      else if (a.type === 'spend') log({ type: 'spend', cost: a.cost });
      else if (a.type === 'undo') undo();
    }
    status(`Heard "${text.trim()}"`);
  }
  $('voice').onclick = () => {
    if (listening) { setListening(false); try { rec && rec.stop(); } catch (e) { /* already stopped */ } status('Voice off'); return; }
    if (!SR) { status('Voice needs Chrome or Safari'); return; }
    if (!started()) { status('Start first'); return; }
    rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) applyVoice(e.results[i][0].transcript);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setListening(false); status('Mic blocked here. Open the page from its own web address.');
      }
    };
    // Chrome stops listening after a pause; keep it going until switched off.
    rec.onend = () => { if (listening) { try { rec.start(); } catch (e) { setListening(false); } } };
    try { rec.start(); setListening(true); status('Listening'); } catch (e) { status('Could not start the mic'); }
  };

  // ---------- modes ----------
  function setMode(m) {
    if (m === mode) return;
    if (listening) $('voice').click();
    if (mode === 'live') store.set(MATCH_KEY, null);
    mode = m; history = [];
    $('modeLive').setAttribute('aria-pressed', m === 'live');
    $('modeReplay').setAttribute('aria-pressed', m === 'replay');
    $('modeDemo').setAttribute('aria-pressed', m === 'demo');
    $('replayBox').hidden = m !== 'replay';
    $('demoBox').hidden = m !== 'demo';
    $('truthBox').hidden = m !== 'demo';
    $('tools').hidden = m === 'demo';
    events = []; startMs = null; videoStart = null; demo = null; autoDets = []; status(''); lastSig = null;
    $('detNote').textContent = '';
    if (m === 'demo') startDemo(demoSeed);
    render();
  }
  // Switching mode clears the match, so with plays logged it takes a second tap.
  const leaveTo = (id, m, label) => () => { if (m === mode) return; if (mode === 'demo') { setMode(m); return; } twoTap($(id), label, () => setMode(m)); };
  $('modeDemo').onclick = leaveTo('modeDemo', 'demo', 'Demo');
  $('demoPlay').onclick = () => {
    if (demoT >= 180) { startDemo(demoSeed); render(); return; }
    demoPlaying = !demoPlaying; $('demoPlay').textContent = demoPlaying ? 'Pause' : 'Play';
  };
  $('demoNew').onclick = () => { demoSeed = Math.floor(Math.random() * 1e6); startDemo(demoSeed); render(); };
  $('demoSpeed').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    demoSpeed = Number(b.dataset.s);
    for (const x of $('demoSpeed').children) x.setAttribute('aria-pressed', x === b);
  });
  $('modeLive').onclick = leaveTo('modeLive', 'live', 'Live');
  $('modeReplay').onclick = leaveTo('modeReplay', 'replay', 'Replay');
  $('videoFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (video.src.startsWith('blob:')) URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(f); status('Pause on the frame the clock starts, then Set match start');
  };
  $('detFile').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => {
      try {
        const data = JSON.parse(txt);
        autoDets = (data.plays || []).map((p, i) => ({ id: i, vt: Number(p.vt), card: String(p.card), off: false }))
          .filter((p) => isFinite(p.vt) && p.card);
        syncAuto(); render();
        if (!autoDets.length) status('No plays in that file');
      } catch (err) { status('Not a detections file'); }
    });
  };
  function removeRow(row) {
    if (!row || mode === 'demo') return;
    const ev = events[Number(row.dataset.ix)]; if (!ev) return;
    snapshot();
    if (ev.auto) { const d = autoDets.find((x) => x.id === ev.id); if (d) d.off = true; syncAuto(); }
    else events.splice(events.indexOf(ev), 1);
    status(`Removed ${ev.card || ev.type} · Undo brings it back`);
    saveMatch(); render();
  }
  $('log').addEventListener('click', (e) => removeRow(e.target.closest('tr[data-ix]')));
  $('log').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeRow(e.target.closest('tr[data-ix]')); }
  });
  $('markStart').onclick = () => {
    if (!video.src) { status('Load a video'); return; }
    snapshot(); videoStart = video.currentTime; status('Start set'); syncAuto(); render();
  };

  // ---------- settings ----------
  function fillSettings() {
    $('cfgSec').value = cfg.secPerElixir; $('cfgStart').value = cfg.startElixir; $('cfgOT').value = cfg.overtimeS;
    markType();
    $('cardNames').innerHTML = cardList().map((c) => `<option value="${esc(c.name)}">`).join('');
    const mine = Object.entries(costOverrides);
    $('costList').innerHTML = mine.map(([n, c]) =>
      `<span class="override"><span>${esc(n)}</span><span class="num">${c}</span><button data-unset="${esc(n)}" aria-label="Remove ${esc(n)} change">×</button></span>`).join('');
  }
  $('costList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unset]'); if (!b) return;
    delete costOverrides[b.dataset.unset]; store.set('costs', costOverrides); fillSettings(); lastSig = null; render();
  });
  // 2v2 makes elixir about 30% slower (3.6 s, 1.8 s, 1.2 s). Same phases.
  function markType() {
    for (const b of $('cfgType').children) b.setAttribute('aria-pressed', Math.abs(Number(b.dataset.sec) - parseFloat($('cfgSec').value)) < 1e-6);
  }
  $('cfgType').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]'); if (!b) return;
    $('cfgSec').value = b.dataset.sec; markType();
  });
  $('cfgSec').addEventListener('input', markType);
  $('openSettings').onclick = () => { fillSettings(); $('settings').showModal(); };
  // Numbers outside these ranges would break the maths (a 0 s regen divides by zero).
  const clampNum = (id, d, lo, hi) => { const v = parseFloat($(id).value); return isNaN(v) ? d : Math.max(lo, Math.min(hi, v)); };
  $('settings').addEventListener('close', () => {
    cfg = { ...cfg, secPerElixir: clampNum('cfgSec', cfg.secPerElixir, 0.5, 10), startElixir: clampNum('cfgStart', cfg.startElixir, 0, 10), overtimeS: clampNum('cfgOT', cfg.overtimeS, 0, 600) };
    store.set('cfg', { secPerElixir: cfg.secPerElixir, startElixir: cfg.startElixir, overtimeS: cfg.overtimeS });
    lastSig = null; render();
  });
  $('closeSettings').onclick = () => $('settings').close();
  $('saveCost').onclick = () => {
    const name = $('costName').value.trim(); const cost = parseFloat($('costValue').value);
    if (!name || isNaN(cost) || cost < 1 || cost > 10) { $('costValue').focus(); return; }
    const known = cardList().find((c) => c.name.toLowerCase() === name.toLowerCase());
    costOverrides[known ? known.name : name] = cost; store.set('costs', costOverrides);
    $('costName').value = ''; $('costValue').value = ''; fillSettings(); render();
  };
  $('resetSettings').onclick = () => { cfg = { ...L.DEFAULTS }; costOverrides = {}; store.set('cfg', {}); store.set('costs', {}); fillSettings(); lastSig = null; render(); };

  // ---------- keep the screen on during a live match ----------
  // Phones dim and lock after ~30 s without a touch, which would hide the
  // count mid-match. Released when the match ends, is reset, or the tab hides.
  let wake = null;
  async function syncWakeLock() {
    const want = mode === 'live' && startMs != null && now() < matchLength() && document.visibilityState === 'visible';
    if (want && !wake && 'wakeLock' in navigator) {
      try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { /* not allowed here */ }
    } else if (!want && wake) { wake.release().catch(() => {}); wake = null; }
  }
  document.addEventListener('visibilitychange', syncWakeLock);

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]') || e.target.matches('input') || (e.key === ' ' && e.target.matches('button'))) return;
    if (mode === 'demo') return;
    const deck = L.cycleState(visibleEvents(now() ?? 0)).deck;
    if (/^[1-8]$/.test(e.key)) { const n = deck[Number(e.key) - 1]; n ? playCard(n) : openPicker(); }
    else if (e.key === 'n' || e.key === 'N') openPicker();
    else if (e.key === 'u' || e.key === 'U' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); undo(); }
    else if (e.key === ' ' && mode === 'live') { e.preventDefault(); $('start').click(); }
  });

  setInterval(() => {
    const t = performance.now();
    if (mode === 'demo' && demo && demoPlaying) {
      demoT = Math.min(180, demoT + (t - lastTick) / 1000 * demoSpeed);
      if (demoT >= 180) { demoPlaying = false; $('demoPlay').textContent = 'Replay'; }
    }
    lastTick = t;
    render();
  }, 100);
  setInterval(syncWakeLock, 2000);

  if (location.hash === '#demo') setMode('demo');
  else { restoreMatch(); render(); }

  // Works offline once loaded (sw.js). Not on file:// or inside previews.
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
