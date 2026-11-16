import { cookies } from "next/headers";
import {
  appUrl,
  cookieOptions,
  errorResponse,
  unseal,
  writeSession,
} from "@/lib/auth";
import { completeOAuth } from "@/lib/oauth";
import { AppError } from "@/lib/errors";
import { validateCallback } from "@/lib/auth-policy";
export async function GET(request: Request) {
  // Evita un segundo error al redirigir si APP_URL no está configurada.
  let origin: string;
  try {
    origin = appUrl();
  } catch (error) {
    return errorResponse(error);
  }
  const store = await cookies(),
    pending = store.get("mep_oauth")?.value;
  try {
    const url = new URL(request.url),
      decoded = pending ? unseal(pending) : null;
    // Un GET arbitrario al callback no debe cerrar la sesión existente.
    validateCallback(url, decoded);
    store.set("mep_oauth", "", { ...cookieOptions, maxAge: 0 });
    store.set("mep_session", "", { ...cookieOptions, maxAge: 0 });
    const session = await completeOAuth(url, decoded);
    await writeSession(session);
    return Response.redirect(origin);
  } catch (error) {
    const reason =
      error instanceof AppError && error.status === 403
        ? "permissions-or-account"
        : "oauth";
    return Response.redirect(`${origin}/login?error=${reason}`);
  }
}
