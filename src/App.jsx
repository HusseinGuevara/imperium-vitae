import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";

const STORAGE_KEY = "hobby-time-tracker-v1";
const MAX_SESSIONS = 25;

const DEFAULT_SETTINGS = {
  dailyGoalMinutes: 30,
  weeklyGoalMinutes: 180,
  reminderTime: "19:00",
  reminderEnabled: false,
  cloud: {
    enabled: false,
    syncId: "",
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      appId: "",
    },
  },
};

export default function App() {
  const [state, setState] = useState(() => prepareState(loadState()));
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [newHobby, setNewHobby] = useState("");
  const [chartPeriod, setChartPeriod] = useState("daily");
  const [chartHobby, setChartHobby] = useState("__all__");
  const [backupStatus, setBackupStatus] = useState("");
  const [cloudStatus, setCloudStatus] = useState("");
  const [dailyGoalInput, setDailyGoalInput] = useState(String(state.settings.dailyGoalMinutes));
  const [weeklyGoalInput, setWeeklyGoalInput] = useState(String(state.settings.weeklyGoalMinutes));
  const [reminderTimeInput, setReminderTimeInput] = useState(state.settings.reminderTime);
  const [syncIdInput, setSyncIdInput] = useState(state.settings.cloud.syncId);
  const [firebaseConfigInput, setFirebaseConfigInput] = useState({ ...state.settings.cloud.firebase });
  const importBackupRef = useRef(null);
  const reminderTickRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    setDailyGoalInput(String(state.settings.dailyGoalMinutes));
    setWeeklyGoalInput(String(state.settings.weeklyGoalMinutes));
    setReminderTimeInput(state.settings.reminderTime);
    setSyncIdInput(state.settings.cloud.syncId);
    setFirebaseConfigInput({ ...state.settings.cloud.firebase });
  }, [state.settings]);

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

  useEffect(() => {
    if (!state.settings.reminderEnabled) {
      if (reminderTickRef.current) clearInterval(reminderTickRef.current);
      reminderTickRef.current = null;
      return;
    }

    const tick = () => {
      maybeTriggerReminder(state.settings.reminderTime);
    };

    tick();
    reminderTickRef.current = setInterval(tick, 30000);
    return () => {
      if (reminderTickRef.current) clearInterval(reminderTickRef.current);
      reminderTickRef.current = null;
    };
  }, [state.settings.reminderEnabled, state.settings.reminderTime]);

  const totals = useMemo(() => {
    return Object.entries(state.totals).sort((a, b) => b[1] - a[1]);
  }, [state.totals]);

  const chartBuckets = useMemo(() => {
    return buildChartBuckets(state.sessions, chartPeriod, chartHobby);
  }, [state.sessions, chartPeriod, chartHobby]);

  const maxSeconds = useMemo(() => {
    return Math.max(1, ...chartBuckets.map((item) => item.seconds));
  }, [chartBuckets]);

  const goals = useMemo(() => {
    const todaySeconds = getTodaySeconds(state.sessions);
    const weekSeconds = getCurrentWeekSeconds(state.sessions);
    const dailyGoalSeconds = state.settings.dailyGoalMinutes * 60;
    const weeklyGoalSeconds = state.settings.weeklyGoalMinutes * 60;

    return {
      todaySeconds,
      weekSeconds,
      dailyGoalSeconds,
      weeklyGoalSeconds,
      dailyPercent: Math.min(100, Math.round((todaySeconds / Math.max(1, dailyGoalSeconds)) * 100)),
      weeklyPercent: Math.min(100, Math.round((weekSeconds / Math.max(1, weeklyGoalSeconds)) * 100)),
    };
  }, [state.sessions, state.settings.dailyGoalMinutes, state.settings.weeklyGoalMinutes]);

  const streak = useMemo(() => {
    return getStreak(state.sessions, state.settings.dailyGoalMinutes * 60);
  }, [state.sessions, state.settings.dailyGoalMinutes]);

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
      version: 2,
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

  function saveGoals() {
    const daily = clampInt(dailyGoalInput, 1, 1440, state.settings.dailyGoalMinutes);
    const weekly = clampInt(weeklyGoalInput, 1, 10080, state.settings.weeklyGoalMinutes);

    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        dailyGoalMinutes: daily,
        weeklyGoalMinutes: weekly,
      },
    }));
    setBackupStatus("Goals updated.");
  }

  async function toggleReminders(enabled) {
    if (enabled) {
      if (!("Notification" in window)) {
        setBackupStatus("Notifications are not supported in this browser.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setBackupStatus("Notification permission denied.");
        return;
      }
    }

    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        reminderEnabled: enabled,
      },
    }));

    setBackupStatus(enabled ? "Daily reminders enabled." : "Daily reminders disabled.");
  }

  function saveReminderTime() {
    if (!/^\d{2}:\d{2}$/.test(reminderTimeInput)) {
      setBackupStatus("Enter a valid reminder time.");
      return;
    }

    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        reminderTime: reminderTimeInput,
      },
    }));

    setBackupStatus("Reminder time updated.");
  }

  function saveCloudConfig() {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        cloud: {
          ...prev.settings.cloud,
          enabled: true,
          syncId: syncIdInput.trim(),
          firebase: {
            apiKey: firebaseConfigInput.apiKey.trim(),
            authDomain: firebaseConfigInput.authDomain.trim(),
            projectId: firebaseConfigInput.projectId.trim(),
            appId: firebaseConfigInput.appId.trim(),
          },
        },
      },
    }));
    setCloudStatus("Cloud config saved.");
  }

  async function syncToCloud() {
    try {
      const cloud = {
        ...state.settings.cloud,
        syncId: syncIdInput.trim(),
        firebase: {
          apiKey: firebaseConfigInput.apiKey.trim(),
          authDomain: firebaseConfigInput.authDomain.trim(),
          projectId: firebaseConfigInput.projectId.trim(),
          appId: firebaseConfigInput.appId.trim(),
        },
      };

      assertCloudConfig(cloud);
      const db = await getCloudDb(cloud.firebase);
      await setDoc(doc(db, "hobby_timer_sync", cloud.syncId), {
        updatedAt: Date.now(),
        data: state,
      });
      setCloudStatus("Synced to cloud.");
    } catch (error) {
      setCloudStatus(`Cloud sync failed: ${getMessage(error)}`);
    }
  }

  async function syncFromCloud() {
    try {
      const cloud = {
        ...state.settings.cloud,
        syncId: syncIdInput.trim(),
        firebase: {
          apiKey: firebaseConfigInput.apiKey.trim(),
          authDomain: firebaseConfigInput.authDomain.trim(),
          projectId: firebaseConfigInput.projectId.trim(),
          appId: firebaseConfigInput.appId.trim(),
        },
      };

      assertCloudConfig(cloud);
      const db = await getCloudDb(cloud.firebase);
      const snapshot = await getDoc(doc(db, "hobby_timer_sync", cloud.syncId));

      if (!snapshot.exists()) {
        setCloudStatus("No cloud data found for this Sync ID.");
        return;
      }

      const remote = snapshot.data().data;
      const normalized = prepareState(remote);
      const confirmReplace = window.confirm(
        "Download cloud data and replace local data on this device?"
      );
      if (!confirmReplace) {
        setCloudStatus("Cloud download canceled.");
        return;
      }

      setState(normalized);
      setCloudStatus("Downloaded from cloud.");
    } catch (error) {
      setCloudStatus(`Cloud download failed: ${getMessage(error)}`);
    }
  }

  return (
    <main className="app">
      <section className="card hero">
        <h1>Hobby Time Tracker</h1>
        <p>Track your time, hit your goals, keep your streak, and sync across devices.</p>
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

      <section className="card goals">
        <h2>Goals & Streaks</h2>
        <div className="goal-grid">
          <div>
            <label htmlFor="dailyGoal">Daily Goal (minutes)</label>
            <input
              id="dailyGoal"
              type="number"
              min="1"
              value={dailyGoalInput}
              onChange={(event) => setDailyGoalInput(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="weeklyGoal">Weekly Goal (minutes)</label>
            <input
              id="weeklyGoal"
              type="number"
              min="1"
              value={weeklyGoalInput}
              onChange={(event) => setWeeklyGoalInput(event.target.value)}
            />
          </div>
          <button className="btn btn-secondary" type="button" onClick={saveGoals}>
            Save Goals
          </button>
        </div>

        <div className="progress-wrap">
          <p>Today: {formatDuration(goals.todaySeconds)} / {formatDuration(goals.dailyGoalSeconds)}</p>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${goals.dailyPercent}%` }} /></div>
          <p>This Week: {formatDuration(goals.weekSeconds)} / {formatDuration(goals.weeklyGoalSeconds)}</p>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${goals.weeklyPercent}%` }} /></div>
        </div>

        <div className="streak-row">
          <strong>Current Streak: {streak.current} day(s)</strong>
          <span>Best: {streak.best} day(s)</span>
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

      <section className="card reminders">
        <h2>Reminders</h2>
        <p className="backup-text">
          Daily reminder notifications (works when browser/PWA can run notifications).
        </p>
        <div className="row">
          <input
            type="time"
            value={reminderTimeInput}
            onChange={(event) => setReminderTimeInput(event.target.value)}
          />
          <button className="btn btn-secondary" type="button" onClick={saveReminderTime}>
            Save Time
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => toggleReminders(!state.settings.reminderEnabled)}
          >
            {state.settings.reminderEnabled ? "Disable Reminders" : "Enable Reminders"}
          </button>
        </div>
      </section>

      <section className="card cloud-sync">
        <h2>Cloud Sync (Firebase Backend)</h2>
        <p className="backup-text">Add your Firebase config and Sync ID, then sync between devices.</p>
        <div className="cloud-grid">
          <input placeholder="Sync ID (example: hussein-main)" value={syncIdInput} onChange={(e) => setSyncIdInput(e.target.value)} />
          <input placeholder="Firebase API Key" value={firebaseConfigInput.apiKey} onChange={(e) => setFirebaseConfigInput((prev) => ({ ...prev, apiKey: e.target.value }))} />
          <input placeholder="Firebase Auth Domain" value={firebaseConfigInput.authDomain} onChange={(e) => setFirebaseConfigInput((prev) => ({ ...prev, authDomain: e.target.value }))} />
          <input placeholder="Firebase Project ID" value={firebaseConfigInput.projectId} onChange={(e) => setFirebaseConfigInput((prev) => ({ ...prev, projectId: e.target.value }))} />
          <input placeholder="Firebase App ID" value={firebaseConfigInput.appId} onChange={(e) => setFirebaseConfigInput((prev) => ({ ...prev, appId: e.target.value }))} />
        </div>
        <div className="row">
          <button className="btn btn-secondary" type="button" onClick={saveCloudConfig}>Save Cloud Config</button>
          <button className="btn btn-primary" type="button" onClick={syncToCloud}>Sync Up</button>
          <button className="btn btn-primary" type="button" onClick={syncFromCloud}>Sync Down</button>
        </div>
        <p className="backup-status" aria-live="polite">{cloudStatus}</p>
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
    if (!raw) return { hobbies: [], selectedHobby: "", totals: {}, sessions: [], settings: DEFAULT_SETTINGS };
    return JSON.parse(raw);
  } catch {
    return { hobbies: [], selectedHobby: "", totals: {}, sessions: [], settings: DEFAULT_SETTINGS };
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

  const settings = mergeSettings(source.settings);

  return {
    hobbies: hobbyList,
    selectedHobby,
    totals,
    sessions,
    settings,
  };
}

