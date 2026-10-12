function championIconUrl(name) {
  return `/map/static/champions/${encodeURIComponent(name.replace(/'/g, "_"))}.png`;
}

const search = document.getElementById("search");
const suggestions = document.getElementById("suggestions");
const map = document.getElementById("map");
const rift = document.querySelector(".rift");
const layer = document.getElementById("itemsLayer");
const clearBtn = document.getElementById("clearBtn");
const randomTeamsBtn = document.getElementById("randomTeamsBtn");
const saveLayoutBtn = document.getElementById("saveLayoutBtn");
const savedLayoutsBtn = document.getElementById("savedLayoutsBtn");
const copyImageBtn = document.getElementById("copyImageBtn");
const downloadImageBtn = document.getElementById("downloadImageBtn");
const penBtn = document.getElementById("penBtn");
const eraserBtn = document.getElementById("eraserBtn");
const wardBtn = document.getElementById("wardBtn");
const textBtn = document.getElementById("textBtn");
const pingsBtn = document.getElementById("pingsBtn");
const matchImport = document.getElementById("matchImport");
const matchLink = document.getElementById("matchLink");
const importMatchBtn = document.getElementById("importMatchBtn");
const spellsBtn = document.getElementById("spellsBtn");
const spellsDropdown = document.getElementById("spellsDropdown");
const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const championSettingsList = document.getElementById("championSettingsList");
const exportDataBtn = document.getElementById("exportDataBtn");
const importDataBtn = document.getElementById("importDataBtn");
const importDataInput = document.getElementById("importDataInput");
const savedLayoutsPanel = document.getElementById("savedLayoutsPanel");
const closeSavedLayoutsBtn = document.getElementById("closeSavedLayoutsBtn");
const savedLayoutsList = document.getElementById("savedLayoutsList");
const helpBar = document.getElementById("helpBar");
const closeHelpBtn = document.getElementById("closeHelpBtn");
const openHelpBtn = document.getElementById("openHelpBtn");
const coordinates = document.getElementById("coordinates");
const copyCoordinatesBtn = document.getElementById("copyCoordinatesBtn");
const app = document.querySelector(".app");
const watermark = document.querySelector(".watermark");
const copyNotice = document.getElementById("copyNotice");
const customContextMenu = document.getElementById("customContextMenu");
const contextCopyImageBtn = document.getElementById("contextCopyImageBtn");
const contextClearAllBtn = document.getElementById("contextClearAllBtn");
const drawingCanvas = document.getElementById("drawingCanvas");
const drawingContext = drawingCanvas.getContext("2d");
const baseItemSize = 52;
const layoutStorageKey = "riftChampionLayout";
const championSettingsStorageKey = "riftChampionSettings";
const savedLayoutsStorageKey = "riftSavedLayouts";
const helpVisibleStorageKey = "riftHelpVisible";
const backupStorageKeys = [
  layoutStorageKey,
  championSettingsStorageKey,
  savedLayoutsStorageKey,
  helpVisibleStorageKey
];
const maxUndoSteps = 100;
const developerToolsEnabled = app.dataset.devToolsEnabled === "true";
const roleNames = ["top", "jungle", "mid", "bot", "support"];
const drawingColor = "#f4f7ff";
const drawingLineWidth = 5;
const spellSizeRatio = 0.5;

let hoveredCoordinates = null;
let pointerX = 0;
let pointerY = 0;
let penActive = false;
let eraserActive = false;
let wardActive = false;
let textActive = false;
let pingsActive = false;
let isErasing = false;
let currentStroke = null;
let strokes = [];
let spellNames = [];
let selectedSpell = null;
let spellEraseActive = false;

let championNames = [];
let championSettings = new Map();
let selectedIndex = 0;
const undoStack = [];
const redoStack = [];

const teamPositions = [
  { team: "red", role: "top", x: 0.2135, y: 0.1042 },
  { team: "red", role: "jungle", x: 0.4954, y: 0.2270 },
  { team: "red", role: "mid", x: 0.5502, y: 0.4649 },
  { team: "red", role: "bot", x: 0.8491, y: 0.7533 },
  { team: "red", role: "support", x: 0.9224, y: 0.8269 },
  { team: "blue", role: "top", x: 0.1193, y: 0.2039 },
  { team: "blue", role: "jungle", x: 0.2282, y: 0.4772 },
  { team: "blue", role: "mid", x: 0.4498, y: 0.5297 },
  { team: "blue", role: "bot", x: 0.7718, y: 0.8267 },
  { team: "blue", role: "support", x: 0.8452, y: 0.9011 }
];

async function loadChampions() {
  try {
    const response = await fetch("/map/static/champions.json");
    const entries = await response.json();
    championNames = entries.map(entry => typeof entry === "string" ? entry : entry.name);
    championSettings = new Map(entries.map(entry => {
      const name = typeof entry === "string" ? entry : entry.name;
      const roles = Object.fromEntries(roleNames.map(role => [
        role,
        typeof entry === "string" ? true : Boolean(entry[role])
      ]));
      return [name, roles];
    }));
    if (!developerToolsEnabled) loadLocalChampionSettings();
    renderChampionSettings();
    restoreLayout();
    randomTeamsBtn.disabled = false;
    loadSpells();
  } catch (err) {
    console.error("Could not load champions:", err);
  }
}

async function loadSpells() {
  try {
    const response = await fetch("/map/api/spells");
    spellNames = await response.json();
    if (spellNames.length) {
      const randomSpell = spellNames[Math.floor(Math.random() * spellNames.length)];
      const icon = document.getElementById("spellsBtnIcon");
      if (icon) {
        icon.src = `/map/static/spells/${encodeURIComponent(randomSpell)}.png`;
        icon.classList.remove("hidden");
      }
    }
    renderSpellChoices();
  } catch (err) {
    console.error("Could not load spells:", err);
  }
}

async function importMatch() {
  const url = matchLink.value.trim();
  if (!url) {
    showCopyNotice("paste an OP.GG match link");
    return;
  }
  showCopyNotice("importing match...", 0);
  importMatchBtn.disabled = true;
  try {
    const response = await fetch("/map/api/import-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Import failed");
    recordUndoState();
    restoreLayoutState(result);
    matchLink.value = "";
    showCopyNotice("match imported");
  } catch (error) {
    showCopyNotice(error.message);
  } finally {
    importMatchBtn.disabled = false;
  }
}

importMatchBtn.addEventListener("click", importMatch);
matchLink.addEventListener("paste", () => setTimeout(importMatch, 0));
matchImport.addEventListener("dragover", event => {
  event.preventDefault();
  matchImport.classList.add("drag-over");
});
matchImport.addEventListener("dragleave", () => matchImport.classList.remove("drag-over"));
matchImport.addEventListener("drop", event => {
  event.preventDefault();
  matchImport.classList.remove("drag-over");
  const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
  if (url) {
    matchLink.value = url.trim();
    importMatch();
  }
});

function renderSpellChoices() {
  spellsDropdown.innerHTML = "";
  const removeChoice = document.createElement("button");
  removeChoice.className = "spell-choice spell-remove-choice";
  removeChoice.type = "button";
  removeChoice.title = "Remove a spell";
  removeChoice.setAttribute("aria-label", "Remove a spell");
  removeChoice.innerHTML = "&#128465;";
  removeChoice.addEventListener("click", () => {
    selectedSpell = null;
    spellEraseActive = true;
    penActive = false;
    eraserActive = false;
    wardActive = false;
    textActive = false;
    updateToolActiveStates();
    spellsBtn.classList.add("active");
    spellsBtn.title = "Remove a spell (S)";
    spellsDropdown.querySelectorAll(".spell-choice").forEach(item => item.classList.remove("active"));
    removeChoice.classList.add("active");
    setSpellMenuOpen(false);
    updateSpellTargets();
  });
  spellsDropdown.appendChild(removeChoice);

  if (!spellNames.length) {
    const empty = document.createElement("span");
    empty.textContent = "Add PNGs to static/spells";
    spellsDropdown.appendChild(empty);
    return;
  }

  spellNames.forEach(name => {
    const choice = document.createElement("button");
    choice.className = "spell-choice";
    choice.type = "button";
    choice.title = `Select ${name}`;
    choice.innerHTML = `<img src="/map/static/spells/${encodeURIComponent(name)}.png" alt="${name}">`;
    choice.addEventListener("click", () => {
      selectedSpell = name;
      spellEraseActive = false;
      penActive = false;
      eraserActive = false;
      wardActive = false;
      textActive = false;
      updateToolActiveStates();
      spellsBtn.classList.add("active");
      spellsBtn.title = `Selected spell: ${name} (S)`;
      spellsDropdown.querySelectorAll(".spell-choice").forEach(item =>
        item.classList.toggle("active", item === choice)
      );
      setSpellMenuOpen(false);
      updateSpellTargets();
    });
    spellsDropdown.appendChild(choice);
  });
}

function updateSpellTargets() {
  document.querySelectorAll(".spell-slot").forEach(slot =>
    slot.classList.toggle("spell-target", Boolean(selectedSpell || spellEraseActive))
  );
}

