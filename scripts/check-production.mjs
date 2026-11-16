import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Prueba HTTP local del build real; nunca despliega ni utiliza credenciales.
const project = resolve(process.argv[2] ?? process.cwd());
let child;
try {
  assert.ok(
    existsSync(resolve(project, ".next/BUILD_ID")),
    "Primero compila una copia limpia.",
  );
  assert.equal(
    readdirSync(project).some(
      (name) => name.startsWith(".env") && name !== ".env.example",
    ),
    false,
    "Usa una copia limpia sin archivos privados .env.",
  );
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`,
    canonical = "https://security-smoke.example.invalid";
  child = spawn(
    process.execPath,
    [
      resolve(project, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: project,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        APP_URL: canonical,
        DEMO_MODE: "true",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "security-smoke.example.invalid",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // Consumir las salidas sin volcarlas: la prueba no imprime cuerpos ni cabeceras privadas.
  child.stdout.resume();
  child.stderr.resume();
  let ready = false;
  for (let attempt = 0; attempt < 240; attempt++) {
    if (child.exitCode !== null)
      throw new Error("El servidor de prueba terminó antes de iniciar.");
    try {
      await fetch(`${origin}/login`, { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await delay(125);
    }
  }
  assert.ok(ready, "El servidor no quedó listo a tiempo.");
  async function request(path, expected, init = {}) {
    const response = await fetch(origin + path, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, expected, `${init.method ?? "GET"} ${path}`);
    console.log(`OK ${init.method ?? "GET"} ${path}: ${expected}`);
    return response;
  }
  const root = await request("/", 307);
  assert.equal(
    new URL(root.headers.get("location"), origin).pathname,
    "/login",
  );
  await request("/login", 200);
  for (const path of [
    "/api/state",
    "/api/backups",
    "/api/drive",
    "/api/drive?id=not-authorized&preview=true",
    "/api/calendar",
    "/api/assistant",
  ]) {
    const response = await request(path, 401);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  const login = await request("/api/auth/login", 503);
  assert.equal(login.headers.get("referrer-policy"), "no-referrer");
  const callback = await request(
    "/api/auth/callback?state=invalid&code=invalid",
    302,
  );
  assert.equal(
    callback.headers.get("location"),
    `${canonical}/login?error=oauth`,
  );
  assert.equal(callback.headers.get("set-cookie"), null);
  for (const [path, method] of [
    ["/api/state", "PUT"],
    ["/api/assistant", "POST"],
    ["/api/assistant/export", "POST"],
    ["/api/drive", "POST"],
    ["/api/drive", "PATCH"],
    ["/api/drive", "DELETE"],
    ["/api/calendar", "POST"],
    ["/api/calendar", "PATCH"],
    ["/api/calendar", "DELETE"],
  ]) {
    const headers = { "Content-Type": "application/json", Origin: canonical };
    await request(path, 401, { method, headers, body: "{}" });
    await request(path, 403, {
      method,
      headers: { ...headers, Origin: "https://untrusted.example.invalid" },
      body: "{}",
    });
  }
  const logout = await request("/api/auth/logout", 200, {
    method: "POST",
    headers: { Origin: canonical },
  });
  const cookies = logout.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=lax/i);
  }
  console.log(
    "Protección de rutas y cookies verificada sobre el build de producción; no se contactó Google.",
  );
} catch (error) {
  console.error(
    "Falló la comprobación HTTP de producción:",
    error instanceof Error ? error.message : "error interno",
  );
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(3000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
