import { z } from "zod";
export const assistantModes = [
  "chat",
  "explain",
  "summary",
  "quiz",
  "plan",
] as const;
export const assistantRequestSchema = z
  .object({
    mode: z.enum(assistantModes),
    consent: z.literal(true),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "model"]),
            text: z.string().trim().min(1).max(8000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    sourceText: z.string().max(24000).optional(),
    driveFileId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,200}$/)
      .optional(),
    attachment: z
      .object({
        name: z.string().min(1).max(200),
        mimeType: z.enum(["application/pdf", "text/plain"]),
        data: z.string().max(2000000),
      })
      .strict()
      .optional(),
    includeCalendar: z.boolean().default(false),
    tasks: z
      .array(
        z.object({
          title: z.string().max(500),
          due: z.string().max(40).optional(),
        }),
      )
      .max(20)
      .optional(),
    timeZone: z.string().max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.messages[0]?.role !== "user" ||
      v.messages.some(
        (message, index) =>
          index > 0 && message.role === v.messages[index - 1].role,
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "La conversación debe empezar por el usuario y alternar mensajes.",
      });
    if (v.messages.at(-1)?.role !== "user")
      ctx.addIssue({
        code: "custom",
        message: "El último mensaje debe ser del usuario.",
      });
    if (v.messages.reduce((n, m) => n + m.text.length, 0) > 24000)
      ctx.addIssue({
        code: "custom",
        message: "La conversación es demasiado larga. Inicia una nueva.",
      });
    if (v.attachment && v.driveFileId)
      ctx.addIssue({
        code: "custom",
        message: "Selecciona un solo documento.",
      });
    try {
      new Intl.DateTimeFormat("es", { timeZone: v.timeZone });
    } catch {
      ctx.addIssue({ code: "custom", message: "Zona horaria inválida." });
    }
  });
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export const generatedQuestionSchema = z
  .object({
    title: z.string().min(1).max(500),
    choices: z.array(z.string().min(1).max(1000)).length(4),
    correct: z.number().int().min(0).max(3),
    explanation: z.string().min(1).max(2000),
  })
  .strict();
export const proposalSchema = z
  .object({
    kind: z.enum(["task", "event"]),
    title: z.string().min(1).max(200),
    due: z.string().max(40).nullable(),
    end: z.string().max(40).nullable(),
    details: z.string().max(2000),
  })
  .strict();
export type AssistantProposal = z.infer<typeof proposalSchema>;
export const assistantResponseSchema = z
  .object({
    answer: z.string().min(1).max(12000),
    title: z.string().min(1).max(200),
    summary: z.string().max(16000).nullable(),
    questions: z.array(generatedQuestionSchema).max(5),
    proposals: z.array(proposalSchema).max(5),
  })
  .strict();
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;
export const assistantJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "title", "summary", "questions", "proposals"],
  properties: {
    answer: { type: "string" },
    title: { type: "string" },
    summary: { type: ["string", "null"] },
    questions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "choices", "correct", "explanation"],
        properties: {
          title: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" },
          },
          correct: { type: "integer", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
        },
      },
    },
    proposals: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "due", "end", "details"],
        properties: {
          kind: { type: "string", enum: ["task", "event"] },
          title: { type: "string" },
          due: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
          details: { type: "string" },
        },
      },
    },
  },
};
export const assistantExportSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    text: z.string().min(1).max(24000),
    format: z.enum(["text", "pdf"]),
    saveToLibrary: z.boolean(),
    confirmed: z.literal(true),
  })
  .strict();
