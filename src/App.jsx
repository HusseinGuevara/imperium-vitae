import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Container,
  Grid,
  Group,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from "@mantine/core";

const STORAGE_KEY = "forge-hypertrophy-tracker-v2";
const USER_SYNC_COLLECTION = "forge_hypertrophy_users";
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

let firebaseServicesPromise;

const BASE_EXERCISES = [
  {
    id: "incline-db-press",
    name: "Incline Dumbbell Press",
    slot: "Upper 1",
    muscle: "Chest",
    category: "Press",
    repRange: "8-12",
    rest: "2-3 min",
    cue: "Pause lightly at the bottom and drive elbows under the wrists.",
  },
  {
    id: "machine-press",
    name: "Machine Chest Press",
    slot: "Upper 1",
    muscle: "Chest",
    category: "Press",
    repRange: "10-15",
    rest: "90 sec",
    cue: "Keep the ribcage stacked and stop one rep shy of form breakdown.",
  },
  {
    id: "lat-pulldown",
    name: "Neutral Grip Lat Pulldown",
    slot: "Upper 1",
    muscle: "Back",
    category: "Pull",
    repRange: "8-12",
    rest: "2 min",
    cue: "Lead with elbows and keep shoulders down into the finish.",
  },
  {
    id: "chest-supported-row",
    name: "Chest Supported Row",
    slot: "Upper 1",
    muscle: "Back",
    category: "Pull",
    repRange: "10-12",
    rest: "2 min",
    cue: "Drive through the pinky side of the hand and hold the squeeze.",
  },
  {
    id: "cable-lateral",
    name: "Cable Lateral Raise",
    slot: "Upper 1",
    muscle: "Delts",
    category: "Isolation",
    repRange: "12-20",
    rest: "60 sec",
    cue: "Let the hand travel slightly in front of the body at the top.",
  },
  {
    id: "rope-pushdown",
    name: "Rope Pushdown",
    slot: "Upper 1",
    muscle: "Triceps",
    category: "Isolation",
    repRange: "10-15",
    rest: "60 sec",
    cue: "Lock shoulders in place and spread the rope at full extension.",
  },
  {
    id: "hack-squat",
    name: "Hack Squat",
    slot: "Lower 1",
    muscle: "Quads",
    category: "Squat",
    repRange: "6-10",
    rest: "3 min",
    cue: "Stay braced and drive knees forward through the whole set.",
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift",
    slot: "Lower 1",
    muscle: "Hamstrings",
    category: "Hinge",
    repRange: "6-10",
    rest: "3 min",
    cue: "Reach hips back until hamstrings lengthen, then stand tall hard.",
  },
  {
    id: "leg-press",
    name: "Leg Press",
    slot: "Lower 1",
    muscle: "Quads",
    category: "Press",
    repRange: "10-15",
    rest: "2 min",
    cue: "Use full knee bend and keep pressure through the mid foot.",
  },
  {
    id: "seated-leg-curl",
    name: "Seated Leg Curl",
    slot: "Lower 1",
    muscle: "Hamstrings",
    category: "Isolation",
    repRange: "10-15",
    rest: "75 sec",
    cue: "Posteriorly tilt slightly and own the squeeze every rep.",
  },
  {
    id: "walking-lunge",
    name: "Walking Lunge",
    slot: "Lower 1",
    muscle: "Glutes",
    category: "Unilateral",
    repRange: "10-14",
    rest: "90 sec",
    cue: "Take long steps and keep the torso tall over the front leg.",
  },
  {
    id: "standing-calf-raise",
    name: "Standing Calf Raise",
    slot: "Lower 1",
    muscle: "Calves",
    category: "Isolation",
    repRange: "8-12",
    rest: "60 sec",
    cue: "Pause at peak contraction and use a deliberate stretch below.",
  },
  {
    id: "smith-high-incline",
    name: "Smith High Incline Press",
    slot: "Upper 2",
    muscle: "Delts",
    category: "Press",
    repRange: "8-10",
    rest: "2 min",
    cue: "Press in a slight arc back over the shoulders.",
  },
  {
    id: "single-arm-row",
    name: "Single Arm Cable Row",
    slot: "Upper 2",
    muscle: "Back",
    category: "Pull",
    repRange: "10-14",
    rest: "75 sec",
    cue: "Reach long on the negative and keep the chest open.",
  },
  {
    id: "pec-deck",
    name: "Pec Deck Fly",
    slot: "Upper 2",
    muscle: "Chest",
    category: "Isolation",
    repRange: "12-18",
    rest: "60 sec",
    cue: "Think elbows around, not hands together.",
  },
  {
    id: "ez-curl",
    name: "EZ Bar Curl",
    slot: "Upper 2",
    muscle: "Biceps",
    category: "Isolation",
    repRange: "8-12",
    rest: "60 sec",
    cue: "Keep elbows just in front of the torso and control the eccentric.",
  },
];

const BASE_TEMPLATES = [
  {
    id: "upper-1",
    name: "Upper 1",
    focus: "Chest + Back bias",
    week: "Mesocycle Week 3",
    exercises: [
      { exerciseId: "incline-db-press", targetSets: 3 },
      { exerciseId: "machine-press", targetSets: 2 },
      { exerciseId: "lat-pulldown", targetSets: 3 },
      { exerciseId: "chest-supported-row", targetSets: 2 },
      { exerciseId: "cable-lateral", targetSets: 3 },
      { exerciseId: "rope-pushdown", targetSets: 2 },
    ],
  },
  {
    id: "lower-1",
    name: "Lower 1",
    focus: "Quad + posterior chain",
    week: "Mesocycle Week 3",
    exercises: [
      { exerciseId: "hack-squat", targetSets: 3 },
      { exerciseId: "romanian-deadlift", targetSets: 3 },
      { exerciseId: "leg-press", targetSets: 2 },
      { exerciseId: "seated-leg-curl", targetSets: 2 },
      { exerciseId: "walking-lunge", targetSets: 2 },
      { exerciseId: "standing-calf-raise", targetSets: 3 },
    ],
  },
  {
    id: "upper-2",
    name: "Upper 2",
    focus: "Shoulder + arm density",
    week: "Mesocycle Week 3",
    exercises: [
      { exerciseId: "smith-high-incline", targetSets: 3 },
      { exerciseId: "single-arm-row", targetSets: 3 },
      { exerciseId: "pec-deck", targetSets: 2 },
      { exerciseId: "cable-lateral", targetSets: 3 },
      { exerciseId: "rope-pushdown", targetSets: 3 },
      { exerciseId: "ez-curl", targetSets: 3 },
    ],
  },
];

const WEEKLY_TARGETS = {
  Chest: 12,
  Back: 14,
  Delts: 14,
  Biceps: 8,
  Triceps: 9,
  Quads: 12,
  Hamstrings: 10,
  Glutes: 8,
  Calves: 8,
};

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSet(weight = "", reps = "", rir = "2") {
  return { weight, reps, rir };
}

function formatDateInput(date) {
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function createDraft(templateId, templates) {
  const template = templates.find((item) => item.id === templateId) || templates[0];
  return {
    templateId: template?.id || "",
    performedAt: formatDateInput(new Date()),
    notes: "",
    entries: (template?.exercises || []).map((item) => ({
      exerciseId: item.exerciseId,
      targetSets: item.targetSets,
      sets: Array.from({ length: item.targetSets }, () => createSet()),
    })),
  };
}

function createStarterWorkouts() {
  const daysAgo = (count, hour) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    date.setDate(date.getDate() - count);
    return date.toISOString();
  };

  return [
    {
      id: uid("workout"),
      templateId: "upper-1",
      performedAt: daysAgo(5, 8),
      notes: "Loads felt steady. Added one rep on the pulldown top set.",
      entries: [
        {
          exerciseId: "incline-db-press",
          targetSets: 3,
          sets: [createSet(70, 10, 2), createSet(70, 9, 2), createSet(65, 11, 1)],
        },
        {
          exerciseId: "lat-pulldown",
          targetSets: 3,
          sets: [createSet(140, 12, 2), createSet(150, 10, 1), createSet(150, 9, 1)],
        },
        {
          exerciseId: "cable-lateral",
          targetSets: 3,
          sets: [createSet(15, 16, 2), createSet(15, 14, 1), createSet(12.5, 18, 1)],
        },
      ],
    },
    {
      id: uid("workout"),
      templateId: "lower-1",
      performedAt: daysAgo(3, 7),
      notes: "Kept hack squat at 2 RIR. RDLs moved well.",
      entries: [
        {
          exerciseId: "hack-squat",
          targetSets: 3,
          sets: [createSet(180, 10, 2), createSet(200, 8, 2), createSet(200, 8, 1)],
        },
        {
          exerciseId: "romanian-deadlift",
          targetSets: 3,
          sets: [createSet(185, 10, 2), createSet(185, 9, 2), createSet(185, 8, 1)],
        },
        {
          exerciseId: "standing-calf-raise",
          targetSets: 3,
          sets: [createSet(160, 12, 1), createSet(160, 11, 1), createSet(160, 10, 0)],
        },
      ],
    },
    {
      id: uid("workout"),
      templateId: "upper-2",
      performedAt: daysAgo(1, 9),
      notes: "Shoulder day. Smith incline top set improved.",
      entries: [
        {
          exerciseId: "smith-high-incline",
          targetSets: 3,
          sets: [createSet(115, 10, 2), createSet(125, 8, 1), createSet(125, 8, 1)],
        },
        {
          exerciseId: "single-arm-row",
          targetSets: 3,
          sets: [createSet(80, 12, 2), createSet(85, 11, 2), createSet(85, 10, 1)],
        },
        {
          exerciseId: "ez-curl",
          targetSets: 3,
          sets: [createSet(60, 12, 2), createSet(70, 10, 1), createSet(70, 9, 1)],
        },
      ],
    },
    {
      id: uid("workout"),
      templateId: "upper-1",
      performedAt: daysAgo(12, 8),
      notes: "Baseline week.",
      entries: [
        {
          exerciseId: "incline-db-press",
          targetSets: 3,
          sets: [createSet(65, 10, 2), createSet(65, 9, 2), createSet(65, 8, 1)],
        },
        {
          exerciseId: "lat-pulldown",
          targetSets: 3,
          sets: [createSet(140, 10, 2), createSet(140, 10, 2), createSet(140, 9, 1)],
        },
      ],
    },
  ];
}

