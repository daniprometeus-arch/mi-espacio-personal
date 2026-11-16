import { z } from "zod";

export const collections = [
  "courses",
  "topics",
  "notes",
  "tasks",
  "projects",
  "questions",
  "results",
  "flashcards",
  "reviews",
  "goals",
  "habits",
  "sessions",
  "events",
] as const;
export type Collection = (typeof collections)[number];
const text = z.string().max(100000);
export const itemSchema = z
  .object({
    id: z.string().min(1).max(200),
    title: z.string().min(1).max(500),
    createdAt: z.string().datetime(),
    body: text.optional(),
    courseId: z.string().max(200).optional(),
    projectId: z.string().max(200).optional(),
    topic: z.string().max(300).optional(),
    unit: z.string().max(300).optional(),
    category: z.string().max(100).optional(),
    due: z.string().max(40).optional(),
    end: z.string().max(40).optional(),
    completed: z.boolean().optional(),
    status: z.enum(["pending", "active", "done"]).optional(),
    parentId: z.string().max(200).optional(),
    url: z.string().max(2000).optional(),
    choices: z.array(z.string().min(1).max(2000)).min(2).max(6).optional(),
    correct: z.number().int().min(0).max(5).optional(),
    explanation: text.optional(),
    answers: z
      .array(
        z.object({
          questionId: z.string(),
          selected: z.number().int(),
          correct: z.boolean(),
        }),
      )
      .max(500)
      .optional(),
    score: z.number().min(0).max(100).optional(),
    seconds: z.number().int().min(0).max(86400).optional(),
    target: z.number().min(1).max(1000000).optional(),
    value: z.number().min(0).max(1000000).optional(),
    dates: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .max(20000)
      .optional(),
    cardId: z.string().optional(),
    known: z.boolean().optional(),
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
export const widgetIds = [
  "welcome",
  "streak",
  "tasks",
  "pomodoro",
  "calendar",
  "note",
  "activity",
  "goals",
  "documents",
  "shortcuts",
] as const;
export const widgetSchema = z.object({
  id: z.enum(widgetIds),
  size: z.enum(["small", "wide"]),
  hidden: z.boolean(),
});
export const preferencesSchema = z
  .object({
    theme: z.enum(["dark", "light"]),
    notifications: z.boolean(),
    focus: z.number().int().min(1).max(180),
    shortBreak: z.number().int().min(1).max(60),
    longBreak: z.number().int().min(1).max(120),
    youtube: z.string().max(2000),
    dailyTarget: z.number().int().min(1).max(1440),
  })
  .strict();
const baseSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().min(0),
    updatedAt: z.string().datetime(),
    widgets: z.array(widgetSchema).length(widgetIds.length),
    preferences: preferencesSchema,
    data: z
      .object(
        Object.fromEntries(
          collections.map((k) => [k, z.array(itemSchema).max(20000)]),
        ) as Record<Collection, z.ZodArray<typeof itemSchema>>,
      )
      .strict(),
  })
  .strict();
export const stateSchema = baseSchema.superRefine((state, ctx) => {
  if (new Set(state.widgets.map((w) => w.id)).size !== widgetIds.length)
    ctx.addIssue({ code: "custom", message: "Widgets duplicados" });
  for (const k of collections) {
    if (new Set(state.data[k].map((i) => i.id)).size !== state.data[k].length)
      ctx.addIssue({ code: "custom", message: `IDs duplicados en ${k}` });
  }
  state.data.questions.forEach((q, index) => {
    if (!q.choices || q.correct === undefined || q.correct >= q.choices.length)
      ctx.addIssue({
        code: "custom",
        path: ["data", "questions", index],
        message: "Pregunta sin opciones o respuesta válida",
      });
  });
});
export type AppState = z.infer<typeof stateSchema>;
export function initialState(): AppState {
  return {
    schemaVersion: 1,
    revision: 0,
    updatedAt: new Date().toISOString(),
    widgets: widgetIds.map((id) => ({
      id,
      size: ["welcome", "note", "activity"].includes(id) ? "wide" : "small",
      hidden: false,
    })),
    preferences: {
      theme: "dark",
      notifications: false,
      focus: 25,
      shortBreak: 5,
      longBreak: 15,
      youtube: "",
      dailyTarget: 120,
    },
    data: collections.reduce(
      (data, key) => {
        data[key] = [];
        return data;
      },
      {} as AppState["data"],
    ),
  };
}
export function newItem(values: Omit<Item, "id" | "createdAt">): Item {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...values,
  };
}
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function scoreQuiz(questions: Item[], answers: Record<string, number>) {
  const graded = questions.map((q) => ({
    questionId: q.id,
    selected: answers[q.id] ?? -1,
    correct: answers[q.id] === q.correct,
  }));
  return {
    answers: graded,
    score: questions.length
      ? Math.round(
          (100 * graded.filter((a) => a.correct).length) / questions.length,
        )
      : 0,
  };
}
export function courseProgress(state: AppState, id: string) {
  const topics = state.data.topics.filter((t) => t.courseId === id);
  return topics.length
    ? Math.round(
        (topics.filter((t) => t.completed).length / topics.length) * 100,
      )
    : 0;
}
export function streak(sessions: Item[], now = new Date()) {
  const dates = new Set(
    sessions
      .filter((s) => (s.seconds ?? 0) > 0)
      .map((s) => dayKey(new Date(s.createdAt))),
  );
  let n = 0;
  const d = new Date(now);
  if (!dates.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (dates.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
export function youtubeId(url: string) {
  try {
    const u = new URL(url);
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(
              u.hostname,
            )
          ? (u.searchParams.get("v") ??
            u.pathname.match(/^\/embed\/([\w-]+)/)?.[1])
          : null;
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
