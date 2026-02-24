const STORAGE_KEY = "hobby-time-tracker-v1";
const MAX_SESSIONS = 25;

const hobbySelect = document.getElementById("hobbySelect");
const newHobbyInput = document.getElementById("newHobbyInput");
const addHobbyBtn = document.getElementById("addHobbyBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const sessionTimer = document.getElementById("sessionTimer");
const totalsList = document.getElementById("totalsList");
const sessionsList = document.getElementById("sessionsList");
const chartHobbyFilter = document.getElementById("chartHobbyFilter");
const chartBars = document.getElementById("chartBars");
const periodButtons = Array.from(document.querySelectorAll(".period-btn"));

let state = loadState();
let activeSession = null;
let ticker = null;
let chartPeriod = "daily";
let chartHobby = "__all__";

init();

function init() {
  ensureDefaultHobby();
  renderHobbyOptions();
  renderChartHobbyOptions();
  renderTotals();
  renderSessions();
  renderChart();
  bindEvents();
}

function bindEvents() {
  addHobbyBtn.addEventListener("click", addHobby);
  newHobbyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addHobby();
    }
  });

  hobbySelect.addEventListener("change", () => {
    state.selectedHobby = hobbySelect.value;
    saveState();
  });

  chartHobbyFilter.addEventListener("change", () => {
    chartHobby = chartHobbyFilter.value;
    renderChart();
  });

  periodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      chartPeriod = button.dataset.period;
      periodButtons.forEach((candidate) => {
        candidate.classList.toggle("active", candidate === button);
      });
      renderChart();
    });
  });

  startBtn.addEventListener("click", startSession);
  stopBtn.addEventListener("click", stopSession);
}

function addHobby() {
  const hobby = newHobbyInput.value.trim();
  if (!hobby) return;

  const exists = state.hobbies.some(
    (item) => item.toLowerCase() === hobby.toLowerCase()
  );
  if (exists) {
    newHobbyInput.value = "";
    return;
  }

  state.hobbies.push(hobby);
  state.totals[hobby] = state.totals[hobby] || 0;
  state.selectedHobby = hobby;
  newHobbyInput.value = "";

  saveState();
  renderHobbyOptions();
  renderChartHobbyOptions();
  renderTotals();
  renderChart();
}

function startSession() {
  if (activeSession) return;

  const hobby = hobbySelect.value;
  if (!hobby) return;

  activeSession = {
    hobby,
    startedAt: Date.now(),
  };

  startBtn.disabled = true;
  stopBtn.disabled = false;
  hobbySelect.disabled = true;
  addHobbyBtn.disabled = true;
  newHobbyInput.disabled = true;

  updateLiveTimer();
  ticker = setInterval(updateLiveTimer, 1000);
}

function stopSession() {
  if (!activeSession) return;

  const endedAt = Date.now();
  const duration = Math.max(
    0,
    Math.floor((endedAt - activeSession.startedAt) / 1000)
  );
  const hobby = activeSession.hobby;

  state.totals[hobby] = (state.totals[hobby] || 0) + duration;
  state.sessions.unshift({
    hobby,
    startedAt: activeSession.startedAt,
    endedAt,
    duration,
  });
  state.sessions = state.sessions.slice(0, MAX_SESSIONS);

  clearInterval(ticker);
  ticker = null;
  activeSession = null;

  sessionTimer.textContent = "00:00:00";
  startBtn.disabled = false;
  stopBtn.disabled = true;
  hobbySelect.disabled = false;
  addHobbyBtn.disabled = false;
  newHobbyInput.disabled = false;

  saveState();
  renderTotals();
  renderSessions();
  renderChart();
}

function updateLiveTimer() {
  if (!activeSession) return;
  const elapsed = Math.floor((Date.now() - activeSession.startedAt) / 1000);
  sessionTimer.textContent = formatDuration(elapsed);
}

function renderHobbyOptions() {
  hobbySelect.innerHTML = "";

  state.hobbies.forEach((hobby) => {
    const option = document.createElement("option");
    option.value = hobby;
    option.textContent = hobby;
    hobbySelect.appendChild(option);
  });

  hobbySelect.value = state.selectedHobby || state.hobbies[0] || "";
}

function renderChartHobbyOptions() {
  const previous = chartHobby;
  chartHobbyFilter.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "__all__";
  allOption.textContent = "All Hobbies";
  chartHobbyFilter.appendChild(allOption);

  state.hobbies.forEach((hobby) => {
    const option = document.createElement("option");
    option.value = hobby;
    option.textContent = hobby;
    chartHobbyFilter.appendChild(option);
  });

  const isValidSelection =
    previous === "__all__" || state.hobbies.includes(previous);
  chartHobby = isValidSelection ? previous : "__all__";
  chartHobbyFilter.value = chartHobby;
}