function deactivateSpellTool() {
  selectedSpell = null;
  spellEraseActive = false;
  spellsBtn.classList.remove("active");
  spellsBtn.title = "Spells (S)";
  spellsDropdown.querySelectorAll(".spell-choice").forEach(item => item.classList.remove("active"));
  updateSpellTargets();
  setSpellMenuOpen(false);
}

function loadLocalChampionSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(championSettingsStorageKey) || "{}");
    championSettings.forEach((roles, name) => {
      if (saved[name]) championSettings.set(name, { ...roles, ...saved[name] });
    });
  } catch (err) {
    console.error("Could not restore champion settings:", err);
  }
}

function saveChampionSettings() {
  const saved = Object.fromEntries(championSettings);
  localStorage.setItem(championSettingsStorageKey, JSON.stringify(saved));
  if (developerToolsEnabled) saveChampionSettingsToServer(saved);
}

async function saveChampionSettingsToServer(saved) {
  try {
    await fetch("/map/api/champions/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(championNames.map(name => ({ name, ...saved[name] })))
    });
  } catch (err) {
    console.error("Could not save champion settings to the server:", err);
  }
}

function renderChampionSettings() {
  championSettingsList.innerHTML = "";
  championNames.forEach(name => {
    const row = document.createElement("div");
    row.className = "champion-setting";

    const title = document.createElement("span");
    title.className = "champion-setting-name";
    title.textContent = name;
    row.appendChild(title);

    const roles = document.createElement("div");
    roles.className = "role-options";
    roleNames.forEach(role => {
      const label = document.createElement("label");
      label.className = "role-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `${name} ${role}`);
      checkbox.checked = championSettings.get(name)[role];
      checkbox.addEventListener("change", () => {
        championSettings.get(name)[role] = checkbox.checked;
        saveChampionSettings();
      });
      label.appendChild(checkbox);
      roles.appendChild(label);
    });
    row.appendChild(roles);
    championSettingsList.appendChild(row);
  });
}

