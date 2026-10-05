const DATA_KEY = "cps_scores";
const BPM_KEY = "cps_metronome_bpm";
const VOLUME_KEY = "cps_metronome_volume";
const CLICK_MODE_KEY = "cps_click_mode";
const MET_PLAY_KEY = "cps_metronome_play_during_click";
const REST_DURATION_KEY = "cps_rest_duration";
const DURATIONS = ["5", "10", "30", "60"];
const CLICK_MODES = ["left", "right"];
const MIN_BPM = 300;
const MAX_BPM = 600;

function scoreKey(duration, mode) {
  return `${duration}_${mode}`;
}

function normalizeScores(data) {
  const normalized = {};

  DURATIONS.forEach(d => {
    CLICK_MODES.forEach(m => {
      const key = scoreKey(d, m);
      normalized[key] = Array.isArray(data[key]) ? data[key] : [];
    });

    // legacy scores (from before left/right tracking existed) were all right-click
    if (Array.isArray(data[d]) && normalized[scoreKey(d, "right")].length === 0) {
      normalized[scoreKey(d, "right")] = data[d];
    }
  });

  return normalized;
}

function loadScores() {
  const raw = localStorage.getItem(DATA_KEY);

  if (raw) {
    try {
      return normalizeScores(JSON.parse(raw));
    } catch (e) {
      console.warn("Corrupt score data, resetting.", e);
    }
  }

  return normalizeScores({});
}

function saveScores(scores) {
  localStorage.setItem(DATA_KEY, JSON.stringify(scores));
}

let scores = loadScores();

// ---------- CPS test ----------

const durationSelect = document.getElementById("duration");
const startBtn = document.getElementById("startBtn");
const cancelBtn = document.getElementById("cancelBtn");
const clickZone = document.getElementById("clickZone");
const clickModeSelect = document.getElementById("clickMode");
const statusText = document.getElementById("statusText");
const statLine = document.getElementById("statLine");

let clickMode = localStorage.getItem(CLICK_MODE_KEY) || "left";
clickModeSelect.value = clickMode;

let selectedDuration = Number(durationSelect.value);
let running = false;
let startTime = 0;
let clicks = 0;
let tickHandle = null;

function startTest() {
  selectedDuration = Number(durationSelect.value);
  running = true;
  clicks = 0;
  startTime = performance.now();
  statusText.textContent = "Click as fast as you can!";
  clickZone.focus();

  if (clickZone.requestPointerLock) clickZone.requestPointerLock();

  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(updateTest, 50);
  updateTest();

  if (metronomePlayCheckbox.checked && !metronomeOn) startMetronome();
}

function updateTest() {
  if (!running) return;

  const elapsed = (performance.now() - startTime) / 1000;
  const remaining = selectedDuration - elapsed;

  if (remaining <= 0) {
    finishTest();
    return;
  }

  statLine.textContent = `Clicks: ${clicks}   Time: ${remaining.toFixed(1)}s`;
}

function finishTest() {
  running = false;
  clearInterval(tickHandle);
  tickHandle = null;

  if (document.pointerLockElement === clickZone) document.exitPointerLock();

  const cps = clicks / selectedDuration;

  scores[scoreKey(selectedDuration, clickMode)].push({
    date: new Date().toLocaleString(),
    clicks: clicks,
    cps: Math.round(cps * 100) / 100
  });

  saveScores(scores);
  renderChart();

  statusText.textContent = "Clicky place";
  statLine.textContent = `Last CPS: ${cps.toFixed(2)}`;

  if (metronomeOn) stopMetronome();
}

function cancelTest() {
  if (!running) return;

  running = false;
  clearInterval(tickHandle);
  tickHandle = null;

  if (document.pointerLockElement === clickZone) document.exitPointerLock();

  statusText.textContent = "Clicky place";
  statLine.textContent = "Cancelled";
  if (metronomeOn) stopMetronome();
}

function registerClick(e) {
  if (!running) return;
  const isRight = e.button === 2;
  if ((clickMode === "right") === isRight) clicks++;
}

startBtn.addEventListener("click", startTest);
cancelBtn.addEventListener("click", cancelTest);
clickZone.addEventListener("mousedown", registerClick);
clickZone.addEventListener("contextmenu", (e) => e.preventDefault());

// browser can exit pointer lock on its own (e.g. Esc key), so cancel the test if that happens
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== clickZone && running) cancelTest();
});

