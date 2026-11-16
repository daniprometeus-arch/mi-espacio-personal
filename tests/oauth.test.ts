import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appUrl, authConfig, configured } from "../src/lib/auth-config";
import {
  API_SCOPES,
  OAUTH_SCOPES,
  SESSION_LIFETIME,
  authorizeProfile,
  validateSession,
  assertGrantedScopes,
} from "../src/lib/auth-policy";
import {
  completeOAuth,
  createOAuthFlow,
  refreshGoogleSession,
} from "../src/lib/oauth";
import { seal, unseal, writeSession, AppError } from "../src/lib/auth";
import { google } from "../src/lib/google";
import { GET as login } from "../src/app/api/auth/login/route";
import { GET as callbackRoute } from "../src/app/api/auth/callback/route";
import { getSession, demoEnabled } from "../src/lib/auth";

// Datos efímeros exclusivos de tests: nunca se escriben en .env ni son credenciales de Google.
const keys = [
  "APP_URL",
  "ALLOWED_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SESSION_SECRET",
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;
let previous: Record<string, string | undefined>;
beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
  ])
    Reflect.deleteProperty(process.env, key);
  Object.assign(process.env, {
    APP_URL: "http://localhost:3000",
    ALLOWED_EMAIL: "owner@example.invalid",
    GOOGLE_CLIENT_ID: `unit-test-${randomUUID()}`,
    GOOGLE_CLIENT_SECRET: randomBytes(24).toString("hex"),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    NODE_ENV: "test",
  });
});
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key);
    else Object.assign(process.env, { [key]: previous[key] });
  }
});
function profile() {
  return {
    sub: randomUUID(),
    email: process.env.ALLOWED_EMAIL!,
    email_verified: true,
    name: "Usuario de prueba",
  };
}
function token() {
  return {
    access_token: randomBytes(24).toString("base64url"),
    refresh_token: randomBytes(32).toString("base64url"),
    token_type: "Bearer",
    expires_in: 3600,
    scope: OAUTH_SCOPES.join(" "),
  };
}
function flow() {
  const now = Date.now(),
    f = createOAuthFlow(now);
  const url = new URL("http://localhost:3000/api/auth/callback");
  url.searchParams.set("state", f.pending.state);
  url.searchParams.set("code", randomUUID());
  return { ...f, callback: url, now };
}
function transport(
  tokens: unknown = token(),
  user: unknown = profile(),
): typeof fetch {
  return async (input) => {
    if (String(input) === "https://oauth2.googleapis.com/token")
      return Response.json(tokens);
    if (String(input) === "https://openidconnect.googleapis.com/v1/userinfo")
      return Response.json(user);
    throw new Error("Destino inesperado");
  };
}
function status(expected: number) {
  return (error: unknown) =>
    error instanceof AppError && error.status === expected;
}

test("Vercel utiliza el dominio estable de producción y nunca VERCEL_URL", () => {
  Reflect.deleteProperty(process.env, "APP_URL");
  Object.assign(process.env, {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: "production.example.invalid",
    VERCEL_URL: "ephemeral.example.invalid",
  });
  assert.equal(appUrl(), "https://production.example.invalid");
  const url = new URL(createOAuthFlow().url);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://production.example.invalid/api/auth/callback",
  );
  process.env.APP_URL = "https://custom.example.invalid";
  assert.equal(appUrl(), "https://custom.example.invalid");
  Reflect.deleteProperty(process.env, "APP_URL");
  Reflect.deleteProperty(process.env, "VERCEL_PROJECT_PRODUCTION_URL");
  assert.throws(appUrl, status(503));
});
test("una preview no puede iniciar OAuth, usar sesiones ni activar modo demo", async () => {
  Object.assign(process.env, {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    APP_URL: "https://production.example.invalid",
  });
  assert.equal(configured(), false);
  assert.throws(createOAuthFlow, status(503));
  assert.equal(await getSession(), null);
  const original = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";
  try {
    assert.equal(demoEnabled(), false);
  } finally {
    if (original === undefined)
      Reflect.deleteProperty(process.env, "DEMO_MODE");
    else process.env.DEMO_MODE = original;
  }
});