function normalizeChampionSearch(str) {
  return str.toLowerCase().replace(/['\s.]/g, "");
}

function championAcronym(name) {
  return name
    .split(/\s+/)
    .map(word => word.replace(/[^a-zA-Z]/g, "").charAt(0))
    .join("")
    .toLowerCase();
}

function filteredChampions() {
  const raw = search.value.trim();
  const q = normalizeChampionSearch(raw);
  if (!q) return championNames.slice();
  return championNames.filter(name =>
    normalizeChampionSearch(name).startsWith(q) || championAcronym(name) === q
  );
}

function renderSuggestions() {
  const results = filteredChampions();
  suggestions.innerHTML = "";
  selectedIndex = 0;

  if (!results.length) {
    suggestions.classList.add("hidden");
    return;
  }

  results.forEach((name, i) => {
    const div = document.createElement("div");
    div.className = "suggestion" + (i === 0 ? " selected" : "");

    const icon = document.createElement("img");
    icon.className = "suggestion-icon";
    icon.src = championIconUrl(name);
    icon.alt = "";
    icon.draggable = false;
    div.appendChild(icon);

    const label = document.createElement("span");
    label.textContent = name;
    div.appendChild(label);

    div.addEventListener("mousedown", e => {
      e.preventDefault();
      placeChampion(name);
    });
    suggestions.appendChild(div);
  });

  suggestions.classList.remove("hidden");
}

function highlightSuggestion() {
  [...suggestions.children].forEach((el, i) => {
    el.classList.toggle("selected", i === selectedIndex);
  });
}

function placeSelected() {
  const results = filteredChampions();
  if (results.length) placeChampion(results[selectedIndex] || results[0]);
}

function placeChampion(name, savedState = {}, focusSearch = true, save = true) {
  if (!Object.keys(savedState).length) recordUndoState();

  const savedSpells = [...(savedState.spells || [null, null])].slice(0, 2);
  const savedUsedSpells = [...(savedState.usedSpells || [false, false])].slice(0, 2);
  if (savedSpells[0] && savedSpells[0] === savedSpells[1]) savedSpells[1] = null;

  const img = document.createElement("img");
  img.className = "map-item";
  img.src = championIconUrl(name);
  img.alt = name;
  img.title = `${name} — click: border, drag: move, right click: remove`;
  img.draggable = false;
  img.dataset.champion = name;
  img.dataset.border = String(savedState.border || 0);

  const mousePoint = riftPoint({ clientX: pointerX, clientY: pointerY });
  const defaultX = mousePoint ? mousePoint.x : 0.5;
  const defaultY = mousePoint ? mousePoint.y : 0.5;

  img.dataset.x = String(savedState.x ?? defaultX);
  img.dataset.y = String(savedState.y ?? defaultY);
  img.dataset.spells = JSON.stringify(savedSpells);
  applyBorder(img);

  img.addEventListener("contextmenu", e => {
    if (penActive || eraserActive) return;
    e.preventDefault();
    e.stopPropagation();
    recordUndoState();
    img._spellSlots?.forEach(slot => slot.remove());
    img.remove();
    saveLayout();
  });

  setupDragging(img);
  img.addEventListener("click", e => {
    if (penActive || eraserActive) return;
    if (selectedSpell || spellEraseActive) {
      placeSpellOnChampion(img, e);
      img.dataset.wasDragged = "";
      return;
    }
    // Click only cycles if this was not a drag.
    if (!img.dataset.wasDragged) cycleBorder(img);
    img.dataset.wasDragged = "";
  });

  layer.appendChild(img);
  createSpellSlots(img, savedSpells, savedUsedSpells);
  positionItem(img);
  if (save) saveLayout();
  search.value = "";
  suggestions.classList.add("hidden");
  if (focusSearch) search.focus();
}

function createSpellSlots(champion, savedSpells, savedUsedSpells = [false, false]) {
  champion._spellSlots = [];
  champion.dataset.usedSpells = JSON.stringify(savedUsedSpells);
  [0, 1].forEach(index => {
    const slot = document.createElement("button");
    slot.className = "spell-slot";
    slot.type = "button";
    slot.dataset.index = String(index);
    slot.title = `Set ${index === 0 ? "top" : "bottom"} spell`;
    slot.addEventListener("click", event => {
      if (penActive || eraserActive) return;
      event.stopPropagation();
      if (selectedSpell || spellEraseActive) {
        setChampionSpell(champion, index, spellEraseActive ? null : selectedSpell);
      } else if (!penActive && !eraserActive) {
        toggleSpellUsed(champion, index);
      }
    });
    layer.appendChild(slot);
    champion._spellSlots.push(slot);
    setChampionSpell(champion, index, savedSpells[index], false, savedUsedSpells[index]);
  });
}

function toggleSpellUsed(champion, index) {
  const spells = JSON.parse(champion.dataset.spells || "[null,null]");
  if (!spells[index]) return;
  const usedSpells = JSON.parse(champion.dataset.usedSpells || "[false,false]");
  recordUndoState();
  usedSpells[index] = !usedSpells[index];
  champion.dataset.usedSpells = JSON.stringify(usedSpells);
  applySpellUsedState(champion, index);
  saveLayout();
}

function applySpellUsedState(champion, index) {
  const slot = champion._spellSlots?.[index];
  if (!slot) return;
  const usedSpells = JSON.parse(champion.dataset.usedSpells || "[false,false]");
  const isUsed = Boolean(usedSpells[index]);
  slot.classList.toggle("used", isUsed);
}

function setChampionSpell(champion, index, spellName, save = true, isUsed = false) {
  if (!champion._spellSlots?.[index]) return;
  const spells = JSON.parse(champion.dataset.spells || "[null,null]");
  const usedSpells = JSON.parse(champion.dataset.usedSpells || "[false,false]");
  if (spellName && spells.some((spell, spellIndex) =>
    spell === spellName && spellIndex !== index
  )) return;
  if (save && (spells[index] !== spellName || usedSpells[index] !== isUsed)) recordUndoState();
  spells[index] = spellName || null;
  usedSpells[index] = isUsed;
  champion.dataset.spells = JSON.stringify(spells);
  champion.dataset.usedSpells = JSON.stringify(usedSpells);
  const slot = champion._spellSlots[index];
  slot.innerHTML = spellName
    ? `<img src="/map/static/spells/${encodeURIComponent(spellName)}.png" alt="${spellName}">`
    : "";
  slot.classList.toggle("has-spell", Boolean(spellName));
  slot.classList.toggle("spell-target", Boolean(selectedSpell || spellEraseActive));
  applySpellUsedState(champion, index);
  if (save) saveLayout();
}

function placeSpellOnChampion(champion, event) {
  if (!selectedSpell && !spellEraseActive) return;
  const rect = champion.getBoundingClientRect();
  const preferredIndex = event.clientY < rect.top + rect.height / 2 ? 0 : 1;
  const spells = JSON.parse(champion.dataset.spells || "[null,null]");
  const index = spells[preferredIndex] ? (spells[1 - preferredIndex] ? preferredIndex : 1 - preferredIndex) : preferredIndex;
  setChampionSpell(champion, index, spellEraseActive ? null : selectedSpell);
}

function positionSpellSlots(champion) {
  if (!champion._spellSlots) return;
  const mapRect = map.getBoundingClientRect();
  const championRect = champion.getBoundingClientRect();
  const size = championRect.width * spellSizeRatio;
  const gap = 4;
  const x = championRect.right - mapRect.left + size / 2 + gap;
  const centers = [
    championRect.top - mapRect.top + size / 2,
    championRect.bottom - mapRect.top - size / 2
  ];
  champion._spellSlots.forEach((slot, index) => {
    slot.style.left = `${x}px`;
    slot.style.top = `${centers[index]}px`;
    slot.style.width = `${size}px`;
    slot.style.height = `${size}px`;
  });
}

function setSpellMenuOpen(open, atPointer = false) {
  spellsDropdown.classList.toggle("hidden", !open);
  spellsBtn.setAttribute("aria-expanded", String(open));
  spellsDropdown.classList.toggle("pointer-positioned", atPointer);
  if (atPointer) {
    spellsDropdown.style.left = `${Math.min(pointerX, window.innerWidth - spellsDropdown.offsetWidth - 8)}px`;
    spellsDropdown.style.top = `${Math.min(pointerY + 12, window.innerHeight - spellsDropdown.offsetHeight - 8)}px`;
  } else {
    spellsDropdown.style.left = "";
    spellsDropdown.style.top = "";
  }
}

spellsBtn.addEventListener("click", () => {
  if (selectedSpell || spellEraseActive) {
    deactivateSpellTool();
    return;
  }
  setSpellMenuOpen(spellsDropdown.classList.contains("hidden"));
});
document.addEventListener("click", event => {
  if (!event.target.closest(".spells-menu")) {
    setSpellMenuOpen(false);
  }
});

function placeRandomTeams() {
  if (championNames.length < teamPositions.length) return;

  const assignments = assignRandomTeams();
  if (!assignments) {
    alert("Select enough champion roles to create two complete teams.");
    return;
  }

  recordUndoState();
  layer.innerHTML = "";
  teamPositions.forEach(position => {
    const champion = assignments.get(position);
    const savedState = {
      x: position.x,
      y: position.y,
      border: position.team === "red" ? 2 : 1
    };
    if (champion === "Nunu" && position.role === "mid") {
      savedState.spells = ["Ghost", "Cleanse"];
    }
    placeChampion(champion, savedState, false, false);
    const img = layer.lastElementChild;
    img.title = `${champion} — ${position.team} ${position.role}`;
  });
  saveLayout();
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function assignRandomTeams() {
  const candidatesFor = position => championNames.filter(name =>
    championSettings.get(name)?.[position.role] || (name === "Nunu" && position.role === "mid")
  );
  const orderedPositions = [...teamPositions].sort((left, right) =>
    candidatesFor(left).length - candidatesFor(right).length
  );
  const assignments = new Map();
  const usedChampions = new Set();

  function assign(positionIndex) {
    if (positionIndex === orderedPositions.length) return true;

    const position = orderedPositions[positionIndex];
    const candidates = shuffled(candidatesFor(position).filter(name =>
      !usedChampions.has(name)
    ));
    for (const champion of candidates) {
      usedChampions.add(champion);
      assignments.set(position, champion);
      if (assign(positionIndex + 1)) return true;
      usedChampions.delete(champion);
      assignments.delete(position);
    }
    return false;
  }

  return assign(0) ? assignments : null;
}

settingsBtn.addEventListener("click", () => {
  const isHidden = settingsPanel.classList.toggle("hidden");
  settingsPanel.setAttribute("aria-hidden", String(isHidden));
  settingsBtn.classList.toggle("active", !isHidden);
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
  settingsPanel.setAttribute("aria-hidden", "true");
  settingsBtn.classList.remove("active");
});

if (exportDataBtn) exportDataBtn.addEventListener("click", exportAllData);
if (importDataBtn && importDataInput) {
  importDataBtn.addEventListener("click", () => importDataInput.click());
  importDataInput.addEventListener("change", () => {
    const [file] = importDataInput.files;
    importAllData(file);
    importDataInput.value = "";
  });
}

function toggleSavedLayoutsPanel() {
  const isHidden = savedLayoutsPanel.classList.toggle("hidden");
  savedLayoutsPanel.setAttribute("aria-hidden", String(isHidden));
  savedLayoutsBtn.classList.toggle("active", !isHidden);
  if (!isHidden) renderSavedLayouts();
}

savedLayoutsBtn.addEventListener("click", toggleSavedLayoutsPanel);
closeSavedLayoutsBtn.addEventListener("click", () => {
  savedLayoutsPanel.classList.add("hidden");
  savedLayoutsPanel.setAttribute("aria-hidden", "true");
  savedLayoutsBtn.classList.remove("active");
});

function positionItem(img) {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const x = riftRect.left - mapRect.left + Number(img.dataset.x) * riftRect.width;
  const y = riftRect.top - mapRect.top + Number(img.dataset.y) * riftRect.height;

  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  img.style.width = `${baseItemSize * riftScale * 5}px`;
  img.style.height = `${baseItemSize * riftScale * 5}px`;
  positionSpellSlots(img);
}

const wardColors = ["neutral", "blue", "red"];
const baseWardSize = 72;
const basePingSize = 64;
const pingDragThreshold = 12;
const pingNames = [
  "on my way", "all in", "assist me", "need vision", "enemy missing",
  "enemy vision", "retreat", "push"
];

function placeWard(x, y, color = "neutral", recordUndo = true) {
  if (recordUndo) recordUndoState();

  const ward = document.createElement("div");
  ward.className = `map-ward color-${color}`;
  ward.dataset.x = String(x);
  ward.dataset.y = String(y);
  ward.dataset.color = color;

  const dot = document.createElement("div");
  dot.className = "map-ward-dot";
  ward.appendChild(dot);

  ward.addEventListener("contextmenu", e => {
    if (penActive || eraserActive) return;
    e.preventDefault();
    e.stopPropagation();
    recordUndoState();
    ward.remove();
    saveLayout();
  });

  ward.addEventListener("click", e => {
    if (penActive || eraserActive) return;
    if (ward.dataset.wasDragged) {
      ward.dataset.wasDragged = "";
      return;
    }
    e.stopPropagation();
    const currentColor = ward.dataset.color || "neutral";
    const nextIndex = (wardColors.indexOf(currentColor) + 1) % wardColors.length;
    const nextColor = wardColors[nextIndex];
    recordUndoState();
    ward.className = `map-ward color-${nextColor}`;
    ward.dataset.color = nextColor;
    saveLayout();
  });

  setupWardDragging(ward);

  layer.appendChild(ward);
  positionWard(ward);
  if (recordUndo) saveLayout();
}

function positionWard(ward) {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const x = riftRect.left - mapRect.left + Number(ward.dataset.x) * riftRect.width;
  const y = riftRect.top - mapRect.top + Number(ward.dataset.y) * riftRect.height;

  const size = baseWardSize * riftScale * 5;
  ward.style.left = `${x}px`;
  ward.style.top = `${y}px`;
  ward.style.width = `${size}px`;
  ward.style.height = `${size}px`;

  const dot = ward.querySelector(".map-ward-dot");
  if (dot) {
    const dotSize = Math.max(4, Math.round(10 * riftScale * 5));
    dot.style.width = `${dotSize}px`;
    dot.style.height = `${dotSize}px`;
  }
}

function placePing(x, y, name = "generic", recordUndo = true) {
  if (recordUndo) recordUndoState();

  const ping = document.createElement("img");
  ping.className = "map-ping";
  ping.src = `/map/static/pings/${encodeURIComponent(name)}.webp`;
  ping.alt = name;
  ping.title = `${name} ping - right click to remove`;
  ping.draggable = false;
  ping.dataset.x = String(x);
  ping.dataset.y = String(y);
  ping.dataset.ping = name;
  ping.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    recordUndoState();
    ping.remove();
    saveLayout();
  });

  layer.appendChild(ping);
  positionPing(ping);
  if (recordUndo) saveLayout();
}

function positionPing(ping) {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const x = riftRect.left - mapRect.left + Number(ping.dataset.x) * riftRect.width;
  const y = riftRect.top - mapRect.top + Number(ping.dataset.y) * riftRect.height;
  const size = basePingSize * riftScale * 5;

  ping.style.left = `${x}px`;
  ping.style.top = `${y}px`;
  ping.style.width = `${size}px`;
  ping.style.height = `${size}px`;
}

function placeText(x, y, content = "", scale = 1, recordUndo = true) {
  if (recordUndo) recordUndoState();

  const textEl = document.createElement("div");
  textEl.className = "map-text";
  textEl.dataset.x = String(x);
  textEl.dataset.y = String(y);
  textEl.dataset.scale = String(scale || 1);
  textEl.dataset.text = content;
  textEl.textContent = content;

  const handle = document.createElement("div");
  handle.className = "map-text-handle";
  handle.title = "Drag to resize";
  textEl.appendChild(handle);

  handle.addEventListener("pointerdown", e => {
    if (penActive || eraserActive) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startScale = Number(textEl.dataset.scale || 1);
    recordUndoState();
    handle.setPointerCapture(e.pointerId);

    const onPointerMove = pe => {
      if (!handle.hasPointerCapture(pe.pointerId)) return;
      const dx = pe.clientX - startX;
      const newScale = Math.max(0.4, Math.min(5, startScale + dx / 100));
      textEl.dataset.scale = String(newScale);
      positionText(textEl);
    };

    const onPointerUp = pe => {
      if (handle.hasPointerCapture(pe.pointerId)) {
        handle.releasePointerCapture(pe.pointerId);
      }
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      saveLayout();
    };

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
  });

  textEl.addEventListener("wheel", e => {
    if (penActive || eraserActive) return;
    e.preventDefault();
    e.stopPropagation();
    recordUndoState();
    const currentScale = Number(textEl.dataset.scale || 1);
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newScale = Math.max(0.4, Math.min(5, currentScale + delta));
    textEl.dataset.scale = String(newScale);
    positionText(textEl);
    saveLayout();
  });

  textEl.addEventListener("contextmenu", e => {
    if (penActive || eraserActive) return;
    e.preventDefault();
    e.stopPropagation();
    recordUndoState();
    textEl.remove();
    saveLayout();
  });

  textEl.addEventListener("dblclick", e => {
    if (penActive || eraserActive) return;
    e.stopPropagation();
    editMapText(textEl);
  });

  setupTextDragging(textEl);

  layer.appendChild(textEl);
  positionText(textEl);
  if (recordUndo) saveLayout();
  return textEl;
}

function positionText(textEl) {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const x = riftRect.left - mapRect.left + Number(textEl.dataset.x) * riftRect.width;
  const y = riftRect.top - mapRect.top + Number(textEl.dataset.y) * riftRect.height;
  const scale = Number(textEl.dataset.scale || 1);

  textEl.style.left = `${x}px`;
  textEl.style.top = `${y}px`;
  const fontSize = Math.max(10, Math.round(16 * riftScale * 5 * scale));
  textEl.style.fontSize = `${fontSize}px`;
}

function createTextAt(x, y, scale = 1) {
  setTextActive(false);
  const textarea = document.createElement("textarea");
  textarea.className = "map-text-input";
  textarea.dataset.x = String(x);
  textarea.dataset.y = String(y);
  textarea.dataset.scale = String(scale || 1);
  textarea.placeholder = "Type text...";

  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const screenX = riftRect.left - mapRect.left + x * riftRect.width;
  const screenY = riftRect.top - mapRect.top + y * riftRect.height;
  textarea.style.left = `${screenX}px`;
  textarea.style.top = `${screenY}px`;
  const fontSize = Math.max(10, Math.round(16 * riftScale * 5 * scale));
  textarea.style.fontSize = `${fontSize}px`;

  function autoSize() {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    const tempSpan = document.createElement("span");
    tempSpan.style.font = getComputedStyle(textarea).font;
    tempSpan.style.whiteSpace = "pre";
    tempSpan.style.visibility = "hidden";
    tempSpan.style.position = "absolute";
    const longestLine = textarea.value.split("\n").reduce((a, b) => a.length > b.length ? a : b, "");
    tempSpan.textContent = longestLine || "M";
    document.body.appendChild(tempSpan);
    textarea.style.width = `${Math.max(60, tempSpan.offsetWidth + 20)}px`;
    tempSpan.remove();
  }

  textarea.addEventListener("input", autoSize);

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    const val = textarea.value.trim();
    textarea.remove();
    if (val) {
      placeText(x, y, val, scale, true);
    }
  }

  textarea.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      committed = true;
      textarea.remove();
    }
  });

  textarea.addEventListener("blur", commit);

  layer.appendChild(textarea);
  setTimeout(() => {
    autoSize();
    textarea.focus();
  }, 0);
}

