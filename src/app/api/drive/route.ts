import { z } from "zod";
import {
  checkOrigin,
  AppError,
  errorResponse,
  requireSession,
} from "@/lib/auth";
import { google, drive, fileId } from "@/lib/google";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireSession();
    const u = new URL(request.url);
    const id = u.searchParams.get("id");
    if (id && u.searchParams.get("preview") === "true") {
      const r = await google(`${drive}/files/${fileId(id)}?alt=media`);
      const type = r.headers.get("content-type") ?? "";
      if (!type.includes("application/pdf"))
        throw new AppError(
          "La vista integrada solo admite PDF. Abre el archivo en Google Drive.",
        );
      return new Response(r.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "inline",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "frame-ancestors 'self'",
        },
      });
    }
    const parent = u.searchParams.get("parent");
    const search = u.searchParams.get("q") ?? "";
    const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `trashed = false${parent ? ` and '${fileId(parent)}' in parents` : ""}${search ? ` and name contains '${escape(search.slice(0, 200))}'` : ""}`;
    const params = new URLSearchParams({
      q,
      spaces: "drive",
      fields:
        "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents,size)",
      pageSize: u.searchParams.get("recent") === "true" ? "5" : "100",
      orderBy:
        u.searchParams.get("recent") === "true"
          ? "modifiedTime desc"
          : "folder,name",
    });
    const page = u.searchParams.get("page");
    if (page) params.set("pageToken", page);
    return Response.json(
      await (await google(`${drive}/files?${params}`)).json(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("multipart/form-data")) {
      const f = await request.formData();
      const file = f.get("file");
      if (!(file instanceof File) || file.size > 3_000_000)
        throw new AppError(
          "Selecciona un archivo de hasta 3 MB. Para archivos mayores usa Google Drive.",
        );
      const parent = String(f.get("parent") ?? "");
      if (parent) fileId(parent);
      const metadata = {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        ...(parent ? { parents: [parent] } : {}),
      };
      const boundary = `upload_${crypto.randomUUID()}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
        ),
        Buffer.from(await file.arrayBuffer()),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const r = await google(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      return Response.json(await r.json());
    }
    const input = z
      .object({
        name: z.string().min(1).max(200),
        parent: z.string().optional(),
      })
      .parse(await request.json());
    const r = await google(`${drive}/files?fields=id,name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        mimeType: "application/vnd.google-apps.folder",
        ...(input.parent ? { parents: [fileId(input.parent)] } : {}),
      }),
    });
    return Response.json(await r.json());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const v = z
      .object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        parent: z.string().optional(),
        previousParent: z.string().optional(),
        confirmed: z.literal(true),
      })
      .parse(await request.json());
    const params = new URLSearchParams({ fields: "id,name,parents" });
    if (v.parent) params.set("addParents", fileId(v.parent));
    if (v.previousParent) params.set("removeParents", fileId(v.previousParent));
    return Response.json(
      await (
        await google(`${drive}/files/${fileId(v.id)}?${params}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(v.name ? { name: v.name } : {}),
        })
      ).json(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const v = z
      .object({ id: z.string(), confirmed: z.literal(true) })
      .parse(await request.json());
    await google(`${drive}/files/${fileId(v.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
