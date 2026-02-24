import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "hobby-time-tracker-v1";
const MAX_SESSIONS = 25;

export default function App() {
  const [state, setState] = useState(() => prepareState(loadState()));
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [newHobby, setNewHobby] = useState("");
  const [chartPeriod, setChartPeriod] = useState("daily");
  const [chartHobby, setChartHobby] = useState("__all__");
  const [backupStatus, setBackupStatus] = useState("");
  const importBackupRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!activeSession) {
      setSessionSeconds(0);
      return;
    }

    const update = () => {
      const elapsed = Math.floor((Date.now() - activeSession.startedAt) / 1000);
      setSessionSeconds(Math.max(0, elapsed));
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  useEffect(() => {
    if (chartHobby === "__all__" || state.hobbies.includes(chartHobby)) return;
    setChartHobby("__all__");
  }, [chartHobby, state.hobbies]);

  const totals = useMemo(() => {
    return Object.entries(state.totals).sort((a, b) => b[1] - a[1]);
  }, [state.totals]);

  const chartBuckets = useMemo(() => {
    return buildChartBuckets(state.sessions, chartPeriod, chartHobby);
  }, [state.sessions, chartPeriod, chartHobby]);

  const maxSeconds = useMemo(() => {
    return Math.max(1, ...chartBuckets.map((item) => item.seconds));
  }, [chartBuckets]);

  function addHobby() {
    const hobby = newHobby.trim();
    if (!hobby) return;

    const exists = state.hobbies.some((item) => item.toLowerCase() === hobby.toLowerCase());
    if (exists) {
      setNewHobby("");
      return;
    }

    setState((prev) => ({
      ...prev,
      hobbies: [...prev.hobbies, hobby],
      selectedHobby: hobby,
      totals: { ...prev.totals, [hobby]: prev.totals[hobby] || 0 },
    }));
    setNewHobby("");
  }

  function startSession() {
    if (activeSession || !state.selectedHobby) return;
    setActiveSession({ hobby: state.selectedHobby, startedAt: Date.now() });
    setBackupStatus("");
  }

  function stopSession() {
    if (!activeSession) return;

    const endedAt = Date.now();
    const duration = Math.max(0, Math.floor((endedAt - activeSession.startedAt) / 1000));
    const hobby = activeSession.hobby;

    setState((prev) => ({
      ...prev,
      totals: {
        ...prev.totals,
        [hobby]: (prev.totals[hobby] || 0) + duration,
      },
      sessions: [
        { hobby, startedAt: activeSession.startedAt, endedAt, duration },
        ...prev.sessions,
      ].slice(0, MAX_SESSIONS),
    }));

    setActiveSession(null);
  }

  function handleImportClick() {
    importBackupRef.current?.click();
  }

  function exportBackup() {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    };

    const fileName = `hobby-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setBackupStatus("Backup exported. Save it to Files or iCloud Drive.");
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (activeSession) {
      setBackupStatus("Stop the current timer before importing a backup.");
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed && parsed.data ? parsed.data : parsed;
      const normalized = normalizeBackupData(imported);

      if (!normalized.sessions.length && !normalized.hobbies.length) {
        throw new Error("Backup file is empty");
      }

      const shouldReplace = window.confirm(
        "Importing will replace your current data on this device. Continue?"
      );
      if (!shouldReplace) {
        setBackupStatus("Import canceled.");
        return;
      }

      setState(prepareState(normalized));
      setBackupStatus("Backup imported successfully.");
    } catch {
      setBackupStatus("Import failed. Please choose a valid backup JSON file.");
    }
  }

  return (
    <main className="app">
      <section className="card hero">
        <h1>Hobby Time Tracker</h1>
        <p>Pick an activity, start the timer, and track your total practice time.</p>
      </section>

      <section className="card controls">
        <label htmlFor="hobbySelect">Current Hobby</label>
        <div className="row">
          <select
            id="hobbySelect"
            aria-label="Select hobby"
            disabled={Boolean(activeSession)}
            value={state.selectedHobby}
            onChange={(event) =>
              setState((prev) => ({ ...prev, selectedHobby: event.target.value }))
            }
          >
            {state.hobbies.map((hobby) => (
              <option key={hobby} value={hobby}>
                {hobby}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={newHobby}
            placeholder="Add a new hobby"
            disabled={Boolean(activeSession)}
            onChange={(event) => setNewHobby(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addHobby();
              }
            }}
          />

          <button
            className="btn btn-secondary"
            type="button"
            disabled={Boolean(activeSession)}
            onClick={addHobby}
          >
            Add
          </button>
        </div>

        <div className="timer-box">
          <p className="label">Current Session</p>
          <p className="timer">{formatDuration(sessionSeconds)}</p>
        </div>

        <div className="row actions">
          <button className="btn btn-primary" type="button" disabled={Boolean(activeSession)} onClick={startSession}>
            Start
          </button>
          <button className="btn btn-danger" type="button" disabled={!activeSession} onClick={stopSession}>
            Stop
          </button>
        </div>
      </section>

      <section className="card totals">
        <h2>Total Time by Hobby</h2>
        <ul>
          {totals.length === 0 ? (
            <li className="empty">No tracked time yet.</li>
          ) : (
            totals.map(([hobby, seconds]) => (
              <li key={hobby}>
                <span>{hobby}</span>
                <strong>{formatDuration(seconds)}</strong>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="card charts">
        <h2>Practice Charts</h2>
        <div className="chart-controls">
          <div className="row period-row">
            {[
              ["daily", "Daily"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
              ["yearly", "Yearly"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`btn period-btn ${chartPeriod === value ? "active" : ""}`}
                data-period={value}
                type="button"
                onClick={() => setChartPeriod(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter chart by hobby"
            value={chartHobby}
            onChange={(event) => setChartHobby(event.target.value)}
          >
            <option value="__all__">All Hobbies</option>
            {state.hobbies.map((hobby) => (
              <option key={hobby} value={hobby}>
                {hobby}
              </option>
            ))}
          </select>
        </div>

        <div className="chart-bars">
          {chartBuckets.map((bucket) => {
            const barHeight = Math.round((bucket.seconds / maxSeconds) * 160) + 4;
            return (
              <div className="chart-bar" key={bucket.key}>
                <span className="value">{formatHours(bucket.seconds)}</span>
                <div
                  className="bar"
                  style={{ height: `${barHeight}px` }}
                  title={formatDuration(bucket.seconds)}
                />
                <span className="label">{bucket.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card sessions">
        <h2>Recent Sessions</h2>
        <ul>
          {state.sessions.length === 0 ? (
            <li className="empty">No sessions yet.</li>
          ) : (
            state.sessions.map((session, index) => (
              <li key={`${session.endedAt}-${index}`}>
                <span>
                  {session.hobby} · {new Date(session.endedAt).toLocaleString()}
                </span>
                <strong>{formatDuration(session.duration)}</strong>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="card backup">
        <h2>Backup & Restore</h2>
        <p className="backup-text">
          Export your data to a backup file, then save it in iCloud Drive or Files.
        </p>
        <div className="row">
          <button className="btn btn-secondary" type="button" onClick={exportBackup}>
            Export Backup
          </button>
          <button className="btn btn-primary" type="button" onClick={handleImportClick}>
            Import Backup
          </button>
          <input
            ref={importBackupRef}
            type="file"
            accept="application/json"
            hidden
            onChange={importBackup}
          />
        </div>
        <p className="backup-status" aria-live="polite">
          {backupStatus}
        </p>
      </section>
    </main>
  );
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hobbies: [], selectedHobby: "", totals: {}, sessions: [] };
    return JSON.parse(raw);
  } catch {
    return { hobbies: [], selectedHobby: "", totals: {}, sessions: [] };
  }
}

function prepareState(input) {
  const source = input && typeof input === "object" ? input : {};
  const hobbies = Array.isArray(source.hobbies)
    ? source.hobbies.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];

  if (!hobbies.length) hobbies.push("Guitar Practice");

  const totals = {};
  if (source.totals && typeof source.totals === "object") {
    Object.entries(source.totals).forEach(([name, seconds]) => {
      const value = Number(seconds);
      if (typeof name === "string" && Number.isFinite(value) && value >= 0) {
        totals[name] = Math.floor(value);
      }
    });
  }

  hobbies.forEach((hobby) => {
    totals[hobby] = totals[hobby] || 0;
  });

  const sessions = Array.isArray(source.sessions)
    ? source.sessions
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => {
          const hobby = typeof entry.hobby === "string" ? entry.hobby.trim() : "";
          const endedAt = Number(entry.endedAt);
          const startedAt = Number(entry.startedAt);
          const duration = Math.floor(Number(entry.duration));
          if (!hobby || !Number.isFinite(endedAt) || !Number.isFinite(duration) || duration < 0) {
            return null;
          }
          return {
            hobby,
            endedAt,
            startedAt: Number.isFinite(startedAt) ? startedAt : Math.max(0, endedAt - duration * 1000),
            duration,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.endedAt - a.endedAt)
        .slice(0, MAX_SESSIONS)
    : [];

  const mergedHobbies = new Set(hobbies);
  Object.keys(totals).forEach((hobby) => mergedHobbies.add(hobby));
  sessions.forEach((session) => mergedHobbies.add(session.hobby));

  const hobbyList = [...mergedHobbies];
  const selectedHobby =
    typeof source.selectedHobby === "string" && hobbyList.includes(source.selectedHobby)
      ? source.selectedHobby
      : hobbyList[0];

  return {
    hobbies: hobbyList,
    selectedHobby,
    totals,
    sessions,
  };
}

function normalizeBackupData(input) {
  return prepareState(input);
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

function buildChartBuckets(sessions, period, hobbyFilter) {
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
      key: String(start.getTime()),
      start,
      end,
      label: label(start),
      seconds: 0,
    });
  }

  sessions.forEach((session) => {
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