function normalizeBackupData(input) {
  return prepareState(input);
}

function mergeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const cloudSource = source.cloud && typeof source.cloud === "object" ? source.cloud : {};
  const firebaseSource = cloudSource.firebase && typeof cloudSource.firebase === "object" ? cloudSource.firebase : {};

  return {
    dailyGoalMinutes: clampInt(source.dailyGoalMinutes, 1, 1440, DEFAULT_SETTINGS.dailyGoalMinutes),
    weeklyGoalMinutes: clampInt(source.weeklyGoalMinutes, 1, 10080, DEFAULT_SETTINGS.weeklyGoalMinutes),
    reminderTime: isValidTime(source.reminderTime) ? source.reminderTime : DEFAULT_SETTINGS.reminderTime,
    reminderEnabled: Boolean(source.reminderEnabled),
    cloud: {
      enabled: Boolean(cloudSource.enabled),
      syncId: typeof cloudSource.syncId === "string" ? cloudSource.syncId : "",
      firebase: {
        apiKey: typeof firebaseSource.apiKey === "string" ? firebaseSource.apiKey : "",
        authDomain: typeof firebaseSource.authDomain === "string" ? firebaseSource.authDomain : "",
        projectId: typeof firebaseSource.projectId === "string" ? firebaseSource.projectId : "",
        appId: typeof firebaseSource.appId === "string" ? firebaseSource.appId : "",
      },
    },
  };
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

