import test from "node:test";
import assert from "node:assert/strict";
import { GET as getState, PUT as putState } from "../src/app/api/state/route";
import {
  GET as getFiles,
  POST as createFile,
  PATCH as editFile,
  DELETE as trashFile,
} from "../src/app/api/drive/route";
import {
  GET as getCalendar,
  POST as createEvent,
  PATCH as editEvent,
  DELETE as deleteEvent,
} from "../src/app/api/calendar/route";
import { GET as getBackups } from "../src/app/api/backups/route";
import { initialState } from "../src/lib/model";
import { POST as logout } from "../src/app/api/auth/logout/route";
import {
  GET as assistantStatus,
  POST as assistantChat,
} from "../src/app/api/assistant/route";
import { POST as assistantExport } from "../src/app/api/assistant/export/route";

test("las API de lectura rechazan solicitudes sin sesión, sin contactar Google", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("No debe invocarse");
  };
  try {
    for (const request of [
      () => getState(),
      () => getFiles(new Request("https://example.com/api/drive")),
      () => getCalendar(new Request("https://example.com/api/calendar")),
      () => getBackups(new Request("https://example.com/api/backups")),
      () => assistantStatus(),
    ]) {
      const r = await request();
      assert.equal(r.status, 401);
      assert.match((await r.json()).error, /sesión/);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("todas las escrituras remotas rechazan CSRF antes de ejecutar operaciones", async () => {
  process.env.APP_URL = "https://example.com";
  for (const route of [
    putState,
    createFile,
    editFile,
    trashFile,
    createEvent,
    editEvent,
    deleteEvent,
    logout,
    assistantChat,
    assistantExport,
  ]) {
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const r = await route(request);
    assert.equal(r.status, 403);
  }
});
test("chat y exportación IA requieren sesión antes de procesar entradas", async () => {
  process.env.APP_URL = "https://example.com";
  for (const route of [assistantChat, assistantExport]) {
    const response = await route(
      new Request("https://example.com/api/assistant", {
        method: "POST",
        headers: {
          Origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(response.status, 401);
  }
});
test("una escritura de estado válida requiere sesión aunque el origen sea correcto", async () => {
  process.env.APP_URL = "https://example.com";
  const request = new Request("https://example.com/api/state", {
    method: "PUT",
    headers: {
      origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state: initialState(), fileId: null, etag: null }),
  });
  const r = await putState(request);
  assert.equal(r.status, 401);
});