clickModeSelect.addEventListener("change", () => {
  clickMode = clickModeSelect.value;
  localStorage.setItem(CLICK_MODE_KEY, clickMode);
  renderChart();
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    startTest();
  } else if (e.code === "Backspace" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    if (metronomeOn) stopMetronome();
    cancelTest();
  }
});

durationSelect.addEventListener("change", () => {
  selectedDuration = Number(durationSelect.value);
  renderChart();
});

const metronomeToggle = document.getElementById("metronomeToggle");
const bpmInput = document.getElementById("bpmInput");
const bpmSlider = document.getElementById("bpmSlider");
const bpsIndicator = document.getElementById("bpsIndicator");
const volumeSlider = document.getElementById("volumeSlider");
const metronomePlayCheckbox = document.getElementById("metronomePlayDuringClick");

const savedMetPlay = localStorage.getItem(MET_PLAY_KEY);
if (savedMetPlay !== null) metronomePlayCheckbox.checked = savedMetPlay === "true";

metronomePlayCheckbox.addEventListener("change", () => {
  localStorage.setItem(MET_PLAY_KEY, String(metronomePlayCheckbox.checked));
});

let bpm = Number(bpmInput.value);
let metronomeOn = false;
let audioCtx = null;
let nextNoteTime = 0;
let schedulerHandle = null;

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.1;

function clampBpm(value) {
  if (Number.isNaN(value)) return MIN_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, value));
}

function setBpm(value, persist = true) {
  bpm = clampBpm(value);
  bpmInput.value = bpm;
  bpmSlider.value = bpm;
  bpsIndicator.textContent = `(${(bpm / 60).toFixed(2)} bps)`;
  if (persist) localStorage.setItem(BPM_KEY, String(bpm));
}

const savedBpm = Number(localStorage.getItem(BPM_KEY));
if (!Number.isNaN(savedBpm) && localStorage.getItem(BPM_KEY) !== null) {
  setBpm(savedBpm, false);
} else {
  setBpm(bpm, false);
}

let volume = Number(volumeSlider.value) / 100;

function setVolume(value, persist = true) {
  volume = Math.min(100, Math.max(0, value)) / 100;
  volumeSlider.value = value;
  if (persist) localStorage.setItem(VOLUME_KEY, String(value));
}

const savedVolume = Number(localStorage.getItem(VOLUME_KEY));
if (!Number.isNaN(savedVolume) && localStorage.getItem(VOLUME_KEY) !== null) {
  setVolume(savedVolume, false);
}

volumeSlider.addEventListener("input", () => setVolume(Number(volumeSlider.value)));

function playClick(time) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.frequency.value = 880;
  gain.gain.setValueAtTime(Math.max(0.0001, 0.4 * volume), time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(time);
  osc.stop(time + 0.05);
}

function scheduler() {
  if (bpm <= 0) return;

  const interval = 60 / bpm;

  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_TIME) {
    playClick(nextNoteTime);
    nextNoteTime += interval;
  }
}

function startMetronome() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (metronomeOn) return;

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (bpm <= 0) return;

  metronomeOn = true;
  metronomeToggle.textContent = "Stop Metronome";
  metronomeToggle.classList.add("active");

  nextNoteTime = audioCtx.currentTime + 0.05;
  schedulerHandle = setInterval(scheduler, LOOKAHEAD_MS);
}

function stopMetronome() {
  metronomeOn = false;
  metronomeToggle.textContent = "Start Metronome";
  metronomeToggle.classList.remove("active");

  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}

metronomeToggle.addEventListener("click", () => {
  if (metronomeOn) {
    stopMetronome();
  } else {
    startMetronome();
  }
});

bpmInput.addEventListener("input", () => setBpm(Number(bpmInput.value)));
bpmSlider.addEventListener("input", () => setBpm(Number(bpmSlider.value)));

// ---------- Rest timer ----------

const restDurationInput = document.getElementById("restDurationInput");
const restStartBtn = document.getElementById("restStartBtn");
const restResetBtn = document.getElementById("restResetBtn");
const restTimeDisplay = document.getElementById("restTimeDisplay");

const savedRestDuration = localStorage.getItem(REST_DURATION_KEY);
if (savedRestDuration !== null) restDurationInput.value = savedRestDuration;

let restRunning = false;
let restRemaining = Number(restDurationInput.value) || 0;
let restTickHandle = null;

