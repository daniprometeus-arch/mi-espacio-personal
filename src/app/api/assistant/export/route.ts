import {
  checkOrigin,
  requireSession,
  errorResponse,
  AppError,
} from "@/lib/auth";
import { assistantExportSchema } from "@/lib/assistant-schema";
import { readLimited } from "@/lib/assistant-documents";
import { summaryPdf } from "@/lib/assistant-pdf";
import { google } from "@/lib/google";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await requireSession();
    const parsed = assistantExportSchema.safeParse(
      JSON.parse(
        new TextDecoder().decode(await readLimited(request.body, 160000)),
      ),
    );
    if (!parsed.success)
      throw new AppError(
        "La exportación necesita texto, formato válido y confirmación explícita.",
      );
    const input = parsed.data,
      name =
        input.title.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").slice(0, 150) ||
        "Resumen";
    const pdf = input.format === "pdf",
      mimeType = pdf ? "application/pdf" : "text/plain",
      filename = `${name}.${pdf ? "pdf" : "txt"}`;
    const bytes = pdf
      ? Buffer.from(await summaryPdf(input.title, input.text))
      : Buffer.from(`${input.title}\n\n${input.text}`, "utf8");
    if (!input.saveToLibrary)
      return new Response(bytes, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="resumen.${pdf ? "pdf" : "txt"}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`,
          "Cache-Control": "private, no-store",
        },
      });
    const boundary = `summary_${crypto.randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, mimeType })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const saved = await (
      await google(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      )
    ).json();
    return Response.json(
      { id: saved.id, name: saved.name, url: saved.webViewLink ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
