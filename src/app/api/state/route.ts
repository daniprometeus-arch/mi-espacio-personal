import {
  checkOrigin,
  errorResponse,
  AppError,
  requireSession,
} from "@/lib/auth";
import { google, drive, findStateFile, fileId } from "@/lib/google";
import { initialState, stateSchema } from "@/lib/model";
import { assertVersion, assertSaved } from "@/lib/versioning";
import { createJsonFile, backupState, pruneBackups } from "@/lib/backups";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireSession();
    const id = await findStateFile();
    if (!id)
      return Response.json(
        { state: initialState(), etag: null, fileId: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    const r = await google(`${drive}/files/${fileId(id)}?alt=media`);
    const state = stateSchema.parse(await r.json());
    return Response.json(
      { state, etag: r.headers.get("etag"), fileId: id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 2_000_000)
      throw new AppError(
        "Los datos superan 2 MB. Exporta y archiva registros antiguos.",
        413,
      );
    const input = JSON.parse(raw);
    const parsed = stateSchema.safeParse(input.state);
    if (!parsed.success) throw new AppError("Estructura de datos inválida");
    const id = await findStateFile();
    let etag: string | null = null;
    if (id) {
      if (input.fileId !== id || typeof input.etag !== "string")
        throw new AppError(
          "Carga la última versión de Drive antes de guardar.",
          409,
        );
      const current = await google(`${drive}/files/${fileId(id)}?alt=media`);
      etag = current.headers.get("etag");
      const previous = stateSchema.parse(await current.json());
      assertVersion(previous, parsed.data, etag, input.etag);
      await backupState(previous);
    } else if (input.fileId || input.state.revision !== 0)
      throw new AppError(
        "Falta el archivo original. Recupera una copia antes de continuar.",
        409,
      );
    const next = {
      ...parsed.data,
      revision: parsed.data.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    let r: Response;
    if (id) {
      r = await google(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId(id)}?uploadType=media`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "If-Match": etag! },
          body: JSON.stringify(next),
        },
      );
    } else {
      r = await createJsonFile("mi-espacio-v1.json", next);
    }
    const result = await r.json();
    const savedId = id ?? result.id;
    const verified = await google(
      `${drive}/files/${fileId(savedId)}?alt=media`,
    );
    const saved = stateSchema.parse(await verified.json());
    assertSaved(saved, next);
    try {
      await pruneBackups();
    } catch {
      console.error("No se pudieron depurar las copias anteriores.");
    }
    return Response.json({
      state: saved,
      etag: verified.headers.get("etag"),
      fileId: savedId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