function formatRestTime(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateRestDisplay() {
  restTimeDisplay.textContent = formatRestTime(restRemaining);
}

function playRestEndSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();

  const now = audioCtx.currentTime;
  // two quick beeps to distinguish it from the metronome click
  [0, 0.15].forEach(offset => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.frequency.value = 660;
    gain.gain.setValueAtTime(Math.max(0.0001, 0.5 * volume), now + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now + offset);
    osc.stop(now + offset + 0.13);
  });
}

function pauseRestTimer() {
  restRunning = false;
  restStartBtn.textContent = "▶";
  if (restTickHandle) {
    clearInterval(restTickHandle);
    restTickHandle = null;
  }
}

function startRestTimer() {
  if (restRunning) return;
  if (restRemaining <= 0) restRemaining = Number(restDurationInput.value) || 0;

  restRunning = true;
  restStartBtn.textContent = "❚❚";

  const startTs = performance.now();
  const startRemaining = restRemaining;

  restTickHandle = setInterval(() => {
    const elapsed = (performance.now() - startTs) / 1000;
    restRemaining = startRemaining - elapsed;

    if (restRemaining <= 0) {
      restRemaining = 0;
      updateRestDisplay();
      pauseRestTimer();
      playRestEndSound();
      return;
    }

    updateRestDisplay();
  }, 100);
}

function resetRestTimer() {
  pauseRestTimer();
  restRemaining = Number(restDurationInput.value) || 0;
  updateRestDisplay();
}

restStartBtn.addEventListener("click", () => {
  if (restRunning) {
    pauseRestTimer();
  } else {
    startRestTimer();
  }
});

restResetBtn.addEventListener("click", resetRestTimer);

restDurationInput.addEventListener("change", () => {
  localStorage.setItem(REST_DURATION_KEY, restDurationInput.value);
  if (!restRunning) resetRestTimer();
});

updateRestDisplay();

// ---------- Chart ----------

const graphTitle = document.getElementById("graphTitle");
const ctx = document.getElementById("scoreChart").getContext("2d");
let chart = null;

function linearTrend(xs, ys) {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return xs.map(() => sumY / n);

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return xs.map(x => slope * x + intercept);
}

function renderChart() {
  const current = scores[scoreKey(selectedDuration, clickMode)] || [];
  const labels = current.map((_, i) => i + 1);
  const cpsValues = current.map(s => s.cps);

  graphTitle.textContent = `${selectedDuration}s (${clickMode} click) CPS Progress`;

  const datasets = [
    {
      label: "CPS",
      data: cpsValues,
      borderColor: "#F4D17D",
      backgroundColor: "#F4D17D",
      tension: 0.1
    }
  ];

  if (cpsValues.length >= 2) {
    datasets.push({
      label: "Trend",
      data: linearTrend(labels, cpsValues),
      borderColor: "#E4D9D5",
      borderDash: [6, 4],
      pointRadius: 0
    });
  }

  if (cpsValues.length >= 1) {
    const average = cpsValues.reduce((a, b) => a + b, 0) / cpsValues.length;
    const best = Math.max(...cpsValues);

    datasets.push({
      label: `Average: ${average.toFixed(2)}`,
      data: labels.map(() => average),
      borderColor: "rgba(228, 217, 213, 0.58)",
      borderDash: [2, 3],
      pointRadius: 0
    });

    datasets.push({
      label: `Best: ${best.toFixed(2)}`,
      data: labels.map(() => best),
      borderColor: "#FDE3BA",
      borderDash: [2, 3],
      pointRadius: 0
    });
  }

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      color: "#E4D9D5",
      scales: {
        x: { ticks: { color: "#E4D9D5" }, grid: { color: "rgba(228, 217, 213, 0.13)" } },
        y: { ticks: { color: "#E4D9D5" }, grid: { color: "rgba(228, 217, 213, 0.13)" } }
      },
      plugins: {
        legend: { labels: { color: "#E4D9D5" } }
      }
    }
  });
}

// ---------- Export / Import ----------

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(scores, null, 4)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "cps_scores.json";
  a.click();

  URL.revokeObjectURL(url);
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);

      scores = normalizeScores(imported);
      saveScores(scores);
      renderChart();
    } catch (e) {
      alert("Invalid scores file.");
    }
  };

  reader.readAsText(file);
  importFile.value = "";
});

renderChart();
