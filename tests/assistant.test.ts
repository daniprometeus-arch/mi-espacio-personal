import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import {
  assistantRequestSchema,
  assistantResponseSchema,
  assistantExportSchema,
  type AssistantRequest,
} from "../src/lib/assistant-schema";
import {
  geminiKey,
  verifyGeminiModel,
  generateAssistant,
  GEMINI_MODEL,
} from "../src/lib/gemini";
import {
  reserveQuota,
  consumeAssistantQuota,
  beginAssistantRequest,
} from "../src/lib/assistant-quota";
import { documentPart, readLimited } from "../src/lib/assistant-documents";
import { summaryPdf } from "../src/lib/assistant-pdf";
import { AppError } from "../src/lib/errors";
import { compactAssistantHistory } from "../src/lib/assistant-conversation";
const input: AssistantRequest = {
  mode: "chat",
  consent: true,
  messages: [{ role: "user", text: "Explica la célula" }],
  includeCalendar: false,
  timeZone: "America/Lima",
};
const output = {
  answer: "Una explicación paso a paso.",
  title: "La célula",
  summary: null,
  questions: [],
  proposals: [],
};
let previousKey: string | undefined, previousFlag: string | undefined;
beforeEach(() => {
  previousKey = process.env.GEMINI_API_KEY;
  previousFlag = process.env.GEMINI_FREE_TIER_CONFIRMED;
  process.env.GEMINI_API_KEY = randomBytes(32).toString("hex");
  process.env.GEMINI_FREE_TIER_CONFIRMED = "true";
});
afterEach(() => {
  for (const [key, value] of [
    ["GEMINI_API_KEY", previousKey],
    ["GEMINI_FREE_TIER_CONFIRMED", previousFlag],
  ]) {
    if (value === undefined) Reflect.deleteProperty(process.env, key!);
    else process.env[key!] = value;
  }
});
const status = (n: number) => (e: unknown) =>
  e instanceof AppError && e.status === n;