function renderTotals() {
  totalsList.innerHTML = "";

  const totals = Object.entries(state.totals).sort((a, b) => b[1] - a[1]);
  if (!totals.length) {
    totalsList.appendChild(emptyItem("No tracked time yet."));
    return;
  }

  totals.forEach(([hobby, seconds]) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${escapeHtml(hobby)}</span><strong>${formatDuration(seconds)}</strong>`;
    totalsList.appendChild(item);
  });
}

function renderSessions() {
  sessionsList.innerHTML = "";

  if (!state.sessions.length) {
    sessionsList.appendChild(emptyItem("No sessions yet."));
    return;
  }

  state.sessions.forEach((session) => {
    const item = document.createElement("li");
    const endedAt = new Date(session.endedAt).toLocaleString();
    item.innerHTML = `<span>${escapeHtml(session.hobby)} · ${endedAt}</span><strong>${formatDuration(session.duration)}</strong>`;
    sessionsList.appendChild(item);
  });
}

function renderChart() {
  chartBars.innerHTML = "";
  const buckets = buildChartBuckets(chartPeriod, chartHobby);

  const maxSeconds = Math.max(1, ...buckets.map((bucket) => bucket.seconds));

  buckets.forEach((bucket) => {
    const barHeight = Math.round((bucket.seconds / maxSeconds) * 160) + 4;
    const item = document.createElement("div");
    item.className = "chart-bar";
    item.innerHTML = `
      <span class="value">${formatHours(bucket.seconds)}</span>
      <div class="bar" style="height: ${barHeight}px" title="${formatDuration(bucket.seconds)}"></div>
      <span class="label">${bucket.label}</span>
    `;
    chartBars.appendChild(item);
  });
}

function buildChartBuckets(period, hobbyFilter) {
  const now = new Date();
  let currentStart;
  let count;
  let shift;
  let label;

  if (period === "weekly") {
    currentStart = startOfWeek(now);
    count = 12;
    shift = (start, amount) => addDays(start, amount * 7);
    label = (start) => {
      const end = addDays(start, 6);
      return `${start.getMonth() + 1}/${start.getDate()}-${end.getMonth() + 1}/${end.getDate()}`;
    };
  } else if (period === "monthly") {
    currentStart = startOfMonth(now);
    count = 12;
    shift = (start, amount) => addMonths(start, amount);
    label = (start) => start.toLocaleString(undefined, { month: "short" });
  } else if (period === "yearly") {
    currentStart = startOfYear(now);
    count = 5;
    shift = (start, amount) => addYears(start, amount);
    label = (start) => String(start.getFullYear());
  } else {
    currentStart = startOfDay(now);
    count = 14;
    shift = (start, amount) => addDays(start, amount);
    label = (start) => `${start.getMonth() + 1}/${start.getDate()}`;
  }

  const buckets = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = shift(currentStart, -index);
    const end = shift(start, 1);
    buckets.push({
      start,
      end,
      label: label(start),
      seconds: 0,
    });
  }

  state.sessions.forEach((session) => {
    if (hobbyFilter !== "__all__" && session.hobby !== hobbyFilter) return;

    const endedAt = new Date(session.endedAt);
    const duration = Number(session.duration) || 0;
    if (!Number.isFinite(endedAt.getTime()) || duration <= 0) return;

    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (endedAt >= bucket.start && endedAt < bucket.end) {
        bucket.seconds += duration;
        break;
      }
    }
  });

  return buckets;
}

function emptyItem(text) {
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = text;
  return item;
}

function ensureDefaultHobby() {
  if (!Array.isArray(state.hobbies)) state.hobbies = [];
  if (!state.hobbies.length) state.hobbies = ["Guitar Practice"];
  if (!state.selectedHobby || !state.hobbies.includes(state.selectedHobby)) {
    state.selectedHobby = state.hobbies[0];
  }

  if (!state.totals || typeof state.totals !== "object") state.totals = {};
  state.hobbies.forEach((hobby) => {
    state.totals[hobby] = state.totals[hobby] || 0;
  });

  if (!Array.isArray(state.sessions)) {
    state.sessions = [];
  } else {
    state.sessions = state.sessions.filter((entry) => {
      return (
        entry &&
        typeof entry.hobby === "string" &&
        Number.isFinite(Number(entry.endedAt)) &&
        Number(entry.duration) >= 0
      );
    });
  }
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatHours(totalSeconds) {
  const hours = totalSeconds / 3600;
  if (hours >= 10) return `${hours.toFixed(0)}h`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${hours.toFixed(2)}h`;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date) {
  const value = startOfDay(date);
  const shift = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - shift);
  return value;
}

function startOfMonth(date) {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
}

function startOfYear(date) {
  const value = startOfDay(date);
  value.setMonth(0, 1);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function addMonths(date, months) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months, 1);
  return startOfDay(value);
}

function addYears(date, years) {
  const value = new Date(date);
  value.setFullYear(value.getFullYear() + years, 0, 1);
  return startOfDay(value);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        hobbies: [],
        selectedHobby: "",
        totals: {},
        sessions: [],
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      hobbies: [],
      selectedHobby: "",
      totals: {},
      sessions: [],
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
