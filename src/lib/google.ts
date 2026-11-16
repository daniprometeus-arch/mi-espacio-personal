import { accessToken, AppError } from "./auth";
export async function google(url: string, init: RequestInit = {}) {
  const target = new URL(url);
  if (
    target.origin !== "https://www.googleapis.com" ||
    target.username ||
    target.password ||
    !["/drive/v3/", "/upload/drive/v3/", "/calendar/v3/"].some((prefix) =>
      target.pathname.startsWith(prefix),
    )
  )
    throw new AppError("Destino de Google API no permitido", 400);
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(target, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError(
      "Se interrumpió la conexión con Google. No se pudo confirmar la operación; recarga antes de repetir una creación.",
      503,
    );
  }
  if (!response.ok) {
    if (response.status === 412)
      throw new AppError(
        "Los datos cambiaron en otra pestaña. Descarga tu copia y carga la versión de Drive.",
        409,
      );
    if (response.status === 401)
      throw new AppError("Vuelve a conectar tu cuenta de Google", 401);
    if (response.status === 404)
      throw new AppError("El recurso ya no existe o no está autorizado", 404);
    if (response.status === 403)
      throw new AppError(
        "Google denegó el acceso. Revisa los permisos, las API habilitadas y la cuota.",
        403,
      );
    if (response.status === 429 || response.status >= 500)
      throw new AppError(
        "Google está temporalmente ocupado o se alcanzó la cuota. Reintenta más tarde y comprueba antes si una creación ya se realizó.",
        503,
      );
    throw new AppError(
      "Google no pudo confirmar la operación. Revisa el estado antes de repetirla.",
      502,
    );
  }
  return response;
}
export const drive = "https://www.googleapis.com/drive/v3";
export function fileId(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id))
    throw new AppError("ID de archivo inválido");
  return encodeURIComponent(id);
}
export async function findStateFile() {
  const q = new URLSearchParams({
    spaces: "appDataFolder",
    q: "name = 'mi-espacio-v1.json' and trashed = false",
    fields: "files(id,modifiedTime)",
    pageSize: "100",
    orderBy: "createdTime asc",
  });
  const r = await google(`${drive}/files?${q}`);
  const data = await r.json();
  if (data.files.length > 1)
    throw new AppError(
      "Hay varios archivos de estado. Requiere recuperación manual; no se sobrescribió ninguno.",
      409,
    );
  return data.files[0]?.id as string | undefined;
}
