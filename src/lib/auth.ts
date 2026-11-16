import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { appUrl, sessionSecret, deploymentAllowsGoogle } from "./auth-config";
import { validateSession, type Session } from "./auth-policy";
import { AppError } from "./errors";
import { refreshGoogleSession } from "./oauth";
export { AppError, errorResponse } from "./errors";
export { appUrl, configured } from "./auth-config";
export type { Session } from "./auth-policy";
export function demoEnabled() {
  return (
    process.env.DEMO_MODE === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL !== "1"
  );
}
function key() {
  return createHash("sha256").update(sessionSecret()).digest();
}
export function seal(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal<T>(value: string): T {
  if (value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new AppError("Cookie inválida", 401);
  const data = Buffer.from(value, "base64url");
  if (data.length < 29) throw new AppError("Cookie inválida", 401);
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function writeSession(session: Session) {
  const valid = validateSession(session);
  if (!valid) throw new AppError("Sesión inválida o vencida", 401);
  const encoded = seal(valid);
  if (encoded.length > 3800)
    throw new AppError(
      "La sesión supera el tamaño permitido. No se creó una sesión parcial.",
      503,
    );
  (await cookies()).set("mep_session", encoded, {
    ...cookieOptions,
    maxAge: Math.max(
      0,
      Math.floor((valid.sessionExpiresAt - Date.now()) / 1000),
    ),
  });
}
export async function getSession(): Promise<Session | null> {
  if (!deploymentAllowsGoogle()) return null;
  try {
    const value = (await cookies()).get("mep_session")?.value;
    return value ? validateSession(unseal(value)) : null;
  } catch {
    return null;
  }
}
export async function requireSession() {
  const session = await getSession();
  if (!session)
    throw new AppError("Inicia sesión con tu cuenta autorizada", 401);
  return session;
}
export async function accessToken() {
  const session = await requireSession();
  if (session.expiresAt > Date.now() + 60000) return session.accessToken;
  try {
    const updated = await refreshGoogleSession(session);
    await writeSession(updated);
    return updated.accessToken;
  } catch (error) {
    if (error instanceof AppError && [401, 403].includes(error.status))
      (await cookies()).set("mep_session", "", { ...cookieOptions, maxAge: 0 });
    throw error;
  }
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== appUrl())
    throw new AppError("Origen de solicitud no permitido", 403);
}
