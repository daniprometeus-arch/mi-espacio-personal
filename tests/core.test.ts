import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  newItem,
  stateSchema,
  scoreQuiz,
  courseProgress,
  streak,
  youtubeId,
  dayKey,
} from "../src/lib/model";
import {
  seal,
  unseal,
  checkOrigin,
  AppError,
  demoEnabled,
  errorResponse,
} from "../src/lib/auth";
import { assertVersion, assertSaved } from "../src/lib/versioning";

test("estado inicial sin indicadores inventados y exportación compatible", () => {
  const s = initialState();
  assert.equal(s.data.sessions.length, 0);
  assert.equal(s.data.results.length, 0);
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(s))), s);
});
test("rechaza importaciones malformadas, IDs y widgets duplicados", () => {
  const s = initialState();
  s.widgets[1] = { ...s.widgets[0] };
  assert.equal(stateSchema.safeParse(s).success, false);
  const t = initialState();
  const item = newItem({ title: "Curso" });
  t.data.courses = [item, item];
  assert.equal(stateSchema.safeParse(t).success, false);
  assert.equal(
    stateSchema.safeParse({ ...initialState(), schemaVersion: 9 }).success,
    false,
  );
});
test("las preguntas requieren opciones y una respuesta válida", () => {
  const s = initialState();
  s.data.questions = [
    newItem({ title: "Pregunta", choices: ["Sí", "No"], correct: 4 }),
  ];
  assert.equal(stateSchema.safeParse(s).success, false);
  s.data.questions[0].correct = 1;
  assert.equal(stateSchema.safeParse(s).success, true);
});
test("cuestionarios: corrección, errores y respuestas faltantes", () => {
  const questions = [
    newItem({ title: "Uno", choices: ["A", "B"], correct: 0 }),
    newItem({ title: "Dos", choices: ["A", "B"], correct: 1 }),
  ];
  const r = scoreQuiz(questions, { [questions[0].id]: 0 });
  assert.equal(r.score, 50);
  assert.equal(r.answers[1].selected, -1);
  assert.equal(r.answers[1].correct, false);
  assert.equal(scoreQuiz([], {}).score, 0);
});
test("el progreso de curso deriva solo de sus temas", () => {
  const s = initialState();
  s.data.topics = [
    newItem({ title: "A", courseId: "c", completed: true }),
    newItem({ title: "B", courseId: "c", completed: false }),
    newItem({ title: "C", courseId: "other", completed: true }),
  ];
  assert.equal(courseProgress(s, "c"), 50);
  assert.equal(courseProgress(s, "missing"), 0);
});
test("racha: deduplica sesiones por día y tolera hoy sin sesión", () => {
  const make = (date: string) => ({
    ...newItem({ title: "Enfoque", seconds: 1500 }),
    createdAt: new Date(date).toISOString(),
  });
  const now = new Date("2026-11-15T12:00:00");
  const sessions = [
    make("2026-11-14T12:00:00"),
    make("2026-11-14T14:00:00"),
    make("2026-11-13T12:00:00"),
  ];
  assert.equal(streak(sessions, now), 2);
  assert.equal(streak([], now), 0);
  assert.equal(dayKey(now), "2026-11-15");
});
test("solo acepta identificadores de video de hosts YouTube conocidos", () => {
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(
    youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  );
  assert.equal(youtubeId("https://evil.test/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeId("javascript:alert(1)"), null);
});
test("tokens cifrados con autenticación, sin texto legible y con IV único", () => {
  process.env.SESSION_SECRET = "a".repeat(64);
  const value = {
    refreshToken: "token-super-secreto",
    email: "owner@example.com",
  };
  const encoded = seal(value);
  assert.equal(encoded.includes(value.refreshToken), false);
  assert.deepEqual(unseal(encoded), value);
  assert.notEqual(seal(value), encoded);
  const tampered = Buffer.from(encoded, "base64url");
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => unseal(tampered.toString("base64url")));
  process.env.SESSION_SECRET = "short";
  assert.throws(() => seal(value));
});
test("CSRF: rechaza origen ausente o diferente", () => {
  process.env.APP_URL = "https://example.com";
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("https://example.com/api/state", {
        headers: { origin: "https://example.com" },
      }),
    ),
  );
  assert.throws(
    () =>
      checkOrigin(
        new Request("https://example.com/api/state", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    (e: unknown) => e instanceof AppError && e.status === 403,
  );
  assert.throws(() =>
    checkOrigin(new Request("https://example.com/api/state")),
  );
});
test("demo nunca puede habilitarse en producción", () => {
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production", DEMO_MODE: "true" });
  assert.equal(demoEnabled(), false);
  Object.assign(process.env, {
    NODE_ENV: original ?? "test",
    DEMO_MODE: "false",
  });
});
test("concurrencia: rechaza ETag/revisión obsoletos y falta de ETag", () => {
  const s = initialState();
  assert.doesNotThrow(() => assertVersion(s, s, '"a"', '"a"'));
  for (const [actual, expected] of [
    ['"b"', '"a"'],
    [null, '"a"'],
  ] as const)
    assert.throws(
      () => assertVersion(s, s, actual, expected),
      (e: unknown) => e instanceof AppError && e.status === 409,
    );
  assert.throws(() => assertVersion({ ...s, revision: 3 }, s, '"a"', '"a"'));
  assert.throws(() => assertSaved({ ...s, revision: 2 }, s));
});
test("errores de entrada no revelan datos internos", async () => {
  const r = errorResponse(new SyntaxError("secret"));
  assert.equal(r.status, 400);
  assert.equal((await r.text()).includes("secret"), false);
});
