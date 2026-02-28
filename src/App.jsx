import React, { useEffect, useMemo, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { doc, getDoc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { Container, SimpleGrid, Stack } from "@mantine/core";
import AuthScreen from "./components/AuthScreen";
import ChartsCard from "./components/ChartsCard";
import GoalsCard from "./components/GoalsCard";
import RemindersCard from "./components/RemindersCard";
import SessionCard from "./components/SessionCard";
import SessionsCard from "./components/SessionsCard";
import TopNav from "./components/TopNav";
import TotalsCard from "./components/TotalsCard";

const STORAGE_KEY = "hobby-time-tracker-v1";
const AUTH_ACTIVITY_KEY = "progressxp-auth-last-active-at";
const AUTH_MAX_IDLE_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_SESSIONS = 25;
const BASE_URL = import.meta.env.BASE_URL || "/";
const USER_SYNC_COLLECTION = "progress_xp_users";
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const DEFAULT_SETTINGS = {
  dailyGoalMinutes: 30,
  weeklyGoalMinutes: 180,
  reminderTime: "19:00",
  reminderEnabled: false,
  cloud: {
    enabled: false,
    syncId: "",
    firebase: DEFAULT_FIREBASE_CONFIG,
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
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const importBackupRef = useRef(null);
  const reminderTickRef = useRef(null);
  const stateRef = useRef(state);
  const applyingRemoteSyncRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    setDailyGoalInput(String(state.settings.dailyGoalMinutes));
    setWeeklyGoalInput(String(state.settings.weeklyGoalMinutes));
    setReminderTimeInput(state.settings.reminderTime);
    setSyncIdInput(state.settings.cloud.syncId);
  }, [state.settings]);

  useEffect(() => {
    if (!activeSession) {
      setSessionSeconds(0);
      return;
    }

    const update = () => {
      if (activeSession.pausedAt) {
        setSessionSeconds(Math.max(0, activeSession.accumulatedSeconds));
        return;
      }

      const elapsed = activeSession.accumulatedSeconds + Math.floor((Date.now() - activeSession.runStartedAt) / 1000);
      setSessionSeconds(Math.max(0, elapsed));
    };

    update();
    if (activeSession.pausedAt) return;

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

  useEffect(() => {
    const firebase = getResolvedFirebaseConfig(state.settings.cloud.firebase);
    if (!isCompleteFirebaseConfig(firebase)) {
      setAuthUser(null);
      setAuthChecked(true);
      setSyncReady(false);
      return;
    }

    const app = getFirebaseApp(firebase);
    const auth = getAuth(app);
    setAuthChecked(false);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setAuthChecked(true);
        setSyncReady(false);
        return;
      }

      const lastActive = getAuthLastActiveAt();
      if (isAuthExpired(lastActive)) {
        try {
          await signOut(auth);
        } catch {
          // Ignore sign-out failure and still force local logged-out state.
        }
        setAuthUser(null);
        setAuthStatus("Session expired. Please log in again.");
        setAuthChecked(true);
        setSyncReady(false);
        return;
      }

      markAuthActivity();
      setAuthUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [state.settings.cloud.firebase]);

  useEffect(() => {
    if (!authUser) {
      setSyncReady(false);
      return;
    }

    const firebase = getResolvedFirebaseConfig(state.settings.cloud.firebase);
    if (!isCompleteFirebaseConfig(firebase)) {
      setSyncReady(false);
      return;
    }

    const app = getFirebaseApp(firebase);
    const db = getFirestore(app);
    const userDoc = doc(db, USER_SYNC_COLLECTION, authUser.uid);
    setSyncReady(false);

    const unsubscribe = onSnapshot(
      userDoc,
      async (snapshot) => {
        const localState = stateRef.current;
        const localUpdatedAt = getStateLastUpdatedAt(localState);

        if (!snapshot.exists()) {
          const initialState = localUpdatedAt > 0 ? localState : withUpdatedMeta(localState);
          if (getStateLastUpdatedAt(initialState) !== localUpdatedAt) {
            applyingRemoteSyncRef.current = getStateLastUpdatedAt(initialState);
            setState(initialState);
          }

          await persistUserState(userDoc, initialState, authUser.uid);
          setSyncReady(true);
          return;
        }

        const payload = snapshot.data();
        const remoteState = prepareState(payload?.data);
        const remoteUpdatedAt = getStateLastUpdatedAt(remoteState);

        if (remoteUpdatedAt > localUpdatedAt) {
          applyingRemoteSyncRef.current = remoteUpdatedAt;
          setState(remoteState);
        } else if (localUpdatedAt > remoteUpdatedAt) {
          await persistUserState(userDoc, localState, authUser.uid);
        }

        setSyncReady(true);
      },
      () => {
        setSyncReady(false);
      }
    );

    return () => {
      setSyncReady(false);
      unsubscribe();
    };
  }, [authUser, state.settings.cloud.firebase]);

  useEffect(() => {
    if (!authUser || !syncReady) return;

    const stateUpdatedAt = getStateLastUpdatedAt(state);
    if (!stateUpdatedAt) return;

    if (applyingRemoteSyncRef.current === stateUpdatedAt) {
      applyingRemoteSyncRef.current = 0;
      return;
    }

    const firebase = getResolvedFirebaseConfig(state.settings.cloud.firebase);
    if (!isCompleteFirebaseConfig(firebase)) return;

    const app = getFirebaseApp(firebase);
    const db = getFirestore(app);
    const userDoc = doc(db, USER_SYNC_COLLECTION, authUser.uid);

    persistUserState(userDoc, state, authUser.uid).catch(() => {
      // Keep local state intact if cloud sync fails.
    });
  }, [authUser, state, syncReady, state.settings.cloud.firebase]);

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

  const hobbyOptions = useMemo(() => state.hobbies.map((hobby) => ({ value: hobby, label: hobby })), [state.hobbies]);
  const chartHobbyOptions = useMemo(
    () => [{ value: "__all__", label: "All Hobbies" }, ...hobbyOptions],
    [hobbyOptions]
  );
  const accountName = useMemo(() => {
    if (!authUser) return "Account";
    if (typeof authUser.displayName === "string" && authUser.displayName.trim()) {
      return authUser.displayName.trim();
    }
    if (typeof authUser.email === "string" && authUser.email.trim()) {
      return authUser.email.split("@")[0];
    }
    return "Account";
  }, [authUser]);
  const accountEmail = typeof authUser?.email === "string" && authUser.email.trim() ? authUser.email : "Signed in";

  function updateTrackedState(updater) {
    setState((prev) => withUpdatedMeta(typeof updater === "function" ? updater(prev) : updater));
  }

  function buildCloudInput() {
    return {
      ...state.settings.cloud,
      syncId: syncIdInput.trim(),
      firebase: getResolvedFirebaseConfig(state.settings.cloud.firebase),
    };
  }

  function addHobby() {
    const hobby = newHobby.trim();
    if (!hobby) return;

    const exists = state.hobbies.some((item) => item.toLowerCase() === hobby.toLowerCase());
    if (exists) {
      setNewHobby("");
      return;
    }

    updateTrackedState((prev) => ({
      ...prev,
      hobbies: [...prev.hobbies, hobby],
      selectedHobby: hobby,
      totals: { ...prev.totals, [hobby]: prev.totals[hobby] || 0 },
    }));
    setNewHobby("");
  }

  function deleteSelectedHobby() {
    const hobby = state.selectedHobby;
    if (!hobby) return;

    if (activeSession) {
      window.alert("Stop the current timer before deleting a hobby.");
      return;
    }

    if (state.hobbies.length <= 1) {
      window.alert("Add another hobby first. You need at least one hobby.");
      return;
    }

    const sessionCount = state.sessions.filter((session) => session.hobby === hobby).length;
    const trackedSeconds = state.totals[hobby] || 0;
    const warning = `Delete "${hobby}"?\n\nThis will remove ${sessionCount} session(s) and ${formatDuration(
      trackedSeconds
    )} of tracked time for this hobby.`;
    const confirmed = window.confirm(warning);
    if (!confirmed) return;

    updateTrackedState((prev) => {
      const nextHobbies = prev.hobbies.filter((item) => item !== hobby);
      const nextTotals = { ...prev.totals };
      delete nextTotals[hobby];

      return {
        ...prev,
        hobbies: nextHobbies,
        selectedHobby: nextHobbies.includes(prev.selectedHobby) ? prev.selectedHobby : nextHobbies[0] || "",
        totals: nextTotals,
        sessions: prev.sessions.filter((session) => session.hobby !== hobby),
      };
    });

    if (chartHobby === hobby) {
      setChartHobby("__all__");
    }
  }

  function startSession() {
    if (activeSession || !state.selectedHobby) return;
    const now = Date.now();
    setActiveSession({
      hobby: state.selectedHobby,
      sessionStartedAt: now,
      runStartedAt: now,
      accumulatedSeconds: 0,
      pausedAt: null,
    });
    setBackupStatus("");
  }

  function pauseSession() {
    if (!activeSession || activeSession.pausedAt) return;

    const now = Date.now();
    const elapsed = activeSession.accumulatedSeconds + Math.floor((now - activeSession.runStartedAt) / 1000);

    setActiveSession((prev) => {
      if (!prev || prev.pausedAt) return prev;
      return {
        ...prev,
        accumulatedSeconds: Math.max(0, elapsed),
        pausedAt: now,
      };
    });
  }

  function resumeSession() {
    if (!activeSession || !activeSession.pausedAt) return;

    setActiveSession((prev) => {
      if (!prev || !prev.pausedAt) return prev;
      return {
        ...prev,
        runStartedAt: Date.now(),
        pausedAt: null,
      };
    });
  }

  function stopSession() {
    if (!activeSession) return;

    const endedAt = Date.now();
    const duration = activeSession.pausedAt
      ? Math.max(0, activeSession.accumulatedSeconds)
      : Math.max(0, activeSession.accumulatedSeconds + Math.floor((endedAt - activeSession.runStartedAt) / 1000));
    const hobby = activeSession.hobby;

    updateTrackedState((prev) => ({
      ...prev,
      totals: {
        ...prev.totals,
        [hobby]: (prev.totals[hobby] || 0) + duration,
      },
      sessions: [{ hobby, startedAt: activeSession.sessionStartedAt, endedAt, duration }, ...prev.sessions].slice(
        0,
        MAX_SESSIONS
      ),
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

    const fileName = `progressxp-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

      updateTrackedState(prepareState(normalized));
      setBackupStatus("Backup imported successfully.");
    } catch {
      setBackupStatus("Import failed. Please choose a valid backup JSON file.");
    }
  }

  function saveGoals() {
    const daily = clampInt(dailyGoalInput, 1, 1440, state.settings.dailyGoalMinutes);
    const weekly = clampInt(weeklyGoalInput, 1, 10080, state.settings.weeklyGoalMinutes);

    updateTrackedState((prev) => ({
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

    updateTrackedState((prev) => ({
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

    updateTrackedState((prev) => ({
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
          firebase: getResolvedFirebaseConfig(prev.settings.cloud.firebase),
        },
      },
    }));
    setCloudStatus("Sync settings saved.");
  }

  async function syncToCloud() {
    try {
      const cloud = buildCloudInput();

      assertCloudConfig(cloud);
      const { db, uid } = await getCloudDb(cloud.firebase, true);
      await setDoc(doc(db, "hobby_timer_sync", cloud.syncId), {
        updatedAt: Date.now(),
        ownerUid: uid,
        data: state,
      });
      setCloudStatus("Synced to cloud (owner bound).");
    } catch (error) {
      setCloudStatus(`Cloud sync failed: ${getMessage(error)}`);
    }
  }

  async function syncFromCloud() {
    try {
      const cloud = buildCloudInput();

      assertCloudConfig(cloud);
      const { db, uid } = await getCloudDb(cloud.firebase, true);
      const snapshot = await getDoc(doc(db, "hobby_timer_sync", cloud.syncId));

      if (!snapshot.exists()) {
        setCloudStatus("No cloud data found for this Sync ID.");
        return;
      }

      const payload = snapshot.data();
      if (payload.ownerUid && payload.ownerUid !== uid) {
        setCloudStatus("This Sync ID belongs to a different account.");
        return;
      }

      const remote = payload.data;
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

  async function signUpWithEmail() {
    try {
      if (!authEmailInput.trim() || !authPasswordInput) {
        setAuthStatus("Enter an email and password.");
        return;
      }

      const cloud = buildCloudInput();
      assertFirebaseConfig(cloud.firebase);

      const app = getFirebaseApp(cloud.firebase);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(
        auth,
        authEmailInput.trim(),
        authPasswordInput
      );

      markAuthActivity();
      setAuthStatus(`Account created: ${credential.user.email || "signed in"}.`);
    } catch (error) {
      setAuthStatus(`Sign up failed: ${getMessage(error)}`);
    }
  }

  async function logInWithEmail() {
    try {
      if (!authEmailInput.trim() || !authPasswordInput) {
        setAuthStatus("Enter an email and password.");
        return;
      }

      const cloud = buildCloudInput();
      assertFirebaseConfig(cloud.firebase);

      const app = getFirebaseApp(cloud.firebase);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, authEmailInput.trim(), authPasswordInput);
      markAuthActivity();
      setAuthStatus(`Logged in: ${credential.user.email || "account"}.`);
    } catch (error) {
      setAuthStatus(`Login failed: ${getMessage(error)}`);
    }
  }

  async function logOutAccount() {
    try {
      const cloud = buildCloudInput();
      assertFirebaseConfig(cloud.firebase);
      const app = getFirebaseApp(cloud.firebase);
      const auth = getAuth(app);
      await signOut(auth);
      localStorage.removeItem(AUTH_ACTIVITY_KEY);
      setAuthStatus("Logged out.");
    } catch (error) {
      setAuthStatus(`Logout failed: ${getMessage(error)}`);
    }
  }

  async function signInWithProvider(providerId) {
    try {
      const cloud = buildCloudInput();
      assertFirebaseConfig(cloud.firebase);

      const app = getFirebaseApp(cloud.firebase);
      const auth = getAuth(app);
      await setPersistence(auth, browserLocalPersistence);

      const provider = createAuthProvider(providerId);

      try {
        await signInWithPopup(auth, provider);
        markAuthActivity();
        setAuthStatus(`Logged in with ${providerId === "google" ? "Google" : "Apple"}.`);
      } catch (popupError) {
        const code = popupError && typeof popupError.code === "string" ? popupError.code : "";
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupError;
      }
    } catch (error) {
      setAuthStatus(`Social login failed: ${getMessage(error)}`);
    }
  }

  const hasFirebaseConfigured = isCompleteFirebaseConfig(
    getResolvedFirebaseConfig(state.settings.cloud.firebase)
  );

  if (!authUser) {
    return (
      <AuthScreen
        baseUrl={BASE_URL}
        authEmailInput={authEmailInput}
        authPasswordInput={authPasswordInput}
        authStatus={authStatus}
        authChecked={authChecked}
        hasFirebaseConfigured={hasFirebaseConfigured}
        onEmailChange={setAuthEmailInput}
        onPasswordChange={setAuthPasswordInput}
        onGoogleSignIn={() => signInWithProvider("google")}
        onAppleSignIn={() => signInWithProvider("apple")}
        onSignUp={signUpWithEmail}
        onLogIn={logInWithEmail}
      />
    );
  }

  return (
    <div className="app-bg">
      <TopNav
        baseUrl={BASE_URL}
        accountMenuOpen={accountMenuOpen}
        setAccountMenuOpen={setAccountMenuOpen}
        accountName={accountName}
        accountEmail={accountEmail}
        onLogOut={logOutAccount}
      />

      <Container size="lg" py="xl">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <SessionCard
              hobbyOptions={hobbyOptions}
              selectedHobby={state.selectedHobby}
              activeSession={activeSession}
              newHobby={newHobby}
              sessionSeconds={sessionSeconds}
              hobbyCount={state.hobbies.length}
              onSelectHobby={(value) => {
                if (!value) return;
                updateTrackedState((prev) => ({ ...prev, selectedHobby: value }));
              }}
              onNewHobbyChange={setNewHobby}
              onNewHobbyKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addHobby();
                }
              }}
              onAddHobby={addHobby}
              onDeleteHobby={deleteSelectedHobby}
              onStart={startSession}
              onPauseResume={activeSession?.pausedAt ? resumeSession : pauseSession}
              onStop={stopSession}
              formatDuration={formatDuration}
            />

            <GoalsCard
              dailyGoalInput={dailyGoalInput}
              weeklyGoalInput={weeklyGoalInput}
              goals={goals}
              streak={streak}
              onDailyGoalChange={setDailyGoalInput}
              onWeeklyGoalChange={setWeeklyGoalInput}
              onSaveGoals={saveGoals}
              formatDuration={formatDuration}
            />
          </SimpleGrid>

          <ChartsCard
            chartPeriod={chartPeriod}
            chartHobby={chartHobby}
            chartHobbyOptions={chartHobbyOptions}
            chartBuckets={chartBuckets}
            maxSeconds={maxSeconds}
            onChartPeriodChange={setChartPeriod}
            onChartHobbyChange={setChartHobby}
            formatChartTime={formatChartTime}
            formatDuration={formatDuration}
          />

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <TotalsCard totals={totals} formatDuration={formatDuration} />
            <SessionsCard sessions={state.sessions} formatDuration={formatDuration} />
          </SimpleGrid>

          <RemindersCard
            reminderTimeInput={reminderTimeInput}
            reminderEnabled={state.settings.reminderEnabled}
            onReminderTimeChange={setReminderTimeInput}
            onSaveReminderTime={saveReminderTime}
            onToggleReminders={toggleReminders}
          />
        </Stack>
      </Container>
    </div>
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
  const lastUpdatedAt = Number(source.meta?.lastUpdatedAt);

  return {
    hobbies: hobbyList,
    selectedHobby,
    totals,
    sessions,
    settings,
    meta: {
      lastUpdatedAt: Number.isFinite(lastUpdatedAt) ? lastUpdatedAt : 0,
    },
  };
}

function normalizeBackupData(input) {
  return prepareState(input);
}

function withUpdatedMeta(input, timestamp = Date.now()) {
  const prepared = prepareState(input);
  return {
    ...prepared,
    meta: {
      ...prepared.meta,
      lastUpdatedAt: timestamp,
    },
  };
}

function getStateLastUpdatedAt(input) {
  const value = Number(input?.meta?.lastUpdatedAt);
  return Number.isFinite(value) ? value : 0;
}

async function persistUserState(userDoc, state, uid) {
  const payload = getStateLastUpdatedAt(state) > 0 ? state : withUpdatedMeta(state);
  await setDoc(
    userDoc,
    {
      ownerUid: uid,
      updatedAt: getStateLastUpdatedAt(payload),
      data: payload,
    },
    { merge: true }
  );
}

function mergeSettings(input) {
  const source = input && typeof input === "object" ? input : {};
  const cloudSource = source.cloud && typeof source.cloud === "object" ? source.cloud : {};
  const firebaseSource = cloudSource.firebase && typeof cloudSource.firebase === "object" ? cloudSource.firebase : {};
  const resolvedFirebase = getResolvedFirebaseConfig(firebaseSource);

  return {
    dailyGoalMinutes: clampInt(source.dailyGoalMinutes, 1, 1440, DEFAULT_SETTINGS.dailyGoalMinutes),
    weeklyGoalMinutes: clampInt(source.weeklyGoalMinutes, 1, 10080, DEFAULT_SETTINGS.weeklyGoalMinutes),
    reminderTime: isValidTime(source.reminderTime) ? source.reminderTime : DEFAULT_SETTINGS.reminderTime,
    reminderEnabled: Boolean(source.reminderEnabled),
    cloud: {
      enabled: Boolean(cloudSource.enabled),
      syncId: typeof cloudSource.syncId === "string" ? cloudSource.syncId : "",
      firebase: resolvedFirebase,
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

function formatChartTime(totalSeconds) {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "0m";
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

  const key = `progressxp-reminder-last-${now.toISOString().slice(0, 10)}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "sent");

  const iconUrl = `${window.location.origin}${BASE_URL}icon-192.png`;

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.showNotification("Progress XP", {
          body: "Time for your practice session.",
          icon: iconUrl,
          badge: iconUrl,
          tag: "progressxp-reminder",
        });
      })
      .catch(() => {
        new Notification("Progress XP", { body: "Time for your practice session." });
      });
    return;
  }

  new Notification("Progress XP", { body: "Time for your practice session." });
}

async function getCloudDb(firebaseConfig, requireSignedIn = false) {
  const app = getFirebaseApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);

  if (!auth.currentUser && !requireSignedIn) {
    await signInAnonymously(auth);
  }

  if (!auth.currentUser) {
    throw new Error("Please log in with email before syncing.");
  }

  return { db: getFirestore(app), uid: auth.currentUser.uid };
}

function assertCloudConfig(cloud) {
  if (!cloud.syncId) {
    throw new Error("Missing Sync ID");
  }

  if (!isCompleteFirebaseConfig(cloud.firebase)) {
    throw new Error("Missing Firebase config");
  }
}

function assertFirebaseConfig(firebaseConfig) {
  if (!isCompleteFirebaseConfig(firebaseConfig)) {
    throw new Error("Missing Firebase config. Add VITE_FIREBASE_* values to your deployment.");
  }
}

function getResolvedFirebaseConfig(firebaseInput) {
  const source = firebaseInput && typeof firebaseInput === "object" ? firebaseInput : {};
  const fallback = DEFAULT_FIREBASE_CONFIG;
  return {
    apiKey: pickFirebaseValue(source.apiKey, fallback.apiKey),
    authDomain: pickFirebaseValue(source.authDomain, fallback.authDomain),
    projectId: pickFirebaseValue(source.projectId, fallback.projectId),
    appId: pickFirebaseValue(source.appId, fallback.appId),
  };
}

function isCompleteFirebaseConfig(firebaseConfig) {
  return Boolean(
    firebaseConfig &&
      isUsableFirebaseValue(firebaseConfig.apiKey) &&
      isUsableFirebaseValue(firebaseConfig.authDomain) &&
      isUsableFirebaseValue(firebaseConfig.projectId) &&
      isUsableFirebaseValue(firebaseConfig.appId)
  );
}

function pickFirebaseValue(primaryValue, fallbackValue) {
  const primary = normalizeFirebaseValue(primaryValue);
  if (isUsableFirebaseValue(primary)) return primary;

  const fallback = normalizeFirebaseValue(fallbackValue);
  if (isUsableFirebaseValue(fallback)) return fallback;

  return primary || fallback;
}

function normalizeFirebaseValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUsableFirebaseValue(value) {
  if (!value || typeof value !== "string") return false;
  return !/^VITE_FIREBASE_/i.test(value.trim());
}

function getFirebaseApp(firebaseConfig) {
  const appName = `hobby-tracker-${firebaseConfig.projectId}`;
  return getApps().some((item) => item.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
}

function createAuthProvider(providerId) {
  if (providerId === "google") {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return provider;
  }

  if (providerId === "apple") {
    return new OAuthProvider("apple.com");
  }

  throw new Error("Unsupported sign-in provider");
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

function getAuthLastActiveAt() {
  const raw = localStorage.getItem(AUTH_ACTIVITY_KEY);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function isAuthExpired(lastActiveAt) {
  if (!lastActiveAt) return false;
  return Date.now() - lastActiveAt > AUTH_MAX_IDLE_MS;
}

function markAuthActivity() {
  localStorage.setItem(AUTH_ACTIVITY_KEY, String(Date.now()));
}
