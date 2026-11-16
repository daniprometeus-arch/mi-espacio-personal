import { createHash, randomBytes } from "node:crypto";
import { authConfig } from "./auth-config";
import {
  OAUTH_SCOPES,
  OAUTH_LIFETIME,
  SESSION_LIFETIME,
  assertGrantedScopes,
  authorizeProfile,
  tokenSchema,
  validateCallback,
  type Session,
} from "./auth-policy";
import { AppError } from "./errors";
// El transporte inyectable se usa en pruebas; producción utiliza endpoints fijos.
export async function oauthRequest(
  url: string,
  init: RequestInit,
  transport: typeof fetch = fetch,
) {
  if (
    ![
      "https://oauth2.googleapis.com/token",
      "https://oauth2.googleapis.com/revoke",
      "https://openidconnect.googleapis.com/v1/userinfo",
    ].includes(url)
  )
    throw new AppError("Destino de OAuth no permitido", 400);
  try {
    return await transport(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError(
      "No se pudo contactar con Google. Reintenta cuando se restablezca la conexión.",
      503,
    );
  }
}
async function googleJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new AppError("Google devolvió una respuesta no válida.", 502);
  }
}
export function createOAuthFlow(now = Date.now()) {
  const config = authConfig();
  const pending = {
    state: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    expires: now + OAUTH_LIFETIME,
  };
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.origin}/api/auth/callback`,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    state: pending.state,
    code_challenge: createHash("sha256")
      .update(pending.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return {
    pending,
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  };
}
export async function completeOAuth(
  url: URL,
  pendingValue: unknown,
  transport: typeof fetch = fetch,
  now = Date.now(),
): Promise<Session> {
  const config = authConfig(),
    { code, pending } = validateCallback(url, pendingValue, now);
  const response = await oauthRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: `${config.origin}/api/auth/callback`,
        code,
        code_verifier: pending.verifier,
        grant_type: "authorization_code",
      }),
    },
    transport,
  );
  if (!response.ok)
    throw new AppError(
      "Google no pudo completar el inicio de sesión. Inícialo de nuevo.",
      response.status >= 500 || response.status === 429 ? 503 : 401,
    );
  const parsed = tokenSchema.safeParse(await googleJson(response));
  if (!parsed.success || !parsed.data.refresh_token)
    throw new AppError(
      "Google no entregó una autorización offline válida. Vuelve a conectar tu cuenta.",
      401,
    );
  const tokens = parsed.data;
  assertGrantedScopes(tokens.scope);
  const profile = await oauthRequest(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    transport,
  );
  if (!profile.ok)
    throw new AppError(
      "No se pudo verificar la cuenta de Google.",
      profile.status >= 500 ? 503 : 401,
    );
  const user = authorizeProfile(await googleJson(profile));
  return {
    authVersion: 2,
    ...user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token!,
    expiresAt: now + tokens.expires_in * 1000,
    sessionExpiresAt: now + SESSION_LIFETIME,
  };
}
export async function refreshGoogleSession(
  session: Session,
  transport: typeof fetch = fetch,
  now = Date.now(),
): Promise<Session> {
  const config = authConfig();
  const response = await oauthRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }),
    },
    transport,
  );
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500)
      throw new AppError(
        "Google no pudo renovar la conexión temporalmente. Reintenta más tarde.",
        503,
      );
    throw new AppError(
      "La autorización de Google ya no es válida. Vuelve a iniciar sesión.",
      401,
    );
  }
  const parsed = tokenSchema.safeParse(await googleJson(response));
  if (!parsed.success)
    throw new AppError(
      "Google devolvió una respuesta de renovación inválida.",
      502,
    );
  const tokens = parsed.data;
  // Google puede omitir scope y refresh_token en una renovación.
  if (tokens.scope !== undefined) assertGrantedScopes(tokens.scope);
  return {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt: now + tokens.expires_in * 1000,
  };
}
