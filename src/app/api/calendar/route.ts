import { z } from "zod";
import {
  checkOrigin,
  errorResponse,
  AppError,
  requireSession,
} from "@/lib/auth";
import { google } from "@/lib/google";
const endpoint =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const schema = z.object({
  id: z.string().max(1024).optional(),
  title: z.string().min(1).max(500),
  due: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  confirmed: z.literal(true),
  etag: z.string().optional(),
});
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireSession();
    const u = new URL(request.url);
    const start = u.searchParams.get("start") ?? new Date().toISOString();
    const end =
      u.searchParams.get("end") ??
      new Date(Date.now() + 90 * 86400000).toISOString();
    if (
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start)
    )
      throw new AppError("Fechas inválidas");
    const p = new URLSearchParams({
      timeMin: start,
      timeMax: end,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const page = u.searchParams.get("page");
    if (page) p.set("pageToken", page);
    return Response.json(await (await google(`${endpoint}?${p}`)).json());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  return save(r, false);
}
export async function PATCH(r: Request) {
  return save(r, true);
}
async function save(request: Request, edit: boolean) {
  try {
    checkOrigin(request);
    await requireSession();
    const v = schema.parse(await request.json());
    if (Date.parse(v.end) <= Date.parse(v.due))
      throw new AppError("El final debe ser posterior al inicio");
    if (edit && (!v.id || !v.etag))
      throw new AppError("Recarga el evento antes de editar");
    const r = await google(
      `${endpoint}${edit ? `/${encodeURIComponent(v.id!)}` : ""}`,
      {
        method: edit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(edit ? { "If-Match": v.etag! } : {}),
        },
        body: JSON.stringify({
          summary: v.title,
          start: { dateTime: v.due },
          end: { dateTime: v.end },
        }),
      },
    );
    return Response.json(await r.json());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const v = z
      .object({ id: z.string(), etag: z.string(), confirmed: z.literal(true) })
      .parse(await request.json());
    await google(`${endpoint}/${encodeURIComponent(v.id)}`, {
      method: "DELETE",
      headers: { "If-Match": v.etag },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
