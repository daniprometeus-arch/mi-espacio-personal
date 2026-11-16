import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { allowedEmail } from "./auth-config";
import { AppError } from "./errors";
export const API_SCOPES = [
  "https://www.googleapis.com/auth/drive.appdata",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;
export const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  ...API_SCOPES,
] as const;
export const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export const OAUTH_LIFETIME = 10 * 60 * 1000;
export const pendingSchema = z
  .object({
    state: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    expires: z.number().int().positive(),
  })
  .strict();
export type PendingOAuth = z.infer<typeof pendingSchema>;
export const tokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
  token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive().max(86400),
  refresh_token: z.string().min(1).max(4096).optional(),
  scope: z.string().min(1).max(10000).optional(),
});
export const sessionSchema = z
  .object({
    authVersion: z.literal(2),
    subject: z.string().min(1).max(255),
    email: z.email(),
    name: z.string().min(1).max(200),
    accessToken: z.string().min(1).max(8192),
    refreshToken: z.string().min(1).max(4096),
    expiresAt: z.number().int().positive(),
    sessionExpiresAt: z.number().int().positive(),
  })
  .strict();
export type Session = z.infer<typeof sessionSchema>;
export function validateSession(
  value: unknown,
  now = Date.now(),
): Session | null {
  const parsed = sessionSchema.safeParse(value);
  if (!parsed.success) return null;
  const s = parsed.data;
  if (
    s.sessionExpiresAt <= now ||
    s.sessionExpiresAt > now + SESSION_LIFETIME + 60000 ||
    s.email.toLowerCase() !== allowedEmail()
  )
    return null;
  return s;
}
export function assertGrantedScopes(scope: string | undefined) {
  const granted = new Set(scope?.split(/\s+/).filter(Boolean) ?? []);
  if (API_SCOPES.some((required) => !granted.has(required)))
    throw new AppError(
      "Faltan permisos de Drive o Calendar. Vuelve a conectar y concede los tres permisos solicitados.",
      403,
    );
}
export function authorizeProfile(value: unknown) {
  const parsed = z
    .object({
      sub: z.string().min(1).max(255),
      email: z.email(),
      email_verified: z.literal(true),
      name: z.string().min(1).optional(),
    })
    .safeParse(value);
  if (!parsed.success || parsed.data.email.toLowerCase() !== allowedEmail())
    throw new AppError(
      "La cuenta de Google no está autorizada o su correo no está verificado.",
      403,
    );
  return {
    subject: parsed.data.sub,
    email: parsed.data.email.toLowerCase(),
    name: (parsed.data.name ?? parsed.data.email).slice(0, 200),
  };
}
export function validateCallback(url: URL, value: unknown, now = Date.now()) {
  const parsed = pendingSchema.safeParse(value),
    supplied = url.searchParams.get("state") ?? "",
    code = url.searchParams.get("code"),
    issuer = url.searchParams.get("iss");
  if (
    !parsed.success ||
    parsed.data.expires <= now ||
    parsed.data.expires > now + OAUTH_LIFETIME ||
    url.searchParams.has("error") ||
    url.searchParams.getAll("state").length !== 1 ||
    url.searchParams.getAll("code").length !== 1 ||
    !code ||
    code.length > 4096 ||
    !/^[A-Za-z0-9_-]{32}$/.test(supplied) ||
    (issuer !== null && issuer !== "https://accounts.google.com")
  )
    throw new AppError(
      "La autorización caducó, fue cancelada o no es válida. Inicia sesión otra vez.",
      401,
    );
  if (!timingSafeEqual(Buffer.from(parsed.data.state), Buffer.from(supplied)))
    throw new AppError("La autorización no corresponde a esta sesión.", 401);
  return { code, pending: parsed.data };
}