function getTodaySeconds(sessions) {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);

  return sessions
    .filter((session) => session.endedAt >= today.getTime() && session.endedAt < tomorrow.getTime())
    .reduce((sum, session) => sum + session.duration, 0);
}

function getCurrentWeekSeconds(sessions) {
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);

  return sessions
    .filter((session) => session.endedAt >= weekStart.getTime() && session.endedAt < weekEnd.getTime())
    .reduce((sum, session) => sum + session.duration, 0);
}

function getStreak(sessions, thresholdSeconds) {
  const byDay = new Map();

  sessions.forEach((session) => {
    const day = startOfDay(new Date(session.endedAt)).getTime();
    byDay.set(day, (byDay.get(day) || 0) + session.duration);
  });

  const days = [...byDay.entries()]
    .filter(([, seconds]) => seconds >= thresholdSeconds)
    .map(([day]) => day)
    .sort((a, b) => b - a);

  const daySet = new Set(days);
  const today = startOfDay(new Date()).getTime();

  let current = 0;
  let pointer = today;
  while (daySet.has(pointer)) {
    current += 1;
    pointer = addDays(new Date(pointer), -1).getTime();
  }

  let best = 0;
  days.forEach((day) => {
    const prev = addDays(new Date(day), -1).getTime();
    if (daySet.has(prev)) return;

    let count = 1;
    let next = addDays(new Date(day), 1).getTime();
    while (daySet.has(next)) {
      count += 1;
      next = addDays(new Date(next), 1).getTime();
    }
    best = Math.max(best, count);
  });

  return { current, best };
}