function editMapText(textEl) {
  const x = Number(textEl.dataset.x);
  const y = Number(textEl.dataset.y);
  const scale = Number(textEl.dataset.scale || 1);
  const currentVal = textEl.dataset.text || "";
  textEl.remove();

  const textarea = document.createElement("textarea");
  textarea.className = "map-text-input";
  textarea.value = currentVal;
  textarea.dataset.x = String(x);
  textarea.dataset.y = String(y);
  textarea.dataset.scale = String(scale);

  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const riftScale = rift.naturalWidth ? riftRect.width / rift.naturalWidth : 1;
  const screenX = riftRect.left - mapRect.left + x * riftRect.width;
  const screenY = riftRect.top - mapRect.top + y * riftRect.height;
  textarea.style.left = `${screenX}px`;
  textarea.style.top = `${screenY}px`;
  const fontSize = Math.max(10, Math.round(16 * riftScale * 5 * scale));
  textarea.style.fontSize = `${fontSize}px`;

  function autoSize() {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    const tempSpan = document.createElement("span");
    tempSpan.style.font = getComputedStyle(textarea).font;
    tempSpan.style.whiteSpace = "pre";
    tempSpan.style.visibility = "hidden";
    tempSpan.style.position = "absolute";
    const longestLine = textarea.value.split("\n").reduce((a, b) => a.length > b.length ? a : b, "");
    tempSpan.textContent = longestLine || "M";
    document.body.appendChild(tempSpan);
    textarea.style.width = `${Math.max(60, tempSpan.offsetWidth + 20)}px`;
    tempSpan.remove();
  }

  textarea.addEventListener("input", autoSize);

  let committed = false;
  function commit() {
    if (committed) return;
    committed = true;
    const val = textarea.value.trim();
    textarea.remove();
    if (val) {
      placeText(x, y, val, scale, true);
    } else {
      recordUndoState();
      saveLayout();
    }
  }

  textarea.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      committed = true;
      textarea.remove();
      placeText(x, y, currentVal, scale, false);
    }
  });

  textarea.addEventListener("blur", commit);

  layer.appendChild(textarea);
  setTimeout(() => {
    autoSize();
    textarea.focus();
  }, 0);
}

function setupTextDragging(textEl) {
  let dragging = false;
  let startX, startY, startLeft, startTop;

  textEl.addEventListener("pointerdown", e => {
    if (penActive || eraserActive) return;
    if (e.button !== 0) return;

    e.stopPropagation();
    dragging = false;
    textEl.dataset.undoRecorded = "";
    startX = e.clientX;
    startY = e.clientY;
    startLeft = Number(textEl.dataset.x);
    startTop = Number(textEl.dataset.y);
    textEl.setPointerCapture(e.pointerId);
  });

  textEl.addEventListener("pointermove", e => {
    if (!textEl.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragging = true;
      if (!textEl.dataset.undoRecorded) {
        recordUndoState();
        textEl.dataset.undoRecorded = "1";
      }
      textEl.dataset.wasDragged = "1";
      textEl.classList.add("dragging");
    }

    if (dragging) {
      const riftRect = rift.getBoundingClientRect();
      textEl.dataset.x = String(startLeft + dx / riftRect.width);
      textEl.dataset.y = String(startTop + dy / riftRect.height);
      positionText(textEl);
    }
  });

  textEl.addEventListener("pointerup", e => {
    if (textEl.hasPointerCapture(e.pointerId)) textEl.releasePointerCapture(e.pointerId);
    textEl.classList.remove("dragging");

    if (!dragging) textEl.dataset.wasDragged = "";
    if (dragging) saveLayout();
    textEl.dataset.undoRecorded = "";
  });
}

function repositionItems() {
  layer.querySelectorAll(".map-item").forEach(positionItem);
  layer.querySelectorAll(".map-ward").forEach(positionWard);
  layer.querySelectorAll(".map-ping").forEach(positionPing);
  layer.querySelectorAll(".map-text").forEach(positionText);
  positionWatermark();
  drawStrokes();
}

function positionWatermark() {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const inset = 8;

  watermark.style.left = `${riftRect.right - mapRect.left - watermark.offsetWidth - inset}px`;
  watermark.style.top = `${riftRect.bottom - mapRect.top - watermark.offsetHeight - inset}px`;
}

function riftPoint(event) {
  const mapRect = map.getBoundingClientRect();
  const riftRect = rift.getBoundingClientRect();
  const x = (event.clientX - riftRect.left) / riftRect.width;
  const y = (event.clientY - riftRect.top) / riftRect.height;

  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return {
    x,
    y,
    mapX: riftRect.left - mapRect.left + x * riftRect.width,
    mapY: riftRect.top - mapRect.top + y * riftRect.height
  };
}