test("configuración incompleta no se anuncia como lista y login devuelve 503", async () => {
  delete process.env.GOOGLE_CLIENT_SECRET;
  assert.equal(configured(), false);
  assert.throws(authConfig, status(503));
  const response = await login(
    new Request("http://localhost:3000/api/auth/login"),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("APP_URL rechaza HTTP remoto, rutas y credenciales; producción exige HTTPS", () => {
  for (const value of [
    "http://example.invalid",
    "https://example.invalid/path",
    "https://user:pass@example.invalid",
    "https://example.invalid?query=1",
    "https://example.invalid#fragment",
    "ftp://localhost",
  ]) {
    process.env.APP_URL = value;
    assert.throws(appUrl, status(503));
  }
  process.env.APP_URL = "http://localhost:3000";
  assert.equal(appUrl(), "http://localhost:3000");
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.throws(appUrl, status(503));
  process.env.APP_URL = "https://example.invalid";
  assert.equal(appUrl(), "https://example.invalid");
});
test("configuración rechaza correo inválido y clave de sesión mal formada", () => {
  process.env.ALLOWED_EMAIL = "no-es-correo";
  assert.equal(configured(), false);
  process.env.ALLOWED_EMAIL = "owner@example.invalid";
  process.env.SESSION_SECRET = "not-a-valid-key";
  assert.equal(configured(), false);
  assert.throws(() => seal({}), status(503));
});
test("flujo OAuth usa PKCE S256 y scopes mínimos sin secretos en URL", () => {
  const f = flow(),
    url = new URL(f.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), [
    ...OAUTH_SCOPES,
  ]);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(f.pending.verifier).digest("base64url"),
  );
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://localhost:3000/api/auth/callback",
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("login_hint"), null);
  assert.equal(f.url.includes(process.env.ALLOWED_EMAIL!), false);
  assert.equal(f.url.includes(process.env.GOOGLE_CLIENT_SECRET!), false);
  assert.equal(f.url.includes(f.pending.verifier), false);
  assert.equal(
    url.searchParams
      .get("scope")
      ?.split(" ")
      .includes("https://www.googleapis.com/auth/calendar.events"),
    false,
  );
  assert.notEqual(createOAuthFlow().pending.state, f.pending.state);
});

