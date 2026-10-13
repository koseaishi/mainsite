(() => {
  const DURATION = 30;
  const SEQUENCE = [1, 3, 5, 2, 4];
  const STORE_KEY = 'lolAimHistory';
  const MODES = { right: 'Right Click Only', q: 'Q + Left Click Only', adaptive: 'Adaptive Random' };
  const W = 800, H = 560, CX = W / 2, CY = H / 2;
  const RADIUS_OPTIONS = [60, 100, 140, 180, 220, 260];
  const SIZE_PX = [10, 20, 30, 40, 50, 60];

  function snapTo(val, opts, fallback) {
    if (typeof val !== 'number' || isNaN(val) || val <= 0) return fallback;
    return opts.reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
  }

  function distSizeToPx(s) {
    const idx = Math.min(Math.max(1, Math.round(s)), 6) - 1;
    return RADIUS_OPTIONS[idx];
  }

  function pxToDistSize(px) {
    if (typeof px !== 'number' || isNaN(px) || px <= 0) return 3;
    if (px >= 1 && px <= 6 && Number.isInteger(px)) return px;
    let best = 1, minDiff = Infinity;
    RADIUS_OPTIONS.forEach((p, idx) => {
      const diff = Math.abs(p - px);
      if (diff < minDiff) { minDiff = diff; best = idx + 1; }
    });
    return best;
  }

  function sizeToPx(s) {
    const idx = Math.min(Math.max(1, Math.round(s)), 6) - 1;
    return SIZE_PX[idx];
  }

  function pxToSize(px) {
    if (typeof px !== 'number' || isNaN(px) || px <= 0) return 3;
    if (px >= 1 && px <= 6 && Number.isInteger(px)) return px;
    let best = 1, minDiff = Infinity;
    SIZE_PX.forEach((p, idx) => {
      const diff = Math.abs(p - px);
      if (diff < minDiff) { minDiff = diff; best = idx + 1; }
    });
    return best;
  }

  const storedSize = localStorage.getItem('lolAimSize');
  let targetSizeNum = storedSize !== null ? pxToSize(+storedSize) : 3;
  let TR = sizeToPx(targetSizeNum);
  let volume = +(localStorage.getItem('lolAimVol') ?? 40) / 100;
  let forgiving = localStorage.getItem('lolAimForgiving') !== '0';
  const COLORS = { move: '#4caf6a', attack: '#d9534f', champ: '#9b6bd6' };
  const MODE_COLORS = { right: COLORS.move, q: COLORS.attack, adaptive: COLORS.champ };
  const storedRadius = localStorage.getItem('lolAimRadius');
  let distSizeNum = storedRadius !== null ? pxToDistSize(+storedRadius) : 3;
  let radius = distSizeToPx(distSizeNum);
  let qKey = localStorage.getItem('lolAimQKey') || 'a';
  let champKey = localStorage.getItem('lolAimChampKey') || 'x';

  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);

  let history = load();
  let mode = 'right';
  let state = 'idle'; // idle | countdown | running | done
  const COUNTDOWN_MS = 1000;
  let countdownStart = 0;
  let startT = 0, hits = 0, misses = 0, clicks = 0, hitTimes = [];
  let seqIdx = 0, rotation = Math.random() * Math.PI * 2;
  let task = 'move'; // move | attack | champ
  let nextSwitch = 0, audio = null;
  let qArmed = false, champOnly = false;
  let feedback = null, lastResult = null, rebindingKey = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(history)); }

  // Star positions: target n sits on a pentagon, so 1-3-5-2-4 traces a star.
  function targetPos(n, t) {
    const a = rotation + (n - 1) * (Math.PI * 2 / 5) - Math.PI / 2;
    const wob = state === 'running' ? 1 : 0;
    return {
      x: CX + Math.cos(a) * radius + Math.sin(t / 700 + n * 1.7) * 3 * wob,
      y: CY + Math.sin(a) * radius + Math.cos(t / 800 + n * 2.3) * 3 * wob
    };
  }

  function currentTask() { return mode === 'right' ? 'move' : mode === 'q' ? 'attack' : task; }
  function pickTask() {
    nextSwitch = performance.now() + (5 + Math.random() * 3) * 1000;
    if (mode === 'adaptive') task = ['move', 'attack', 'champ'][Math.floor(Math.random() * 3)];
  }

  function resetRound(keepIdle) {
    state = 'idle'; hits = misses = clicks = 0; hitTimes = []; seqIdx = 0; qArmed = false;
    rotation = Math.random() * Math.PI * 2; task = 'move'; feedback = null;
    if (!keepIdle) lastResult = null;
    updateStats(0); updateHint(); drawGraph(true);
  }

  function start() {
    if (state === 'countdown' || state === 'running') return;
    resetRound(true); lastResult = null;
    state = 'countdown'; countdownStart = performance.now(); pickTask(); updateHint();
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll('#modes [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    resetRound(false);
  }

  function register(ok, advance) {
    const now = performance.now();
    clicks++;
    if (ok) { hits++; hitTimes.push(now); } else misses++;
    if (advance) seqIdx = (seqIdx + 1) % 5;
    qArmed = false;
    feedback = { ok, until: now + 450 };
    updateHint();
  }

  function handleClick(btn, x, y) {
    if (state !== 'running') return;
    const t = performance.now();
    const need = currentTask();
    const target = SEQUENCE[seqIdx];
    const p = targetPos(target, t);
    const onTarget = Math.hypot(x - p.x, y - p.y) <= TR;
    let actionOk;
    if (need === 'move') actionOk = btn === 2 && !qArmed;
    else if (need === 'attack') actionOk = btn === 0 && qArmed;
    else actionOk = btn === 0 && qArmed && champOnly;
    // Only a correct hit advances unless forgiving mode is on; clicking the
    // target with the wrong action (e.g. no attack key) is still a miss.
    const ok = actionOk && onTarget;
    click(ok);
    register(ok, forgiving || ok);
  }

  function click(ok) {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    const f0 = ok ? 900 : 220, f1 = ok ? 300 : 110;
    o.type = ok ? 'square' : 'sawtooth'; o.frequency.setValueAtTime(f0, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, audio.currentTime + (ok ? 0.04 : 0.1));
    g.gain.setValueAtTime(Math.max(volume * 0.075, 0.0001), audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (ok ? 0.05 : 0.12));
    o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.14);
  }

  function updateStats(elapsed) {
    const e = Math.max(elapsed, 0.001);
    $('sTime').textContent = Math.max(DURATION - elapsed, 0).toFixed(1);
    $('sCps').textContent = (clicks / e).toFixed(1);
    $('sAcc').textContent = (clicks ? Math.round(hits / clicks * 100) : 0) + '%';
    $('sHits').textContent = hits;
    $('sMiss').textContent = misses;
    $('sAvg').textContent = hitTimes.length > 1
      ? ((hitTimes[hitTimes.length - 1] - hitTimes[0]) / (hitTimes.length - 1) / 1000).toFixed(2) + 's' : '–';
  }

  function updateHint() {
    const need = currentTask();
    const K = qKey.toUpperCase();
    const C = champKey.toUpperCase();
    const txt = { move: 'Right-click the highlighted target.',
      attack: `Press ${K}, then left-click the highlighted target.`,
      champ: `Champion-only: toggle ${C} ON, press ${K}, then left-click the target.` }[need];
    const prefix = state === 'running'
      ? txt
      : state === 'countdown'
        ? `Get ready! Find target 1. ${txt}`
        : 'Pick a mode (1/2/3), press Space to start, R to reset. ';
    $('hint').textContent = prefix +
      `  [${K} armed: ${qArmed ? 'yes' : 'no'} · Champion-only (${C}): ${champOnly ? 'on' : 'off'}]`;
    cv.classList.toggle('champ', champOnly);
    $('qKeyBtn').textContent = rebindingKey === 'q' ? 'Press a key…' : `Attack key: ${K}`;
    $('qKeyBtn').classList.toggle('rebinding', rebindingKey === 'q');
    if ($('champKeyBtn')) {
      $('champKeyBtn').textContent = rebindingKey === 'champ' ? 'Press a key…' : `Champ-only key: ${C}`;
      $('champKeyBtn').classList.toggle('rebinding', rebindingKey === 'champ');
    }
  }

  const METRICS = [
    { key: 'accuracy', label: 'ACCURACY', fmt: v => v.toFixed(1) + '%', dfmt: v => v.toFixed(1) + '%', better: 1, mildThresh: 5 },
    { key: 'hits', label: 'HITS', fmt: v => String(v), dfmt: v => v.toFixed(1), better: 1, mildThresh: 3 },
    { key: 'misses', label: 'MISSES', fmt: v => String(v), dfmt: v => v.toFixed(1), better: -1, mildThresh: 2 },
    { key: 'avgHitTime', label: 'AVG / HIT', fmt: v => v.toFixed(2) + 's', dfmt: v => v.toFixed(2) + 's', better: -1, mildThresh: 0.06 }
  ];
  const GOOD = '#4caf6a', WARN = '#f59e0b', BAD = '#e0605c';
  let recap = null;

  // Compare the finished round against the average of the previous 5 rounds in the same mode.
  function buildRecap(r, prev) {
    const base = prev.slice(-5);
    const avg = key => {
      const v = base.map(p => p[key]).filter(x => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const cmp = (key, better, eps, mildThresh) => {
      const b = avg(key), v = r[key];
      if (b === null || typeof v !== 'number') return { base: b, delta: null, state: 'none' };
      const delta = v - b;
      if (Math.abs(delta) < eps) return { base: b, delta, state: 'same' };
      if (delta * better > 0) return { base: b, delta, state: 'good' };
      const thresh = typeof mildThresh === 'number'
        ? mildThresh
        : Math.max(Math.abs(b) * 0.12, 0.3);
      const isMild = Math.abs(delta) <= thresh;
      return { base: b, delta, state: isMild ? 'warn' : 'bad' };
    };
    return {
      n: base.length,
      cps: cmp('cps', 1, 0.005, null),
      items: METRICS.map(m => ({ ...m, ...cmp(m.key, m.better, 0.005, m.mildThresh) }))
    };
  }

  function finish() {
    state = 'done';
    const intervals = hitTimes.length > 1 ? (hitTimes[hitTimes.length - 1] - hitTimes[0]) / (hitTimes.length - 1) / 1000 : null;
    lastResult = {
      mode, date: new Date().toISOString(), hits, misses,
      cps: +(clicks / DURATION).toFixed(2),
      accuracy: clicks ? +(hits / clicks * 100).toFixed(1) : 0,
      avgHitTime: intervals === null ? null : +intervals.toFixed(3),
      distance: radius,
      radius,
      size: targetSizeNum,
      forgiving
    };
    recap = buildRecap(lastResult, history.filter(r => r.mode === mode));
    history.push(lastResult); save();
    splitKey = comboKey(lastResult);
    updateStats(DURATION); drawGraph(true);
  }

  // Rendering
  function frame(t) {
    if (state === 'countdown') {
      const cdElapsed = t - countdownStart;
      if (cdElapsed >= COUNTDOWN_MS) {
        state = 'running';
        startT = performance.now();
        updateHint();
      }
    }
    if (state === 'running') {
      const el = (t - startT) / 1000;
      if (el >= DURATION) finish();
      else { updateStats(el); if (mode === 'adaptive' && t >= nextSwitch) { pickTask(); updateHint(); } }
    }
    draw(t);
    requestAnimationFrame(frame);
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(228,217,213,.13)'; ctx.lineWidth = 2;
    ctx.beginPath();
    SEQUENCE.concat(SEQUENCE[0]).forEach((n, i) => {
      const p = targetPos(n, t); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.stroke();

    ctx.font = 'bold 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let n = 1; n <= 5; n++) {
      const p = targetPos(n, t);
      const next = (state === 'running' || state === 'countdown') && n === SEQUENCE[seqIdx];
      ctx.beginPath(); ctx.arc(p.x, p.y, TR, 0, Math.PI * 2);
      ctx.fillStyle = next ? COLORS[currentTask()] : '#393F4E'; ctx.fill();
      ctx.lineWidth = next ? 3 : 1.5; ctx.strokeStyle = next ? '#FDE3BA' : 'rgba(228,217,213,.3)'; ctx.stroke();
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.fillStyle = '#FDE3BA'; ctx.fillText(n, p.x, p.y + 1);

      if (state === 'countdown' && next) {
        const progress = (t - countdownStart) / COUNTDOWN_MS;
        const pulseR = TR + 4 + Math.sin(progress * Math.PI * 4) * 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(TR + 2, pulseR), 0, Math.PI * 2);
        ctx.strokeStyle = '#FDE3BA';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    if (state === 'running' || state === 'countdown') {
      ctx.font = '600 15px Inter, sans-serif'; ctx.fillStyle = COLORS[currentTask()];
      const K = qKey.toUpperCase();
      const C = champKey.toUpperCase();
      const label = { move: 'MOVE · right click', attack: `ATTACK · ${K} + left click`, champ: `CHAMPION · ${C} on, ${K} + left click` }[currentTask()];
      ctx.fillText(label, CX, 28);
    }
    if (state === 'countdown') {
      const elapsed = t - countdownStart;
      const frac = Math.max(0, Math.min(1, elapsed / COUNTDOWN_MS));
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.beginPath();
      ctx.arc(CX, CY, 38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(23, 27, 36, 0.78)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(228, 217, 213, 0.2)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(CX, CY, 38, -Math.PI / 2, -Math.PI / 2 + (1 - frac) * Math.PI * 2);
      ctx.strokeStyle = '#F4D17D';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.font = 'bold 28px Inter, sans-serif';
      ctx.fillStyle = '#FDE3BA';
      ctx.fillText('1', CX, CY - 2);
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = 'rgba(228, 217, 213, 0.75)';
      ctx.fillText('READY', CX, CY + 18);
      ctx.restore();
    }
    if (feedback && t < feedback.until) {
      ctx.globalAlpha = Math.min(1, (feedback.until - t) / 250);
      ctx.font = 'bold 40px Inter, sans-serif';
      ctx.fillStyle = feedback.ok ? '#F4D17D' : '#e07070';
      ctx.fillText(feedback.ok ? 'HIT' : 'MISS', CX, CY);
      ctx.globalAlpha = 1;
    }
    if (state === 'idle') overlay('Press SPACE to start', 'Mode: ' + MODES[mode], 'Press R at any time to reset the round');
    if (state === 'done' && lastResult && recap) drawRecap(lastResult, recap);
  }

  function drawRecap(r, rc) {
    const col = s => s === 'good' ? GOOD : s === 'warn' ? WARN : s === 'bad' ? BAD : 'rgba(228,217,213,.58)';
    const arrow = s => s === 'good' ? '▲' : (s === 'warn' || s === 'bad') ? '▼' : '●';
    const sign = d => (d > 0 ? '+' : d < 0 ? '−' : '±');
    ctx.fillStyle = 'rgba(23,27,36,.94)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = MODE_COLORS[r.mode]; ctx.fillRect(0, 0, W, 6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    ctx.font = '600 15px Inter, sans-serif'; ctx.fillStyle = 'rgba(228,217,213,.58)';
    ctx.fillText('TIME!  ·  ' + MODES[r.mode].toUpperCase(), CX, 38);

    // Main score: CPS
    const c = rc.cps;
    ctx.font = 'bold 74px Inter, sans-serif'; ctx.fillStyle = '#FDE3BA';
    ctx.fillText(r.cps.toFixed(2), CX, 112);
    ctx.font = '700 16px Inter, sans-serif'; ctx.fillStyle = '#F4D17D';
    ctx.fillText('CLICKS PER SECOND', CX, 166);

    ctx.font = '700 18px Inter, sans-serif';
    if (c.state === 'none') {
      ctx.fillStyle = 'rgba(228,217,213,.58)'; ctx.fillText('First run in this mode — no previous average yet', CX, 204);
    } else {
      ctx.fillStyle = col(c.state);
      ctx.fillText(`${arrow(c.state)} ${sign(c.delta)}${Math.abs(c.delta).toFixed(2)} vs last ${rc.n} avg (${c.base.toFixed(2)})`, CX, 204);
    }

    // Metric cards
    const cw = 168, gap = 16, y0 = 252, ch = 128;
    const x0 = (W - (cw * 4 + gap * 3)) / 2;
    rc.items.forEach((m, i) => {
      const x = x0 + i * (cw + gap), v = r[m.key];
      ctx.fillStyle = '#202633'; ctx.fillRect(x, y0, cw, ch);
      ctx.fillStyle = col(m.state); ctx.fillRect(x, y0, cw, 4);
      ctx.strokeStyle = 'rgba(228,217,213,.13)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y0 + .5, cw - 1, ch - 1);
      const cx = x + cw / 2;
      ctx.font = '700 12px Inter, sans-serif'; ctx.fillStyle = 'rgba(228,217,213,.58)'; ctx.fillText(m.label, cx, y0 + 24);
      ctx.font = 'bold 32px Inter, sans-serif'; ctx.fillStyle = '#E4D9D5';
      ctx.fillText(typeof v === 'number' ? m.fmt(v) : '–', cx, y0 + 62);
      ctx.font = '700 14px Inter, sans-serif'; ctx.fillStyle = col(m.state);
      ctx.fillText(m.state === 'none' ? 'no data' : `${arrow(m.state)} ${sign(m.delta)}${m.dfmt(Math.abs(m.delta))}`, cx, y0 + 98);
    });

    // Summary
    const names = st => rc.items.filter(m => m.state === st).map(m => m.label.toLowerCase());
    const up = names('good'), mild = names('warn'), down = names('bad');
    if (c.state === 'good') up.unshift('cps');
    else if (c.state === 'warn') mild.unshift('cps');
    else if (c.state === 'bad') down.unshift('cps');

    let sumY = 412;
    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillStyle = GOOD; ctx.fillText('Improved: ' + (up.length ? up.join(', ') : '—'), CX, sumY); sumY += 24;
    if (mild.length) {
      ctx.fillStyle = WARN; ctx.fillText('Slightly worse: ' + mild.join(', '), CX, sumY); sumY += 24;
    }
    ctx.fillStyle = BAD; ctx.fillText('Worse: ' + (down.length ? down.join(', ') : '—'), CX, sumY); sumY += 28;

    ctx.font = '15px Inter, sans-serif'; ctx.fillStyle = 'rgba(228,217,213,.58)';
    const distSizeShow = pxToDistSize(r.radius ?? r.distance ?? 100);
    const sizeShow = pxToSize(r.size ?? 26);
    ctx.fillText(`Hits ${r.hits} · Misses ${r.misses} · Distance: Size ${distSizeShow} · Target: Size ${sizeShow}`, CX, sumY); sumY += 26;
    ctx.fillText('Press SPACE to play again', CX, sumY);
  }

  function overlay(a, b, c) {
    ctx.fillStyle = 'rgba(23,27,36,.82)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FDE3BA'; ctx.font = 'bold 30px Inter, sans-serif'; ctx.fillText(a, CX, CY - 24);
    ctx.fillStyle = '#E4D9D5'; ctx.font = '16px Inter, sans-serif'; ctx.fillText(b, CX, CY + 12);
    if (c) { ctx.fillStyle = 'rgba(228,217,213,.58)'; ctx.fillText(c, CX, CY + 44); }
  }

  // Graph: rendered to an offscreen canvas only when data or mode changes.
  const gcv = $('graph'), gctx = gcv.getContext('2d');
  const cache = document.createElement('canvas');
  cache.width = gcv.width; cache.height = gcv.height;

  // Optional split: show only runs with one distance / target size / forgiving combination.
  let splitOn = localStorage.getItem('lolAimGraphSplit') === '1';
  let splitKey = null;
  const forgiveTag = r => r.forgiving === false ? 'strict' : r.forgiving === true ? 'forgiving' : 'unknown';
  const comboKey = r => `${pxToDistSize(r.radius ?? r.distance ?? 100)}|${pxToSize(r.size ?? 26)}|${forgiveTag(r)}`;
  const comboLabel = k => {
    const [d, s, f] = k.split('|');
    const fl = { strict: 'Strict', forgiving: 'Forgiving', unknown: 'Forgiving: unrecorded' }[f];
    return `Distance ${d} · Target ${s} · ${fl}`;
  };

  function graphData() {
    const all = history.filter(r => r.mode === mode);
    return (splitOn ? all.filter(r => comboKey(r) === splitKey) : all).slice(-40);
  }

  function updateSplitSelect() {
    const sel = $('splitSel');
    sel.hidden = !splitOn;
    if (!splitOn) return;
    const counts = {};
    history.filter(r => r.mode === mode).forEach(r => { const k = comboKey(r); counts[k] = (counts[k] || 0) + 1; });
    const keys = Object.keys(counts).sort();
    const current = `${distSizeNum}|${targetSizeNum}|${forgiving ? 'forgiving' : 'strict'}`;
    if (!keys.includes(splitKey)) splitKey = keys.includes(current) ? current : keys[0] ?? null;
    sel.innerHTML = keys.length
      ? keys.map(k => `<option value="${k}">${comboLabel(k)} (${counts[k]})</option>`).join('')
      : '<option value="">No runs yet</option>';
    sel.value = splitKey ?? '';
  }

  function drawGraph() {
    updateSplitSelect();
    $('graphTitle').textContent = 'History · ' + MODES[mode];
    const g = cache.getContext('2d'), w = cache.width, h = cache.height;
    g.clearRect(0, 0, w, h);
    const data = graphData();
    const pad = { l: 44, r: 44, t: 16, b: 26 };
    g.font = '12px Inter, sans-serif'; g.fillStyle = 'rgba(228,217,213,.58)';
    g.strokeStyle = 'rgba(228,217,213,.13)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (h - pad.t - pad.b) * i / 4;
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
    }
    if (!data.length) {
      g.textAlign = 'center'; g.fillText('No attempts yet for this mode', w / 2, h / 2);
    } else {
      const maxCps = Math.max(5, Math.ceil(Math.max(...data.map(d => d.cps))));
      const maxDistSize = 6;
      const maxSize = 6;
      const xs = i => data.length === 1 ? (pad.l + w - pad.r) / 2 : pad.l + (w - pad.l - pad.r) * i / (data.length - 1);

      const line = (val, max, color, dash = [], withDots = true) => {
        g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2;
        g.setLineDash(dash);
        g.beginPath();
        data.forEach((d, i) => {
          const y = h - pad.b - (h - pad.t - pad.b) * val(d) / max;
          i ? g.lineTo(xs(i), y) : g.moveTo(xs(i), y);
        });
        g.stroke();
        g.setLineDash([]);
        if (withDots) {
          data.forEach((d, i) => {
            const y = h - pad.b - (h - pad.t - pad.b) * val(d) / max;
            g.beginPath(); g.arc(xs(i), y, 3, 0, Math.PI * 2); g.fill();
          });
        }
      };

      // Target conditions (straight lines without dots); constant when split, so hidden
      if (!splitOn) {
        line(d => pxToDistSize(d.radius ?? d.distance ?? 100), maxDistSize, '#e57373', [], false);
        line(d => pxToSize(d.size ?? 26), maxSize, '#81c784', [], false);
      }

      // Performance results (solid with dots)
      line(d => d.cps, maxCps, '#F4D17D', [], true);
      line(d => d.accuracy, 100, '#4f9bd1', [], true);

      g.textAlign = 'right'; g.fillStyle = '#F4D17D';
      g.fillText(maxCps + ' cps', pad.l - 6, pad.t + 4); g.fillText('0', pad.l - 6, h - pad.b);
      g.textAlign = 'left'; g.fillStyle = '#4f9bd1';
      g.fillText('100%', w - pad.r + 6, pad.t + 4); g.fillText('0%', w - pad.r + 6, h - pad.b);
    }

    g.textAlign = 'left';
    let lx = pad.l;
    g.fillStyle = '#F4D17D'; g.fillText('● CPS', lx, h - 6); lx += 60;
    g.fillStyle = '#4f9bd1'; g.fillText('● Accuracy', lx, h - 6); lx += 80;
    if (!splitOn) {
      g.fillStyle = '#e57373'; g.fillText('― Distance (Size 1–6)', lx, h - 6); lx += 135;
      g.fillStyle = '#81c784'; g.fillText('― Target size (Size 1–6)', lx, h - 6);
    }

    gctx.clearRect(0, 0, w, h); gctx.drawImage(cache, 0, 0);
  }

  function renderGraphWithHover(mx, my) {
    const w = gcv.width, h = gcv.height;
    gctx.clearRect(0, 0, w, h);
    gctx.drawImage(cache, 0, 0);

    const data = graphData();
    if (!data.length) return;

    const pad = { l: 44, r: 44, t: 16, b: 26 };
    if (mx < pad.l - 10 || mx > w - pad.r + 10 || my < pad.t - 10 || my > h - pad.b + 10) return;

    const xs = i => data.length === 1 ? (pad.l + w - pad.r) / 2 : pad.l + (w - pad.l - pad.r) * i / (data.length - 1);
    let closest = 0, minDist = Infinity;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(xs(i) - mx);
      if (d < minDist) { minDist = d; closest = i; }
    }
    const d = data[closest];
    const px = xs(closest);

    gctx.save();
    gctx.strokeStyle = 'rgba(253, 227, 186, 0.4)';
    gctx.lineWidth = 1;
    gctx.setLineDash([3, 3]);
    gctx.beginPath();
    gctx.moveTo(px, pad.t);
    gctx.lineTo(px, h - pad.b);
    gctx.stroke();

    const maxCps = Math.max(5, Math.ceil(Math.max(...data.map(x => x.cps))));
    const maxDistSize = 6;
    const maxSize = 6;

    const pts = [
      { y: h - pad.b - (h - pad.t - pad.b) * d.cps / maxCps, color: '#F4D17D' },
      { y: h - pad.b - (h - pad.t - pad.b) * d.accuracy / 100, color: '#4f9bd1' }
    ];
    gctx.setLineDash([]);
    pts.forEach(p => {
      gctx.beginPath();
      gctx.arc(px, p.y, 5, 0, Math.PI * 2);
      gctx.fillStyle = p.color;
      gctx.fill();
      gctx.strokeStyle = '#171B24';
      gctx.lineWidth = 1.5;
      gctx.stroke();
    });

    const distSizeVal = pxToDistSize(d.radius ?? d.distance ?? 100);
    const sizeVal = pxToSize(d.size ?? 26);
    const boxW = 156, boxH = splitOn ? 56 : 74;
    let boxX = px + 12;
    if (boxX + boxW > w - pad.r + 30) boxX = px - boxW - 12;
    const boxY = Math.min(Math.max(pad.t + 2, my - boxH / 2), h - pad.b - boxH - 2);

    gctx.fillStyle = 'rgba(23, 27, 36, 0.94)';
    gctx.strokeStyle = 'rgba(228, 217, 213, 0.3)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    if (gctx.roundRect) gctx.roundRect(boxX, boxY, boxW, boxH, 6);
    else gctx.rect(boxX, boxY, boxW, boxH);
    gctx.fill();
    gctx.stroke();

    gctx.font = 'bold 11px Inter, sans-serif';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'top';
    gctx.fillStyle = '#FDE3BA';
    gctx.fillText(`Run #${closest + 1}`, boxX + 8, boxY + 7);

    gctx.font = '11px Inter, sans-serif';
    gctx.fillStyle = '#F4D17D';
    gctx.fillText(`CPS: ${d.cps.toFixed(2)}`, boxX + 8, boxY + 22);
    gctx.fillStyle = '#4f9bd1';
    gctx.fillText(`Acc: ${d.accuracy.toFixed(1)}% (${d.hits}h/${d.misses}m)`, boxX + 8, boxY + 38);
    if (!splitOn) {
      gctx.fillStyle = '#E4D9D5';
      gctx.fillText(`Dist: Size ${distSizeVal} · Size: Size ${sizeVal}`, boxX + 8, boxY + 54);
    }

    gctx.restore();
  }

  gcv.addEventListener('mousemove', e => {
    const r = gcv.getBoundingClientRect();
    const mx = (e.clientX - r.left) * gcv.width / r.width;
    const my = (e.clientY - r.top) * gcv.height / r.height;
    renderGraphWithHover(mx, my);
  });
  gcv.addEventListener('mouseleave', () => {
    gctx.clearRect(0, 0, gcv.width, gcv.height);
    gctx.drawImage(cache, 0, 0);
  });

  // Input
  const pos = e => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  };
  cv.addEventListener('mousedown', e => { e.preventDefault(); const [x, y] = pos(e); handleClick(e.button, x, y); });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (e.repeat || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (rebindingKey) {
      e.preventDefault();
      if (k === 'escape') {
        rebindingKey = null;
        updateHint();
        return;
      }
      if (k.length === 1 && !'123 r'.includes(k) && k !== ' ') {
        if (rebindingKey === 'q') {
          if (k !== champKey) {
            qKey = k;
            localStorage.setItem('lolAimQKey', k);
          }
        } else if (rebindingKey === 'champ') {
          if (k !== qKey) {
            champKey = k;
            localStorage.setItem('lolAimChampKey', k);
          }
        }
      }
      rebindingKey = null;
      updateHint();
      return;
    }

    if (k === 'escape') {
      const panel = $('settings');
      if (!panel.hidden) {
        panel.hidden = true;
        return;
      }
    }

    if (k === qKey) { qArmed = true; updateHint(); }
    else if (k === champKey) { champOnly = !champOnly; updateHint(); }
    else if (k === '1') setMode('right');
    else if (k === '2') setMode('q');
    else if (k === '3') setMode('adaptive');
    else if (k === ' ') { e.preventDefault(); start(); }
    else if (k === 'r') resetRound(false);
  });

  document.querySelectorAll('#modes [data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('qKeyBtn').onclick = e => {
    e.target.blur();
    rebindingKey = rebindingKey === 'q' ? null : 'q';
    updateHint();
  };
  const champBtn = $('champKeyBtn');
  if (champBtn) {
    champBtn.onclick = e => {
      e.target.blur();
      rebindingKey = rebindingKey === 'champ' ? null : 'champ';
      updateHint();
    };
  }

  const slider = $('radiusSlider');
  slider.value = distSizeNum;
  if ($('radiusVal')) $('radiusVal').textContent = 'Size ' + distSizeNum;
  slider.oninput = () => {
    distSizeNum = Math.min(Math.max(1, Math.round(+slider.value)), 6);
    radius = distSizeToPx(distSizeNum);
    slider.value = distSizeNum;
    if ($('radiusVal')) $('radiusVal').textContent = 'Size ' + distSizeNum;
    localStorage.setItem('lolAimRadius', distSizeNum);
  };
  slider.onchange = () => slider.blur();

  const sizeSlider = $('sizeSlider');
  sizeSlider.value = targetSizeNum;
  if ($('sizeVal')) $('sizeVal').textContent = 'Size ' + targetSizeNum;
  sizeSlider.oninput = () => {
    targetSizeNum = Math.min(Math.max(1, Math.round(+sizeSlider.value)), 6);
    TR = sizeToPx(targetSizeNum);
    sizeSlider.value = targetSizeNum;
    if ($('sizeVal')) $('sizeVal').textContent = 'Size ' + targetSizeNum;
    localStorage.setItem('lolAimSize', targetSizeNum);
  };
  sizeSlider.onchange = () => sizeSlider.blur();

  const vol = $('volSlider');
  vol.value = Math.round(volume * 100);
  vol.oninput = () => { volume = +vol.value / 100; localStorage.setItem('lolAimVol', vol.value); };
  vol.onchange = () => vol.blur();

  const forgive = $('forgiveChk');
  forgive.checked = forgiving;
  forgive.onchange = () => { forgiving = forgive.checked; localStorage.setItem('lolAimForgiving', forgiving ? '1' : '0'); forgive.blur(); };

  $('settingsBtn').onclick = e => {
    e.target.blur();
    const panel = $('settings');
    panel.hidden = !panel.hidden;
    if (panel.hidden && rebindingKey) {
      rebindingKey = null;
      updateHint();
    }
  };

  document.addEventListener('pointerdown', e => {
    const panel = $('settings');
    const btn = $('settingsBtn');
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.hidden = true;
      if (rebindingKey) {
        rebindingKey = null;
        updateHint();
      }
    }
  });

  const splitChk = $('splitChk');
  splitChk.checked = splitOn;
  splitChk.onchange = () => {
    splitOn = splitChk.checked;
    localStorage.setItem('lolAimGraphSplit', splitOn ? '1' : '0');
    splitChk.blur(); drawGraph();
  };
  $('splitSel').onchange = e => { splitKey = e.target.value || null; e.target.blur(); drawGraph(); };

  $('exportBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' }));
    a.download = 'lol-aim-history.json'; a.click(); URL.revokeObjectURL(a.href);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data)) throw 0;
      history = data.filter(r => MODES[r.mode] && typeof r.cps === 'number' && typeof r.accuracy === 'number');
      save(); drawGraph();
    } catch { alert('Invalid history file.'); }
    e.target.value = '';
  };

  updateStats(0); updateHint(); drawGraph();
  requestAnimationFrame(frame);
})();