function drawStrokes() {
  const mapRect = map.getBoundingClientRect();
  drawingCanvas.width = Math.max(1, Math.round(mapRect.width));
  drawingCanvas.height = Math.max(1, Math.round(mapRect.height));
  drawingContext.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  drawingContext.strokeStyle = drawingColor;
  drawingContext.lineWidth = drawingLineWidth;
  drawingContext.lineCap = "round";
  drawingContext.lineJoin = "round";

  const riftRect = rift.getBoundingClientRect();
  [...strokes, ...(currentStroke ? [currentStroke] : [])].forEach(stroke => {
    if (!stroke.length) return;
    drawingContext.beginPath();
    stroke.forEach((point, index) => {
      const x = riftRect.left - mapRect.left + point.x * riftRect.width;
      const y = riftRect.top - mapRect.top + point.y * riftRect.height;
      if (index === 0) drawingContext.moveTo(x, y);
      else drawingContext.lineTo(x, y);
    });
    drawingContext.stroke();
  });
}

function setPenActive(active) {
  penActive = active;
  if (active) {
    deactivateSpellTool();
    eraserActive = false;
    wardActive = false;
    textActive = false;
    pingsActive = false;
  }
  updateToolActiveStates();
}

function setEraserActive(active) {
  eraserActive = active;
  if (active) {
    deactivateSpellTool();
    penActive = false;
    wardActive = false;
    textActive = false;
    pingsActive = false;
  }
  updateToolActiveStates();
}

function setWardActive(active) {
  wardActive = active;
  if (active) {
    deactivateSpellTool();
    penActive = false;
    eraserActive = false;
    textActive = false;
    pingsActive = false;
  }
  updateToolActiveStates();
}

function setTextActive(active) {
  textActive = active;
  if (active) {
    deactivateSpellTool();
    penActive = false;
    eraserActive = false;
    wardActive = false;
    pingsActive = false;
  }
  updateToolActiveStates();
}

function setPingsActive(active) {
  pingsActive = active;
  if (active) {
    deactivateSpellTool();
    penActive = false;
    eraserActive = false;
    wardActive = false;
    textActive = false;
  }
  updateToolActiveStates();
}

function updateToolActiveStates() {
  drawingCanvas.classList.toggle("pen-active", penActive);
  drawingCanvas.classList.toggle("eraser-active", eraserActive);
  map.classList.toggle("ward-active", wardActive);
  map.classList.toggle("text-active", textActive);
  map.classList.toggle("pings-active", pingsActive);

  if (penBtn) {
    penBtn.classList.toggle("active", penActive);
    penBtn.setAttribute("aria-pressed", String(penActive));
  }
  if (eraserBtn) {
    eraserBtn.classList.toggle("active", eraserActive);
    eraserBtn.setAttribute("aria-pressed", String(eraserActive));
  }
  if (wardBtn) {
    wardBtn.classList.toggle("active", wardActive);
    wardBtn.setAttribute("aria-pressed", String(wardActive));
  }
  if (textBtn) {
    textBtn.classList.toggle("active", textActive);
    textBtn.setAttribute("aria-pressed", String(textActive));
  }
  if (pingsBtn) {
    pingsBtn.classList.toggle("active", pingsActive);
    pingsBtn.setAttribute("aria-pressed", String(pingsActive));
  }
}

function distanceToSegment(point, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);

  const position = Math.max(0, Math.min(1,
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  ));
  const nearestX = start.x + position * deltaX;
  const nearestY = start.y + position * deltaY;
  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

function eraseStrokeAt(point, recordUndo = true) {
  const riftRect = rift.getBoundingClientRect();
  const hitRadius = 24 / riftRect.width;
  let closestIndex = -1;
  let closestDistance = Infinity;

  strokes.forEach((stroke, strokeIndex) => {
    for (let pointIndex = 0; pointIndex < stroke.length; pointIndex++) {
      const start = stroke[pointIndex];
      const end = stroke[pointIndex + 1] || start;
      const distance = distanceToSegment(point, start, end);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = strokeIndex;
      }
    }
  });

  if (closestDistance > hitRadius || closestIndex < 0) return;
  if (recordUndo) recordUndoState();
  strokes.splice(closestIndex, 1);
  drawStrokes();
  saveLayout();
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create image")), type, quality);
  });
}

let copyNoticeTimer = null;

function showCopyNotice(message, duration = 1600) {
  if (copyNoticeTimer) {
    clearTimeout(copyNoticeTimer);
    copyNoticeTimer = null;
  }
  copyNotice.textContent = message;
  copyNotice.style.display = "block";
  copyNotice.style.left = `${Math.max(8, Math.min(pointerX + 12, window.innerWidth - copyNotice.offsetWidth - 8))}px`;
  copyNotice.style.top = `${Math.max(8, Math.min(pointerY + 12, window.innerHeight - copyNotice.offsetHeight - 8))}px`;
  if (duration > 0) {
    copyNoticeTimer = setTimeout(() => {
      copyNotice.style.display = "none";
      copyNoticeTimer = null;
    }, duration);
  }
}

