import {
  checkOrigin,
  requireSession,
  errorResponse,
  AppError,
} from "@/lib/auth";
import {
  geminiKey,
  verifyGeminiModel,
  generateAssistant,
  GEMINI_MODEL,
} from "@/lib/gemini";
import { assistantRequestSchema } from "@/lib/assistant-schema";
import {
  assistantDocument,
  assistantCalendar,
  readLimited,
} from "@/lib/assistant-documents";
import {
  beginAssistantRequest,
  consumeAssistantQuota,
  AI_LIMITS,
} from "@/lib/assistant-quota";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    await requireSession();
    geminiKey();
    await verifyGeminiModel();
    return Response.json(
      { available: true, model: GEMINI_MODEL, limits: AI_LIMITS },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(request);
    const session = await requireSession();
    geminiKey();
    const raw = await readLimited(request.body, 2100000),
      parsed = assistantRequestSchema.safeParse(
        JSON.parse(new TextDecoder().decode(raw)),
      );
    if (!parsed.success)
      throw new AppError(
        "Revisa el consentimiento, los mensajes, el documento y la zona horaria. Máximo 12 mensajes y 24.000 caracteres de conversación.",
        400,
      );
    release = beginAssistantRequest(session.subject);
    await verifyGeminiModel();
    const document = await assistantDocument(parsed.data),
      calendar = parsed.data.includeCalendar ? await assistantCalendar() : null;
    const usage = await consumeAssistantQuota();
    const result = await generateAssistant(parsed.data, document, calendar);
    return Response.json(
      { result, usage, model: GEMINI_MODEL },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const response = errorResponse(error);
    if (error instanceof AppError && error.status === 429)
      response.headers.set("Retry-After", "60");
    return response;
  } finally {
    release?.();
  }
}
