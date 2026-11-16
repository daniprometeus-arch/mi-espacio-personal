import { z } from "zod";
import { AppError } from "./errors";
export function deploymentAllowsGoogle() {
  // Una preview de Vercel no debe utilizar sesiones o credenciales de producción.
  return process.env.VERCEL !== "1" || process.env.VERCEL_ENV === "production";
}
export function appUrl() {
  try {
    if (!deploymentAllowsGoogle()) throw new Error("preview");
    const productionDomain =
      process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : undefined;
    // Nunca usar VERCEL_URL ni cabeceras Host: corresponden a URLs efímeras o externas.
    const automatic =
      productionDomain && /^[a-zA-Z0-9.-]+$/.test(productionDomain)
        ? `https://${productionDomain}`
        : undefined;
    const url = new URL(process.env.APP_URL?.trim() || automatic || "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          local &&
          process.env.NODE_ENV !== "production" &&
          process.env.VERCEL !== "1")
      )
    )
      throw new Error("invalid");
    return url.origin;
  } catch {
    throw new AppError(
      "Configura el origen HTTPS definitivo en APP_URL (o el dominio de producción de Vercel), sin ruta ni credenciales. OAuth está desactivado en previews; HTTP solo se permite en localhost durante el desarrollo.",
      503,
    );
  }
}
export function allowedEmail() {
  const parsed = z
    .email()
    .safeParse(process.env.ALLOWED_EMAIL?.trim().toLowerCase());
  if (!parsed.success)
    throw new AppError(
      "Configura ALLOWED_EMAIL con la única cuenta autorizada.",
      503,
    );
  return parsed.data;
}
export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret))
    throw new AppError(
      "SESSION_SECRET debe ser un valor de 32 bytes en hexadecimal (64 caracteres), generado con openssl rand -hex 32.",
      503,
    );
  return secret;
}
export function authConfig() {
  const origin = appUrl(),
    email = allowedEmail();
  sessionSecret();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim(),
    clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret)
    throw new AppError(
      "Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local. Consulta docs/GOOGLE_CLOUD.md.",
      503,
    );
  return { origin, email, clientId, clientSecret };
}
export function configured() {
  try {
    authConfig();
    return true;
  } catch {
    return false;
  }
}