function createClient(name = "Demo Client") {
  const exercises = clone(BASE_EXERCISES);
  const templates = clone(BASE_TEMPLATES);
  return {
    id: uid("client"),
    name,
    role: "client",
    goal: "Add lean size while keeping weekly fatigue manageable.",
    notes: "Use this profile as a coaching template or assign it to a real client.",
    exercises,
    assignedExerciseIds: exercises.map((exercise) => exercise.id),
    templates,
    workouts: createStarterWorkouts(),
    draft: createDraft(templates[0].id, templates),
  };
}

function createDefaultState() {
  const client = createClient();
  return {
    meta: { updatedAt: Date.now() },
    admin: {
      role: "administrator",
      name: "Owner",
      email: "",
    },
    activeClientId: client.id,
    clients: [client],
  };
}

function withUpdatedMeta(nextState) {
  return {
    ...nextState,
    meta: { updatedAt: Date.now() },
  };
}

function normalizeExercise(exercise) {
  if (!exercise?.id || !exercise?.name) return null;
  return {
    id: String(exercise.id),
    name: String(exercise.name),
    slot: String(exercise.slot || "Custom"),
    muscle: String(exercise.muscle || "Other"),
    category: String(exercise.category || "Custom"),
    repRange: String(exercise.repRange || "8-12"),
    rest: String(exercise.rest || "90 sec"),
    cue: String(exercise.cue || ""),
    mediaUrl: String(exercise.mediaUrl || ""),
    mediaType: String(exercise.mediaType || "video"),
  };
}

function normalizeTemplate(template, validExerciseIds) {
  if (!template?.id || !template?.name) return null;
  const exercises = Array.isArray(template.exercises)
    ? template.exercises
        .map((item) => ({
          exerciseId: String(item.exerciseId || ""),
          targetSets: Math.max(1, Number(item.targetSets || 1)),
        }))
        .filter((item) => validExerciseIds.has(item.exerciseId))
    : [];

  if (exercises.length === 0) return null;

  return {
    id: String(template.id),
    name: String(template.name),
    focus: String(template.focus || "Custom focus"),
    week: String(template.week || "Mesocycle"),
    exercises,
  };
}

function normalizeWorkout(workout, validTemplateIds, validExerciseIds) {
  if (!workout?.id) return null;
  const entries = Array.isArray(workout.entries)
    ? workout.entries
        .map((entry) => {
          if (!validExerciseIds.has(entry.exerciseId)) return null;
          const sets = Array.isArray(entry.sets)
            ? entry.sets
                .map((set) => ({
                  weight: Number(set.weight || 0),
                  reps: Number(set.reps || 0),
                  rir: Number(set.rir || 0),
                }))
                .filter((set) => set.reps > 0)
            : [];
          if (sets.length === 0) return null;
          return {
            exerciseId: String(entry.exerciseId),
            targetSets: Math.max(1, Number(entry.targetSets || sets.length)),
            sets,
          };
        })
        .filter(Boolean)
    : [];

  if (entries.length === 0) return null;

  return {
    id: String(workout.id),
    templateId: validTemplateIds.has(workout.templateId) ? String(workout.templateId) : Array.from(validTemplateIds)[0],
    performedAt: String(workout.performedAt || new Date().toISOString()),
    notes: String(workout.notes || ""),
    entries,
  };
}

function normalizeDraft(draft, templates, validExerciseIds) {
  if (!draft?.templateId || !templates.some((item) => item.id === draft.templateId)) {
    return createDraft(templates[0].id, templates);
  }

  const template = templates.find((item) => item.id === draft.templateId) || templates[0];
  const fallbackEntries = createDraft(template.id, templates).entries;
  const incomingEntries = Array.isArray(draft.entries)
    ? draft.entries
        .map((entry) => {
          if (!validExerciseIds.has(entry.exerciseId)) return null;
          const sets = Array.isArray(entry.sets)
            ? entry.sets.map((set) => ({
                weight: set.weight === "" ? "" : String(set.weight ?? ""),
                reps: set.reps === "" ? "" : String(set.reps ?? ""),
                rir: set.rir === "" ? "" : String(set.rir ?? ""),
              }))
            : [];
          return {
            exerciseId: String(entry.exerciseId),
            targetSets: Math.max(1, Number(entry.targetSets || 1)),
            sets: sets.length > 0 ? sets : [createSet()],
          };
        })
        .filter(Boolean)
    : [];

  return {
    templateId: template.id,
    performedAt: String(draft.performedAt || formatDateInput(new Date())),
    notes: String(draft.notes || ""),
    entries: incomingEntries.length > 0 ? incomingEntries : fallbackEntries,
  };
}

function normalizeClient(client) {
  if (!client?.id || !client?.name) return null;
  const exercises = Array.isArray(client.exercises)
    ? client.exercises.map(normalizeExercise).filter(Boolean)
    : clone(BASE_EXERCISES);
  const validExerciseIds = new Set(exercises.map((item) => item.id));

  let templates = Array.isArray(client.templates)
    ? client.templates.map((item) => normalizeTemplate(item, validExerciseIds)).filter(Boolean)
    : clone(BASE_TEMPLATES);

  if (templates.length === 0) {
    templates = clone(BASE_TEMPLATES).map((item) => normalizeTemplate(item, validExerciseIds)).filter(Boolean);
  }

  const validTemplateIds = new Set(templates.map((item) => item.id));
  const workouts = Array.isArray(client.workouts)
    ? client.workouts
        .map((item) => normalizeWorkout(item, validTemplateIds, validExerciseIds))
        .filter(Boolean)
    : [];

  return {
    id: String(client.id),
    name: String(client.name),
    role: String(client.role || "client"),
    goal: String(client.goal || ""),
    notes: String(client.notes || ""),
    exercises,
    assignedExerciseIds: Array.isArray(client.assignedExerciseIds)
      ? client.assignedExerciseIds.filter((id) => validExerciseIds.has(id))
      : exercises.map((item) => item.id),
    templates,
    workouts,
    draft: normalizeDraft(client.draft, templates, validExerciseIds),
  };
}

function prepareState(input) {
  if (!input?.clients || !Array.isArray(input.clients) || input.clients.length === 0) {
    return createDefaultState();
  }

  const clients = input.clients.map(normalizeClient).filter(Boolean);
  if (clients.length === 0) return createDefaultState();

  const activeClientId = clients.some((client) => client.id === input.activeClientId)
    ? input.activeClientId
    : clients[0].id;

  return {
    meta: {
      updatedAt: Number(input.meta?.updatedAt || Date.now()),
    },
    admin: {
      role: "administrator",
      name: String(input.admin?.name || "Owner"),
      email: String(input.admin?.email || ""),
    },
    clients,
    activeClientId,
  };
}

function loadState() {
  if (typeof window === "undefined") return createDefaultState();

  try {
    return prepareState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return createDefaultState();
  }
}

function isCompleteFirebaseConfig(config) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

async function getFirebaseServices(config) {
  if (!isCompleteFirebaseConfig(config)) {
    throw new Error("Firebase configuration is incomplete.");
  }

  firebaseServicesPromise ||= Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]).then(([appModule, authModule, firestoreModule]) => {
    const app = appModule.getApps().length > 0 ? appModule.getApp() : appModule.initializeApp(config);
    return {
      app,
      authModule,
      firestoreModule,
    };
  });

  return firebaseServicesPromise;
}

function getWeekStart(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day + 6) % 7;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function isWithinRange(value, start, end) {
  return value >= start && value < end;
}

function countCompletedSets(entries) {
  return entries.reduce(
    (sum, entry) => sum + entry.sets.filter((set) => Number(set.reps) > 0).length,
    0
  );
}

function calculateVolume(entries) {
  return entries.reduce(
    (sum, entry) =>
      sum +
      entry.sets.reduce((entrySum, set) => entrySum + Number(set.weight || 0) * Number(set.reps || 0), 0),
    0
  );
}

function getTopSet(entry) {
  return entry.sets.reduce((best, set) => {
    const candidate = {
      weight: Number(set.weight || 0),
      reps: Number(set.reps || 0),
    };

    if (!best) return candidate;
    if (candidate.weight > best.weight) return candidate;
    if (candidate.weight === best.weight && candidate.reps > best.reps) return candidate;
    return best;
  }, null);
}

