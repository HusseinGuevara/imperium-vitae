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
import { doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import {
  Badge,
  Burger,
  Button,
  Card,
  Container,
  Group,
  Menu,
  NumberInput,
  Paper,
  Progress,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

const STORAGE_KEY = "hobby-time-tracker-v1";
const AUTH_ACTIVITY_KEY = "progressxp-auth-last-active-at";
const AUTH_MAX_IDLE_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_SESSIONS = 25;
const BASE_URL = import.meta.env.BASE_URL || "/";
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
      return;
    }

    const app = getFirebaseApp(firebase);
    const auth = getAuth(app);
    setAuthChecked(false);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthUser(null);
        setAuthChecked(true);
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
        return;
      }

      markAuthActivity();
      setAuthUser(user);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [state.settings.cloud.firebase]);

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

    setState((prev) => ({
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

    setState((prev) => {
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

    setState((prev) => ({
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
      <div className="app-bg">
        <Container size="sm" py="xl">
          <Stack gap="md">
            <div className="login-logo-wrap">
              <img className="hero-logo" src={`${BASE_URL}progressxp-logo.png`} alt="Progress XP logo" />
            </div>

            <Card radius="xl" shadow="sm" withBorder className="glass-card cloud-card">
              <Stack gap="sm">
                <Title order={3}>Create Account</Title>
                <Text c="dimmed" size="sm">
                  Sign up once to unlock Progress XP and stay logged in across sessions.
                </Text>
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <TextInput
                    label="Email"
                    placeholder="you@example.com"
                    value={authEmailInput}
                    onChange={(e) => setAuthEmailInput(e.currentTarget.value)}
                  />
                  <TextInput
                    type="password"
                    label="Password"
                    placeholder="At least 6 characters"
                    value={authPasswordInput}
                    onChange={(e) => setAuthPasswordInput(e.currentTarget.value)}
                  />
                </SimpleGrid>
                <Group className="social-auth-row">
                  <Button
                    className="auth-provider-btn google-btn"
                    variant="light"
                    leftSection={<GoogleLogoIcon />}
                    onClick={() => signInWithProvider("google")}
                  >
                    Continue with Google
                  </Button>
                  <Button
                    className="auth-provider-btn apple-btn"
                    variant="light"
                    leftSection={<AppleLogoIcon />}
                    onClick={() => signInWithProvider("apple")}
                  >
                    Continue with Apple
                  </Button>
                </Group>
                <Group>
                  <Button variant="light" onClick={signUpWithEmail}>Sign Up</Button>
                  <Button onClick={logInWithEmail}>Log In</Button>
                </Group>
                {!hasFirebaseConfigured ? (
                  <Text size="sm" c="dimmed">
                    Login is not available yet. Firebase sign-in providers must be enabled.
                  </Text>
                ) : null}
                {hasFirebaseConfigured && !authChecked ? (
                  <Text size="sm" c="dimmed">Checking saved session...</Text>
                ) : null}
                {authStatus ? <Text size="sm" c="blue" className="status-text">{authStatus}</Text> : null}
              </Stack>
            </Card>
          </Stack>
        </Container>
      </div>
    );
  }

  return (
    <div className="app-bg">
      <Paper p="sm" className="top-nav" radius={0}>
        <div className="top-nav-inner">
          <Group justify="space-between" align="center" wrap="nowrap">
            <img className="nav-logo" src={`${BASE_URL}progressxp-logo.png`} alt="Progress XP logo" />
            <Menu
              opened={accountMenuOpen}
              onChange={setAccountMenuOpen}
              position="bottom-end"
              shadow="md"
              width={250}
              transitionProps={{ transition: "pop-top-right", duration: 180 }}
            >
              <Menu.Target>
                <div>
                  <Burger
                    opened={accountMenuOpen}
                    onClick={() => setAccountMenuOpen((open) => !open)}
                    aria-label="Open account menu"
                    className="account-burger"
                    color="#ffffff"
                  />
                </div>
              </Menu.Target>
              <Menu.Dropdown className="account-dropdown">
                <Menu.Label>{accountName}</Menu.Label>
                <Menu.Item disabled>{accountEmail}</Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logOutAccount();
                  }}
                >
                  Log Out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </Paper>

      <Container size="lg" py="xl">
        <Stack gap="md">

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card radius="xl" shadow="sm" withBorder className="glass-card session-card">
              <Stack gap="sm">
                <Title order={3}>Current Session</Title>
                <Text size="sm" c="dimmed" className="section-subtitle">
                  Pick a focus and press start when you begin.
                </Text>
                <Select
                  label="Current Hobby"
                  data={hobbyOptions}
                  value={state.selectedHobby}
                  disabled={Boolean(activeSession)}
                  onChange={(value) => {
                    if (!value) return;
                    setState((prev) => ({ ...prev, selectedHobby: value }));
                  }}
                />
                <Group>
                  <TextInput
                    placeholder="Add a new hobby"
                    value={newHobby}
                    style={{ flex: 1 }}
                    disabled={Boolean(activeSession)}
                    onChange={(event) => setNewHobby(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addHobby();
                      }
                    }}
                  />
                </Group>
                <Group>
                  <Button variant="light" onClick={addHobby} disabled={Boolean(activeSession)}>
                    Add
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    onClick={deleteSelectedHobby}
                    disabled={Boolean(activeSession) || state.hobbies.length <= 1}
                  >
                    Delete Hobby
                  </Button>
                </Group>
                <Paper p="md" radius="md" className="timer-surface">
                  <Text size="sm" c="dimmed">
                    Live Timer
                  </Text>
                  <Title order={2} className="timer-text">
                    {formatDuration(sessionSeconds)}
                  </Title>
                  {activeSession?.pausedAt ? (
                    <Text size="sm" c="orange" fw={700}>
                      Paused
                    </Text>
                  ) : null}
                </Paper>
                <Group grow>
                  <Button onClick={startSession} disabled={Boolean(activeSession)}>
                    Start
                  </Button>
                  <Button
                    color={activeSession?.pausedAt ? "teal" : "yellow"}
                    variant="light"
                    onClick={activeSession?.pausedAt ? resumeSession : pauseSession}
                    disabled={!activeSession}
                  >
                    {activeSession?.pausedAt ? "Resume" : "Pause"}
                  </Button>
                  <Button color="red" onClick={stopSession} disabled={!activeSession}>
                    Stop
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card radius="xl" shadow="sm" withBorder className="glass-card goals-card">
              <Stack gap="sm">
                <Title order={3}>Goals & Streaks</Title>
                <Text size="sm" c="dimmed" className="section-subtitle">
                  Keep your routine consistent and grow your streak.
                </Text>
                <Group grow>
                  <NumberInput
                    label="Daily Goal (minutes)"
                    min={1}
                    value={dailyGoalInput}
                    onChange={(value) => setDailyGoalInput(String(value ?? ""))}
                  />
                  <NumberInput
                    label="Weekly Goal (minutes)"
                    min={1}
                    value={weeklyGoalInput}
                    onChange={(value) => setWeeklyGoalInput(String(value ?? ""))}
                  />
                </Group>
                <Button variant="light" onClick={saveGoals}>
                  Save Goals
                </Button>
                <Text size="sm">Today: {formatDuration(goals.todaySeconds)} / {formatDuration(goals.dailyGoalSeconds)}</Text>
                <Progress value={goals.dailyPercent} radius="xl" />
                <Text size="sm">This Week: {formatDuration(goals.weekSeconds)} / {formatDuration(goals.weeklyGoalSeconds)}</Text>
                <Progress value={goals.weeklyPercent} radius="xl" color="cyan" />
                <Group justify="space-between">
                  <Badge size="lg" color="indigo" variant="light">
                    Current streak: {streak.current} day(s)
                  </Badge>
                  <Badge size="lg" color="teal" variant="light">
                    Best: {streak.best}
                  </Badge>
                </Group>
              </Stack>
            </Card>
          </SimpleGrid>

          <Card radius="xl" shadow="sm" withBorder className="glass-card charts-card">
            <Stack gap="sm">
              <Title order={3}>Practice Charts</Title>
              <Text size="sm" c="dimmed" className="section-subtitle">
                Review daily, weekly, monthly, and yearly consistency.
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                <SegmentedControl
                  fullWidth
                  value={chartPeriod}
                  onChange={setChartPeriod}
                  data={[
                    { value: "daily", label: "Daily" },
                    { value: "weekly", label: "Weekly" },
                    { value: "monthly", label: "Monthly" },
                    { value: "yearly", label: "Yearly" },
                  ]}
                />
                <Select
                  data={chartHobbyOptions}
                  value={chartHobby}
                  onChange={(value) => setChartHobby(value || "__all__")}
                />
              </SimpleGrid>
              <div className="chart-wrap">
                {chartBuckets.map((bucket) => {
                  const barHeight = Math.round((bucket.seconds / maxSeconds) * 160) + 6;
                  return (
                    <div className="chart-col" key={bucket.key}>
                      <Text size="xs" c="dimmed">
                        {formatChartTime(bucket.seconds)}
                      </Text>
                      <div className="chart-bar" style={{ height: `${barHeight}px` }} title={formatDuration(bucket.seconds)} />
                      <Text size="xs" fw={700}>
                        {bucket.label}
                      </Text>
                    </div>
                  );
                })}
              </div>
            </Stack>
          </Card>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card radius="xl" shadow="sm" withBorder className="glass-card totals-card">
              <Stack gap="sm">
                <Title order={3}>Totals by Hobby</Title>
                {totals.length === 0 ? (
                  <Text c="dimmed">No tracked time yet.</Text>
                ) : (
                  totals.map(([hobby, seconds]) => (
                    <Paper key={hobby} withBorder p="sm" radius="md" className="row-paper">
                      <Group justify="space-between">
                        <Text>{hobby}</Text>
                        <Text fw={700}>{formatDuration(seconds)}</Text>
                      </Group>
                    </Paper>
                  ))
                )}
              </Stack>
            </Card>

            <Card radius="xl" shadow="sm" withBorder className="glass-card sessions-card">
              <Stack gap="sm">
                <Title order={3}>Recent Sessions</Title>
                {state.sessions.length === 0 ? (
                  <Text c="dimmed">No sessions yet.</Text>
                ) : (
                  state.sessions.map((session, index) => (
                    <Paper key={`${session.endedAt}-${index}`} withBorder p="sm" radius="md" className="row-paper">
                      <Group justify="space-between" align="flex-start">
                        <Text size="sm">{session.hobby} · {new Date(session.endedAt).toLocaleString()}</Text>
                        <Text fw={700} size="sm">{formatDuration(session.duration)}</Text>
                      </Group>
                    </Paper>
                  ))
                )}
              </Stack>
            </Card>
          </SimpleGrid>

          <Card radius="xl" shadow="sm" withBorder className="glass-card reminders-card">
            <Stack gap="sm">
              <Title order={3}>Reminders</Title>
              <Text c="dimmed" size="sm">Enable a daily prompt to keep your streak going.</Text>
              <Group grow>
                <TextInput type="time" value={reminderTimeInput} onChange={(event) => setReminderTimeInput(event.currentTarget.value)} />
                <Button variant="light" onClick={saveReminderTime}>Save Time</Button>
              </Group>
              <Switch
                checked={state.settings.reminderEnabled}
                onChange={(event) => toggleReminders(event.currentTarget.checked)}
                label={state.settings.reminderEnabled ? "Reminders enabled" : "Reminders disabled"}
              />
            </Stack>
          </Card>

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
    return new GoogleAuthProvider();
  }

  if (providerId === "apple") {
    return new OAuthProvider("apple.com");
  }

  throw new Error("Unsupported sign-in provider");
}

function GoogleLogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.9-5.4 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.8 2.4 2.6 6.6 2.6 11.8S6.8 21.2 12 21.2c6.9 0 9.3-4.9 9.3-7.3 0-.5 0-.8-.1-1.1H12z"
      />
      <path
        fill="#34A853"
        d="M3.7 7.3l3.2 2.3C7.7 7.9 9.7 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4c-3.7 0-6.9 2.1-8.3 4.9z"
      />
      <path
        fill="#FBBC05"
        d="M12 21.2c2.6 0 4.8-.9 6.4-2.4l-3-2.5c-.8.6-1.9 1-3.4 1-2.8 0-5.1-1.9-5.9-4.4l-3.2 2.5c1.4 2.9 4.4 4.8 8.1 4.8z"
      />
      <path
        fill="#4285F4"
        d="M21.3 13.9c0-.5 0-.8-.1-1.1H12v3.9h5.4c-.3 1-1 1.8-2 2.5l3 2.5c1.8-1.7 2.9-4.2 2.9-7.8z"
      />
    </svg>
  );
}

function AppleLogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 12.7c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 6.9 1.1 9 .7 1 1.6 2.1 2.8 2 .9 0 1.3-.6 2.4-.6 1.1 0 1.4.6 2.4.6 1 0 1.7-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2-.8-2-3.9zm-2.2-6.6c.6-.8 1-1.9.9-3-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.9-1.4z"
      />
    </svg>
  );
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