function maybeTriggerReminder(reminderTime) {
  if (!isValidTime(reminderTime)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const now = new Date();
  const [hours, minutes] = reminderTime.split(":").map((value) => Number(value));
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return;

  const key = `hobby-reminder-last-${now.toISOString().slice(0, 10)}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "sent");

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.showNotification("Hobby Time Tracker", {
          body: "Time for your practice session.",
          icon: `${window.location.origin}/HobbyTimer/icon-192.png`,
          badge: `${window.location.origin}/HobbyTimer/icon-192.png`,
          tag: "hobby-reminder",
        });
      })
      .catch(() => {
        new Notification("Hobby Time Tracker", { body: "Time for your practice session." });
      });
    return;
  }

  new Notification("Hobby Time Tracker", { body: "Time for your practice session." });
}

async function getCloudDb(firebaseConfig) {
  const app = initializeApp(firebaseConfig, `hobby-tracker-${firebaseConfig.projectId}`);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  return getFirestore(app);
}

function assertCloudConfig(cloud) {
  if (!cloud.syncId) {
    throw new Error("Missing Sync ID");
  }

  const { apiKey, authDomain, projectId, appId } = cloud.firebase;
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error("Missing Firebase config");
  }
}

function getMessage(error) {
  return error && typeof error.message === "string" ? error.message : "Unknown error";
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

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function isValidTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}