function renderLayoutCanvas(itemScale = 5) {
  const canvas = document.createElement("canvas");
  canvas.width = rift.naturalWidth;
  canvas.height = rift.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(rift, 0, 0, canvas.width, canvas.height);

  const itemSize = baseItemSize * itemScale;
  const wardSize = baseWardSize * itemScale;

  layer.querySelectorAll(".map-ward").forEach(ward => {
    const x = Number(ward.dataset.x) * canvas.width;
    const y = Number(ward.dataset.y) * canvas.height;
    const color = ward.dataset.color || "neutral";

    let strokeColor = "rgba(255, 255, 255, 0.65)";
    let fillColor = "rgba(255, 255, 255, 0.12)";
    let dotColor = "#ffffff";

    if (color === "blue") {
      strokeColor = "rgba(50, 133, 255, 0.75)";
      fillColor = "rgba(50, 133, 255, 0.15)";
      dotColor = "#3285ff";
    } else if (color === "red") {
      strokeColor = "rgba(229, 57, 53, 0.75)";
      fillColor = "rgba(229, 57, 53, 0.15)";
      dotColor = "#e53935";
    }

    context.save();
    context.beginPath();
    context.arc(x, y, wardSize / 2, 0, Math.PI * 2);
    context.fillStyle = fillColor;
    context.fill();
    context.lineWidth = Math.max(1, wardSize / 64);
    context.strokeStyle = strokeColor;
    context.stroke();

    context.beginPath();
    context.arc(x, y, wardSize * (5 / baseWardSize), 0, Math.PI * 2);
    context.fillStyle = dotColor;
    context.fill();
    context.restore();
  });

  layer.querySelectorAll(".map-item").forEach(img => {
    const x = Number(img.dataset.x) * canvas.width;
    const y = Number(img.dataset.y) * canvas.height;
    const borderState = Number(img.dataset.border || 0);
    const borderColor = borderState === 1 ? "#3285ff"
      : borderState === 2 ? "#e53935" : "transparent";

    context.save();
    if (borderColor !== "transparent") {
      const glowBlur = Math.round(2 * itemScale);
      context.filter = `drop-shadow(0 0 0 ${borderColor}) drop-shadow(0 0 ${glowBlur}px ${borderColor}) drop-shadow(0 0 ${glowBlur}px ${borderColor})`;
      context.shadowColor = borderColor;
      context.shadowBlur = glowBlur * 2;
    }
    context.drawImage(img, x - itemSize / 2, y - itemSize / 2, itemSize, itemSize);
    context.restore();

    const spellSize = itemSize * spellSizeRatio;
    const spellValues = JSON.parse(img.dataset.spells || "[null,null]");
    const usedValues = JSON.parse(img.dataset.usedSpells || "[false,false]");
    const displayScale = rift.getBoundingClientRect().width / rift.naturalWidth;
    const spellX = x + itemSize / 2 + spellSize / 2 + 4 / displayScale;
    [0, 1].forEach(index => {
      if (!spellValues[index]) return;
      const spellY = y + (index === 0 ? -itemSize / 2 + spellSize / 2 : itemSize / 2 - spellSize / 2);
      const spellImage = img._spellSlots?.[index]?.querySelector("img");
      if (spellImage?.complete) {
        context.save();
        if (usedValues[index]) {
          context.filter = "brightness(40%) contrast(110%) saturate(80%)";
          context.globalAlpha = 0.7;
        }
        context.drawImage(spellImage, spellX - spellSize / 2, spellY - spellSize / 2, spellSize, spellSize);
        context.restore();
      }
    });
  });

  const riftScale = rift.getBoundingClientRect().width / rift.naturalWidth;
  context.strokeStyle = drawingColor;
  context.lineWidth = drawingLineWidth / riftScale;
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach(stroke => {
    if (!stroke.length) return;
    context.beginPath();
    stroke.forEach((point, index) => {
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  });

  layer.querySelectorAll(".map-text").forEach(textEl => {
    const x = Number(textEl.dataset.x) * canvas.width;
    const y = Number(textEl.dataset.y) * canvas.height;
    const content = textEl.dataset.text || "";
    if (!content) return;

    const scale = Number(textEl.dataset.scale || 1);
    const lines = content.split("\n");
    const fontSize = Math.round(16 * itemScale * scale);
    const lineHeight = Math.round(fontSize * 1.25);
    const totalHeight = lines.length * lineHeight;

    context.save();
    context.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(0, 0, 0, 0.85)";
    context.shadowBlur = Math.round(4 * itemScale);

    const maxLineWidth = Math.max(...lines.map(line => context.measureText(line).width), 0);
    const startX = x - (maxLineWidth / 2);
    const startY = y - (totalHeight / 2) + (lineHeight / 2);

    lines.forEach((line, index) => {
      context.fillText(line, startX, startY + index * lineHeight);
    });
    context.restore();
  });

  const watermarkFontSize = Math.round(24 * itemScale);
  const watermarkInset = Math.round(12 * itemScale);
  context.save();
  context.font = `700 ${watermarkFontSize}px system-ui, -apple-system, sans-serif`;
  context.fillStyle = "rgba(53, 204, 242, 0.5)";
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText("tool by twtv/saberkratia", canvas.width - watermarkInset, canvas.height - watermarkInset);
  context.restore();

  return canvas;
}

function getOptimizedExportCanvas(maxDimension = 2048) {
  const canvas = renderLayoutCanvas();
  if (canvas.width <= maxDimension && canvas.height <= maxDimension) {
    return canvas;
  }
  const exportCanvas = document.createElement("canvas");
  const scale = Math.min(maxDimension / canvas.width, maxDimension / canvas.height);
  exportCanvas.width = Math.round(canvas.width * scale);
  exportCanvas.height = Math.round(canvas.height * scale);
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";
  exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  return exportCanvas;
}

async function copyImageToClipboard(event) {
  if (!navigator.clipboard?.write || !window.ClipboardItem || !rift.complete) return;

  try {
    const exportCanvas = getOptimizedExportCanvas();

    let blob;
    try {
      blob = await canvasBlob(exportCanvas, "image/jpeg", 0.85);
      await navigator.clipboard.write([new ClipboardItem({ "image/jpeg": blob })]);
    } catch {
      blob = await canvasBlob(exportCanvas, "image/png");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    }

    showCopyNotice("image copied to clipboard");
    if (copyImageBtn) {
      copyImageBtn.textContent = "Copied image";
      setTimeout(() => { copyImageBtn.textContent = "Copy image"; }, 1200);
    }
  } catch (err) {
    console.error("Could not copy exported image:", err);
    if (copyImageBtn) {
      copyImageBtn.textContent = "Copy failed";
      setTimeout(() => { copyImageBtn.textContent = "Copy image"; }, 1200);
    }
  }
}

async function downloadImage() {
  if (!rift.complete) return;

  try {
    const exportCanvas = getOptimizedExportCanvas();
    const blob = await canvasBlob(exportCanvas, "image/jpeg", 0.85);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rift_map_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showCopyNotice("image downloaded");
  } catch (err) {
    console.error("Could not download image:", err);
    showCopyNotice("download failed");
  }
}

function cycleBorder(img) {
  let state = Number(img.dataset.border || 0);

  recordUndoState();
  state = (state + 1) % 3;
  img.dataset.border = String(state);
  applyBorder(img);
  saveLayout();
}

function applyBorder(img) {
  const state = Number(img.dataset.border || 0);
  img.classList.remove("border-red", "border-blue");
  if (state === 1) img.classList.add("border-blue");
  if (state === 2) img.classList.add("border-red");
}

function saveLayout() {
  const layout = [...layer.querySelectorAll(".map-item")].map(img => ({
    champion: img.dataset.champion,
    x: Number(img.dataset.x),
    y: Number(img.dataset.y),
    border: Number(img.dataset.border || 0),
    spells: JSON.parse(img.dataset.spells || "[null,null]"),
    usedSpells: JSON.parse(img.dataset.usedSpells || "[false,false]")
  }));
  const wards = [...layer.querySelectorAll(".map-ward")].map(ward => ({
    x: Number(ward.dataset.x),
    y: Number(ward.dataset.y),
    color: ward.dataset.color || "neutral"
  }));
  const texts = currentTexts();
  const pings = currentPings();
  localStorage.setItem(layoutStorageKey, JSON.stringify({ layout, wards, pings, texts, strokes }));
}

function currentLayout() {
  return [...layer.querySelectorAll(".map-item")].map(img => ({
    champion: img.dataset.champion,
    x: Number(img.dataset.x),
    y: Number(img.dataset.y),
    border: Number(img.dataset.border || 0),
    spells: JSON.parse(img.dataset.spells || "[null,null]"),
    usedSpells: JSON.parse(img.dataset.usedSpells || "[false,false]")
  }));
}

function currentWards() {
  return [...layer.querySelectorAll(".map-ward")].map(ward => ({
    x: Number(ward.dataset.x),
    y: Number(ward.dataset.y),
    color: ward.dataset.color || "neutral"
  }));
}

function currentTexts() {
  return [...layer.querySelectorAll(".map-text")].map(textEl => ({
    x: Number(textEl.dataset.x),
    y: Number(textEl.dataset.y),
    scale: Number(textEl.dataset.scale || 1),
    text: textEl.dataset.text || ""
  }));
}

function currentPings() {
  return [...layer.querySelectorAll(".map-ping")].map(ping => ({
    x: Number(ping.dataset.x),
    y: Number(ping.dataset.y),
    name: ping.dataset.ping || "generic"
  }));
}

function currentState() {
  return { layout: currentLayout(), wards: currentWards(), pings: currentPings(), texts: currentTexts(), strokes };
}

function exportAllData() {
  try {
    const data = {};
    backupStorageKeys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = JSON.parse(value);
    });

    const backup = { app: "riftplan", version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `riftplan_backup_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showCopyNotice("data exported");
  } catch (err) {
    console.error("Could not export data:", err);
    showCopyNotice("export failed");
  }
}

function importAllData(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed && typeof parsed === "object" && parsed.data ? parsed.data : parsed;
      if (!data || typeof data !== "object") throw new Error("Invalid backup file");

      let imported = 0;
      backupStorageKeys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          localStorage.setItem(key, JSON.stringify(data[key]));
          imported += 1;
        }
      });

      if (!imported) throw new Error("No recognized data in backup file");

      showCopyNotice("data imported, reloading...");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error("Could not import data:", err);
      showCopyNotice("import failed: invalid file");
    }
  };
  reader.onerror = () => {
    console.error("Could not read backup file:", reader.error);
    showCopyNotice("import failed: could not read file");
  };
  reader.readAsText(file);
}

function savedLayouts() {
  try {
    const saved = JSON.parse(localStorage.getItem(savedLayoutsStorageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (err) {
    console.error("Could not read saved layouts:", err);
    return [];
  }
}

function saveNamedLayout() {
  if (!rift.complete || !rift.naturalWidth) return;

  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = 220;
  thumbnailCanvas.height = 220;
  thumbnailCanvas.getContext("2d").drawImage(renderLayoutCanvas(10), 0, 0, 220, 220);

  const saved = savedLayouts();
  saved.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: new Date().toLocaleString(),
    state: JSON.parse(JSON.stringify(currentState())),
    thumbnail: thumbnailCanvas.toDataURL("image/jpeg", .72)
  });
  localStorage.setItem(savedLayoutsStorageKey, JSON.stringify(saved));
  renderSavedLayouts();
  showCopyNotice("layout saved successfully");
}

function renderSavedLayouts() {
  const saved = savedLayouts();
  savedLayoutsList.innerHTML = "";
  if (!saved.length) {
    const empty = document.createElement("p");
    empty.className = "saved-layout-empty";
    empty.textContent = "No saved layouts";
    savedLayoutsList.appendChild(empty);
    return;
  }

  saved.forEach(entry => {
    const row = document.createElement("div");
    row.className = "saved-layout";

    const loadButton = document.createElement("button");
    loadButton.className = "saved-layout-load";
    loadButton.type = "button";
    loadButton.title = `Load layout from ${entry.name}`;
    loadButton.innerHTML = `<img class="saved-layout-thumbnail" src="${entry.thumbnail}" alt=""><span class="saved-layout-name"></span>`;
    loadButton.querySelector(".saved-layout-name").textContent = entry.name;
    loadButton.addEventListener("click", () => restoreLayoutState(entry.state));

    const actions = document.createElement("div");
    actions.className = "saved-layout-actions";

    const renameButton = document.createElement("button");
    renameButton.className = "rename-layout-btn";
    renameButton.type = "button";
    renameButton.title = `Rename layout ${entry.name}`;
    renameButton.setAttribute("aria-label", `Rename layout ${entry.name}`);
    renameButton.innerHTML = "&#9998;";
    renameButton.addEventListener("click", () => {
      const newName = prompt("Rename layout:", entry.name)?.trim();
      if (!newName) return;
      const updated = savedLayouts().map(layout => layout.id === entry.id
        ? { ...layout, name: newName }
        : layout
      );
      localStorage.setItem(savedLayoutsStorageKey, JSON.stringify(updated));
      renderSavedLayouts();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-layout-btn";
    deleteButton.type = "button";
    deleteButton.title = `Delete layout from ${entry.name}`;
    deleteButton.setAttribute("aria-label", `Delete layout from ${entry.name}`);
    deleteButton.innerHTML = "&#128465;";
    deleteButton.addEventListener("click", () => {
      const remaining = savedLayouts().filter(layout => layout.id !== entry.id);
      localStorage.setItem(savedLayoutsStorageKey, JSON.stringify(remaining));
      renderSavedLayouts();
    });

    actions.append(renameButton, deleteButton);
    row.append(loadButton, actions);
    savedLayoutsList.appendChild(row);
  });
}

function recordUndoState() {
  const state = JSON.stringify(currentState());
  if (undoStack[undoStack.length - 1] === state) return;
  undoStack.push(state);
  redoStack.length = 0;
  if (undoStack.length > maxUndoSteps) undoStack.shift();
}

function restoreLayoutState(state) {
  layer.innerHTML = "";
  strokes = state.strokes || [];
  const layout = state.layout || [];
  const wards = state.wards || [];
  const pings = state.pings || [];
  const texts = state.texts || [];
  layout.forEach(entry => placeChampion(entry.champion, entry, false, false));
  wards.forEach(w => placeWard(w.x, w.y, w.color, false));
  pings.forEach(ping => placePing(ping.x, ping.y, ping.name, false));
  texts.forEach(t => placeText(t.x, t.y, t.text, t.scale || 1, false));
  drawStrokes();
  saveLayout();
}

function undoLastAction() {
  if (!undoStack.length) return;

  redoStack.push(JSON.stringify(currentState()));
  const previousState = JSON.parse(undoStack.pop());
  restoreLayoutState(previousState);
}

function redoLastAction() {
  if (!redoStack.length) return;

  undoStack.push(JSON.stringify(currentState()));
  const nextState = JSON.parse(redoStack.pop());
  restoreLayoutState(nextState);
}

function restoreLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutStorageKey) || "[]");
    const layout = Array.isArray(saved) ? saved : saved.layout || [];
    const wards = Array.isArray(saved) ? [] : saved.wards || [];
    const pings = Array.isArray(saved) ? [] : saved.pings || [];
    const texts = Array.isArray(saved) ? [] : saved.texts || [];
    strokes = Array.isArray(saved) ? [] : saved.strokes || [];
    layout
      .filter(entry => championNames.includes(entry.champion))
      .forEach(entry => placeChampion(entry.champion, entry, false, false));
    wards.forEach(w => placeWard(w.x, w.y, w.color, false));
    pings.forEach(ping => placePing(ping.x, ping.y, ping.name, false));
    texts.forEach(t => placeText(t.x, t.y, t.text, t.scale || 1, false));
    drawStrokes();
  } catch (err) {
    console.error("Could not restore champion layout:", err);
  }
}

function setupDragging(img) {
  let dragging = false;
  let startX, startY, startLeft, startTop;

  img.addEventListener("pointerdown", e => {
    if (penActive || eraserActive) return;
    if (e.button !== 0) return;

    e.preventDefault();
    dragging = false;
    img.dataset.undoRecorded = "";
    startX = e.clientX;
    startY = e.clientY;
    startLeft = Number(img.dataset.x);
    startTop = Number(img.dataset.y);
    img.setPointerCapture(e.pointerId);
  });

  img.addEventListener("pointermove", e => {
    if (!img.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragging = true;
      if (!img.dataset.undoRecorded) {
        recordUndoState();
        img.dataset.undoRecorded = "1";
      }
      img.dataset.wasDragged = "1";
      img.classList.add("dragging");
    }

    if (dragging) {
      const riftRect = rift.getBoundingClientRect();
      img.dataset.x = String(startLeft + dx / riftRect.width);
      img.dataset.y = String(startTop + dy / riftRect.height);
      positionItem(img);
    }
  });

  img.addEventListener("pointerup", e => {
    if (img.hasPointerCapture(e.pointerId)) img.releasePointerCapture(e.pointerId);
    img.classList.remove("dragging");

    // Let the click event know whether this was a drag.
    if (!dragging) img.dataset.wasDragged = "";
    if (dragging) saveLayout();
    img.dataset.undoRecorded = "";
  });
}

function setupWardDragging(ward) {
  let dragging = false;
  let startX, startY, startLeft, startTop;

  ward.addEventListener("pointerdown", e => {
    if (penActive || eraserActive) return;
    if (e.button !== 0) return;

    e.stopPropagation();
    dragging = false;
    ward.dataset.undoRecorded = "";
    startX = e.clientX;
    startY = e.clientY;
    startLeft = Number(ward.dataset.x);
    startTop = Number(ward.dataset.y);
    ward.setPointerCapture(e.pointerId);
  });

  ward.addEventListener("pointermove", e => {
    if (!ward.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragging = true;
      if (!ward.dataset.undoRecorded) {
        recordUndoState();
        ward.dataset.undoRecorded = "1";
      }
      ward.dataset.wasDragged = "1";
      ward.classList.add("dragging");
    }

    if (dragging) {
      const riftRect = rift.getBoundingClientRect();
      ward.dataset.x = String(startLeft + dx / riftRect.width);
      ward.dataset.y = String(startTop + dy / riftRect.height);
      positionWard(ward);
    }
  });

  ward.addEventListener("pointerup", e => {
    if (ward.hasPointerCapture(e.pointerId)) ward.releasePointerCapture(e.pointerId);
    ward.classList.remove("dragging");

    if (!dragging) ward.dataset.wasDragged = "";
    if (dragging) saveLayout();
    ward.dataset.undoRecorded = "";
  });
}

drawingCanvas.addEventListener("pointerdown", event => {
  if ((!penActive && !eraserActive) || event.button !== 0) return;
  const point = riftPoint(event);
  if (!point) return;

  event.preventDefault();
  if (eraserActive) {
    recordUndoState();
    isErasing = true;
    drawingCanvas.setPointerCapture(event.pointerId);
    eraseStrokeAt(point, false);
    return;
  }

  recordUndoState();
  currentStroke = [{ x: point.x, y: point.y }];
  drawingCanvas.setPointerCapture(event.pointerId);
  drawStrokes();
});

drawingCanvas.addEventListener("pointermove", event => {
  if (!drawingCanvas.hasPointerCapture(event.pointerId)) return;
  const point = riftPoint(event);
  if (!point) return;

  if (isErasing) {
    eraseStrokeAt(point, false);
    return;
  }

  if (currentStroke) {
    currentStroke.push({ x: point.x, y: point.y });
    drawStrokes();
  }
});

function finishStroke(event) {
  if (isErasing) {
    if (drawingCanvas.hasPointerCapture(event.pointerId)) {
      drawingCanvas.releasePointerCapture(event.pointerId);
    }
    isErasing = false;
    return;
  }
  if (!currentStroke) return;
  if (drawingCanvas.hasPointerCapture(event.pointerId)) {
    drawingCanvas.releasePointerCapture(event.pointerId);
  }
  if (currentStroke.length > 1) strokes.push(currentStroke);
  currentStroke = null;
  drawStrokes();
  saveLayout();
}

drawingCanvas.addEventListener("pointerup", finishStroke);
drawingCanvas.addEventListener("pointercancel", finishStroke);
penBtn.addEventListener("click", () => setPenActive(!penActive));
eraserBtn.addEventListener("click", () => setEraserActive(!eraserActive));
if (wardBtn) wardBtn.addEventListener("click", () => setWardActive(!wardActive));
if (textBtn) textBtn.addEventListener("click", () => setTextActive(!textActive));
if (pingsBtn) pingsBtn.addEventListener("click", () => setPingsActive(!pingsActive));

let pingGestureStart = null;
map.addEventListener("pointerdown", event => {
  if (!pingsActive || event.button !== 0) return;
  const point = riftPoint(event);
  if (!point) return;

  event.preventDefault();
  event.stopPropagation();
  pingGestureStart = { point, clientX: event.clientX, clientY: event.clientY };
  map.setPointerCapture(event.pointerId);
}, true);

map.addEventListener("pointerup", event => {
  if (!pingGestureStart || !map.hasPointerCapture(event.pointerId)) return;

  event.preventDefault();
  event.stopPropagation();
  const deltaX = event.clientX - pingGestureStart.clientX;
  const deltaY = event.clientY - pingGestureStart.clientY;
  const distance = Math.hypot(deltaX, deltaY);
  const name = distance < pingDragThreshold
    ? "generic"
    : pingNames[Math.round(Math.atan2(deltaY, deltaX) / (Math.PI / 4) + 8) % 8];
  placePing(pingGestureStart.point.x, pingGestureStart.point.y, name);
  pingGestureStart = null;
  map.releasePointerCapture(event.pointerId);
  setPingsActive(false);
}, true);

map.addEventListener("pointercancel", event => {
  if (!pingGestureStart || !map.hasPointerCapture(event.pointerId)) return;
  pingGestureStart = null;
  map.releasePointerCapture(event.pointerId);
}, true);

map.addEventListener("click", event => {
  if (event.target.closest(".map-item") || event.target.closest(".spell-slot") || event.target.closest(".map-ward") || event.target.closest(".map-text") || event.target.closest(".map-text-input")) return;
  const point = riftPoint(event);
  if (!point) return;

  if (wardActive) {
    placeWard(point.x, point.y, "neutral", true);
  } else if (textActive) {
    createTextAt(point.x, point.y);
  }
});

window.addEventListener("resize", repositionItems);
window.addEventListener("load", positionWatermark);
positionWatermark();
drawStrokes();

document.addEventListener("keydown", e => {
  const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;

  if (e.ctrlKey && e.key.toLowerCase() === "s") {
    if (!isInput) {
      e.preventDefault();
      saveNamedLayout();
      return;
    }
  }

  if (e.ctrlKey && e.key.toLowerCase() === "c" && !e.altKey && !e.shiftKey) {
    if (!isInput) {
      e.preventDefault();
      copyImageToClipboard();
      return;
    }
  }

  if (isInput) return;

  if (!e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (selectedSpell || spellEraseActive) deactivateSpellTool();
      else {
        const open = spellsDropdown.classList.contains("hidden");
        setSpellMenuOpen(open, open);
      }
      return;
    }
    if (e.key.toLowerCase() === "w") {
      e.preventDefault();
      setPenActive(!penActive);
      return;
    }
    if (e.key.toLowerCase() === "e") {
      e.preventDefault();
      setEraserActive(!eraserActive);
      return;
    }
    if (e.key === "4") {
      e.preventDefault();
      setWardActive(!wardActive);
      return;
    }
    if (e.key.toLowerCase() === "t") {
      e.preventDefault();
      setTextActive(!textActive);
      return;
    }
    if (e.key.toLowerCase() === "g") {
      e.preventDefault();
      setPingsActive(!pingsActive);
      return;
    }
    if (e.key.toLowerCase() === "b") {
      e.preventDefault();
      toggleSavedLayoutsPanel();
      return;
    }
    if (e.key.toLowerCase() === "i") {
      e.preventDefault();
      const isHelpVisible = localStorage.getItem(helpVisibleStorageKey) !== "false";
      setHelpVisible(!isHelpVisible);
      return;
    }
  }

  if (e.key === "Escape") {
    hideCustomContextMenu();
  }

  if (e.ctrlKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undoLastAction();
    return;
  }

  if (e.ctrlKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redoLastAction();
    return;
  }

  if (!developerToolsEnabled || e.key.toLowerCase() !== "c" || !e.altKey || !e.shiftKey) return;

  e.preventDefault();
  copyCurrentCoordinates();
});

map.addEventListener("pointermove", e => {
  if (!developerToolsEnabled) return;
  const riftRect = rift.getBoundingClientRect();
  const hoveredChampion = e.target.closest?.(".map-item");

  if (hoveredChampion) {
    const normalizedX = Number(hoveredChampion.dataset.x);
    const normalizedY = Number(hoveredChampion.dataset.y);
    const x = Math.round(normalizedX * rift.naturalWidth);
    const y = Math.round(normalizedY * rift.naturalHeight);

    hoveredCoordinates = {
      x,
      y,
      normalizedX: normalizedX.toFixed(4),
      normalizedY: normalizedY.toFixed(4)
    };
    coordinates.textContent = `${hoveredChampion.dataset.champion} x: ${x}, y: ${y}`;
    copyCoordinatesBtn.disabled = false;
    return;
  }

  const insideRift = e.clientX >= riftRect.left && e.clientX <= riftRect.right
    && e.clientY >= riftRect.top && e.clientY <= riftRect.bottom;

  if (!insideRift || !rift.naturalWidth) {
    hoveredCoordinates = null;
    coordinates.textContent = "Hover over the rift";
    copyCoordinatesBtn.disabled = true;
    return;
  }

  const x = Math.round((e.clientX - riftRect.left) / riftRect.width * rift.naturalWidth);
  const y = Math.round((e.clientY - riftRect.top) / riftRect.height * rift.naturalHeight);
  const normalizedX = ((e.clientX - riftRect.left) / riftRect.width).toFixed(4);
  const normalizedY = ((e.clientY - riftRect.top) / riftRect.height).toFixed(4);

  hoveredCoordinates = { x, y, normalizedX, normalizedY };
  coordinates.textContent = `x: ${x}, y: ${y}`;
  copyCoordinatesBtn.disabled = false;
});

map.addEventListener("pointerleave", () => {
  hoveredCoordinates = null;
  coordinates.textContent = "Hover over the rift";
  copyCoordinatesBtn.disabled = true;
});

async function copyCurrentCoordinates() {
  if (!hoveredCoordinates) return;

  const text = JSON.stringify({
    x: hoveredCoordinates.x,
    y: hoveredCoordinates.y,
    normalizedX: Number(hoveredCoordinates.normalizedX),
    normalizedY: Number(hoveredCoordinates.normalizedY)
  });
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("Could not copy coordinates:", err);
    return;
  }
  copyCoordinatesBtn.textContent = "Copied";
  setTimeout(() => { copyCoordinatesBtn.textContent = "Copy coordinates"; }, 1000);
}

copyCoordinatesBtn.addEventListener("click", copyCurrentCoordinates);

search.addEventListener("input", renderSuggestions);

search.addEventListener("keydown", e => {
  const results = filteredChampions();

  if (e.key === "Tab") {
    if (results.length) {
      e.preventDefault();
      search.value = results[selectedIndex] || results[0];
      renderSuggestions();
    }
  } else if (e.key === "ArrowDown") {
    if (!results.length) return;
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
    highlightSuggestion();
  } else if (e.key === "ArrowUp") {
    if (!results.length) return;
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    highlightSuggestion();
  } else if (e.key === "Enter") {
    if (results.length) {
      e.preventDefault();
      placeSelected();
    }
  } else if (e.key === "Escape") {
    suggestions.classList.add("hidden");
  }
});

search.addEventListener("focus", renderSuggestions);

document.addEventListener("mousedown", e => {
  if (!e.target.closest(".search-wrap")) suggestions.classList.add("hidden");
});

clearBtn.addEventListener("click", () => {
  if (layer.children.length || strokes.length) recordUndoState();
  layer.innerHTML = "";
  strokes = [];
  drawStrokes();
  saveLayout();
});

randomTeamsBtn.addEventListener("click", placeRandomTeams);
saveLayoutBtn.addEventListener("click", saveNamedLayout);
if (copyImageBtn) copyImageBtn.addEventListener("click", copyImageToClipboard);
if (downloadImageBtn) downloadImageBtn.addEventListener("click", downloadImage);

document.addEventListener("pointermove", e => {
  pointerX = e.clientX;
  pointerY = e.clientY;
});

function showCustomContextMenu(x, y) {
  if (!customContextMenu) return;
  customContextMenu.classList.remove("hidden");
  customContextMenu.setAttribute("aria-hidden", "false");

  const menuWidth = customContextMenu.offsetWidth;
  const menuHeight = customContextMenu.offsetHeight;
  const posX = Math.min(x, window.innerWidth - menuWidth - 8);
  const posY = Math.min(y, window.innerHeight - menuHeight - 8);

  customContextMenu.style.left = `${Math.max(8, posX)}px`;
  customContextMenu.style.top = `${Math.max(8, posY)}px`;
}

function hideCustomContextMenu() {
  if (!customContextMenu) return;
  customContextMenu.classList.add("hidden");
  customContextMenu.setAttribute("aria-hidden", "true");
}

document.addEventListener("contextmenu", event => {
  event.preventDefault();
  showCustomContextMenu(event.clientX, event.clientY);
});

document.addEventListener("pointerdown", event => {
  if (customContextMenu && !customContextMenu.contains(event.target)) {
    hideCustomContextMenu();
  }
}, true);

document.addEventListener("mousedown", event => {
  if (customContextMenu && !customContextMenu.contains(event.target)) {
    hideCustomContextMenu();
  }
}, true);

document.addEventListener("click", event => {
  if (customContextMenu && !customContextMenu.contains(event.target)) {
    hideCustomContextMenu();
  }
});

window.addEventListener("scroll", hideCustomContextMenu, true);
window.addEventListener("resize", hideCustomContextMenu);

if (contextCopyImageBtn) {
  contextCopyImageBtn.addEventListener("click", () => {
    hideCustomContextMenu();
    copyImageToClipboard();
  });
}

if (contextClearAllBtn) {
  contextClearAllBtn.addEventListener("click", () => {
    hideCustomContextMenu();
    clearBtn.click();
  });
}

function setHelpVisible(visible) {
  if (helpBar) helpBar.classList.toggle("hidden", !visible);
  if (openHelpBtn) openHelpBtn.classList.toggle("hidden", visible);
  localStorage.setItem(helpVisibleStorageKey, String(visible));
  repositionItems();
}

function initHelpBar() {
  const isHelpVisible = localStorage.getItem(helpVisibleStorageKey) !== "false";
  setHelpVisible(isHelpVisible);
}

if (closeHelpBtn) {
  closeHelpBtn.addEventListener("click", () => setHelpVisible(false));
}
if (openHelpBtn) {
  openHelpBtn.addEventListener("click", () => setHelpVisible(true));
}

loadChampions();
renderSavedLayouts();
initHelpBar();