function compareTopSets(current, previous) {
  if (!current || !previous) return null;
  if (current.weight > previous.weight) return `+${current.weight - previous.weight} lb on the top set`;
  if (current.weight === previous.weight && current.reps > previous.reps) {
    return `+${current.reps - previous.reps} reps at ${current.weight} lb`;
  }
  return null;
}

function formatVolume(value) {
  return `${Math.round(value).toLocaleString()} lb`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function emptyExerciseForm() {
  return {
    id: "",
    name: "",
    slot: "Custom",
    muscle: "Chest",
    category: "Isolation",
    repRange: "8-12",
    rest: "90 sec",
    cue: "",
    mediaUrl: "",
    mediaType: "video",
  };
}

function emptyTemplateForm(exercises) {
  return {
    id: "",
    name: "",
    focus: "",
    week: "Mesocycle Week 1",
    exercises: [{ exerciseId: exercises[0]?.id || "", targetSets: 3 }],
  };
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 48rem)").matches : false
  );
  const [mobileTab, setMobileTab] = useState("dashboard");
  const [mobileWorkoutStep, setMobileWorkoutStep] = useState(0);
  const [clientNameInput, setClientNameInput] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [exerciseForm, setExerciseForm] = useState(emptyExerciseForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm(BASE_EXERCISES));
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");
  const stateRef = useRef(state);
  const applyingRemoteSyncRef = useRef(0);
  const importClientRef = useRef(null);

  const hasFirebaseConfigured = isCompleteFirebaseConfig(DEFAULT_FIREBASE_CONFIG);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const query = window.matchMedia("(max-width: 48rem)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!hasFirebaseConfigured) {
      setAuthChecked(true);
      setAuthUser(null);
      setSyncReady(false);
      return;
    }

    let cancelled = false;
    let unsubscribe = () => {};
    setAuthChecked(false);

    (async () => {
      try {
        const { app, authModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
        if (cancelled) return;
        const auth = authModule.getAuth(app);
        await authModule.setPersistence(auth, authModule.browserLocalPersistence);
        if (cancelled) return;
        unsubscribe = authModule.onAuthStateChanged(auth, (user) => {
          setAuthUser(user);
          setAuthChecked(true);
        });
      } catch {
        if (!cancelled) {
          setAuthChecked(true);
          setAuthStatus("Could not start Firebase auth. Local mode is still available.");
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hasFirebaseConfigured]);

  useEffect(() => {
    applyingRemoteSyncRef.current = 0;
    if (!hasFirebaseConfigured || !authUser?.uid) {
      setSyncReady(false);
      return;
    }

    let cancelled = false;
    let unsubscribe = () => {};
    setSyncReady(false);

    (async () => {
      try {
        const { app, firestoreModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
        if (cancelled) return;
        const db = firestoreModule.getFirestore(app);
        const userDoc = firestoreModule.doc(db, USER_SYNC_COLLECTION, authUser.uid);

        unsubscribe = firestoreModule.onSnapshot(
          userDoc,
          async (snapshot) => {
            const localState = stateRef.current;
            const localUpdatedAt = Number(localState.meta?.updatedAt || 0);

            if (!snapshot.exists()) {
              await firestoreModule.setDoc(userDoc, { data: localState }, { merge: true });
              if (!cancelled) setSyncReady(true);
              return;
            }

            const remoteState = prepareState(snapshot.data()?.data);
            const remoteUpdatedAt = Number(remoteState.meta?.updatedAt || 0);

            if (remoteUpdatedAt > localUpdatedAt) {
              applyingRemoteSyncRef.current = remoteUpdatedAt;
              if (!cancelled) setState(remoteState);
            } else if (localUpdatedAt > remoteUpdatedAt) {
              await firestoreModule.setDoc(userDoc, { data: localState }, { merge: true });
            }

            if (!cancelled) setSyncReady(true);
          },
          () => {
            if (!cancelled) {
              setSyncReady(false);
              setAuthStatus("Cloud sync failed. Local data is still intact.");
            }
          }
        );
      } catch {
        if (!cancelled) {
          setSyncReady(false);
          setAuthStatus("Cloud sync could not initialize. Local data is still intact.");
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [authUser?.uid, hasFirebaseConfigured]);

  useEffect(() => {
    if (!hasFirebaseConfigured || !authUser?.uid || !syncReady) return;
    const updatedAt = Number(state.meta?.updatedAt || 0);
    if (!updatedAt) return;
    if (applyingRemoteSyncRef.current === updatedAt) {
      applyingRemoteSyncRef.current = 0;
      return;
    }

    (async () => {
      try {
        const { app, firestoreModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
        const db = firestoreModule.getFirestore(app);
        const userDoc = firestoreModule.doc(db, USER_SYNC_COLLECTION, authUser.uid);
        await firestoreModule.setDoc(userDoc, { data: state }, { merge: true });
      } catch {
        setAuthStatus("Cloud sync could not save the latest update.");
      }
    })();
  }, [authUser?.uid, hasFirebaseConfigured, state, syncReady]);

  const activeClient = useMemo(
    () => state.clients.find((client) => client.id === state.activeClientId) || state.clients[0],
    [state]
  );
  const assignedExerciseIds = useMemo(
    () => new Set(activeClient?.assignedExerciseIds || []),
    [activeClient]
  );

  useEffect(() => {
    setExerciseForm(emptyExerciseForm());
    setTemplateForm(
      emptyTemplateForm(
        (activeClient?.exercises || BASE_EXERCISES).filter((exercise) => assignedExerciseIds.has(exercise.id))
      )
    );
    setMobileWorkoutStep(0);
  }, [activeClient?.id, assignedExerciseIds]);

  useEffect(() => {
    const totalSteps = (activeClient?.draft.entries?.length || 0) + 1;
    setMobileWorkoutStep((current) => Math.min(current, Math.max(0, totalSteps - 1)));
  }, [activeClient?.draft.entries?.length]);

  const exerciseMap = useMemo(
    () => new Map((activeClient?.exercises || []).map((exercise) => [exercise.id, exercise])),
    [activeClient]
  );
  const assignedExercises = useMemo(
    () => (activeClient?.exercises || []).filter((exercise) => assignedExerciseIds.has(exercise.id)),
    [activeClient, assignedExerciseIds]
  );
  const templateMap = useMemo(
    () => new Map((activeClient?.templates || []).map((template) => [template.id, template])),
    [activeClient]
  );
  const workouts = useMemo(
    () => [...(activeClient?.workouts || [])].sort((a, b) => new Date(b.performedAt) - new Date(a.performedAt)),
    [activeClient]
  );

  const draftTemplate = templateMap.get(activeClient?.draft?.templateId) || activeClient?.templates?.[0];

  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const previousWeekStart = new Date(thisWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const currentWeekWorkouts = workouts.filter((workout) =>
    isWithinRange(new Date(workout.performedAt), thisWeekStart, nextWeekStart)
  );

  const previousWeekWorkouts = workouts.filter((workout) =>
    isWithinRange(new Date(workout.performedAt), previousWeekStart, thisWeekStart)
  );

  const weeklySets = countCompletedSets(currentWeekWorkouts.flatMap((workout) => workout.entries));
  const previousWeeklySets = countCompletedSets(previousWeekWorkouts.flatMap((workout) => workout.entries));
  const weeklyVolume = calculateVolume(currentWeekWorkouts.flatMap((workout) => workout.entries));
  const previousWeeklyVolume = calculateVolume(previousWeekWorkouts.flatMap((workout) => workout.entries));

  const weeklyMuscleProgress = Object.entries(WEEKLY_TARGETS).map(([muscle, target]) => {
    const completed = currentWeekWorkouts.reduce((sum, workout) => {
      return (
        sum +
        workout.entries.reduce((entrySum, entry) => {
          const exercise = exerciseMap.get(entry.exerciseId);
          if (exercise?.muscle !== muscle) return entrySum;
          return entrySum + entry.sets.filter((set) => Number(set.reps) > 0).length;
        }, 0)
      );
    }, 0);

    return {
      muscle,
      target,
      completed,
      percent: Math.min(100, Math.round((completed / target) * 100)),
    };
  });

  const dailySeries = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(thisWeekStart);
    day.setDate(day.getDate() + index);
    const dayStart = new Date(day);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const matching = currentWeekWorkouts.filter((workout) =>
      isWithinRange(new Date(workout.performedAt), dayStart, dayEnd)
    );
    const entries = matching.flatMap((workout) => workout.entries);

    return {
      label: day.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      sets: countCompletedSets(entries),
      volume: calculateVolume(entries),
    };
  });

  const maxDailySets = Math.max(...dailySeries.map((item) => item.sets), 1);

  const progressionSignals = assignedExercises
    .map((exercise) => {
      const history = workouts
        .map((workout) => ({
          performedAt: workout.performedAt,
          entry: workout.entries.find((item) => item.exerciseId === exercise.id),
        }))
        .filter((item) => item.entry);

      if (history.length < 2) return null;

      const latestTopSet = getTopSet(history[0].entry);
      const previousTopSet = getTopSet(history[1].entry);
      const improvement = compareTopSets(latestTopSet, previousTopSet);

      if (!improvement) return null;

      return {
        exercise: exercise.name,
        note: improvement,
        performedAt: new Date(history[0].performedAt).toLocaleDateString(),
      };
    })
    .filter(Boolean);

  const libraryOptions = ["All", ...new Set((activeClient?.exercises || []).map((item) => item.muscle))];
  const filteredExercises = (activeClient?.exercises || []).filter((exercise) => {
    const matchesFilter = libraryFilter === "All" || exercise.muscle === libraryFilter;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      query === "" ||
      exercise.name.toLowerCase().includes(query) ||
      exercise.category.toLowerCase().includes(query) ||
      exercise.slot.toLowerCase().includes(query);

    return matchesFilter && matchesSearch;
  });

  const recentSessions = workouts.slice(0, 6).map((workout) => {
    const template = templateMap.get(workout.templateId);
    return {
      ...workout,
      templateName: template?.name || "Workout",
      focus: template?.focus || "Custom",
      hardSets: countCompletedSets(workout.entries),
      volume: calculateVolume(workout.entries),
    };
  });

  function commitState(updater) {
    setState((current) => withUpdatedMeta(updater(current)));
  }

  function showSection(tab) {
    return !isMobile || mobileTab === tab;
  }

  function updateActiveClient(updater) {
    commitState((current) => ({
      ...current,
      clients: current.clients.map((client) =>
        client.id === current.activeClientId ? updater(client) : client
      ),
    }));
  }

  function addClient() {
    const name = clientNameInput.trim();
    if (!name) return;

    const client = createClient(name);
    commitState((current) => ({
      ...current,
      activeClientId: client.id,
      clients: [...current.clients, client],
    }));
    setClientNameInput("");
    setAuthStatus("");
  }

  function removeActiveClient() {
    if (state.clients.length <= 1) return;
    const remaining = state.clients.filter((client) => client.id !== state.activeClientId);
    commitState((current) => ({
      ...current,
      activeClientId: remaining[0].id,
      clients: remaining,
    }));
  }

  function exportActiveClient() {
    if (!activeClient) return;

    const payload = JSON.stringify(activeClient, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeName = activeClient.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    anchor.href = url;
    anchor.download = `${safeName || "client"}-forge-export.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setTransferStatus(`Exported ${activeClient.name}.`);
  }

  async function handleImportClient(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const imported = normalizeClient(raw?.client || raw);
      if (!imported) throw new Error("Invalid client file.");
      const client = {
        ...imported,
        id: uid("client"),
        name: state.clients.some((item) => item.name === imported.name)
          ? `${imported.name} Imported`
          : imported.name,
      };

      commitState((current) => ({
        ...current,
        activeClientId: client.id,
        clients: [...current.clients, client],
      }));
      setTransferStatus(`Imported ${client.name}.`);
    } catch {
      setTransferStatus("Import failed. Use a client export JSON from Forge Hypertrophy.");
    } finally {
      event.target.value = "";
    }
  }

  function updateDraftTemplate(templateId) {
    setMobileWorkoutStep(0);
    updateActiveClient((client) => ({
      ...client,
      draft: createDraft(templateId, client.templates),
    }));
  }

  function toggleExerciseAssignment(exerciseId) {
    updateActiveClient((client) => {
      const assigned = new Set(client.assignedExerciseIds || []);
      if (assigned.has(exerciseId)) {
        assigned.delete(exerciseId);
      } else {
        assigned.add(exerciseId);
      }

      const assignedExerciseIds = client.exercises
        .map((exercise) => exercise.id)
        .filter((id) => assigned.has(id));

      const templates = client.templates
        .map((template) => ({
          ...template,
          exercises: template.exercises.filter((row) => assigned.has(row.exerciseId)),
        }))
        .filter((template) => template.exercises.length > 0);

      const nextTemplates = templates.length > 0 ? templates : client.templates;
      const fallbackTemplate = nextTemplates[0];
      const currentDraftTemplateId = nextTemplates.some((template) => template.id === client.draft.templateId)
        ? client.draft.templateId
        : fallbackTemplate?.id;

      const draft =
        currentDraftTemplateId && assigned.has(client.draft.entries?.[0]?.exerciseId)
          ? {
              ...client.draft,
              templateId: currentDraftTemplateId,
              entries: client.draft.entries.filter((entry) => assigned.has(entry.exerciseId)),
            }
          : createDraft(currentDraftTemplateId || fallbackTemplate?.id || client.templates[0].id, nextTemplates);

      return {
        ...client,
        assignedExerciseIds,
        templates: nextTemplates,
        draft,
      };
    });
  }

  function updateDraftMeta(field, value) {
    updateActiveClient((client) => ({
      ...client,
      draft: {
        ...client.draft,
        [field]: value,
      },
    }));
  }

  function updateSetValue(entryIndex, setIndex, field, value) {
    updateActiveClient((client) => ({
      ...client,
      draft: {
        ...client.draft,
        entries: client.draft.entries.map((entry, currentEntryIndex) => {
          if (currentEntryIndex !== entryIndex) return entry;
          return {
            ...entry,
            sets: entry.sets.map((set, currentSetIndex) => {
              if (currentSetIndex !== setIndex) return set;
              return { ...set, [field]: value === "" ? "" : String(value) };
            }),
          };
        }),
      },
    }));
  }

  function addSetToEntry(entryIndex) {
    updateActiveClient((client) => ({
      ...client,
      draft: {
        ...client.draft,
        entries: client.draft.entries.map((entry, currentEntryIndex) =>
          currentEntryIndex === entryIndex
            ? { ...entry, sets: [...entry.sets, createSet()] }
            : entry
        ),
      },
    }));
  }

  function removeSetFromEntry(entryIndex, setIndex) {
    updateActiveClient((client) => ({
      ...client,
      draft: {
        ...client.draft,
        entries: client.draft.entries.map((entry, currentEntryIndex) => {
          if (currentEntryIndex !== entryIndex || entry.sets.length === 1) return entry;
          return {
            ...entry,
            sets: entry.sets.filter((_, currentSetIndex) => currentSetIndex !== setIndex),
          };
        }),
      },
    }));
  }

  function saveWorkout() {
    const cleanedEntries = activeClient.draft.entries
      .map((entry) => ({
        ...entry,
        sets: entry.sets
          .map((set) => ({
            weight: Number(set.weight || 0),
            reps: Number(set.reps || 0),
            rir: Number(set.rir || 0),
          }))
          .filter((set) => set.reps > 0),
      }))
      .filter((entry) => entry.sets.length > 0);

    if (cleanedEntries.length === 0) return;

    const workout = {
      id: uid("workout"),
      templateId: activeClient.draft.templateId,
      performedAt: new Date(`${activeClient.draft.performedAt}T09:00:00`).toISOString(),
      notes: activeClient.draft.notes.trim(),
      entries: cleanedEntries,
    };

    setMobileWorkoutStep(0);
    updateActiveClient((client) => ({
      ...client,
      workouts: [workout, ...client.workouts],
      draft: createDraft(client.draft.templateId, client.templates),
    }));
  }

  function resetDraft() {
    setMobileWorkoutStep(0);
    updateActiveClient((client) => ({
      ...client,
      draft: createDraft(client.draft.templateId, client.templates),
    }));
  }

  function loadExerciseIntoEditor(exerciseId) {
    const exercise = activeClient.exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    setExerciseForm({ ...exercise });
  }

  function saveExercise() {
    const name = exerciseForm.name.trim();
    if (!name) return;

    const payload = {
      ...exerciseForm,
      id: exerciseForm.id || uid("exercise"),
      name,
      slot: exerciseForm.slot.trim() || "Custom",
      muscle: exerciseForm.muscle.trim() || "Other",
      category: exerciseForm.category.trim() || "Custom",
      repRange: exerciseForm.repRange.trim() || "8-12",
      rest: exerciseForm.rest.trim() || "90 sec",
      cue: exerciseForm.cue.trim(),
      mediaUrl: exerciseForm.mediaUrl.trim(),
      mediaType: exerciseForm.mediaType || "video",
    };

    updateActiveClient((client) => {
      const exists = client.exercises.some((item) => item.id === payload.id);
      const exercises = exists
        ? client.exercises.map((item) => (item.id === payload.id ? payload : item))
        : [...client.exercises, payload];
      return {
        ...client,
        exercises,
      };
    });

    setExerciseForm(emptyExerciseForm());
  }

  function loadTemplateIntoEditor(templateId) {
    const template = activeClient.templates.find((item) => item.id === templateId);
    if (!template) return;
    setTemplateForm(clone(template));
  }

  function updateTemplateRow(rowIndex, field, value) {
    setTemplateForm((current) => ({
      ...current,
      exercises: current.exercises.map((row, currentIndex) =>
        currentIndex === rowIndex ? { ...row, [field]: value } : row
      ),
    }));
  }

  function addTemplateRow() {
    setTemplateForm((current) => ({
      ...current,
      exercises: [...current.exercises, { exerciseId: assignedExercises[0]?.id || "", targetSets: 3 }],
    }));
  }

  function removeTemplateRow(rowIndex) {
    setTemplateForm((current) => ({
      ...current,
      exercises: current.exercises.length === 1
        ? current.exercises
        : current.exercises.filter((_, currentIndex) => currentIndex !== rowIndex),
    }));
  }

  function moveTemplateRow(rowIndex, direction) {
    setTemplateForm((current) => {
      const nextIndex = rowIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      const [row] = exercises.splice(rowIndex, 1);
      exercises.splice(nextIndex, 0, row);
      return {
        ...current,
        exercises,
      };
    });
  }

  function saveTemplate() {
    const name = templateForm.name.trim();
    const rows = templateForm.exercises
      .map((row) => ({
        exerciseId: row.exerciseId,
        targetSets: Math.max(1, Number(row.targetSets || 1)),
      }))
      .filter((row) => row.exerciseId);

    if (!name || rows.length === 0) return;

    const payload = {
      id: templateForm.id || uid("template"),
      name,
      focus: templateForm.focus.trim() || "Custom focus",
      week: templateForm.week.trim() || "Mesocycle",
      exercises: rows,
    };

    updateActiveClient((client) => {
      const exists = client.templates.some((item) => item.id === payload.id);
      const templates = exists
        ? client.templates.map((item) => (item.id === payload.id ? payload : item))
        : [...client.templates, payload];
      const shouldRefreshDraft = client.draft.templateId === payload.id || !exists;

      return {
        ...client,
        templates,
        draft: shouldRefreshDraft ? createDraft(payload.id, templates) : client.draft,
      };
    });

    setTemplateForm(emptyTemplateForm(assignedExercises));
  }

  async function handleSignUp() {
    if (!hasFirebaseConfigured) return;
    if (!authEmailInput.trim() || !authPasswordInput.trim()) return;

    try {
      const { app, authModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
      const auth = authModule.getAuth(app);
      await authModule.createUserWithEmailAndPassword(auth, authEmailInput.trim(), authPasswordInput);
      setAuthStatus("Account created. Cloud sync is active for this workspace.");
    } catch (error) {
      setAuthStatus(error.message || "Could not create the account.");
    }
  }

  async function handleLogIn() {
    if (!hasFirebaseConfigured) return;
    if (!authEmailInput.trim() || !authPasswordInput.trim()) return;

    try {
      const { app, authModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
      const auth = authModule.getAuth(app);
      await authModule.signInWithEmailAndPassword(auth, authEmailInput.trim(), authPasswordInput);
      setAuthStatus("Logged in. Local changes will sync to Firebase.");
    } catch (error) {
      setAuthStatus(error.message || "Could not log in.");
    }
  }

  async function handleLogOut() {
    if (!hasFirebaseConfigured) return;

    try {
      const { app, authModule } = await getFirebaseServices(DEFAULT_FIREBASE_CONFIG);
      const auth = authModule.getAuth(app);
      await authModule.signOut(auth);
      setAuthStatus("Signed out. Local mode is still available.");
    } catch (error) {
      setAuthStatus(error.message || "Could not log out.");
    }
  }

  function exportActiveClientCsv() {
    if (!activeClient) return;

    const rows = [
      [
        "client",
        "date",
        "template",
        "focus",
        "exercise",
        "muscle",
        "set_number",
        "weight_lb",
        "reps",
        "rir",
        "session_notes",
      ],
    ];

    workouts.forEach((workout) => {
      const template = templateMap.get(workout.templateId);
      workout.entries.forEach((entry) => {
        const exercise = exerciseMap.get(entry.exerciseId);
        entry.sets.forEach((set, index) => {
          rows.push([
            activeClient.name,
            new Date(workout.performedAt).toLocaleDateString(),
            template?.name || "Workout",
            template?.focus || "Custom",
            exercise?.name || entry.exerciseId,
            exercise?.muscle || "Other",
            index + 1,
            Number(set.weight || 0),
            Number(set.reps || 0),
            Number(set.rir || 0),
            workout.notes || "",
          ]);
        });
      });
    });

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const safeName = activeClient.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadTextFile(`${safeName || "client"}-report.csv`, csv, "text/csv;charset=utf-8");
    setTransferStatus(`Exported CSV report for ${activeClient.name}.`);
  }

  function exportActiveClientPdf() {
    if (!activeClient) return;

    const reportRows = recentSessions
      .map(
        (session) => `
          <tr>
            <td>${escapeHtml(new Date(session.performedAt).toLocaleDateString())}</td>
            <td>${escapeHtml(session.templateName)}</td>
            <td>${escapeHtml(String(session.hardSets))}</td>
            <td>${escapeHtml(formatVolume(session.volume))}</td>
            <td>${escapeHtml(session.notes || "")}</td>
          </tr>
        `
      )
      .join("");

    const progressRows = weeklyMuscleProgress
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.muscle)}</td>
            <td>${escapeHtml(String(item.completed))}</td>
            <td>${escapeHtml(String(item.target))}</td>
          </tr>
        `
      )
      .join("");

    const win = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
    if (!win) {
      setTransferStatus("Popup blocked. Allow popups to generate the PDF report.");
      return;
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(activeClient.name)} Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #1d1b19; }
            h1, h2 { margin: 0 0 12px; }
            p { margin: 0 0 8px; color: #655d56; }
            .stats { display: flex; gap: 12px; margin: 20px 0; }
            .stat { border: 1px solid #d4c3b3; border-radius: 12px; padding: 12px 14px; min-width: 140px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e2d6ca; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #f5ece2; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(activeClient.name)} Weekly Report</h1>
          <p>${escapeHtml(activeClient.goal || "")}</p>
          <p>${escapeHtml(activeClient.notes || "")}</p>
          <div class="stats">
            <div class="stat"><strong>${escapeHtml(String(weeklySets))}</strong><br/>Hard sets</div>
            <div class="stat"><strong>${escapeHtml(formatVolume(weeklyVolume))}</strong><br/>Weekly volume</div>
            <div class="stat"><strong>${escapeHtml(String(progressionSignals.length))}</strong><br/>Progress signals</div>
          </div>
          <h2>Recent Check-ins</h2>
          <table>
            <thead>
              <tr><th>Date</th><th>Template</th><th>Sets</th><th>Volume</th><th>Notes</th></tr>
            </thead>
            <tbody>${reportRows}</tbody>
          </table>
          <h2 style="margin-top: 28px;">Muscle Targets</h2>
          <table>
            <thead>
              <tr><th>Muscle</th><th>Completed</th><th>Target</th></tr>
            </thead>
            <tbody>${progressRows}</tbody>
          </table>
        </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    setTransferStatus(`Opened PDF report for ${activeClient.name}.`);
  }

  function renderDraftEntry(entry, entryIndex) {
    const exercise = exerciseMap.get(entry.exerciseId);
    const recentWorkout = workouts.find((workout) =>
      workout.entries.some((item) => item.exerciseId === entry.exerciseId)
    );
    const recentEntry = recentWorkout?.entries.find((item) => item.exerciseId === entry.exerciseId);
    const topSet = recentEntry ? getTopSet(recentEntry) : null;

    return (
      <Paper key={entry.exerciseId} radius="xl" withBorder className="exercise-card">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" className="exercise-head">
            <div>
              <Text fw={700} size="lg">
                {exercise?.name || "Exercise"}
              </Text>
              <Text size="sm" c="dimmed">
                {exercise?.muscle || "Other"} · {exercise?.repRange || "8-12"} reps · {exercise?.rest || "90 sec"} rest
              </Text>
            </div>
            <Badge variant="light" color="dark">
              {entry.targetSets} target sets
            </Badge>
          </Group>

          <Text size="sm" className="cue-text">
            {exercise?.cue || "Add coaching cues in the exercise studio."}
          </Text>
          {exercise?.mediaUrl ? (
            <div className="media-block">
              {exercise.mediaType === "image" ? (
                <img className="exercise-media" src={exercise.mediaUrl} alt={`${exercise.name} demo`} />
              ) : (
                <iframe
                  className="exercise-media"
                  src={exercise.mediaUrl}
                  title={`${exercise.name} demo`}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
              <Text size="sm">
                <a href={exercise.mediaUrl} target="_blank" rel="noreferrer">
                  Open {exercise.mediaType === "image" ? "image" : "video"} demo for {exercise.name}
                </a>
              </Text>
            </div>
          ) : null}

          {topSet ? (
            <Text size="sm" c="dimmed">
              Last top set: {topSet.weight} lb x {topSet.reps} on{" "}
              {new Date(recentWorkout.performedAt).toLocaleDateString()}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              No prior exposure logged yet. This session will set the baseline.
            </Text>
          )}

          <Stack gap="xs">
            {entry.sets.map((set, setIndex) => (
              <SimpleGrid
                key={`${entry.exerciseId}-${setIndex}`}
                cols={{ base: 1, sm: 5 }}
                spacing="sm"
                className="set-row"
              >
                <NumberInput
                  label={`Set ${setIndex + 1} Weight`}
                  min={0}
                  value={set.weight}
                  onChange={(value) => updateSetValue(entryIndex, setIndex, "weight", value)}
                  suffix=" lb"
                />
                <NumberInput
                  label="Reps"
                  min={0}
                  value={set.reps}
                  onChange={(value) => updateSetValue(entryIndex, setIndex, "reps", value)}
                />
                <NumberInput
                  label="RIR"
                  min={0}
                  max={5}
                  value={set.rir}
                  onChange={(value) => updateSetValue(entryIndex, setIndex, "rir", value)}
                />
                <div className="set-chip">
                  <Text size="xs" tt="uppercase" fw={700}>
                    Prescription
                  </Text>
                  <Text fw={700}>{exercise?.repRange || "8-12"}</Text>
                </div>
                <Button
                  color="red"
                  variant="subtle"
                  className="remove-set-btn"
                  onClick={() => removeSetFromEntry(entryIndex, setIndex)}
                >
                  Remove set
                </Button>
              </SimpleGrid>
            ))}
          </Stack>

          <Group justify="space-between" className="inline-actions">
            <Button variant="light" onClick={() => addSetToEntry(entryIndex)}>
              Add back-off set
            </Button>
            <Text size="sm" c="dimmed">
              Progress load or reps before layering more fatigue.
            </Text>
          </Group>
        </Stack>
      </Paper>
    );
  }

  if (hasFirebaseConfigured && authChecked && !authUser) {
    return (
      <div className="app-shell">
        <Container size="sm" py="xl">
          <Card radius="xl" withBorder className="app-card">
            <Stack gap="md">
              <Badge variant="light" color="orange">
                Administrator Access
              </Badge>
              <Title order={2}>Log in to manage your clients</Title>
              <Text size="sm" c="dimmed">
                Firebase auth is enabled for the live app. Use your administrator email and password to open the
                coaching workspace.
              </Text>
              <TextInput
                label="Admin email"
                placeholder="owner@yourbusiness.com"
                value={authEmailInput}
                onChange={(event) => setAuthEmailInput(event.currentTarget.value)}
              />
              <TextInput
                type="password"
                label="Password"
                placeholder="Enter password"
                value={authPasswordInput}
                onChange={(event) => setAuthPasswordInput(event.currentTarget.value)}
              />
              <Group grow className="footer-actions">
                <Button variant="light" onClick={handleSignUp}>
                  Create admin account
                </Button>
                <Button onClick={handleLogIn}>Log in</Button>
              </Group>
              {authStatus ? <Text size="sm">{authStatus}</Text> : null}
            </Stack>
          </Card>
        </Container>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Container size="xl" py="xl">
        <Stack gap="xl" className="page-stack">
          <section id="dashboard" hidden={!showSection("dashboard")} className="app-section">
          <Card radius={28} className="hero-card">
            <Grid align="center" gutter="xl">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Stack gap="lg">
                  <Group gap="sm" className="hero-metrics">
                    <Badge variant="white" color="dark" className="hero-badge">
                      Coaching workspace
                    </Badge>
                    <Badge variant="outline" color="gray" className="hero-outline">
                      {draftTemplate?.week || "Mesocycle"}
                    </Badge>
                  </Group>
                  <div>
                    <Title order={1} className="hero-title">
                      Forge a client-ready hypertrophy system, not just a workout log.
                    </Title>
                    <Text className="hero-copy">
                      Manage multiple lifters, customize the exercise library and templates, then sync the whole
                      coaching workspace with Firebase when you are ready to go cross-device.
                    </Text>
                  </div>
                  <Group gap="sm">
                    <MetricPill label="Active client" value={activeClient?.name || "Client"} />
                    <MetricPill label="This week" value={`${weeklySets} hard sets`} />
                    <MetricPill label="Volume" value={formatVolume(weeklyVolume)} />
                    <MetricPill label="Templates" value={`${activeClient?.templates.length || 0} live`} />
                  </Group>
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Paper radius="xl" className="hero-panel">
                  <Stack gap="md">
                    <Text className="panel-label">Coach snapshot</Text>
                    <SimpleGrid cols={2}>
                      <SnapshotStat
                        label="Set pace"
                        value={`${weeklySets - previousWeeklySets >= 0 ? "+" : ""}${weeklySets - previousWeeklySets}`}
                        helper="vs last week"
                      />
                      <SnapshotStat
                        label="Volume pace"
                        value={`${weeklyVolume >= previousWeeklyVolume ? "+" : ""}${Math.round(
                          weeklyVolume - previousWeeklyVolume
                        ).toLocaleString()}`}
                        helper="lb moved"
                      />
                      <SnapshotStat
                        label="PR signals"
                        value={String(progressionSignals.length)}
                        helper="recent wins"
                      />
                      <SnapshotStat
                        label="Cloud"
                        value={authUser ? "Synced" : "Local"}
                        helper={authUser ? authUser.email || "Firebase active" : "offline-ready"}
                      />
                    </SimpleGrid>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          </Card>
          </section>

          <section id="workout" hidden={!showSection("workout")} className="app-section">
          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, lg: 8 }}>
              <MobilePanel title="Workout Builder" defaultOpen={true}>
              <Card radius="xl" withBorder className="app-card">
                <Stack gap="lg">
                  <Group justify="space-between" align="flex-end" className="section-head">
                    <div>
                      <Title order={3}>Workout Builder</Title>
                      <Text size="sm" c="dimmed">
                        Log each set for {activeClient?.name}, then roll it into weekly progress automatically.
                      </Text>
                    </div>
                    <Badge variant="light" color="orange">
                      RIR target: 1-3
                    </Badge>
                  </Group>

                  <SimpleGrid cols={{ base: 1, md: 3 }}>
                    <Select
                      label="Template"
                      data={(activeClient?.templates || []).map((template) => ({
                        value: template.id,
                        label: `${template.name} · ${template.focus}`,
                      }))}
                      value={activeClient?.draft.templateId || null}
                      onChange={(value) => value && updateDraftTemplate(value)}
                    />
                    <TextInput
                      type="date"
                      label="Session date"
                      value={activeClient?.draft.performedAt || ""}
                      onChange={(event) => updateDraftMeta("performedAt", event.currentTarget.value)}
                    />
                    <TextInput label="Block" value={draftTemplate?.week || ""} readOnly />
                  </SimpleGrid>

                  <Textarea
                    label="Coach notes"
                    placeholder="Execution notes, fatigue flags, client feedback..."
                    minRows={2}
                    value={activeClient?.draft.notes || ""}
                    onChange={(event) => updateDraftMeta("notes", event.currentTarget.value)}
                  />

                  {isMobile ? (
                    <Stack gap="md">
                      <Paper withBorder radius="xl" className="status-card">
                        <Group justify="space-between" align="center">
                          <div>
                            <Text fw={700}>
                              Step {mobileWorkoutStep + 1} of {(activeClient?.draft.entries?.length || 0) + 1}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {mobileWorkoutStep === 0
                                ? "Set the session, then move through each exercise one at a time."
                                : exerciseMap.get(activeClient.draft.entries[mobileWorkoutStep - 1]?.exerciseId)?.name}
                            </Text>
                          </div>
                          <Badge variant="light" color="orange">
                            Mobile flow
                          </Badge>
                        </Group>
                      </Paper>

                      {mobileWorkoutStep === 0 ? (
                        <Paper radius="xl" withBorder className="exercise-card">
                          <Stack gap="sm">
                            <Text fw={700}>Session Setup</Text>
                            <Text size="sm" c="dimmed">
                              Confirm the workout shell before logging sets.
                            </Text>
                            <SimpleGrid cols={1}>
                              <TextInput label="Client" value={activeClient?.name || ""} readOnly />
                              <TextInput label="Goal" value={activeClient?.goal || ""} readOnly />
                              <TextInput label="Block" value={draftTemplate?.week || ""} readOnly />
                            </SimpleGrid>
                          </Stack>
                        </Paper>
                      ) : (
                        renderDraftEntry(activeClient.draft.entries[mobileWorkoutStep - 1], mobileWorkoutStep - 1)
                      )}

                      <Group justify="space-between" className="footer-actions">
                        <Button
                          variant="subtle"
                          color="gray"
                          disabled={mobileWorkoutStep === 0}
                          onClick={() => setMobileWorkoutStep((current) => Math.max(0, current - 1))}
                        >
                          Back
                        </Button>
                        {mobileWorkoutStep < (activeClient?.draft.entries?.length || 0) ? (
                          <Button onClick={() => setMobileWorkoutStep((current) => current + 1)}>
                            Next
                          </Button>
                        ) : (
                          <Button onClick={saveWorkout}>Save workout</Button>
                        )}
                      </Group>
                    </Stack>
                  ) : (
                    <Stack gap="md">
                      {(activeClient?.draft.entries || []).map((entry, entryIndex) =>
                        renderDraftEntry(entry, entryIndex)
                      )}
                    </Stack>
                  )}

                  <Group justify="flex-end" className="footer-actions">
                    <Button variant="subtle" color="gray" onClick={resetDraft}>
                      Reset draft
                    </Button>
                    <Button onClick={saveWorkout}>Save workout</Button>
                  </Group>
                </Stack>
              </Card>
              </MobilePanel>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 4 }}>
              <Stack gap="lg">
                <MobilePanel title="Client Profiles" defaultOpen={false}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Group justify="space-between" className="section-head">
                      <div>
                        <Title order={3}>Client Profiles</Title>
                        <Text size="sm" c="dimmed">
                          Signed in as {authUser?.email || state.admin.email || "local administrator"}.
                        </Text>
                      </div>
                      <Badge variant="light" color="orange">
                        Administrator
                      </Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <Select
                        label="Active profile"
                        data={state.clients.map((client) => ({
                          value: client.id,
                          label: client.name,
                        }))}
                        value={state.activeClientId}
                        onChange={(value) =>
                          value &&
                          setState((current) => ({
                            ...current,
                            activeClientId: value,
                          }))
                        }
                      />
                      <TextInput
                        label="New client"
                        placeholder="Avery Brooks"
                        value={clientNameInput}
                        onChange={(event) => setClientNameInput(event.currentTarget.value)}
                      />
                    </SimpleGrid>
                    <Group justify="space-between" className="client-toolbar">
                      <Button variant="light" onClick={addClient}>
                        Add client
                      </Button>
                      <Group gap="xs" className="client-action-group">
                        <Button variant="subtle" color="gray" onClick={exportActiveClient}>
                          Export client
                        </Button>
                        <Button variant="subtle" color="gray" onClick={() => importClientRef.current?.click()}>
                          Import client
                        </Button>
                        <Button variant="subtle" color="gray" onClick={exportActiveClientCsv}>
                          Export CSV
                        </Button>
                        <Button variant="subtle" color="gray" onClick={exportActiveClientPdf}>
                          Export PDF
                        </Button>
                        <Button
                          color="red"
                          variant="subtle"
                          onClick={removeActiveClient}
                          disabled={state.clients.length <= 1}
                        >
                          Remove active client
                        </Button>
                      </Group>
                    </Group>
                    <input
                      ref={importClientRef}
                      type="file"
                      accept="application/json"
                      hidden
                      onChange={handleImportClient}
                    />
                    <TextInput
                      label="Client name"
                      value={activeClient?.name || ""}
                      onChange={(event) =>
                        updateActiveClient((client) => ({ ...client, name: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Primary goal"
                      value={activeClient?.goal || ""}
                      onChange={(event) =>
                        updateActiveClient((client) => ({ ...client, goal: event.currentTarget.value }))
                      }
                    />
                    <Textarea
                      label="Profile notes"
                      minRows={3}
                      value={activeClient?.notes || ""}
                      onChange={(event) =>
                        updateActiveClient((client) => ({ ...client, notes: event.currentTarget.value }))
                      }
                    />
                    <Paper withBorder radius="lg" className="status-card">
                      <Stack gap="xs">
                        <Text fw={700}>Assigned Exercises</Text>
                        <Text size="sm" c="dimmed">
                          Turn movements on or off for {activeClient?.name}. Only assigned exercises appear in their
                          templates and workout logger.
                        </Text>
                        <Group gap="xs" className="client-action-group">
                          {(activeClient?.exercises || []).map((exercise) => {
                            const assigned = assignedExerciseIds.has(exercise.id);
                            return (
                              <Button
                                key={exercise.id}
                                variant={assigned ? "filled" : "light"}
                                color={assigned ? "orange" : "gray"}
                                onClick={() => toggleExerciseAssignment(exercise.id)}
                              >
                                {assigned ? `Assigned: ${exercise.name}` : `Assign: ${exercise.name}`}
                              </Button>
                            );
                          })}
                        </Group>
                      </Stack>
                    </Paper>
                    {transferStatus ? (
                      <Paper withBorder radius="lg" className="status-card">
                        <Text size="sm">{transferStatus}</Text>
                      </Paper>
                    ) : null}
                  </Stack>
                </Card>
                </MobilePanel>

                <MobilePanel title="Weekly Progress" defaultOpen={true}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Title order={3}>Weekly Progress</Title>
                    <Text size="sm" c="dimmed">
                      Monitor workload distribution for {activeClient?.name}.
                    </Text>
                    <div className="week-chart">
                      {dailySeries.map((day) => (
                        <div className="week-column" key={day.label}>
                          <Text size="xs" c="dimmed">
                            {day.sets} sets
                          </Text>
                          <div
                            className="week-bar"
                            style={{ height: `${24 + (day.sets / maxDailySets) * 156}px` }}
                            title={`${day.sets} sets · ${formatVolume(day.volume)}`}
                          />
                          <Text fw={700} size="sm">
                            {day.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {day.dateLabel}
                          </Text>
                        </div>
                      ))}
                    </div>
                    {weeklyMuscleProgress.map((item) => (
                      <div key={item.muscle}>
                        <Group justify="space-between" mb={6}>
                          <Text fw={700}>{item.muscle}</Text>
                          <Text size="sm" c="dimmed">
                            {item.completed} / {item.target} sets
                          </Text>
                        </Group>
                        <Progress value={item.percent} radius="xl" />
                      </div>
                    ))}
                  </Stack>
                </Card>
                </MobilePanel>

                <MobilePanel title="Cloud Sync" defaultOpen={false}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Title order={3}>Cloud Sync</Title>
                    <Text size="sm" c="dimmed">
                      Email/password auth and Firebase sync for all client profiles in this workspace.
                    </Text>
                    {!hasFirebaseConfigured ? (
                      <Text size="sm" c="dimmed">
                        Add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and
                        `VITE_FIREBASE_APP_ID` to enable auth and sync. Local storage already works.
                      </Text>
                    ) : (
                      <>
                        <TextInput
                          label="Email"
                          placeholder="coach@yourgym.com"
                          value={authEmailInput}
                          onChange={(event) => setAuthEmailInput(event.currentTarget.value)}
                        />
                        <TextInput
                          type="password"
                          label="Password"
                          placeholder="Enter password"
                          value={authPasswordInput}
                          onChange={(event) => setAuthPasswordInput(event.currentTarget.value)}
                        />
                        <Group grow>
                          <Button variant="light" onClick={handleSignUp}>
                            Create account
                          </Button>
                          <Button onClick={handleLogIn}>Log in</Button>
                        </Group>
                        <Button variant="subtle" color="gray" onClick={handleLogOut} disabled={!authUser}>
                          Log out
                        </Button>
                        <Paper withBorder radius="lg" className="status-card">
                          <Stack gap={4}>
                            <Text fw={700}>{authUser ? "Authenticated" : "Local mode"}</Text>
                            <Text size="sm" c="dimmed">
                              {!hasFirebaseConfigured
                                ? "Firebase is not configured."
                                : !authChecked
                                  ? "Checking saved session..."
                                  : authUser
                                    ? syncReady
                                      ? `Sync ready for ${authUser.email || "this account"}.`
                                      : "Connected account found. Initial sync is still loading."
                                    : "No cloud session. Data stays on this device until you log in."}
                            </Text>
                            {authStatus ? <Text size="sm">{authStatus}</Text> : null}
                          </Stack>
                        </Paper>
                      </>
                    )}
                  </Stack>
                </Card>
                </MobilePanel>
              </Stack>
            </Grid.Col>
          </Grid>
          </section>

          <section id="library" hidden={!showSection("library")} className="app-section">
          <Grid gutter="lg">
            <Grid.Col span={{ base: 12, lg: 6 }}>
              <MobilePanel title="Exercise Studio" defaultOpen={false}>
              <Card radius="xl" withBorder className="app-card">
                <Stack gap="md">
                  <Group justify="space-between" align="flex-end" className="section-head">
                    <div>
                      <Title order={3}>Exercise Studio</Title>
                      <Text size="sm" c="dimmed">
                        Create and edit client-specific movements, cues, and prescriptions.
                      </Text>
                    </div>
                    <Badge variant="light" color="green">
                      {filteredExercises.length} filtered
                    </Badge>
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Select
                      label="Muscle group"
                      data={libraryOptions}
                      value={libraryFilter}
                      onChange={(value) => setLibraryFilter(value || "All")}
                    />
                    <TextInput
                      label="Search"
                      placeholder="Press, curl, squat..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                    />
                  </SimpleGrid>

                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <TextInput
                      label="Exercise name"
                      value={exerciseForm.name}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, name: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Workout slot"
                      value={exerciseForm.slot}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, slot: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Muscle"
                      value={exerciseForm.muscle}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, muscle: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Category"
                      value={exerciseForm.category}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, category: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Rep range"
                      value={exerciseForm.repRange}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, repRange: event.currentTarget.value }))
                      }
                    />
                    <TextInput
                      label="Rest"
                      value={exerciseForm.rest}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, rest: event.currentTarget.value }))
                      }
                    />
                    <Select
                      label="Media type"
                      data={[
                        { value: "video", label: "Video" },
                        { value: "image", label: "Image" },
                      ]}
                      value={exerciseForm.mediaType}
                      onChange={(value) =>
                        setExerciseForm((current) => ({ ...current, mediaType: value || "video" }))
                      }
                    />
                    <TextInput
                      label="Media URL"
                      placeholder="https://..."
                      value={exerciseForm.mediaUrl}
                      onChange={(event) =>
                        setExerciseForm((current) => ({ ...current, mediaUrl: event.currentTarget.value }))
                      }
                    />
                  </SimpleGrid>
                  <Textarea
                    label="Coaching cue"
                    minRows={2}
                    value={exerciseForm.cue}
                    onChange={(event) =>
                      setExerciseForm((current) => ({ ...current, cue: event.currentTarget.value }))
                    }
                  />
                    <Group justify="flex-end" className="footer-actions">
                    <Button variant="subtle" color="gray" onClick={() => setExerciseForm(emptyExerciseForm())}>
                      New exercise
                    </Button>
                    <Button onClick={saveExercise}>
                      {exerciseForm.id ? "Save exercise" : "Add exercise"}
                    </Button>
                  </Group>

                  <ScrollArea h={420} offsetScrollbars>
                    <Stack gap="sm">
                      {filteredExercises.map((exercise) => (
                        <Paper key={exercise.id} withBorder radius="lg" className="library-row">
                          <Group justify="space-between" align="flex-start" className="library-head">
                            <div>
                              <Text fw={700}>{exercise.name}</Text>
                              <Text size="sm" c="dimmed">
                                {exercise.slot} · {exercise.muscle} · {exercise.category}
                              </Text>
                              <Text size="sm">
                                {exercise.repRange} reps · {exercise.rest} rest
                              </Text>
                              <Text size="sm" c="dimmed">
                                {exercise.cue}
                              </Text>
                              {exercise.mediaUrl ? (
                                <div className="media-block compact-media">
                                  {exercise.mediaType === "image" ? (
                                    <img className="exercise-media" src={exercise.mediaUrl} alt={`${exercise.name} demo`} />
                                  ) : (
                                    <iframe
                                      className="exercise-media"
                                      src={exercise.mediaUrl}
                                      title={`${exercise.name} demo`}
                                      loading="lazy"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                    />
                                  )}
                                  <Text size="sm">
                                    <a href={exercise.mediaUrl} target="_blank" rel="noreferrer">
                                      Open {exercise.mediaType === "image" ? "image" : "video"} demo
                                    </a>
                                  </Text>
                                </div>
                              ) : null}
                            </div>
                            <Button variant="light" onClick={() => loadExerciseIntoEditor(exercise.id)}>
                              Edit
                            </Button>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Card>
              </MobilePanel>
            </Grid.Col>

            <Grid.Col span={{ base: 12, lg: 6 }}>
              <Stack gap="lg">
                <MobilePanel title="Template Studio" defaultOpen={false}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-end" className="section-head">
                      <div>
                        <Title order={3}>Template Studio</Title>
                        <Text size="sm" c="dimmed">
                          Build custom training days from the current client exercise library.
                        </Text>
                      </div>
                      <Badge variant="light" color="blue">
                        {activeClient?.templates.length || 0} templates
                      </Badge>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                      <TextInput
                        label="Template name"
                        value={templateForm.name}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, name: event.currentTarget.value }))
                        }
                      />
                      <TextInput
                        label="Focus"
                        value={templateForm.focus}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, focus: event.currentTarget.value }))
                        }
                      />
                      <TextInput
                        label="Mesocycle label"
                        value={templateForm.week}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, week: event.currentTarget.value }))
                        }
                      />
                    </SimpleGrid>
                    <Stack gap="xs">
                      {templateForm.exercises.map((row, rowIndex) => (
                        <SimpleGrid key={`${row.exerciseId}-${rowIndex}`} cols={{ base: 1, sm: 3 }} className="set-row">
                          <Select
                            label={`Exercise ${rowIndex + 1}`}
                            data={assignedExercises.map((exercise) => ({
                              value: exercise.id,
                              label: exercise.name,
                            }))}
                            value={row.exerciseId}
                            onChange={(value) => updateTemplateRow(rowIndex, "exerciseId", value || "")}
                          />
                          <NumberInput
                            label="Target sets"
                            min={1}
                            max={8}
                            value={row.targetSets}
                            onChange={(value) => updateTemplateRow(rowIndex, "targetSets", Number(value || 1))}
                          />
                          <Button
                            color="red"
                            variant="subtle"
                            className="remove-set-btn"
                            onClick={() => removeTemplateRow(rowIndex)}
                          >
                            Remove row
                          </Button>
                          <Group gap="xs" className="row-order-controls">
                            <Button
                              variant="light"
                              onClick={() => moveTemplateRow(rowIndex, -1)}
                              disabled={rowIndex === 0}
                            >
                              Move up
                            </Button>
                            <Button
                              variant="light"
                              onClick={() => moveTemplateRow(rowIndex, 1)}
                              disabled={rowIndex === templateForm.exercises.length - 1}
                            >
                              Move down
                            </Button>
                          </Group>
                        </SimpleGrid>
                      ))}
                    </Stack>
                    <Group justify="space-between" className="template-toolbar">
                      <Button variant="light" onClick={addTemplateRow}>
                        Add row
                      </Button>
                      <Group gap="sm" className="footer-actions">
                        <Button
                          variant="subtle"
                          color="gray"
                          onClick={() => setTemplateForm(emptyTemplateForm(assignedExercises))}
                        >
                          New template
                        </Button>
                        <Button onClick={saveTemplate}>
                          {templateForm.id ? "Save template" : "Add template"}
                        </Button>
                      </Group>
                    </Group>

                    <Stack gap="sm">
                      {activeClient.templates.map((template) => (
                        <Paper key={template.id} withBorder radius="lg" className="library-row">
                          <Group justify="space-between" align="flex-start" className="library-head">
                            <div>
                              <Text fw={700}>{template.name}</Text>
                              <Text size="sm" c="dimmed">
                                {template.focus} · {template.week}
                              </Text>
                              <Text size="sm">
                                {template.exercises.length} exercise slots
                              </Text>
                            </div>
                            <Group gap="xs" className="inline-actions">
                              <Button variant="light" onClick={() => updateDraftTemplate(template.id)}>
                                Use
                              </Button>
                              <Button variant="light" onClick={() => loadTemplateIntoEditor(template.id)}>
                                Edit
                              </Button>
                            </Group>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </Stack>
                </Card>
                </MobilePanel>

                <MobilePanel title="Recent Check-ins" defaultOpen={true}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Title order={3}>Recent Check-ins</Title>
                    <Text size="sm" c="dimmed">
                      Session history with hard sets and total volume for {activeClient?.name}.
                    </Text>
                    {recentSessions.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No workouts logged yet for this client.
                      </Text>
                    ) : (
                      recentSessions.map((session) => (
                        <Paper key={session.id} withBorder radius="lg" className="session-row">
                          <Group justify="space-between" align="flex-start" className="library-head">
                            <div>
                              <Text fw={700}>
                                {session.templateName} · {new Date(session.performedAt).toLocaleDateString()}
                              </Text>
                              <Text size="sm" c="dimmed">
                                {session.focus}
                              </Text>
                              {session.notes ? (
                                <Text size="sm" className="session-note">
                                  {session.notes}
                                </Text>
                              ) : null}
                            </div>
                            <Group gap="xs" className="inline-actions">
                              <Badge variant="light" color="orange">
                                {session.hardSets} sets
                              </Badge>
                              <Badge variant="light" color="dark">
                                {formatVolume(session.volume)}
                              </Badge>
                            </Group>
                          </Group>
                        </Paper>
                      ))
                    )}
                  </Stack>
                </Card>
                </MobilePanel>

                <MobilePanel title="Progress Signals" defaultOpen={true}>
                <Card radius="xl" withBorder className="app-card">
                  <Stack gap="md">
                    <Title order={3}>Progress Signals</Title>
                    <Text size="sm" c="dimmed">
                      Recent overload wins pulled from the current client history.
                    </Text>
                    {progressionSignals.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Log two exposures for the same exercise to surface progression signals.
                      </Text>
                    ) : (
                      progressionSignals.slice(0, 5).map((signal) => (
                        <Paper key={`${signal.exercise}-${signal.performedAt}`} radius="lg" withBorder className="signal-row">
                          <Group align="flex-start" wrap="nowrap" className="signal-layout">
                            <ThemeIcon radius="xl" size={36} variant="light" color="orange">
                              PR
                            </ThemeIcon>
                            <div>
                              <Text fw={700}>{signal.exercise}</Text>
                              <Text size="sm" c="dimmed">
                                {signal.note} on {signal.performedAt}
                              </Text>
                            </div>
                          </Group>
                        </Paper>
                      ))
                    )}
                  </Stack>
                </Card>
                </MobilePanel>
              </Stack>
            </Grid.Col>
          </Grid>
          </section>
          <MobileBottomNav activeTab={mobileTab} onChange={setMobileTab} />
        </Stack>
      </Container>
    </div>
  );
}

function MetricPill({ label, value }) {
  return (
    <Paper radius="xl" className="metric-pill">
      <Text size="xs" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </Paper>
  );
}

function SnapshotStat({ label, value, helper }) {
  return (
    <div className="snapshot-stat">
      <Text className="snapshot-label">{label}</Text>
      <Text className="snapshot-value">{value}</Text>
      <Text size="sm" c="dimmed">
        {helper}
      </Text>
    </div>
  );
}

function MobilePanel({ title, defaultOpen = false, children }) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 48rem)").matches : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const query = window.matchMedia("(max-width: 48rem)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!mobile) {
    return children;
  }

  return (
    <div className="mobile-panel">
      <details className="mobile-panel-details" open={defaultOpen}>
        <summary>{title}</summary>
        <div className="mobile-panel-body">{children}</div>
      </details>
    </div>
  );
}

function MobileBottomNav({ activeTab, onChange }) {
  const items = [
    { id: "dashboard", label: "Dashboard" },
    { id: "workout", label: "Workout" },
    { id: "library", label: "Library" },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile sections">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`mobile-nav-btn${activeTab === item.id ? " active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