test("login desde un alias redirige al origen configurado antes de crear cookies", async () => {
  const response = await login(
    new Request("https://alias.example.invalid/api/auth/login", {
      headers: { Host: "untrusted.example.invalid" },
    }),
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/api/auth/login",
  );
  assert.equal(response.headers.get("set-cookie"), null);
});
test("callback correcto intercambia el código en servidor y crea sesión solo del propietario", async () => {
  const f = flow(),
    tokens = token(),
    user = profile();
  let calls = 0;
  const mock: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (String(input).includes("/token")) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("code_verifier"), f.pending.verifier);
      assert.equal(body.get("client_secret"), process.env.GOOGLE_CLIENT_SECRET);
      assert.equal(body.get("code"), f.callback.searchParams.get("code"));
      return Response.json(tokens);
    }
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${tokens.access_token}`,
    );
    return Response.json(user);
  };
  const session = await completeOAuth(f.callback, f.pending, mock, f.now);
  assert.equal(calls, 2);
  assert.equal(session.email, user.email);
  assert.equal(session.subject, user.sub);
  assert.equal(session.authVersion, 2);
  assert.equal(session.sessionExpiresAt, f.now + SESSION_LIFETIME);
  assert.ok(validateSession(session, f.now));
});
test("callback rechaza state ausente/diferente, vencido, cancelación, emisor distinto y duplicados antes de usar la red", async () => {
  const f = flow();
  let calls = 0;
  const never: typeof fetch = async () => {
    calls++;
    throw new Error("No debe llamar");
  };
  const cases: [URL, unknown][] = [];
  for (const key of ["state", "code"]) {
    const u = new URL(f.callback);
    u.searchParams.delete(key);
    cases.push([u, f.pending]);
  }
  const wrong = new URL(f.callback);
  wrong.searchParams.set("state", randomBytes(24).toString("base64url"));
  cases.push([wrong, f.pending]);
  const cancel = new URL(f.callback);
  cancel.searchParams.set("error", "access_denied");
  cases.push([cancel, f.pending]);
  const issuer = new URL(f.callback);
  issuer.searchParams.set("iss", "https://example.invalid");
  cases.push([issuer, f.pending]);
  const duplicate = new URL(f.callback);
  duplicate.searchParams.append("state", f.pending.state);
  cases.push([duplicate, f.pending]);
  cases.push(
    [f.callback, { ...f.pending, expires: f.now - 1 }],
    [f.callback, null],
    [f.callback, { ...f.pending, verifier: "bad" }],
  );
  for (const [url, pending] of cases)
    await assert.rejects(
      completeOAuth(url, pending, never, f.now),
      status(401),
    );
  assert.equal(calls, 0);
});
test("no se acepta otra cuenta, correo sin verificar o identidad sin sub", async () => {
  const f = flow();
  for (const user of [
    { ...profile(), email: "other@example.invalid" },
    { ...profile(), email_verified: false },
    { ...profile(), email_verified: "true" },
    { email: process.env.ALLOWED_EMAIL, email_verified: true },
  ])
    await assert.rejects(
      completeOAuth(f.callback, f.pending, transport(token(), user), f.now),
      status(403),
    );
  process.env.ALLOWED_EMAIL = " OWNER@EXAMPLE.INVALID ";
  assert.equal(
    authorizeProfile({ ...profile(), email: "owner@example.invalid" }).email,
    "owner@example.invalid",
  );
});
test("permisos parciales no crean sesión ni consultan el perfil", async () => {
  const f = flow();
  for (const missing of API_SCOPES) {
    const tokens = {
      ...token(),
      scope: OAUTH_SCOPES.filter((s) => s !== missing).join(" "),
    };
    let calls = 0;
    const mock: typeof fetch = async () => {
      calls++;
      return Response.json(tokens);
    };
    await assert.rejects(
      completeOAuth(f.callback, f.pending, mock, f.now),
      status(403),
    );
    assert.equal(calls, 1);
  }
  assert.throws(() => assertGrantedScopes(undefined), status(403));
});
test("callback rechaza respuestas malformadas, token de tipo incorrecto o sin refresh token", async () => {
  const f = flow();
  const tokens = token();
  for (const invalid of [
    { ...tokens, access_token: "" },
    { ...tokens, expires_in: "3600" },
    { ...tokens, expires_in: -1 },
    { ...tokens, token_type: "other" },
    { ...tokens, refresh_token: undefined },
  ])
    await assert.rejects(
      completeOAuth(f.callback, f.pending, transport(invalid), f.now),
      status(401),
    );
  await assert.rejects(
    completeOAuth(
      f.callback,
      f.pending,
      async () => new Response("not-json"),
      f.now,
    ),
    status(502),
  );
});
test("sesiones malformadas, vencidas o de otra cuenta se rechazan; cambiar ALLOWED_EMAIL invalida la anterior", async () => {
  const f = flow(),
    session = await completeOAuth(f.callback, f.pending, transport(), f.now);
  for (const invalid of [
    { ...session, expiresAt: null },
    { ...session, sessionExpiresAt: f.now },
    { ...session, authVersion: 1 },
    { ...session, email: "other@example.invalid" },
    { ...session, subject: "" },
    { ...session, accessToken: "" },
  ])
    assert.equal(validateSession(invalid, f.now), null);
  process.env.ALLOWED_EMAIL = "other@example.invalid";
  assert.equal(validateSession(session, f.now), null);
});
test("cifrado rechaza cookies corruptas, demasiado grandes y claves cambiadas", () => {
  const encoded = seal({ secret: randomUUID() });
  assert.ok(unseal(encoded));
  for (const bad of ["", "a", "bad!", "a".repeat(4097)])
    assert.throws(() => unseal(bad));
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  assert.throws(() => unseal(encoded));
});
test("sesión que supera la cookie falla cerrada, sin crear una sesión parcial", async () => {
  const f = flow(),
    session = await completeOAuth(f.callback, f.pending, transport(), f.now);
  session.accessToken = randomBytes(3000).toString("hex");
  await assert.rejects(writeSession(session), status(503));
});
test("renovación conserva refresh token omitido y la caducidad absoluta de siete días", async () => {
  const f = flow(),
    session = await completeOAuth(f.callback, f.pending, transport(), f.now),
    tokens = token();
  const refreshed = await refreshGoogleSession(
    session,
    transport({ ...tokens, refresh_token: undefined, scope: undefined }),
    f.now + 1000,
  );
  assert.equal(refreshed.refreshToken, session.refreshToken);
  assert.equal(refreshed.accessToken, tokens.access_token);
  assert.equal(refreshed.sessionExpiresAt, session.sessionExpiresAt);
  const rotated = await refreshGoogleSession(
    session,
    transport(tokens),
    f.now + 1000,
  );
  assert.equal(rotated.refreshToken, tokens.refresh_token);
});
test("renovación distingue revocación de errores transitorios y no filtra cuerpos de Google", async () => {
  const f = flow(),
    session = await completeOAuth(f.callback, f.pending, transport(), f.now);
  for (const [http, expected] of [
    [400, 401],
    [401, 401],
    [429, 503],
    [500, 503],
  ])
    await assert.rejects(
      refreshGoogleSession(session, async () =>
        Response.json(
          { error_description: session.refreshToken },
          { status: http },
        ),
      ),
      (e) =>
        status(expected)(e) &&
        !(e as Error).message.includes(session.refreshToken),
    );
  await assert.rejects(
    refreshGoogleSession(session, async () => {
      throw new Error(session.refreshToken);
    }),
    status(503),
  );
  await assert.rejects(
    refreshGoogleSession(session, transport({ access_token: undefined })),
    status(502),
  );
  await assert.rejects(
    refreshGoogleSession(session, transport({ ...token(), scope: "openid" })),
    status(403),
  );
});
test("callback con APP_URL ausente devuelve error seguro en vez de fallar redirigiendo", async () => {
  delete process.env.APP_URL;
  const response = await callbackRoute(
    new Request("http://localhost:3000/api/auth/callback"),
  );
  assert.equal(response.status, 503);
});
test("transporte Google rechaza destinos ajenos antes de obtener o enviar tokens", async () => {
  for (const url of [
    "https://example.invalid/drive/v3/files",
    "http://www.googleapis.com/drive/v3/files",
    "https://www.googleapis.com/other",
    "https://user:pass@www.googleapis.com/drive/v3/files",
  ])
    await assert.rejects(google(url), status(400));
});