test("el historial largo mantiene alternancia y empieza por usuario al recortarse", () => {
  const items = Array.from({ length: 21 }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("model" as const),
    text: "x".repeat(4000),
  }));
  const compact = compactAssistantHistory(items);
  assert.equal(compact[0].role, "user");
  assert.equal(compact.at(-1)?.role, "user");
  assert.ok(compact.reduce((n, m) => n + m.text.length, 0) <= 24000);
  assert.ok(
    assistantRequestSchema.safeParse({ ...input, messages: compact }).success,
  );
});
test("la IA requiere clave y confirmación de proyecto gratuito; no inventa configuración", async () => {
  delete process.env.GEMINI_API_KEY;
  assert.throws(geminiKey, status(503));
  process.env.GEMINI_API_KEY = "unit-test-only";
  delete process.env.GEMINI_FREE_TIER_CONFIRMED;
  let calls = 0;
  await assert.rejects(
    verifyGeminiModel(async () => {
      calls++;
      return Response.json({});
    }),
    status(503),
  );
  assert.equal(calls, 0);
});
test("modelos: verifica nombre y soporte generateContent, sin clave en la URL", async () => {
  let calls = 0;
  await verifyGeminiModel(async (url, init) => {
    calls++;
    assert.equal(new URL(String(url)).search, "");
    assert.equal(
      new Headers(init?.headers).get("x-goog-api-key"),
      process.env.GEMINI_API_KEY,
    );
    assert.equal(init?.redirect, "error");
    return Response.json({
      name: `models/${GEMINI_MODEL}`,
      supportedGenerationMethods: ["generateContent"],
    });
  });
  assert.equal(calls, 1);
  await assert.rejects(
    verifyGeminiModel(async () =>
      Response.json({
        name: "models/other",
        supportedGenerationMethods: ["generateContent"],
      }),
    ),
    status(503),
  );
});
test("cuota o modelo no disponible nunca dispara un fallback o reintento", async () => {
  for (const code of [429, 404, 403, 500]) {
    let calls = 0;
    await assert.rejects(
      verifyGeminiModel(async () => {
        calls++;
        return Response.json(
          { error: { message: process.env.GEMINI_API_KEY } },
          { status: code },
        );
      }),
      (e) =>
        e instanceof AppError &&
        !e.message.includes(process.env.GEMINI_API_KEY!),
    );
    assert.equal(calls, 1);
  }
});
test("generación utiliza solo REST de Gemini, JSON validado y ninguna herramienta de escritura", async () => {
  const result = await generateAssistant(input, [], null, async (url, init) => {
    assert.ok(String(url).endsWith(`${GEMINI_MODEL}:generateContent`));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 4096);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(
      JSON.stringify(body).includes(process.env.GEMINI_API_KEY!),
      false,
    );
    assert.match(
      body.systemInstruction.parts[0].text,
      /Nunca afirmes que guardaste/,
    );
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(output) }] },
        },
      ],
    });
  });
  assert.deepEqual(result, output);
});
test("respuestas truncadas, bloqueadas, acciones desconocidas y preguntas inválidas se rechazan", async () => {
  await assert.rejects(
    generateAssistant(input, [], null, async () =>
      Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
    ),
    status(422),
  );
  await assert.rejects(
    generateAssistant(input, [], null, async () =>
      Response.json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "not json" }] } },
        ],
      }),
    ),
    status(502),
  );
  assert.equal(
    assistantResponseSchema.safeParse({
      ...output,
      proposals: [
        { kind: "delete", title: "x", due: null, end: null, details: "" },
      ],
    }).success,
    false,
  );
  assert.equal(
    assistantResponseSchema.safeParse({
      ...output,
      questions: [
        {
          title: "x",
          choices: ["a", "b", "c", "d"],
          correct: 9,
          explanation: "x",
        },
      ],
    }).success,
    false,
  );
});
test("entrada exige consentimiento y limita historial, contexto y tipo de documento", () => {
  assert.equal(assistantRequestSchema.safeParse(input).success, true);
  for (const invalid of [
    { ...input, consent: false },
    { ...input, messages: Array(13).fill(input.messages[0]) },
    { ...input, sourceText: "x".repeat(24001) },
    { ...input, timeZone: "not-a-zone" },
    { ...input, messages: [{ role: "model", text: "x" }] },
    {
      ...input,
      driveFileId: "file",
      attachment: { name: "x", mimeType: "text/plain", data: "YQ==" },
    },
  ])
    assert.equal(assistantRequestSchema.safeParse(invalid).success, false);
});
test("límite por minuto, diario y reinicio por día UTC", () => {
  const now = Date.now(),
    day = new Date(now).toISOString().slice(0, 10);
  assert.throws(
    () =>
      reserveQuota(
        {
          version: 1,
          day,
          requests: Array.from({ length: 3 }, (_, i) => ({
            id: String(i),
            at: now - i * 1000,
          })),
        },
        now,
      ),
    status(429),
  );
  assert.throws(
    () =>
      reserveQuota(
        {
          version: 1,
          day,
          requests: Array.from({ length: 20 }, (_, i) => ({
            id: String(i),
            at: now - 1000000 - i,
          })),
        },
        now,
      ),
    status(429),
  );
  assert.equal(
    reserveQuota({ version: 1, day: "2000-01-01", requests: [] }, now).next
      .requests.length,
    1,
  );
});
test("solicitudes concurrentes por usuario se rechazan y el bloqueo se libera", () => {
  const release = beginAssistantRequest("unit-owner");
  assert.throws(() => beginAssistantRequest("unit-owner"), status(429));
  release();
  beginAssistantRequest("unit-owner")();
});
test("contador de Drive utiliza If-Match y persiste antes de permitir generación", async () => {
  let state = {
    version: 1,
    day: new Date().toISOString().slice(0, 10),
    requests: [] as { id: string; at: number }[],
  };
  let writes = 0;
  const transport: typeof import("../src/lib/google").google = async (
    url,
    init,
  ) => {
    if (url.includes("/files?"))
      return Response.json({ files: [{ id: "quota-file" }] });
    if (init?.method === "PATCH") {
      assert.equal(new Headers(init.headers).get("If-Match"), '"v1"');
      state = JSON.parse(String(init.body));
      writes++;
      return Response.json({ id: "quota-file" });
    }
    return Response.json(state, { headers: { etag: '"v1"' } });
  };
  const used = await consumeAssistantQuota(transport);
  assert.equal(used.used, 1);
  assert.equal(writes, 1);
  assert.equal(state.requests.length, 1);
  await assert.rejects(
    consumeAssistantQuota(async (url) =>
      url.includes("/files?")
        ? Response.json({ files: [{ id: "q" }] })
        : Response.json(state),
    ),
    status(503),
  );
});
test("contador duplicado o precondición rechazada bloquean la solicitud", async () => {
  await assert.rejects(
    consumeAssistantQuota(async () =>
      Response.json({ files: [{ id: "q1" }, { id: "q2" }] }),
    ),
    status(409),
  );
  await assert.rejects(
    consumeAssistantQuota(async (url, init) => {
      if (url.includes("/files?"))
        return Response.json({ files: [{ id: "q" }] });
      if (init?.method === "PATCH") throw new AppError("conflicto", 409);
      return Response.json(
        {
          version: 1,
          day: new Date().toISOString().slice(0, 10),
          requests: [],
        },
        { headers: { etag: '"old"' } },
      );
    }),
    status(409),
  );
});
test("PDF/TXT están limitados, se valida tipo y no se descargan URLs externas", async () => {
  assert.ok(
    "text" in
      documentPart(
        new TextEncoder().encode("Resumen de biología"),
        "text/plain",
        "apunte.txt",
      ),
  );
  assert.throws(
    () =>
      documentPart(
        new TextEncoder().encode("not pdf"),
        "application/pdf",
        "x.pdf",
      ),
    status(400),
  );
  assert.throws(
    () => documentPart(new Uint8Array(1500001), "application/pdf", "x.pdf"),
    status(413),
  );
  assert.throws(
    () =>
      documentPart(
        new TextEncoder().encode("x".repeat(24001)),
        "text/plain",
        "x.txt",
      ),
    status(413),
  );
  await assert.rejects(
    readLimited(new Response("x".repeat(100)).body, 10),
    status(413),
  );
});
test("exportar o guardar requiere confirmación explícita", () => {
  const value = {
    title: "Resumen",
    text: "Texto",
    format: "pdf",
    saveToLibrary: true,
  };
  assert.equal(assistantExportSchema.safeParse(value).success, false);
  assert.equal(
    assistantExportSchema.safeParse({ ...value, confirmed: false }).success,
    false,
  );
  assert.equal(
    assistantExportSchema.safeParse({ ...value, confirmed: true }).success,
    true,
  );
});
test("PDF real con caracteres españoles, griegos y varias páginas", async () => {
  const bytes = await summaryPdf(
    "Biología y física: α, β, ñ",
    "Una explicación clara con acentos y células.\n".repeat(250),
  );
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
  const parsed = await PDFDocument.load(bytes);
  assert.ok(parsed.getPageCount() > 1);
  assert.equal(parsed.getTitle(), "Biología y física: α, β, ñ");
});
