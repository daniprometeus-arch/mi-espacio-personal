"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  LayoutDashboard,
  FolderOpen,
  GraduationCap,
  ClipboardCheck,
  CalendarDays,
  BarChart3,
  NotebookPen,
  FolderKanban,
  Layers,
  Target,
  Timer,
  Settings,
  Search,
  Bell,
  Sun,
  Moon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Check,
  ArrowUpRight,
  GripVertical,
  Maximize2,
  RotateCcw,
  Play,
  Pause,
  Flame,
  Download,
  Cloud,
  CloudOff,
  LogOut,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCheck,
  MoreHorizontal,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import {
  AppState,
  Collection,
  Item,
  initialState,
  newItem,
  stateSchema,
  dayKey,
  streak,
  courseProgress,
  scoreQuiz,
  youtubeId,
  widgetIds,
} from "@/lib/model";
import { Library, CalendarPanel } from "./google-panels";

const nav = [
  { id: "home", label: "Inicio", icon: LayoutDashboard },
  { id: "library", label: "Biblioteca", icon: FolderOpen },
  { id: "courses", label: "Cursos y apuntes", icon: GraduationCap },
  { id: "practice", label: "Práctica", icon: ClipboardCheck },
  { id: "calendar", label: "Calendario y tareas", icon: CalendarDays },
  { id: "stats", label: "Progreso", icon: BarChart3 },
  { id: "notes", label: "Bloc de notas", icon: NotebookPen },
  { id: "projects", label: "Proyectos", icon: FolderKanban },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "habits", label: "Objetivos y hábitos", icon: Target },
  { id: "timer", label: "Pomodoro", icon: Timer },
  { id: "settings", label: "Configuración", icon: Settings },
];
const widgetNames: Record<string, string> = {
  welcome: "Panel personal",
  streak: "Racha de estudio",
  tasks: "Tareas de hoy",
  pomodoro: "Pomodoro",
  calendar: "Próximo",
  note: "Nota rápida",
  activity: "Actividad semanal",
  goals: "Mis objetivos",
  documents: "Documentos recientes",
  shortcuts: "Accesos rápidos",
};
export type Change = (fn: (state: AppState) => AppState) => void;
export type Notify = (message: string) => void;
export async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(
      j.error ?? "No se pudo completar la operación",
    ) as Error & { status: number };
    e.status = r.status;
    throw e;
  }
  return j;
}
export function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
export function exportData(state: AppState) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `mi-espacio-${dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Workspace({
  name,
  email,
  demo,
}: {
  name: string;
  email: string;
  demo: boolean;
}) {
  const [driveRecent, setDriveRecent] = useState<
      { id: string; name: string; webViewLink?: string }[]
    >([]),
    [googleUpcoming, setGoogleUpcoming] = useState<
      {
        id: string;
        summary?: string;
        start: { dateTime?: string; date?: string };
        htmlLink?: string;
      }[]
    >([]);
  const [state, setState] = useState<AppState>(initialState),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState("home"),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [notice, setNotice] = useState(false),
    [customize, setCustomize] = useState(false),
    [editing, setEditing] = useState<{
      kind: Collection;
      item?: Item;
      defaults?: Partial<Item>;
    } | null>(null),
    [status, setStatus] = useState(demo ? "local" : "loading"),
    [authNeeded, setAuthNeeded] = useState(false),
    [remote, setRemote] = useState<{
      fileId: string | null;
      etag: string | null;
    }>({ fileId: null, etag: null }),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [recovery, setRecovery] = useState<AppState | null>(null);
  const stateRef = useRef(state),
    version = useRef(0),
    saving = useRef(false),
    draftKey = `mep-draft-${demo ? "demo" : email}`,
    statusRef = useRef(status);
  stateRef.current = state;
  statusRef.current = status;
  const notify: Notify = useCallback((m) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const loadRemote = useCallback(async () => {
    setStatus("loading");
    try {
      const r = await api("/api/state");
      setState(r.state);
      stateRef.current = r.state;
      setRemote({ fileId: r.fileId, etag: r.etag });
      setStatus("synced");
      setDirty(false);
      setConflict(false);
      setLoaded(true);
      setAuthNeeded(false);
    } catch (e) {
      setStatus("error");
      setAuthNeeded((e as Error & { status?: number }).status === 401);
      notify((e as Error).message);
    }
  }, [notify]);
  useEffect(() => {
    let draft: AppState | null = null;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) draft = stateSchema.parse(JSON.parse(raw));
    } catch {}
    if (demo) {
      setState(draft ?? initialState());
      setLoaded(true);
      setStatus("local");
    } else {
      if (draft) setRecovery(draft);
      void loadRemote();
    }
  }, [demo, draftKey, loadRemote]);
  const change: Change = useCallback(
    (fn) => {
      if (
        !loaded ||
        statusRef.current === "loading" ||
        statusRef.current === "error"
      )
        return;
      setState((s) => ({ ...fn(s), updatedAt: new Date().toISOString() }));
      version.current++;
      setDirty(true);
      setStatus((previous) => (previous === "synced" ? "pending" : previous));
    },
    [loaded],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);
  useEffect(() => {
    if (!loaded) return;
    if (!dirty) {
      // Leer Drive tras iniciar sesión no debe borrar un borrador por recuperar.
      // Solo un guardado remoto confirmado elimina la copia local.
      return;
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify(state));
    } catch {
      notify("No hay espacio para la copia local. Exporta tus datos.");
    }
  }, [state, loaded, draftKey, notify, dirty, demo]);
  const save = useCallback(async () => {
    if (demo || !dirty || saving.current || conflict || !loaded) return;
    saving.current = true;
    const v = version.current;
    setStatus("saving");
    try {
      const r = await api(
        "/api/state",
        json("PUT", { state: stateRef.current, ...remote }),
      );
      setRemote({ fileId: r.fileId, etag: r.etag });
      setState((s) => ({ ...s, revision: r.state.revision }));
      if (v === version.current) {
        setDirty(false);
        try {
          localStorage.removeItem(draftKey);
        } catch {}
      }
      setStatus(v === version.current ? "synced" : "pending");
    } catch (e) {
      setStatus("unsaved");
      if ((e as Error & { status?: number }).status === 401)
        setAuthNeeded(true);
      if ((e as Error & { status: number }).status === 409) setConflict(true);
      notify((e as Error).message);
    } finally {
      saving.current = false;
    }
  }, [demo, dirty, conflict, loaded, remote, draftKey, notify]);
  useEffect(() => {
    if (!dirty || demo || conflict || status === "unsaved") return;
    const t = setTimeout(() => void save(), 1400);
    return () => clearTimeout(t);
  }, [state, dirty, demo, conflict, save, status]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty && !demo) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, demo]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("universal-search")?.focus();
      }
      if (e.key === "Escape") setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (demo || !loaded || view !== "home") return;
    const controller = new AbortController();
    void api("/api/drive?recent=true", { signal: controller.signal })
      .then((r) => setDriveRecent(r.files))
      .catch(() => {});
    void api("/api/calendar", { signal: controller.signal })
      .then((r) => setGoogleUpcoming(r.items.slice(0, 3)))
      .catch(() => {});
    return () => controller.abort();
  }, [demo, loaded, view]);
  const add = (kind: Collection, item?: Item, defaults?: Partial<Item>) =>
    setEditing({ kind, item, defaults });
  const upsert = (kind: Collection, item: Item) =>
    change((s) => ({
      ...s,
      data: {
        ...s.data,
        [kind]: s.data[kind].some((i) => i.id === item.id)
          ? s.data[kind].map((i) => (i.id === item.id ? item : i))
          : [...s.data[kind], item],
      },
    }));
  const remove = (kind: Collection, item: Item) => {
    if (
      !confirm(
        `¿Eliminar «${item.title}»? Esta acción no se puede deshacer.${kind === "courses" ? " Se eliminarán también sus temas; los apuntes y otros registros conservarán su contenido." : ""}`,
      )
    )
      return;
    change((s) => {
      const data = {
        ...s.data,
        [kind]: s.data[kind].filter((i) => i.id !== item.id),
      };
      if (kind === "courses") {
        data.topics = data.topics.filter((t) => t.courseId !== item.id);
        for (const k of [
          "notes",
          "questions",
          "flashcards",
          "sessions",
        ] as Collection[])
          data[k] = data[k].map((i) =>
            i.courseId === item.id ? { ...i, courseId: "" } : i,
          );
      }
      if (kind === "projects")
        data.tasks = data.tasks.map((t) =>
          t.projectId === item.id ? { ...t, projectId: "", parentId: "" } : t,
        );
      if (kind === "tasks")
        data.tasks = data.tasks.map((t) =>
          t.parentId === item.id ? { ...t, parentId: "" } : t,
        );
      return { ...s, data };
    });
  };
  const toggle = (kind: Collection, item: Item) =>
    upsert(kind, { ...item, completed: !item.completed });
  const go = (id: string) => {
    setView(id);
    setMobile(false);
    setQuery("");
  };
  const tasks = state.data.tasks.filter((t) => !t.completed),
    hours =
      state.data.sessions.reduce((a, s) => a + (s.seconds ?? 0), 0) / 3600;
  const searchResults = query.trim()
    ? Object.entries(state.data)
        .flatMap(([kind, items]) =>
          items
            .filter((i) =>
              `${i.title} ${i.body ?? ""} ${i.topic ?? ""}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((item) => ({ kind: kind as Collection, item })),
        )
        .slice(0, 12)
    : [];
  const pending = tasks.filter((t) => t.due && t.due.slice(0, 10) <= dayKey());
  const props: ModuleProps = {
    state,
    change,
    add,
    upsert,
    remove,
    toggle,
    notify,
  };
  const [timerMode, setTimerMode] = useState<
      "focus" | "shortBreak" | "longBreak"
    >("focus"),
    [remaining, setRemaining] = useState(25 * 60),
    [running, setRunning] = useState(false),
    [association, setAssociation] = useState("");
  const deadline = useRef(0),
    timerTotal = useRef(25 * 60),
    sessionId = useRef("");
  const timerFinish = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    if (timerMode === "focus") {
      const id = sessionId.current;
      change((s) =>
        s.data.sessions.some((i) => i.id === id)
          ? s
          : {
              ...s,
              data: {
                ...s.data,
                sessions: [
                  ...s.data.sessions,
                  {
                    ...newItem({
                      title: "Sesión de enfoque",
                      seconds: timerTotal.current,
                      ...(association.startsWith("c:")
                        ? { courseId: association.slice(2) }
                        : association.startsWith("p:")
                          ? { projectId: association.slice(2) }
                          : {}),
                    }),
                    id,
                  },
                ],
              },
            },
      );
    }
    notify(
      timerMode === "focus"
        ? "Sesión completada. Es momento de descansar."
        : "Descanso completado.",
    );
    if (
      stateRef.current.preferences.notifications &&
      "Notification" in window &&
      Notification.permission === "granted"
    )
      new Notification("Mi espacio personal", {
        body: "Tu temporizador ha terminado.",
      });
  }, [change, timerMode, association, notify]);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) timerFinish();
    };
    tick();
    const t = setInterval(tick, 400);
    return () => clearInterval(t);
  }, [running, timerFinish]);
  useEffect(() => {
    if (!running) {
      const seconds = state.preferences[timerMode] * 60;
      setRemaining(seconds);
      timerTotal.current = seconds;
    }
  }, [
    state.preferences.focus,
    state.preferences.shortBreak,
    state.preferences.longBreak,
    timerMode,
  ]); // La pausa mantiene el tiempo; solo cambia con ajustes o modo.
  function resetTimer(mode = timerMode) {
    setRunning(false);
    setTimerMode(mode);
    const n = state.preferences[mode] * 60;
    setRemaining(n);
    timerTotal.current = n;
    sessionId.current = "";
  }
  const timer = (
    <div className="timer-content">
      <div className="segmented">
        {(["focus", "shortBreak", "longBreak"] as const).map((m, i) => (
          <button
            key={m}
            className={timerMode === m ? "active" : ""}
            onClick={() => resetTimer(m)}
          >
            {["Enfoque", "Corto", "Largo"][i]}
          </button>
        ))}
      </div>
      <span className="timer-label">
        {timerMode === "focus" ? "Sesión de enfoque" : "Tiempo para descansar"}
      </span>
      <strong className="timer-digits">
        {String(Math.floor(remaining / 60)).padStart(2, "0")}:
        {String(remaining % 60).padStart(2, "0")}
      </strong>
      <div className="row center">
        <Button
          size="icon"
          variant="outline"
          onClick={() => resetTimer()}
          aria-label="Reiniciar temporizador"
        >
          <RotateCcw size={15} />
        </Button>
        <Button
          disabled={remaining === 0}
          onClick={() => {
            if (running) setRunning(false);
            else {
              if (!sessionId.current) sessionId.current = crypto.randomUUID();
              deadline.current = Date.now() + remaining * 1000;
              setRunning(true);
            }
          }}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}{" "}
          {running ? "Pausar" : "Iniciar"}
        </Button>
      </div>
      <select
        aria-label="Asociar sesión"
        disabled={running}
        value={association}
        onChange={(e) => setAssociation(e.target.value)}
      >
        <option value="">Sin asociación</option>
        {state.data.courses.map((c) => (
          <option key={c.id} value={`c:${c.id}`}>
            {c.title}
          </option>
        ))}
        {state.data.projects.map((c) => (
          <option key={c.id} value={`p:${c.id}`}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
  const weekly = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + i);
    const key = dayKey(date);
    return {
      day: date.toLocaleDateString("es", { weekday: "short" }),
      minutes: Math.round(
        state.data.sessions
          .filter((s) => dayKey(new Date(s.createdAt)) === key)
          .reduce((n, s) => n + (s.seconds ?? 0), 0) / 60,
      ),
    };
  });
  const content: Record<string, ReactNode> = {
    welcome: (
      <div className="welcome">
        <span className="tag">PANEL PERSONAL</span>
        <h2>Hoy es un buen día para avanzar.</h2>
        <p>
          Revisa tus prioridades, enfócate por bloques y mantén tu espacio en
          orden.
        </p>
        <div className="row wrap">
          <Button variant="outline" onClick={() => go("courses")}>
            Mis cursos <ArrowUpRight size={14} />
          </Button>
          <Button variant="outline" onClick={() => go("practice")}>
            Iniciar práctica
          </Button>
          <Button variant="outline" onClick={() => go("calendar")}>
            Ver agenda
          </Button>
        </div>
      </div>
    ),
    streak: (
      <>
        <div className="widget-title">
          Racha de estudio <Flame size={18} className="orange" />
        </div>
        <strong className="metric">{streak(state.data.sessions)} días</strong>
        <p className="muted small">Tu constancia construye tu progreso.</p>
        <Progress
          value={Math.min(100, (streak(state.data.sessions) / 7) * 100)}
        />
        <p className="tiny muted">
          Una sesión de enfoque completada cuenta como un día.
        </p>
      </>
    ),
    tasks: (
      <>
        <div className="widget-title">
          Tareas de hoy <span className="tag">{tasks.length} pendientes</span>
        </div>
        <TaskList
          items={state.data.tasks
            .filter((t) => !t.due || t.due.slice(0, 10) <= dayKey())
            .slice(0, 4)}
          toggle={(i) => toggle("tasks", i)}
        />
        <QuickAdd
          placeholder="Nueva tarea…"
          onAdd={(title) =>
            upsert("tasks", newItem({ title, completed: false, due: dayKey() }))
          }
        />
      </>
    ),
    pomodoro: (
      <>
        <div className="widget-title center">Pomodoro</div>
        {timer}
      </>
    ),
    calendar: (
      <>
        <div className="widget-title">
          Próximo{" "}
          <button
            className="icon-button"
            aria-label="Ver calendario"
            onClick={() => go("calendar")}
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
        {state.data.events
          .filter((e) => (e.end || e.due || "") >= new Date().toISOString())
          .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
          .slice(0, 3)
          .map((e) => (
            <div className="agenda-item" key={e.id}>
              <strong>{e.title}</strong>
              <small>{formatDate(e.due)}</small>
            </div>
          ))}
        {!state.data.events.length && !googleUpcoming.length && (
          <Empty
            compact
            text="Tu próxima actividad empieza aquí."
            action="Crear evento"
            onClick={() => add("events")}
          />
        )}
        {googleUpcoming.map((e) => (
          <a
            className="agenda-item block"
            key={e.id}
            href={safeUrl(e.htmlLink)}
            target="_blank"
            rel="noreferrer"
          >
            <strong>{e.summary || "Sin título"}</strong>
            <small>
              {formatDate(e.start.dateTime ?? e.start.date)} · Google
            </small>
          </a>
        ))}
        <p className="tiny muted">Agenda personal y Google Calendar.</p>
      </>
    ),
    note: <QuickNote {...props} />,
    activity: (
      <>
        <div className="widget-title">
          Actividad semanal{" "}
          <span className="tag">
            {weekly.reduce((n, d) => n + d.minutes, 0)} min
          </span>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted)", fontSize: 12 }}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                formatter={(v) => [`${v} min`, "Enfoque"]}
              />
              <Bar dataKey="minutes" fill="#38b9dc" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    ),
    goals: (
      <>
        <div className="widget-title">
          Mis objetivos <Target size={17} />
        </div>
        {state.data.goals.slice(0, 3).map((g) => (
          <div key={g.id} className="goal-item">
            <div className="row between">
              <span>{g.title}</span>
              <small>
                {g.value ?? 0}/{g.target ?? 1}
              </small>
            </div>
            <Progress value={((g.value ?? 0) / (g.target ?? 1)) * 100} />
          </div>
        ))}
        {!state.data.goals.length && (
          <Empty
            compact
            text="Dale dirección a tu esfuerzo."
            action="Crear objetivo"
            onClick={() => add("goals")}
          />
        )}
      </>
    ),
    documents: (
      <>
        <div className="widget-title">
          Documentos recientes <FolderOpen size={17} />
        </div>
        {driveRecent.map((d) => (
          <a
            className="document-link"
            key={d.id}
            href={safeUrl(
              d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            <FolderOpen size={17} />
            <span>{d.name}</span>
            <ArrowUpRight size={14} />
          </a>
        ))}
        {state.data.notes
          .filter((n) => n.url)
          .slice(-3)
          .reverse()
          .map((n) => (
            <a
              className="document-link"
              key={n.id}
              href={safeUrl(n.url)}
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={17} />
              {n.title}
              <ArrowUpRight size={14} />
            </a>
          ))}
        <Button variant="ghost" onClick={() => go("library")}>
          Ir a mi biblioteca <ChevronRight size={14} />
        </Button>
      </>
    ),
    shortcuts: (
      <>
        <div className="widget-title">Accesos rápidos</div>
        <div className="shortcut-grid">
          {[
            { id: "notes", label: "Escribir", icon: NotebookPen },
            { id: "practice", label: "Practicar", icon: ClipboardCheck },
            { id: "flashcards", label: "Repasar", icon: Layers },
            { id: "library", label: "Documentos", icon: FolderOpen },
          ].map((a) => (
            <button key={a.id} onClick={() => go(a.id)}>
              <a.icon size={21} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </>
    ),
  };
  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("home");
          }}
        >
          <span className="brand-mark" />
          <strong>
            Mi espacio
            <br />
            personal
          </strong>
        </a>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobile(false)}
          aria-label="Cerrar navegación"
        >
          <X size={19} />
        </button>
        <div className="nav-caption">TU ESPACIO</div>
        <nav>
          {nav
            .filter((n) => n.id !== "settings")
            .map((n) => (
              <button
                key={n.id}
                aria-label={n.label}
                title={collapsed ? n.label : undefined}
                className={`nav-item ${view === n.id ? "active" : ""}`}
                onClick={() => go(n.id)}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {n.id === "calendar" && tasks.length > 0 && (
                  <small>{tasks.length}</small>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <LockBadge /> <span>Espacio privado</span>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={18} />
            <span>Configuración</span>
          </button>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={
              collapsed ? "Expandir barra lateral" : "Contraer barra lateral"
            }
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span>Contraer menú</span>
              </>
            )}
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="mobile-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Abrir navegación"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="search-wrap">
            <Search size={17} />
            <input
              id="universal-search"
              placeholder="Buscar en tu espacio…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar en todos los módulos"
            />
            <kbd>Ctrl K</kbd>
            {query && (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map(({ kind, item }) => (
                    <button
                      key={`${kind}-${item.id}`}
                      onClick={() => {
                        const map: Partial<Record<Collection, string>> = {
                          courses: "courses",
                          topics: "courses",
                          tasks: "calendar",
                          events: "calendar",
                          projects: "projects",
                          questions: "practice",
                          results: "stats",
                          flashcards: "flashcards",
                          goals: "habits",
                          habits: "habits",
                          sessions: "stats",
                          reviews: "flashcards",
                          notes: "notes",
                        };
                        go(map[kind] ?? "home");
                        if (!["sessions", "results", "reviews"].includes(kind))
                          add(kind, item);
                      }}
                    >
                      <Search size={14} />
                      <span>
                        {item.title}
                        <small>{labels[kind]}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>Sin resultados para «{query}».</p>
                )}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <span
              className={`sync-status ${status === "synced" ? "good" : ""}`}
              title={status}
            >
              {status === "saving" || status === "loading" ? (
                <Loader2 size={14} className="spin" />
              ) : status === "synced" ? (
                <Cloud size={14} />
              ) : (
                <CloudOff size={14} />
              )}
              <span>
                {demo
                  ? "Local"
                  : status === "synced"
                    ? "Guardado"
                    : status === "saving"
                      ? "Guardando"
                      : status === "loading"
                        ? "Cargando"
                        : "Sin guardar"}
              </span>
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Ver notificaciones"
              onClick={() => setNotice(!notice)}
            >
              <Bell size={17} />
              {pending.length > 0 && <span>{pending.length}</span>}
            </button>
            <button
              className="icon-button"
              aria-label="Cambiar tema"
              onClick={() =>
                change((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    theme: s.preferences.theme === "dark" ? "light" : "dark",
                  },
                }))
              }
            >
              {state.preferences.theme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
            <Button size="sm" onClick={() => add("tasks")} disabled={!loaded}>
              <Plus size={17} /> Tarea
            </Button>
          </div>
          {notice && (
            <div className="notifications">
              <strong>Notificaciones</strong>
              {pending.length ? (
                pending.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      go("calendar");
                      setNotice(false);
                    }}
                  >
                    <span className="notification-dot" />
                    {t.title}
                    <small>{formatDate(t.due)}</small>
                  </button>
                ))
              ) : (
                <p className="muted">
                  No tienes tareas vencidas o pendientes para hoy.
                </p>
              )}
            </div>
          )}
        </header>
        <div className="page-content">
          {demo && (
            <div className="demo-banner">
              <span>
                <CloudOff size={14} /> Modo local de desarrollo · Los cambios se
                guardan en este navegador. Google no está conectado.
              </span>
            </div>
          )}
          {recovery && (
            <div className="notice row wrap">
              <span>Hay una copia local de una sesión anterior.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportData(recovery)}
              >
                Descargar copia
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRecovery(null)}
              >
                Cerrar
              </Button>
            </div>
          )}
          {(conflict || status === "unsaved" || status === "error") && (
            <div className="notice row wrap">
              <span>
                {conflict
                  ? "Conflicto: el guardado automático está detenido. Conserva tu copia antes de recargar."
                  : "No se pudo sincronizar. Tu copia permanece en este navegador."}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!loaded}
                onClick={() => exportData(state)}
              >
                Exportar copia
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (
                    !dirty ||
                    confirm(
                      "¿Cargar Drive? Los cambios locales no guardados se reemplazarán. Descarga antes tu copia.",
                    )
                  )
                    void loadRemote();
                }}
              >
                Cargar Drive
              </Button>
              {authNeeded && !demo && (
                <a
                  className="button button-outline button-sm"
                  href="/api/auth/login"
                  onClick={(event) => {
                    if (
                      dirty &&
                      !confirm(
                        "¿Volver a iniciar sesión? Descarga antes tu copia si tienes cambios pendientes.",
                      )
                    )
                      event.preventDefault();
                  }}
                >
                  Volver a iniciar sesión
                </a>
              )}
              {!conflict && loaded && dirty && (
                <Button size="sm" onClick={() => void save()}>
                  Reintentar guardado
                </Button>
              )}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="breadcrumb">
                MI ESPACIO <ChevronRight size={11} />{" "}
                {nav.find((n) => n.id === view)?.label.toUpperCase()}
              </div>
              <h1>
                {view === "home"
                  ? `${loaded ? greeting() : "Hola"}, ${name.split(" ")[0]}`
                  : nav.find((n) => n.id === view)?.label}
              </h1>
              <p>
                {view === "home"
                  ? "Tu centro de aprendizaje y organización."
                  : descriptions[view]}
              </p>
            </div>
            {view === "home" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomize(!customize)}
              >
                <Settings size={14} /> Personalizar
              </Button>
            )}
          </div>
          {!loaded ? (
            <div className="loading">
              <Loader2 className="spin" />
              <p>
                {status === "error"
                  ? "No se pudo cargar Drive. Usa Cargar Drive para reintentar."
                  : "Preparando tu espacio…"}
              </p>
            </div>
          ) : (
            <>
              {view === "home" && (
                <>
                  {customize && (
                    <section className="customize card">
                      <div>
                        <strong>Hazlo tuyo</strong>
                        <p className="muted small">
                          Arrastra desde el asa para ordenar. Usa el botón de
                          tamaño para ampliar las tarjetas.
                        </p>
                      </div>
                      <div className="row wrap">
                        {state.widgets.map((w) => (
                          <Button
                            key={w.id}
                            size="sm"
                            variant={w.hidden ? "outline" : "ghost"}
                            onClick={() =>
                              change((s) => ({
                                ...s,
                                widgets: s.widgets.map((x) =>
                                  x.id === w.id
                                    ? { ...x, hidden: !x.hidden }
                                    : x,
                                ),
                              }))
                            }
                          >
                            {w.hidden ? (
                              <EyeOff size={13} />
                            ) : (
                              <Eye size={13} />
                            )}{" "}
                            {widgetNames[w.id]}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            change((s) => ({
                              ...s,
                              widgets: initialState().widgets,
                            }))
                          }
                        >
                          <RotateCcw size={13} /> Restablecer
                        </Button>
                      </div>
                    </section>
                  )}
                  <div className="summary-strip">
                    <div>
                      <span className="stat-icon blue">
                        <GraduationCap size={17} />
                      </span>
                      <span>
                        <strong>{state.data.courses.length}</strong>
                        <small>Cursos activos</small>
                      </span>
                    </div>
                    <div>
                      <span className="stat-icon cyan">
                        <Timer size={17} />
                      </span>
                      <span>
                        <strong>{hours.toFixed(1)} h</strong>
                        <small>Tiempo de enfoque</small>
                      </span>
                    </div>
                    <div>
                      <span className="stat-icon violet">
                        <ClipboardCheck size={17} />
                      </span>
                      <span>
                        <strong>{state.data.results.length}</strong>
                        <small>Prácticas resueltas</small>
                      </span>
                    </div>
                    <div>
                      <span className="stat-icon green">
                        <CheckCheck size={17} />
                      </span>
                      <span>
                        <strong>
                          {state.data.tasks.filter((t) => t.completed).length}
                        </strong>
                        <small>Tareas completadas</small>
                      </span>
                    </div>
                  </div>
                  <DashboardGrid
                    state={state}
                    change={change}
                    customize={customize}
                    content={content}
                  />
                </>
              )}
              {view === "courses" && <Courses {...props} />}
              {view === "notes" && <Notes {...props} />}
              {view === "projects" && <Projects {...props} />}
              {view === "habits" && <Habits {...props} />}
              {view === "practice" && <Practice {...props} />}
              {view === "flashcards" && <Flashcards {...props} />}
              {view === "library" && (
                <Library demo={demo} notify={notify} notes={state.data.notes} />
              )}
              {view === "calendar" && (
                <>
                  <CalendarPanel {...props} demo={demo} />
                  <section className="card section-gap">
                    <SectionTitle
                      title="Tareas personales"
                      action="Nueva tarea"
                      onClick={() => add("tasks")}
                    />
                    <div className="task-filters">
                      <span className="tag">{tasks.length} pendientes</span>
                      <span className="muted small">
                        {state.data.tasks.filter((t) => t.completed).length}{" "}
                        completadas
                      </span>
                    </div>
                    {state.data.tasks.length ? (
                      state.data.tasks.map((t) => (
                        <div className="list-row" key={t.id}>
                          <button
                            className={`checkbox ${t.completed ? "checked" : ""}`}
                            aria-label={`Completar ${t.title}`}
                            onClick={() => toggle("tasks", t)}
                          >
                            {t.completed && <Check size={13} />}
                          </button>
                          <div className="grow">
                            <strong className={t.completed ? "done" : ""}>
                              {t.title}
                            </strong>
                            <small>
                              {formatDate(t.due)}{" "}
                              {
                                state.data.projects.find(
                                  (p) => p.id === t.projectId,
                                )?.title
                              }
                            </small>
                          </div>
                          <ItemActions
                            onEdit={() => add("tasks", t)}
                            onDelete={() => remove("tasks", t)}
                          />
                        </div>
                      ))
                    ) : (
                      <Empty
                        text="Una tarea menos en tu cabeza."
                        action="Añadir tarea"
                        onClick={() => add("tasks")}
                      />
                    )}
                  </section>
                </>
              )}
              {view === "stats" && <Statistics state={state} weekly={weekly} />}
              {view === "timer" && (
                <div className="two-columns">
                  <section className="card full-timer">
                    <SectionTitle title="Un bloque a la vez" />
                    {timer}
                    <p className="muted small">
                      La sesión se registra al terminar el bloque de enfoque.
                      Mantén esta pestaña abierta.
                    </p>
                    {youtubeId(state.preferences.youtube) && (
                      <iframe
                        title="Música para estudiar en YouTube"
                        src={`https://www.youtube-nocookie.com/embed/${youtubeId(state.preferences.youtube)}`}
                        allow="encrypted-media; picture-in-picture"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    )}
                    <label className="field-label">
                      Música de estudio · enlace de YouTube
                      <input
                        placeholder="https://www.youtube.com/watch?v=…"
                        value={state.preferences.youtube}
                        onChange={(e) =>
                          change((s) => ({
                            ...s,
                            preferences: {
                              ...s.preferences,
                              youtube: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    {state.preferences.youtube &&
                      !youtubeId(state.preferences.youtube) && (
                        <small className="error">
                          Introduce un enlace válido de video de YouTube.
                        </small>
                      )}
                    <p className="tiny muted">
                      La reproducción requiere tu interacción y depende de las
                      restricciones de YouTube.
                    </p>
                  </section>
                  <section className="card">
                    <SectionTitle title="Sesiones completadas" />
                    {state.data.sessions
                      .slice()
                      .reverse()
                      .slice(0, 20)
                      .map((s) => (
                        <div className="list-row" key={s.id}>
                          <span className="stat-icon cyan">
                            <Timer size={17} />
                          </span>
                          <div>
                            <strong>
                              {Math.round((s.seconds ?? 0) / 60)} minutos
                            </strong>
                            <small>
                              {formatDate(s.createdAt)} ·{" "}
                              {state.data.courses.find(
                                (c) => c.id === s.courseId,
                              )?.title ??
                                state.data.projects.find(
                                  (p) => p.id === s.projectId,
                                )?.title ??
                                "Enfoque personal"}
                            </small>
                          </div>
                        </div>
                      ))}
                    {!state.data.sessions.length && (
                      <Empty text="Tu próxima sesión es un nuevo comienzo." />
                    )}
                  </section>
                </div>
              )}
              {view === "settings" && (
                <SettingsPanel
                  state={state}
                  change={change}
                  demo={demo}
                  email={email}
                  notify={notify}
                  dirty={dirty}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Mi espacio personal</span>
            <span>Un paso a la vez.</span>
          </footer>
        </div>
      </main>
      {editing && (
        <EntryModal
          key={`${editing.kind}-${editing.item?.id ?? "new"}`}
          kind={editing.kind}
          item={editing.item}
          defaults={editing.defaults}
          state={state}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            upsert(editing.kind, item);
            setEditing(null);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Cerrar aviso"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function LockBadge() {
  return <span className="privacy-dot" />;
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}
const descriptions: Record<string, string> = {
  library: "Tus materiales, organizados en un solo lugar.",
  courses: "Construye tu aprendizaje, tema a tema.",
  practice: "Pon a prueba lo que sabes y aprende de tus errores.",
  calendar: "Dale un lugar a tus prioridades.",
  stats: "Cada pequeño avance cuenta.",
  notes: "Un lugar para tus ideas, apuntes y descubrimientos.",
  projects: "De la idea al siguiente paso.",
  flashcards: "Recuerda más, con un repaso a la vez.",
  habits: "La constancia convierte tus planes en progreso.",
  timer: "Protege tu atención y encuentra tu ritmo.",
  settings: "Adapta este espacio a tu manera de trabajar.",
};
export const labels: Record<Collection, string> = {
  courses: "Curso",
  topics: "Tema",
  notes: "Nota",
  tasks: "Tarea",
  projects: "Proyecto",
  questions: "Pregunta",
  results: "Resultado",
  flashcards: "Flashcard",
  reviews: "Repaso",
  goals: "Objetivo",
  habits: "Hábito",
  sessions: "Sesión",
  events: "Evento",
};
export function safeUrl(value?: string) {
  try {
    const u = new URL(value ?? "");
    return ["https:", "http:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
}
export function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return isNaN(d.getTime())
    ? "Sin fecha"
    : d.toLocaleString("es", {
        day: "numeric",
        month: "short",
        ...(value.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function Empty({
  text,
  action,
  onClick,
  compact = false,
}: {
  text: string;
  action?: string;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <span className="empty-icon">
        <BookOpen size={compact ? 20 : 27} />
      </span>
      <p>{text}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={onClick}>
          <Plus size={14} />
          {action}
        </Button>
      )}
    </div>
  );
}
export function SectionTitle({
  title,
  action,
  onClick,
  children,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <div className="row">
        {children}
        {action && (
          <Button size="sm" onClick={onClick}>
            <Plus size={15} />
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}
export function ItemActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row item-actions">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        Editar
      </Button>
      <button
        className="icon-button danger"
        onClick={onDelete}
        aria-label="Eliminar"
      >
        <X size={15} />
      </button>
    </div>
  );
}
function TaskList({
  items,
  toggle,
}: {
  items: Item[];
  toggle: (i: Item) => void;
}) {
  return (
    <div className="task-list">
      {items.map((t) => (
        <button
          key={t.id}
          onClick={() => toggle(t)}
          className={t.completed ? "done" : ""}
        >
          <span className={`checkbox ${t.completed ? "checked" : ""}`}>
            {t.completed && <Check size={12} />}
          </span>
          {t.title}
        </button>
      ))}
      {!items.length && (
        <p className="muted small">Todo despejado. Añade tu próxima tarea.</p>
      )}
    </div>
  );
}
function QuickAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onAdd(value.trim());
          setValue("");
        }
      }}
    >
      <input
        maxLength={500}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" type="submit" disabled={!value.trim()}>
        Añadir
      </Button>
    </form>
  );
}
function DashboardGrid({
  state,
  change,
  customize,
  content,
}: {
  state: AppState;
  change: Change;
  customize: boolean;
  content: Record<string, ReactNode>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function end(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    change((s) => ({
      ...s,
      widgets: arrayMove(
        s.widgets,
        s.widgets.findIndex((w) => w.id === e.active.id),
        s.widgets.findIndex((w) => w.id === e.over?.id),
      ),
    }));
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
    >
      <SortableContext
        items={state.widgets.filter((w) => !w.hidden).map((w) => w.id)}
      >
        <div className="dashboard-grid">
          {state.widgets
            .filter((w) => !w.hidden)
            .map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                customize={customize}
                onResize={() =>
                  change((s) => ({
                    ...s,
                    widgets: s.widgets.map((x) =>
                      x.id === w.id
                        ? { ...x, size: x.size === "wide" ? "small" : "wide" }
                        : x,
                    ),
                  }))
                }
                onHide={() =>
                  change((s) => ({
                    ...s,
                    widgets: s.widgets.map((x) =>
                      x.id === w.id ? { ...x, hidden: true } : x,
                    ),
                  }))
                }
              >
                {content[w.id]}
              </SortableWidget>
            ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
function SortableWidget({
  widget,
  customize,
  onResize,
  onHide,
  children,
}: {
  widget: AppState["widgets"][number];
  customize: boolean;
  onResize: () => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id, disabled: !customize });
  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={`card widget widget-${widget.id} ${widget.size === "wide" ? "wide" : ""} ${customize ? "editing-widget" : ""}`}
    >
      <div className="widget-tools">
        {customize && (
          <>
            <button
              className="icon-button drag-handle"
              aria-label={`Mover ${widgetNames[widget.id]}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical size={14} />
            </button>
            <button
              className="icon-button"
              aria-label={`Cambiar tamaño de ${widgetNames[widget.id]}`}
              onClick={onResize}
            >
              <Maximize2 size={13} />
            </button>
            <button
              className="icon-button"
              aria-label={`Ocultar ${widgetNames[widget.id]}`}
              onClick={onHide}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      {children}
    </section>
  );
}
export type ModuleProps = {
  state: AppState;
  change: Change;
  add: (kind: Collection, item?: Item, defaults?: Partial<Item>) => void;
  upsert: (kind: Collection, item: Item) => void;
  remove: (kind: Collection, item: Item) => void;
  toggle: (kind: Collection, item: Item) => void;
  notify: Notify;
};

function QuickNote({ state, upsert }: ModuleProps) {
  const note = state.data.notes.find((n) => n.category === "Nota rápida");
  return (
    <>
      <div className="widget-title">
        Nota rápida <NotebookPen size={16} />
      </div>
      <textarea
        className="quick-note"
        aria-label="Nota rápida"
        placeholder="Escribe una idea, pendiente o resumen…"
        value={note?.body ?? ""}
        onChange={(e) =>
          upsert(
            "notes",
            note
              ? { ...note, body: e.target.value }
              : newItem({
                  title: "Nota rápida",
                  category: "Nota rápida",
                  body: e.target.value,
                }),
          )
        }
      />
      <span className="tiny muted">
        Guardado automático · Encuéntrala en Bloc de notas
      </span>
    </>
  );
}
function Courses(p: ModuleProps) {
  const { state, add, remove, toggle } = p;
  const [selected, setSelected] = useState("");
  const current = state.data.courses.find((c) => c.id === selected);
  const topics = state.data.topics.filter((t) => t.courseId === selected);
  return (
    <>
      <section className="card">
        <SectionTitle
          title="Mis cursos"
          action="Crear curso"
          onClick={() => add("courses")}
        />
        {state.data.courses.length ? (
          <div className="course-grid">
            {state.data.courses.map((c, i) => (
              <article
                className={`course-card ${selected === c.id ? "selected" : ""}`}
                key={c.id}
              >
                <button
                  className="course-open"
                  onClick={() => setSelected(c.id)}
                >
                  <span className={`course-icon color-${i % 4}`}>
                    <GraduationCap size={22} />
                  </span>
                  <h3>{c.title}</h3>
                  <p>{c.body || "Tu próximo aprendizaje empieza aquí."}</p>
                  <Progress value={courseProgress(state, c.id)} />
                  <span className="row between small muted">
                    <span>
                      {
                        state.data.topics.filter((t) => t.courseId === c.id)
                          .length
                      }{" "}
                      temas
                    </span>
                    <span>{courseProgress(state, c.id)}%</span>
                  </span>
                </button>
                <ItemActions
                  onEdit={() => add("courses", c)}
                  onDelete={() => remove("courses", c)}
                />
              </article>
            ))}
          </div>
        ) : (
          <Empty
            text="Todo gran aprendizaje empieza con un primer curso."
            action="Crear mi primer curso"
            onClick={() => add("courses")}
          />
        )}
      </section>
      {current && (
        <section className="card section-gap">
          <SectionTitle
            title={current.title}
            action="Añadir tema"
            onClick={() => add("topics", undefined, { courseId: selected })}
          />
          <p className="muted small">
            Organiza por unidad y marca cada tema al completarlo.
          </p>
          {Array.from(new Set(topics.map((t) => t.unit || "Sin unidad"))).map(
            (unit) => (
              <div className="unit-block" key={unit}>
                <h3>{unit}</h3>
                {topics
                  .filter((t) => (t.unit || "Sin unidad") === unit)
                  .map((t) => (
                    <div className="list-row" key={t.id}>
                      <button
                        className={`checkbox ${t.completed ? "checked" : ""}`}
                        onClick={() => toggle("topics", t)}
                        aria-label={`Completar ${t.title}`}
                      >
                        {t.completed && <Check size={12} />}
                      </button>
                      <div className="grow">
                        <strong className={t.completed ? "done" : ""}>
                          {t.title}
                        </strong>
                        <small>{t.body}</small>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          add("notes", undefined, {
                            courseId: selected,
                            topic: t.title,
                          })
                        }
                      >
                        Apunte
                      </Button>
                      <ItemActions
                        onEdit={() => add("topics", t)}
                        onDelete={() => remove("topics", t)}
                      />
                    </div>
                  ))}
              </div>
            ),
          )}
          {!topics.length && (
            <Empty
              compact
              text="Añade unidades y temas para medir el progreso real."
            />
          )}
          <SectionTitle
            title="Apuntes del curso"
            action="Crear apunte"
            onClick={() => add("notes", undefined, { courseId: selected })}
          />
          {state.data.notes
            .filter((n) => n.courseId === selected)
            .map((n) => (
              <div className="list-row" key={n.id}>
                <NotebookPen size={18} />
                <div className="grow">
                  <strong>{n.title}</strong>
                  <small>{n.topic}</small>
                </div>
                {n.url && (
                  <a
                    href={safeUrl(n.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="icon-button"
                    aria-label="Abrir documento"
                  >
                    <ArrowUpRight size={16} />
                  </a>
                )}
                <ItemActions
                  onEdit={() => add("notes", n)}
                  onDelete={() => remove("notes", n)}
                />
              </div>
            ))}
        </section>
      )}
    </>
  );
}
function Notes({ state, add, upsert, remove }: ModuleProps) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [selected, setSelected] = useState("");
  const note = state.data.notes.find((n) => n.id === selected);
  const filtered = state.data.notes.filter(
    (n) =>
      (!category || n.category === category) &&
      `${n.title} ${n.body ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="card">
      <SectionTitle
        title="Tus ideas, a mano"
        action="Nueva nota"
        onClick={() => add("notes")}
      />
      <div className="toolbar">
        <input
          placeholder="Buscar en mis notas…"
          aria-label="Buscar notas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filtrar por categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {Array.from(
            new Set(state.data.notes.map((n) => n.category).filter(Boolean)),
          ).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="notes-layout">
        <div className="notes-list">
          {filtered.map((n) => (
            <button
              aria-label={`Abrir nota ${n.title}`}
              className={`note-preview ${n.id === selected ? "selected" : ""}`}
              key={n.id}
              onClick={() => setSelected(n.id)}
            >
              <span className="tag">{n.category || "General"}</span>
              <strong>{n.title}</strong>
              <p>{n.body?.slice(0, 100) || "Sin contenido todavía."}</p>
              <small>{formatDate(n.createdAt)}</small>
            </button>
          ))}
          {!filtered.length && (
            <Empty text="Guarda una idea antes de que se escape." />
          )}
        </div>
        <div className="note-editor">
          {note ? (
            <>
              <div className="row between">
                <span className="tag">Guardado automático</span>
                <ItemActions
                  onEdit={() => add("notes", note)}
                  onDelete={() => remove("notes", note)}
                />
              </div>
              <input
                className="note-title"
                aria-label="Título de nota"
                value={note.title}
                maxLength={500}
                onChange={(e) =>
                  upsert("notes", {
                    ...note,
                    title: e.target.value || "Sin título",
                  })
                }
              />
              <textarea
                aria-label="Contenido de nota"
                placeholder="Deja fluir tus ideas…"
                value={note.body ?? ""}
                maxLength={100000}
                onChange={(e) =>
                  upsert("notes", { ...note, body: e.target.value })
                }
              />
              {note.url && (
                <a
                  href={safeUrl(note.url)}
                  className="document-link"
                  target="_blank"
                  rel="noreferrer"
                >
                  <FolderOpen size={15} />
                  Documento vinculado
                  <ArrowUpRight size={14} />
                </a>
              )}
            </>
          ) : (
            <Empty text="Selecciona una nota para empezar a escribir." />
          )}
        </div>
      </div>
    </section>
  );
}
function Projects(p: ModuleProps) {
  const { state, add, remove, toggle } = p;
  return (
    <section className="card">
      <SectionTitle
        title="Ideas en movimiento"
        action="Nuevo proyecto"
        onClick={() => add("projects")}
      />
      <div className="projects-grid">
        {state.data.projects.map((project) => {
          const tasks = state.data.tasks.filter(
            (t) => t.projectId === project.id,
          );
          const percent = tasks.length
            ? Math.round(
                (tasks.filter((t) => t.completed).length / tasks.length) * 100,
              )
            : 0;
          return (
            <article className="project-card" key={project.id}>
              <div className="row between">
                <span className="stat-icon blue">
                  <FolderKanban size={20} />
                </span>
                <span className="tag">
                  {project.status === "done"
                    ? "Finalizado"
                    : project.status === "active"
                      ? "En curso"
                      : "Pendiente"}
                </span>
              </div>
              <h3>{project.title}</h3>
              <p className="muted small">{project.body}</p>
              <span className="small muted">{formatDate(project.due)}</span>
              <Progress value={percent} />
              <div className="row between small muted">
                <span>
                  {tasks.filter((t) => t.completed).length}/{tasks.length}{" "}
                  tareas
                </span>
                <span>{percent}%</span>
              </div>
              <div className="project-tasks">
                {tasks
                  .filter((t) => !t.parentId)
                  .map((t) => (
                    <div key={t.id}>
                      <div className="list-row">
                        <button
                          className={`checkbox ${t.completed ? "checked" : ""}`}
                          aria-label={`Completar ${t.title}`}
                          onClick={() => toggle("tasks", t)}
                        >
                          {t.completed && <Check size={12} />}
                        </button>
                        <span className={`grow ${t.completed ? "done" : ""}`}>
                          {t.title}
                        </span>
                        <button
                          className="icon-button"
                          title="Añadir subtarea"
                          aria-label={`Añadir subtarea a ${t.title}`}
                          onClick={() =>
                            add("tasks", undefined, {
                              projectId: project.id,
                              parentId: t.id,
                            })
                          }
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Editar ${t.title}`}
                          onClick={() => add("tasks", t)}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                      {tasks
                        .filter((s) => s.parentId === t.id)
                        .map((s) => (
                          <div className="list-row subtask" key={s.id}>
                            <button
                              className={`checkbox ${s.completed ? "checked" : ""}`}
                              onClick={() => toggle("tasks", s)}
                              aria-label={`Completar ${s.title}`}
                            >
                              {s.completed && <Check size={12} />}
                            </button>
                            <span
                              className={`grow ${s.completed ? "done" : ""}`}
                            >
                              {s.title}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`Editar ${s.title}`}
                              onClick={() => add("tasks", s)}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
              <div className="row between wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    add("tasks", undefined, { projectId: project.id })
                  }
                >
                  <Plus size={14} />
                  Tarea
                </Button>
                <ItemActions
                  onEdit={() => add("projects", project)}
                  onDelete={() => remove("projects", project)}
                />
              </div>
            </article>
          );
        })}
      </div>
      {!state.data.projects.length && (
        <Empty
          text="Convierte una idea en un plan que puedas seguir."
          action="Crear proyecto"
          onClick={() => add("projects")}
        />
      )}
    </section>
  );
}
function Habits({ state, add, upsert, remove }: ModuleProps) {
  const today = dayKey();
  return (
    <div className="two-columns">
      <section className="card">
        <SectionTitle
          title="Objetivos"
          action="Nuevo objetivo"
          onClick={() => add("goals")}
        />
        {state.data.goals.map((g) => (
          <article className="habit-card" key={g.id}>
            <div className="row between">
              <h3>{g.title}</h3>
              <span className="tag">
                {Math.min(
                  100,
                  Math.round(((g.value ?? 0) / (g.target ?? 1)) * 100),
                )}
                %
              </span>
            </div>
            <p className="muted small">{g.body}</p>
            <Progress value={((g.value ?? 0) / (g.target ?? 1)) * 100} />
            <div className="row between">
              <span className="small muted">
                {g.value ?? 0} de {g.target ?? 1} · {formatDate(g.due)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(g.value ?? 0) >= (g.target ?? 1)}
                onClick={() =>
                  upsert("goals", {
                    ...g,
                    value: Math.min(g.target ?? 1, (g.value ?? 0) + 1),
                  })
                }
              >
                +1 avance
              </Button>
            </div>
            <ItemActions
              onEdit={() => add("goals", g)}
              onDelete={() => remove("goals", g)}
            />
          </article>
        ))}
        {!state.data.goals.length && (
          <Empty
            text="¿Qué te gustaría lograr?"
            action="Definir un objetivo"
            onClick={() => add("goals")}
          />
        )}
      </section>
      <section className="card">
        <SectionTitle
          title="Hábitos"
          action="Nuevo hábito"
          onClick={() => add("habits")}
        />
        {state.data.habits.map((h) => {
          const done = h.dates?.includes(today);
          return (
            <article className="habit-card" key={h.id}>
              <div className="row between">
                <div>
                  <h3>{h.title}</h3>
                  <small className="muted">
                    {h.dates?.length ?? 0} días registrados
                  </small>
                </div>
                <Button
                  variant={done ? "outline" : "default"}
                  size="sm"
                  onClick={() =>
                    upsert("habits", {
                      ...h,
                      dates: done
                        ? h.dates?.filter((d) => d !== today)
                        : [...(h.dates ?? []), today],
                    })
                  }
                >
                  <Check size={14} />
                  {done ? "Hecho hoy" : "Marcar hoy"}
                </Button>
              </div>
              <div className="habit-week">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - 6 + i);
                  const key = dayKey(d);
                  return (
                    <div
                      key={key}
                      className={h.dates?.includes(key) ? "completed" : ""}
                      title={key}
                    >
                      <span>
                        {d.toLocaleDateString("es", { weekday: "narrow" })}
                      </span>
                      {h.dates?.includes(key) ? (
                        <Check size={15} />
                      ) : (
                        <span className="habit-dot" />
                      )}
                    </div>
                  );
                })}
              </div>
              <ItemActions
                onEdit={() => add("habits", h)}
                onDelete={() => remove("habits", h)}
              />
            </article>
          );
        })}
        {!state.data.habits.length && (
          <Empty
            text="Pequeñas acciones, grandes cambios."
            action="Crear hábito"
            onClick={() => add("habits")}
          />
        )}
      </section>
    </div>
  );
}
function Practice({ state, add, upsert, remove }: ModuleProps) {
  const [course, setCourse] = useState(""),
    [topic, setTopic] = useState(""),
    [count, setCount] = useState(10),
    [onlyWrong, setOnlyWrong] = useState(false),
    [quiz, setQuiz] = useState<Item[]>([]),
    [answers, setAnswers] = useState<Record<string, number>>({}),
    [finished, setFinished] = useState(false);
  const latest = new Map<string, boolean>();
  state.data.results.forEach((r) =>
    r.answers?.forEach((a) => latest.set(a.questionId, a.correct)),
  );
  const bank = state.data.questions.filter(
    (q) =>
      (!course || q.courseId === course) &&
      (!topic || q.topic === topic) &&
      (!onlyWrong || latest.get(q.id) === false),
  );
  function start() {
    const shuffled = bank.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQuiz(shuffled.slice(0, count));
    setAnswers({});
    setFinished(false);
  }
  return (
    <>
      <section className="card">
        <SectionTitle
          title="Cuestionarios y simuladores"
          action="Crear pregunta"
          onClick={() => add("questions")}
        />
        <p className="muted small">
          Preguntas y explicaciones registradas por ti. Cada práctica guarda sus
          resultados.
        </p>
        <div className="toolbar wrap">
          <select
            aria-label="Curso de práctica"
            value={course}
            onChange={(e) => {
              setCourse(e.target.value);
              setTopic("");
            }}
          >
            <option value="">Todos los cursos</option>
            {state.data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Tema de práctica"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">Todos los temas</option>
            {Array.from(
              new Set(
                state.data.questions
                  .filter((q) => !course || q.courseId === course)
                  .map((q) => q.topic)
                  .filter(Boolean),
              ),
            ).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="row small">
            Cantidad
            <input
              className="count-input"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                )
              }
            />
          </label>
          <label className="row small">
            <input
              type="checkbox"
              checked={onlyWrong}
              onChange={(e) => setOnlyWrong(e.target.checked)}
            />
            Solo incorrectas
          </label>
          <Button
            onClick={start}
            disabled={!bank.length || (quiz.length > 0 && !finished)}
          >
            <Play size={15} /> Empezar ({Math.min(count, bank.length)})
          </Button>
        </div>
      </section>
      {quiz.length > 0 && (
        <section className="card section-gap">
          <SectionTitle
            title={
              finished
                ? `Resultado: ${scoreQuiz(quiz, answers).score}%`
                : `Tu práctica · ${quiz.length} preguntas`
            }
          >
            {finished && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const wrong = quiz.filter((q) => answers[q.id] !== q.correct);
                  setQuiz(wrong);
                  setAnswers({});
                  setFinished(false);
                }}
                disabled={quiz.every((q) => answers[q.id] === q.correct)}
              >
                Repetir errores
              </Button>
            )}
          </SectionTitle>
          {quiz.map((q, index) => (
            <article className="question" key={q.id}>
              <span className="tag">PREGUNTA {index + 1}</span>
              <h3>{q.title}</h3>
              <div className="question-options">
                {q.choices?.map((choice, i) => (
                  <button
                    key={i}
                    aria-label={`Opción ${i + 1}: ${choice}`}
                    disabled={finished}
                    className={`${answers[q.id] === i ? "selected" : ""} ${finished && i === q.correct ? "correct" : ""} ${finished && answers[q.id] === i && i !== q.correct ? "incorrect" : ""}`}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    {choice}
                  </button>
                ))}
              </div>
              {finished && (
                <div className="explanation">
                  <strong>
                    {answers[q.id] === q.correct
                      ? "Respuesta correcta"
                      : "Sigue practicando"}
                  </strong>
                  <p>
                    {q.explanation ||
                      "No se registró una explicación para esta pregunta."}
                  </p>
                </div>
              )}
            </article>
          ))}
          {!finished && (
            <div className="row wrap">
              <Button
                disabled={quiz.some((q) => answers[q.id] === undefined)}
                onClick={() => {
                  const result = scoreQuiz(quiz, answers);
                  upsert(
                    "results",
                    newItem({
                      title: `Práctica de ${quiz.length} preguntas`,
                      courseId: course,
                      ...result,
                    }),
                  );
                  setFinished(true);
                }}
              >
                Corregir y guardar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm("¿Abandonar esta práctica sin guardar?"))
                    setQuiz([]);
                }}
              >
                Abandonar
              </Button>
              <small className="muted">
                {Object.keys(answers).length} de {quiz.length} respondidas
              </small>
            </div>
          )}
        </section>
      )}
      <section className="card section-gap">
        <SectionTitle title={`Banco de preguntas · ${bank.length}`} />
        {bank.map((q) => (
          <div className="list-row" key={q.id}>
            <ClipboardCheck size={18} />
            <div className="grow">
              <strong>{q.title}</strong>
              <small>
                {state.data.courses.find((c) => c.id === q.courseId)?.title} ·{" "}
                {q.topic || "General"}
              </small>
            </div>
            <ItemActions
              onEdit={() => add("questions", q)}
              onDelete={() => remove("questions", q)}
            />
          </div>
        ))}
        {!bank.length && (
          <Empty
            text="Crea tus preguntas y añade una explicación para cada respuesta."
            action="Añadir pregunta"
            onClick={() => add("questions")}
          />
        )}
      </section>
    </>
  );
}
function Flashcards({ state, add, upsert, remove }: ModuleProps) {
  const [course, setCourse] = useState(""),
    [topic, setTopic] = useState(""),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [practicing, setPracticing] = useState(false);
  const cards = state.data.flashcards.filter(
    (c) => (!course || c.courseId === course) && (!topic || c.topic === topic),
  );
  const card = cards[index % Math.max(1, cards.length)];
  return (
    <section className="card">
      <SectionTitle
        title="Un repaso que se queda"
        action="Nueva flashcard"
        onClick={() => add("flashcards")}
      />
      <div className="toolbar">
        <select
          value={course}
          aria-label="Curso de flashcards"
          onChange={(e) => {
            setCourse(e.target.value);
            setTopic("");
            setIndex(0);
            setFlipped(false);
          }}
        >
          <option value="">Todos los cursos</option>
          {state.data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          value={topic}
          aria-label="Tema de flashcards"
          onChange={(e) => {
            setTopic(e.target.value);
            setIndex(0);
            setFlipped(false);
          }}
        >
          <option value="">Todos los temas</option>
          {Array.from(
            new Set(
              state.data.flashcards
                .filter((c) => !course || c.courseId === course)
                .map((c) => c.topic)
                .filter(Boolean),
            ),
          ).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Button
          disabled={!cards.length}
          onClick={() => {
            setPracticing(!practicing);
            setFlipped(false);
          }}
        >
          <Layers size={16} />
          {practicing ? "Ver tarjetas" : "Practicar"}
        </Button>
      </div>
      {practicing && card ? (
        <div className="flashcard-practice">
          <span className="tag">
            {(index % cards.length) + 1} / {cards.length}
          </span>
          <button
            aria-label={flipped ? "Ver pregunta" : "Revelar respuesta"}
            className={`flashcard ${flipped ? "flipped" : ""}`}
            onClick={() => setFlipped(!flipped)}
          >
            <small>{flipped ? "RESPUESTA" : "PREGUNTA"}</small>
            <strong>{flipped ? card.body : card.title}</strong>
            <span>Toca para {flipped ? "volver" : "revelar"}</span>
          </button>
          <div className="row center">
            <Button
              disabled={!flipped}
              variant="outline"
              onClick={() => {
                upsert(
                  "reviews",
                  newItem({
                    title: "Repaso de flashcard",
                    cardId: card.id,
                    courseId: card.courseId,
                    known: false,
                  }),
                );
                setIndex(index + 1);
                setFlipped(false);
              }}
            >
              Necesito repasarla
            </Button>
            <Button
              disabled={!flipped}
              onClick={() => {
                upsert(
                  "reviews",
                  newItem({
                    title: "Repaso de flashcard",
                    cardId: card.id,
                    courseId: card.courseId,
                    known: true,
                  }),
                );
                setIndex(index + 1);
                setFlipped(false);
              }}
            >
              <Check size={15} />
              La recordé
            </Button>
          </div>
        </div>
      ) : (
        <div className="course-grid">
          {cards.map((c) => (
            <article className="course-card" key={c.id}>
              <span className="tag">{c.topic || "General"}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <small className="muted">
                {state.data.reviews.filter((r) => r.cardId === c.id).length}{" "}
                repasos
              </small>
              <ItemActions
                onEdit={() => add("flashcards", c)}
                onDelete={() => remove("flashcards", c)}
              />
            </article>
          ))}
        </div>
      )}
      {!cards.length && (
        <Empty
          text="Transforma tus apuntes en recuerdos duraderos."
          action="Crear flashcard"
          onClick={() => add("flashcards")}
        />
      )}
    </section>
  );
}
function Statistics({
  state,
  weekly,
}: {
  state: AppState;
  weekly: { day: string; minutes: number }[];
}) {
  const results = state.data.results;
  const mean = results.length
    ? Math.round(
        results.reduce((s, r) => s + (r.score ?? 0), 0) / results.length,
      )
    : 0;
  const today = dayKey();
  const focused =
    state.data.sessions
      .filter((s) => dayKey(new Date(s.createdAt)) === today)
      .reduce((n, s) => n + (s.seconds ?? 0), 0) / 60;
  return (
    <>
      <div className="stat-cards">
        {[
          {
            label: "Concentración acumulada",
            value: `${(state.data.sessions.reduce((s, i) => s + (i.seconds ?? 0), 0) / 3600).toFixed(1)} h`,
            icon: Timer,
          },
          {
            label: "Promedio de prácticas",
            value: results.length ? `${mean}%` : "Sin resultados",
            icon: ClipboardCheck,
          },
          {
            label: "Repasos completados",
            value: state.data.reviews.length,
            icon: Layers,
          },
          {
            label: "Cumplimiento de hábitos hoy",
            value: `${state.data.habits.length ? Math.round((state.data.habits.filter((h) => h.dates?.includes(today)).length / state.data.habits.length) * 100) : 0}%`,
            icon: Target,
          },
        ].map((s) => (
          <div className="card stat-card" key={s.label}>
            <s.icon size={20} />
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <div className="two-columns section-gap">
        <section className="card">
          <SectionTitle title="Tiempo de estudio · últimos 7 días" />
          <div className="chart large">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fill: "var(--muted)" }} />
                <YAxis unit="m" tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                  }}
                />
                <Bar
                  dataKey="minutes"
                  name="Minutos"
                  fill="#3abddd"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <SectionTitle title="Resultados de prácticas" />
          {results.length ? (
            <div className="chart large">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={results
                    .slice(-20)
                    .map((r, i) => ({ practice: i + 1, score: r.score }))}
                >
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="practice" tick={{ fill: "var(--muted)" }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--muted)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name="Puntuación %"
                    stroke="#3b82f6"
                    strokeWidth={3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty text="Tus resultados aparecerán al completar una práctica." />
          )}
        </section>
        <section className="card">
          <SectionTitle title="Progreso por curso" />
          {state.data.courses.map((c) => (
            <div className="goal-item" key={c.id}>
              <div className="row between">
                <strong>{c.title}</strong>
                <span>{courseProgress(state, c.id)}%</span>
              </div>
              <Progress value={courseProgress(state, c.id)} />
            </div>
          ))}
          {!state.data.courses.length && (
            <p className="muted">Añade un curso y sus temas para empezar.</p>
          )}
        </section>
        <section className="card">
          <SectionTitle title="Tu meta de enfoque hoy" />
          <strong className="metric">
            {Math.round(focused)}{" "}
            <span className="small muted">
              / {state.preferences.dailyTarget} minutos
            </span>
          </strong>
          <Progress value={(focused / state.preferences.dailyTarget) * 100} />
          <p className="muted small">
            Se contabilizan las sesiones de enfoque completadas.
          </p>
        </section>
        <section className="card">
          <SectionTitle title="Objetivos" />
          {state.data.goals.map((g) => (
            <div className="goal-item" key={g.id}>
              <div className="row between">
                <strong>{g.title}</strong>
                <small>
                  {g.value ?? 0}/{g.target ?? 1}
                </small>
              </div>
              <Progress value={((g.value ?? 0) / (g.target ?? 1)) * 100} />
            </div>
          ))}
          {!state.data.goals.length && (
            <p className="muted">
              Define tu primer objetivo en Objetivos y hábitos.
            </p>
          )}
        </section>
        <section className="card">
          <SectionTitle title="Historial de resultados" />
          {results
            .slice(-10)
            .reverse()
            .map((r) => (
              <div className="list-row" key={r.id}>
                <div className="grow">
                  <strong>{r.title}</strong>
                  <small>{formatDate(r.createdAt)}</small>
                </div>
                <span className="tag">{r.score}%</span>
              </div>
            ))}
          {!results.length && (
            <p className="muted">Todavía no hay prácticas completadas.</p>
          )}
        </section>
      </div>
    </>
  );
}
function SettingsPanel({
  state,
  change,
  demo,
  email,
  notify,
  dirty,
}: {
  state: AppState;
  change: Change;
  demo: boolean;
  email: string;
  notify: Notify;
  dirty: boolean;
}) {
  const pref = state.preferences;
  async function logout(revoke = false) {
    if (
      dirty &&
      !confirm(
        "Hay cambios pendientes. ¿Salir igualmente? Exporta tu copia antes de continuar.",
      )
    )
      return;
    if (
      revoke &&
      !confirm(
        "¿Desconectar Google y revocar los permisos? Los datos seguirán en Drive.",
      )
    )
      return;
    try {
      const r = await api(`/api/auth/logout${revoke ? "?revoke=true" : ""}`, {
        method: "POST",
      });
      if (!r.revoked) {
        notify(
          "Se cerró la sesión, pero Google no confirmó la revocación. Revoca el acceso en myaccount.google.com/permissions.",
        );
        setTimeout(() => location.assign("/login"), 6000);
      } else location.assign("/login");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="two-columns">
      <section className="card">
        <SectionTitle title="Apariencia y preferencias" />
        <label className="field-label">
          Tema
          <select
            value={pref.theme}
            onChange={(e) =>
              change((s) => ({
                ...s,
                preferences: {
                  ...s.preferences,
                  theme: e.target.value as "dark" | "light",
                },
              }))
            }
          >
            <option value="dark">Azul marino oscuro</option>
            <option value="light">Claro</option>
          </select>
        </label>
        {(
          [
            ["focus", "Minutos de enfoque", 180],
            ["shortBreak", "Descanso corto", 60],
            ["longBreak", "Descanso largo", 120],
            ["dailyTarget", "Meta diaria de enfoque", 1440],
          ] as const
        ).map(([key, label, max]) => (
          <label className="field-label" key={key}>
            {label}
            <input
              type="number"
              min={1}
              max={max}
              value={pref[key]}
              onChange={(e) =>
                change((s) => ({
                  ...s,
                  preferences: {
                    ...s.preferences,
                    [key]: Math.max(
                      1,
                      Math.min(max, Number(e.target.value) || 1),
                    ),
                  },
                }))
              }
            />
          </label>
        ))}
        <div className="setting-row">
          <div>
            <strong>Notificaciones del temporizador</strong>
            <p className="small muted">
              Se muestran mientras la aplicación está abierta.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!("Notification" in window)) {
                notify("Este navegador no admite notificaciones.");
                return;
              }
              if (pref.notifications) {
                change((s) => ({
                  ...s,
                  preferences: { ...s.preferences, notifications: false },
                }));
                return;
              }
              const permission = await Notification.requestPermission();
              if (permission === "granted")
                change((s) => ({
                  ...s,
                  preferences: { ...s.preferences, notifications: true },
                }));
              else
                notify(
                  "Permiso no concedido. Puedes cambiarlo en la configuración del navegador.",
                );
            }}
          >
            {pref.notifications ? "Desactivar" : "Activar"}
          </Button>
        </div>
      </section>
      <div>
        <section className="card">
          <SectionTitle title="Cuenta de Google" />
          <div className="account-panel">
            <span className="avatar">
              {(email || "L").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{email || "Modo local de desarrollo"}</strong>
              <p className="small muted">
                {demo
                  ? "Drive y Calendar no están conectados."
                  : "Cuenta autorizada · Drive y Calendar"}
              </p>
            </div>
          </div>
          {!demo && (
            <div className="row wrap">
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                <LogOut size={14} />
                Cerrar sesión
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void logout(true)}
              >
                Desconectar Google
              </Button>
            </div>
          )}
          <p className="small muted">
            Los permisos se pueden revocar también desde la seguridad de tu
            cuenta de Google.
          </p>
        </section>
        <section className="card section-gap">
          <SectionTitle title="Tus datos" />
          <p className="muted small">
            Exporta una copia JSON de cursos, notas, tareas, hábitos y
            configuración. Los archivos de Drive y eventos de Google permanecen
            en Google.
          </p>
          <Button variant="outline" onClick={() => exportData(state)}>
            <Download size={16} />
            Exportar datos personales
          </Button>
          <label className="button button-outline import-button">
            Restaurar desde JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2_000_000)
                    throw new Error("El archivo supera 2 MB");
                  const parsed = stateSchema.parse(
                    JSON.parse(await file.text()),
                  );
                  if (
                    confirm(
                      "¿Reemplazar tus datos con esta copia? Exporta antes tus datos actuales. Los cambios se sincronizarán con Drive.",
                    )
                  ) {
                    change((s) => ({
                      ...parsed,
                      revision: s.revision,
                      updatedAt: new Date().toISOString(),
                    }));
                    notify("Copia restaurada.");
                  }
                } catch {
                  notify(
                    "No se pudo importar: archivo inválido o incompatible.",
                  );
                }
                e.target.value = "";
              }}
            />
          </label>
          {!demo && <BackupPanel change={change} notify={notify} />}
          <div className="storage-info">
            <Cloud size={17} />
            <span>
              {demo
                ? "Almacenamiento local de desarrollo."
                : "Estado en appDataFolder de Drive, privado para esta aplicación."}
              <small>
                Versión {state.revision} · {formatDate(state.updatedAt)}
              </small>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackupPanel({ change, notify }: { change: Change; notify: Notify }) {
  const [backups, setBackups] = useState<
      { id: string; name: string; createdTime: string }[]
    >([]),
    [loading, setLoading] = useState(false);
  return (
    <div className="section-gap">
      <Button
        variant="ghost"
        size="sm"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            const r = await api("/api/backups");
            setBackups(r.backups);
            if (!r.backups.length)
              notify(
                "Aún no hay versiones anteriores. Se crean al guardar cambios en Drive.",
              );
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <RotateCcw size={14} />
        Consultar versiones anteriores
      </Button>
      {backups.map((b) => (
        <div className="list-row" key={b.id}>
          <div className="grow">
            <small>{formatDate(b.createdTime)}</small>
            <span className="tiny muted">
              {b.name.split("-").slice(4, 5).join("")}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={async () => {
              if (
                !confirm(
                  "¿Restaurar esta versión? Exporta primero tus datos actuales. Se guardará como una nueva versión.",
                )
              )
                return;
              setLoading(true);
              try {
                const r = await api(
                  `/api/backups?id=${encodeURIComponent(b.id)}`,
                );
                const restored = stateSchema.parse(r.state);
                change((s) => ({
                  ...restored,
                  revision: s.revision,
                  updatedAt: new Date().toISOString(),
                }));
                notify("Versión restaurada. Pendiente de sincronización.");
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            Restaurar
          </Button>
        </div>
      ))}
    </div>
  );
}

export function EntryModal({
  kind,
  item,
  defaults,
  state,
  onClose,
  onSave,
}: {
  kind: Collection;
  item?: Item;
  defaults?: Partial<Item>;
  state: AppState;
  onClose: () => void;
  onSave: (i: Item) => void;
}) {
  const [v, setV] = useState<Partial<Item>>({ ...defaults, ...item }),
    [choices, setChoices] = useState(item?.choices ?? ["", "", "", ""]),
    [error, setError] = useState("");
  const set = (key: keyof Item, value: unknown) =>
    setV((s) => ({ ...s, [key]: value }));
  const contentKinds = [
    "courses",
    "topics",
    "notes",
    "projects",
    "flashcards",
    "goals",
    "habits",
  ];
  const courseKinds = ["topics", "notes", "questions", "flashcards"];
  const dateKinds = ["tasks", "projects", "goals", "events"];
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!v.title?.trim()) throw new Error("El título es obligatorio.");
      if (v.url && safeUrl(v.url) === "#")
        throw new Error("El enlace debe comenzar por https:// o http://");
      if (
        kind === "questions" &&
        (choices.some((c) => !c.trim()) || v.correct === undefined)
      )
        throw new Error("Completa las opciones y elige la respuesta correcta.");
      if (kind === "topics" && !v.courseId)
        throw new Error("Selecciona un curso.");
      if (kind === "flashcards" && !v.body?.trim())
        throw new Error("Escribe una respuesta.");
      if (kind === "goals" && (v.value ?? 0) > (v.target ?? 1))
        throw new Error("El avance no puede superar la meta.");
      if (
        kind === "events" &&
        (!v.due || !v.end || new Date(v.end) <= new Date(v.due))
      )
        throw new Error(
          "El evento necesita inicio y fin, con el final después del inicio.",
        );
      const result = {
        ...(item ?? newItem({ title: v.title })),
        ...v,
        title: v.title.trim(),
        ...(kind === "questions"
          ? { choices: choices.map((c) => c.trim()) }
          : {}),
        ...(kind === "events"
          ? {
              due: new Date(v.due!).toISOString(),
              end: new Date(v.end!).toISOString(),
            }
          : {}),
        ...(kind === "goals"
          ? { target: v.target ?? 1, value: v.value ?? 0 }
          : {}),
        ...(kind === "habits" ? { dates: v.dates ?? [] } : {}),
        ...(["tasks", "topics"].includes(kind)
          ? { completed: v.completed ?? false }
          : {}),
      } as Item;
      if (
        kind === "events" &&
        !confirm(
          `${item ? "¿Actualizar" : "¿Crear"} este evento en tu agenda personal?`,
        )
      )
        return;
      onSave(result);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const dateValue = (d?: string) => {
    if (!d) return "";
    if (kind !== "events") return d.slice(0, 10);
    const date = new Date(d);
    if (!isNaN(date.getTime()) && d.endsWith("Z"))
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    return d.slice(0, 16);
  };
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${item ? "Editar" : "Crear"} ${labels[kind].toLowerCase()}`}
      description={
        kind === "events"
          ? "Evento de tu agenda personal. La sincronización con Google se gestiona desde Calendario."
          : undefined
      }
    >
      <form onSubmit={submit} className="entry-form">
        <label className="field-label">
          {kind === "questions"
            ? "Pregunta"
            : kind === "flashcards"
              ? "Frente / pregunta"
              : "Título"}
          <input
            required
            autoFocus
            maxLength={500}
            value={v.title ?? ""}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        {contentKinds.includes(kind) && (
          <label className="field-label">
            {kind === "flashcards"
              ? "Reverso / respuesta"
              : "Descripción o contenido"}
            <textarea
              required={kind === "flashcards"}
              rows={4}
              maxLength={100000}
              value={v.body ?? ""}
              onChange={(e) => set("body", e.target.value)}
            />
          </label>
        )}
        {courseKinds.includes(kind) && (
          <label className="field-label">
            Curso
            <select
              required={kind === "topics"}
              value={v.courseId ?? ""}
              onChange={(e) => set("courseId", e.target.value)}
            >
              <option value="">Sin curso</option>
              {state.data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {["topics", "notes", "questions", "flashcards"].includes(kind) && (
          <label className="field-label">
            {kind === "topics" ? "Unidad" : "Tema"}
            <input
              value={kind === "topics" ? (v.unit ?? "") : (v.topic ?? "")}
              maxLength={300}
              onChange={(e) =>
                set(kind === "topics" ? "unit" : "topic", e.target.value)
              }
            />
          </label>
        )}
        {kind === "notes" && (
          <>
            <label className="field-label">
              Categoría
              <input
                maxLength={100}
                value={v.category ?? ""}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Personal, estudio, ideas…"
              />
            </label>
            <label className="field-label">
              Documento de Google Drive (enlace)
              <input
                type="url"
                value={v.url ?? ""}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://drive.google.com/…"
              />
            </label>
          </>
        )}
        {dateKinds.includes(kind) && (
          <label className="field-label">
            {kind === "events" ? "Inicio" : "Fecha límite"}
            <input
              required={kind === "events"}
              type={kind === "events" ? "datetime-local" : "date"}
              value={dateValue(v.due)}
              onChange={(e) => set("due", e.target.value)}
            />
          </label>
        )}
        {kind === "events" && (
          <label className="field-label">
            Fin
            <input
              required
              type="datetime-local"
              value={dateValue(v.end)}
              onChange={(e) => set("end", e.target.value)}
            />
          </label>
        )}
        {kind === "projects" && (
          <label className="field-label">
            Estado
            <select
              value={v.status ?? "pending"}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="pending">Pendiente</option>
              <option value="active">En curso</option>
              <option value="done">Finalizado</option>
            </select>
          </label>
        )}
        {kind === "tasks" && (
          <>
            <label className="field-label">
              Proyecto
              <select
                value={v.projectId ?? ""}
                onChange={(e) => {
                  set("projectId", e.target.value);
                  set("parentId", "");
                }}
              >
                <option value="">Sin proyecto</option>
                {state.data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {v.projectId &&
              !state.data.tasks.some((t) => t.parentId === item?.id) && (
                <label className="field-label">
                  Subtarea de
                  <select
                    value={v.parentId ?? ""}
                    onChange={(e) => set("parentId", e.target.value)}
                  >
                    <option value="">Tarea principal</option>
                    {state.data.tasks
                      .filter(
                        (t) =>
                          t.projectId === v.projectId &&
                          !t.parentId &&
                          t.id !== item?.id,
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>
              )}
          </>
        )}
        {kind === "questions" && (
          <>
            <div className="field-label">Opciones de respuesta</div>
            {choices.map((c, i) => (
              <label className="row choice-editor" key={i}>
                <input
                  type="radio"
                  name="correct"
                  required
                  checked={v.correct === i}
                  onChange={() => set("correct", i)}
                  aria-label={`La opción ${i + 1} es correcta`}
                />
                <span>{String.fromCharCode(65 + i)}</span>
                <input
                  required
                  aria-label={`Opción ${i + 1}`}
                  value={c}
                  maxLength={2000}
                  onChange={(e) =>
                    setChoices((all) =>
                      all.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
              </label>
            ))}
            <p className="tiny muted">
              Marca el círculo de la opción correcta.
            </p>
            <label className="field-label">
              Explicación registrada
              <textarea
                maxLength={100000}
                value={v.explanation ?? ""}
                onChange={(e) => set("explanation", e.target.value)}
                rows={3}
              />
            </label>
          </>
        )}
        {kind === "goals" && (
          <div className="two-columns">
            <label className="field-label">
              Meta
              <input
                type="number"
                required
                min={1}
                max={1000000}
                value={v.target ?? 1}
                onChange={(e) => set("target", Number(e.target.value))}
              />
            </label>
            <label className="field-label">
              Avance actual
              <input
                type="number"
                min={0}
                max={v.target ?? 1}
                value={v.value ?? 0}
                onChange={(e) => set("value", Number(e.target.value))}
              />
            </label>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">
            <Check size={16} />
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
