import { z } from "zod";
import { google, drive, fileId } from "./google";
import { AppError } from "./errors";
export const AI_LIMITS = { perMinute: 3, perDay: 20, maxOutputTokens: 4096 };
const filename = "mi-espacio-assistant-quota-v1.json";
const schema = z
  .object({
    version: z.literal(1),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requests: z
      .array(z.object({ id: z.string(), at: z.number().int() }))
      .max(100),
  })
  .strict();
type Quota = z.infer<typeof schema>;
export function reserveQuota(value: Quota, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10),
    requests = value.day === day ? value.requests : [];
  if (requests.length >= AI_LIMITS.perDay)
    throw new AppError(
      "Alcanzaste el límite del asistente: 20 solicitudes por día UTC. No se enviaron más solicitudes a Gemini.",
      429,
    );
  if (requests.filter((r) => r.at > now - 60000).length >= AI_LIMITS.perMinute)
    throw new AppError(
      "Espera un minuto: el asistente admite 3 solicitudes por minuto.",
      429,
    );
  const request = { id: crypto.randomUUID(), at: now };
  return {
    next: { version: 1 as const, day, requests: [...requests, request] },
    id: request.id,
  };
}
const active = new Map<string, number>();
export function beginAssistantRequest(subject: string) {
  if ((active.get(subject) ?? 0) > Date.now())
    throw new AppError(
      "Ya hay una solicitud del asistente en curso. Espera a que termine.",
      429,
    );
  const expires = Date.now() + 90000;
  active.set(subject, expires);
  return () => {
    if (active.get(subject) === expires) active.delete(subject);
  };
}
export async function consumeAssistantQuota(transport: typeof google = google) {
  const list = async () => {
    const p = new URLSearchParams({
      spaces: "appDataFolder",
      q: `name = '${filename}'`,
      fields: "files(id)",
      pageSize: "100",
    });
    return (await (await transport(`${drive}/files?${p}`)).json()).files as {
      id: string;
    }[];
  };
  let files = await list();
  if (!files.length) {
    const boundary = `quota_${crypto.randomUUID()}`,
      initial = {
        version: 1,
        day: new Date().toISOString().slice(0, 10),
        requests: [],
      };
    await transport(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, parents: ["appDataFolder"], mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(initial)}\r\n--${boundary}--`,
      },
    );
    files = await list();
  }
  if (files.length !== 1)
    throw new AppError(
      "No se pudo asegurar un contador único en Drive. El asistente está detenido para evitar solicitudes sin límite.",
      409,
    );
  const id = fileId(files[0].id),
    url = `${drive}/files/${id}?alt=media`,
    current = await transport(url),
    etag = current.headers.get("etag");
  if (!etag)
    throw new AppError(
      "Drive no proporcionó una versión segura del contador. No se llamó a Gemini.",
      503,
    );
  const parsed = schema.safeParse(await current.json());
  if (!parsed.success)
    throw new AppError(
      "El contador de solicitudes no es válido. No se llamó a Gemini.",
      503,
    );
  const reserved = reserveQuota(parsed.data);
  await transport(
    `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify(reserved.next),
    },
  );
  const verified = schema.parse(await (await transport(url)).json());
  if (!verified.requests.some((r) => r.id === reserved.id))
    throw new AppError(
      "El contador cambió simultáneamente. No se llamó a Gemini.",
      409,
    );
  return { used: reserved.next.requests.length, limit: AI_LIMITS.perDay };
}
