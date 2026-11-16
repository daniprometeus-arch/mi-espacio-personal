"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  FileText,
  Upload,
  FolderOpen,
  RefreshCw,
  Trash2,
  Download,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { api, json, type ModuleProps } from "./workspace";
import { newItem } from "@/lib/model";
import { compactAssistantHistory } from "@/lib/assistant-conversation";
import type {
  AssistantRequest,
  AssistantResponse,
  AssistantProposal,
} from "@/lib/assistant-schema";

type Message = {
  id: string;
  role: "user" | "model";
  text: string;
  result?: AssistantResponse;
  saved?: string[];
};
const modes = [
  ["chat", "Conversar"],
  ["explain", "Explicar un tema"],
  ["summary", "Resumir"],
  ["quiz", "Crear cuestionario"],
  ["plan", "Organizar estudio"],
] as const;
const prompts: Record<AssistantRequest["mode"], string> = {
  chat: "¿En qué te ayudo hoy?",
  explain: "Explica paso a paso el siguiente tema…",
  summary: "Resume el material seleccionado y destaca las ideas clave.",
  quiz: "Crea hasta cinco preguntas con respuestas y explicaciones sobre este material.",
  plan: "Propón un plan de estudio realista y tareas para avanzar.",
};
type Review = {
  messageId: string;
  kind: "task" | "event" | "quiz" | "library-text" | "library-pdf" | "download";
  index?: number;
  title: string;
  body: string;
  due: string;
  end: string;
  courseId: string;
  topic: string;
};
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
}
export default function AssistantPanel({
  state,
  change,
  upsert,
  notify,
  demo,
  active,
}: ModuleProps & { demo: boolean; active: boolean }) {
  const [available, setAvailable] = useState(false),
    [checked, setChecked] = useState(false),
    [model, setModel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AssistantRequest["mode"]>("chat"),
    [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [sourceText, setSourceText] = useState(""),
    [consent, setConsent] = useState(false),
    [includeCalendar, setIncludeCalendar] = useState(false),
    [includeTasks, setIncludeTasks] = useState(false),
    [usage, setUsage] = useState<number | null>(null);
  const [attachment, setAttachment] =
      useState<AssistantRequest["attachment"]>(),
    [driveId, setDriveId] = useState(""),
    [driveName, setDriveName] = useState(""),
    [files, setFiles] = useState<
      { id: string; name: string; mimeType: string }[]
    >([]),
    [page, setPage] = useState(""),
    [picker, setPicker] = useState(false),
    [fileBusy, setFileBusy] = useState(false),
    [review, setReview] = useState<Review | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    bottom = useRef<HTMLDivElement>(null);
  async function check() {
    if (demo) {
      setChecked(true);
      return;
    }
    setError("");
    try {
      const result = await api("/api/assistant");
      setAvailable(result.available === true);
      setModel(result.model ?? "");
    } catch (e) {
      setAvailable(false);
      setError((e as Error).message);
    } finally {
      setChecked(true);
    }
  }
  useEffect(() => {
    if (active && !checked) void check();
  }, [active, checked, demo]);
  useEffect(() => {
    if (active) bottom.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages, busy, active]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy || !available || !consent) return;
    setBusy(true);
    setError("");
    const question: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt.trim(),
    };
    const history = compactAssistantHistory([...messages, question]);
    setMessages((current) => [...current, question]);
    setPrompt("");
    try {
      const result = await api(
        "/api/assistant",
        json("POST", {
          mode,
          consent: true,
          messages: history,
          sourceText: sourceText || undefined,
          driveFileId: driveId || undefined,
          attachment,
          includeCalendar,
          tasks: includeTasks
            ? state.data.tasks
                .filter((t) => !t.completed)
                .slice(0, 20)
                .map((t) => ({ title: t.title, due: t.due }))
            : undefined,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      );
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "model",
          text: result.result.answer,
          result: result.result,
          saved: [],
        },
      ]);
      setUsage(result.usage.used);
    } catch (e) {
      setError((e as Error).message);
      setPrompt(question.text);
      setMessages((current) => current.filter((m) => m.id !== question.id));
    } finally {
      setBusy(false);
    }
  }
  async function loadFiles(next = "") {
    setFileBusy(true);
    try {
      const result = await api(
        `/api/drive?${new URLSearchParams(next ? { page: next } : {})}`,
      );
      const accepted = result.files.filter((f: { mimeType: string }) =>
        [
          "application/pdf",
          "text/plain",
          "application/vnd.google-apps.document",
        ].includes(f.mimeType),
      );
      setFiles((previous) => (next ? [...previous, ...accepted] : accepted));
      setPage(result.nextPageToken ?? "");
      setPicker(true);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setFileBusy(false);
    }
  }
  function openReview(message: Message, kind: Review["kind"], index?: number) {
    const result = message.result!;
    const proposal = index !== undefined ? result.proposals[index] : undefined;
    setReview({
      messageId: message.id,
      kind,
      index,
      title: proposal?.title ?? result.title,
      body: proposal?.details ?? result.summary ?? result.answer,
      due:
        kind === "event"
          ? localDate(proposal?.due ?? null)
          : (proposal?.due ?? "").slice(0, 10),
      end: localDate(proposal?.end ?? null),
      courseId: "",
      topic: "",
    });
  }
  async function saveReview(event: React.FormEvent) {
    event.preventDefault();
    if (!review || busy) return;
    const message = messages.find((m) => m.id === review.messageId),
      result = message?.result;
    if (!message || !result) return;
    setBusy(true);
    setError("");
    const key =
      review.index !== undefined ? `proposal-${review.index}` : review.kind;
    try {
      if (review.kind !== "quiz" && !review.title.trim())
        throw new Error("El título no puede estar vacío.");
      if (review.kind === "task") {
        upsert(
          "tasks",
          newItem({
            title: review.title.trim(),
            body: review.body,
            due: review.due,
            completed: false,
          }),
        );
        notify(
          "Tarea añadida tras tu confirmación; se sincronizará con tus datos.",
        );
      } else if (review.kind === "event") {
        const due = new Date(review.due),
          end = new Date(review.end);
        if (
          !review.due ||
          !review.end ||
          !Number.isFinite(due.getTime()) ||
          !Number.isFinite(end.getTime()) ||
          end <= due
        )
          throw new Error("Revisa el inicio y el fin del evento.");
        await api(
          "/api/calendar",
          json("POST", {
            title: review.title.trim(),
            due: due.toISOString(),
            end: end.toISOString(),
            confirmed: true,
          }),
        );
        notify("Evento creado en Google Calendar tras tu confirmación.");
      } else if (review.kind === "quiz") {
        if (!result.questions.length)
          throw new Error("No hay preguntas válidas para guardar.");
        const items = result.questions.map((q) =>
          newItem({ ...q, courseId: review.courseId, topic: review.topic }),
        );
        change((s) => ({
          ...s,
          data: { ...s.data, questions: [...s.data.questions, ...items] },
        }));
        notify("Preguntas añadidas al banco; se sincronizarán con tus datos.");
      } else {
        const download = review.kind === "download",
          pdf = review.kind === "library-pdf" || download;
        if (download) {
          const response = await fetch(
            "/api/assistant/export",
            json("POST", {
              title: review.title.trim(),
              text: review.body,
              format: "pdf",
              saveToLibrary: false,
              confirmed: true,
            }),
          );
          if (!response.ok)
            throw new Error(
              (await response.json()).error ?? "No se pudo exportar.",
            );
          const url = URL.createObjectURL(await response.blob());
          const link = document.createElement("a");
          link.href = url;
          link.download = "resumen.pdf";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          notify("PDF descargado.");
        } else {
          const saved = await api(
            "/api/assistant/export",
            json("POST", {
              title: review.title.trim(),
              text: review.body,
              format: pdf ? "pdf" : "text",
              saveToLibrary: true,
              confirmed: true,
            }),
          );
          upsert(
            "notes",
            newItem({
              title: review.title.trim(),
              body: review.body,
              category: "Resumen IA",
              url:
                saved.url ??
                `https://drive.google.com/file/d/${encodeURIComponent(saved.id)}/view`,
            }),
          );
          notify(
            "Archivo guardado en tu biblioteca de Drive; el enlace se sincronizará en apuntes.",
          );
        }
      }
      if (review.kind !== "download")
        setMessages((all) =>
          all.map((m) =>
            m.id === message.id
              ? { ...m, saved: [...(m.saved ?? []), key] }
              : m,
          ),
        );
      setReview(null);
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assistant-layout">
      <section className="card assistant-main">
        <div className="section-title">
          <div className="row">
            <span className="stat-icon blue">
              <Sparkles size={21} />
            </span>
            <div>
              <h2>Tu compañero de estudio</h2>
              <p className="tiny muted">
                {model || "Gemini"} ·{" "}
                {usage !== null
                  ? `${usage}/20 solicitudes hoy (UTC)`
                  : "3 solicitudes/min · 20/día UTC"}
              </p>
            </div>
          </div>
          <div className="row">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || demo}
              onClick={() => void check()}
              aria-label="Comprobar disponibilidad de Gemini"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!messages.length || busy}
              onClick={() => {
                if (
                  confirm(
                    "¿Borrar esta conversación de la pestaña? Los elementos ya guardados se conservarán.",
                  )
                ) {
                  setMessages([]);
                  setError("");
                }
              }}
            >
              <Trash2 size={14} />
              Nueva conversación
            </Button>
          </div>
        </div>
        {demo && (
          <div className="notice">
            El asistente requiere tu sesión de Google y una clave Gemini
            configurada en servidor. No realiza llamadas en modo demo.
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="assistant-modes">
          {modes.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              className={mode === id ? "active" : ""}
              onClick={() => {
                setMode(id);
                if (!prompt) setPrompt(prompts[id]);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="assistant-thread"
          role="log"
          aria-label="Conversación del asistente"
          aria-live="polite"
        >
          {!messages.length && (
            <div className="empty">
              <Sparkles size={32} />
              <h3>Una idea más clara. Un siguiente paso.</h3>
              <p>
                Pregunta sobre un tema, prepara un repaso o convierte tus
                pendientes en un plan. Tú decides qué guardar.
              </p>
            </div>
          )}
          {messages.map((message) => (
            <article
              className={`assistant-message ${message.role}`}
              key={message.id}
            >
              <span className="tiny muted">
                {message.role === "user" ? "Tú" : "Asistente IA"}
              </span>
              <p>{message.text}</p>
              {message.result && (
                <>
                  {message.result.summary && (
                    <div className="assistant-summary">
                      <strong>{message.result.title}</strong>
                      <p>{message.result.summary}</p>
                      <div className="row wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy || message.saved?.includes("library-text")
                          }
                          onClick={() => openReview(message, "library-text")}
                        >
                          <FolderOpen size={14} />
                          {message.saved?.includes("library-text")
                            ? "Guardado como TXT"
                            : "Guardar en biblioteca (TXT)"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            busy || message.saved?.includes("library-pdf")
                          }
                          onClick={() => openReview(message, "library-pdf")}
                        >
                          Guardar PDF en biblioteca
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => openReview(message, "download")}
                        >
                          <Download size={14} />
                          Exportar PDF
                        </Button>
                      </div>
                    </div>
                  )}
                  {message.result.questions.length > 0 && (
                    <div className="assistant-questions">
                      {message.result.questions.map((q, index) => (
                        <details key={index}>
                          <summary>
                            {index + 1}. {q.title}
                          </summary>
                          <ol type="A">
                            {q.choices.map((choice, i) => (
                              <li key={i}>
                                {choice}
                                {i === q.correct ? " ✓" : ""}
                              </li>
                            ))}
                          </ol>
                          <p>
                            <strong>Explicación:</strong> {q.explanation}
                          </p>
                        </details>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || message.saved?.includes("quiz")}
                        onClick={() => openReview(message, "quiz")}
                      >
                        {message.saved?.includes("quiz")
                          ? "Preguntas guardadas"
                          : "Revisar y guardar preguntas"}
                      </Button>
                    </div>
                  )}
                  {message.result.proposals.map((proposal, index) => (
                    <div className="assistant-proposal" key={index}>
                      <div>
                        <span className="tag">
                          BORRADOR ·{" "}
                          {proposal.kind === "event"
                            ? "EVENTO GOOGLE"
                            : "TAREA"}
                        </span>
                        <strong>{proposal.title}</strong>
                        <p>{proposal.details}</p>
                        {proposal.due && (
                          <small className="muted">
                            Inicio/fecha: {proposal.due}
                            {proposal.end ? ` · Fin: ${proposal.end}` : ""}
                          </small>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          busy || message.saved?.includes(`proposal-${index}`)
                        }
                        onClick={() =>
                          openReview(message, proposal.kind, index)
                        }
                      >
                        {message.saved?.includes(`proposal-${index}`)
                          ? "Creado"
                          : "Revisar propuesta"}
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </article>
          ))}
          {busy && (
            <div className="row muted small">
              <Loader2 size={15} className="spin" />
              Procesando tu solicitud…
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form onSubmit={send} className="assistant-composer">
          <label className="field-label">
            Tu mensaje
            <textarea
              rows={3}
              maxLength={8000}
              placeholder={prompts[mode]}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="assistant-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Acepto enviar mis mensajes y el material seleccionado a Gemini. En
            el nivel gratuito, Google puede usarlos para mejorar sus productos.
          </label>
          <div className="row between wrap">
            <span className="tiny muted">
              Sin guardados automáticos del chat. Los fallos de generación
              también cuentan.
            </span>
            <Button
              type="submit"
              disabled={!available || !consent || busy || !prompt.trim()}
            >
              <Send size={15} />
              Enviar a Gemini
            </Button>
          </div>
        </form>
      </section>
      <aside className="card assistant-context">
        <h2>Material y contexto</h2>
        <p className="small muted">
          Solo se comparte lo que selecciones al enviar.
        </p>
        <label className="field-label">
          Texto para resumir o estudiar
          <textarea
            rows={7}
            maxLength={24000}
            placeholder="Pega aquí un fragmento…"
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
          />
        </label>
        <div className="row wrap">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || demo || fileBusy}
            onClick={() => void loadFiles()}
          >
            <FolderOpen size={14} />
            Elegir de Drive
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || demo}
            onClick={() => upload.current?.click()}
          >
            <Upload size={14} />
            Adjuntar PDF/TXT
          </Button>
        </div>
        <input
          ref={upload}
          hidden
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1500000) {
              notify("Selecciona un archivo de hasta 1,5 MB.");
              e.target.value = "";
              return;
            }
            const mimeType =
              file.type === "application/pdf" ||
              file.name.toLowerCase().endsWith(".pdf")
                ? "application/pdf"
                : "text/plain";
            const reader = new FileReader();
            reader.onload = () => {
              setAttachment({
                name: file.name,
                mimeType,
                data: String(reader.result).split(",")[1],
              });
              setDriveId("");
              setDriveName("");
            };
            reader.onerror = () => notify("No se pudo leer el archivo.");
            reader.readAsDataURL(file);
            e.target.value = "";
          }}
        />
        {(attachment || driveId) && (
          <div className="assistant-source row">
            <FileText size={16} />
            <span className="grow">{attachment?.name ?? driveName}</span>
            <button
              className="icon-button"
              aria-label="Quitar documento seleccionado"
              onClick={() => {
                setAttachment(undefined);
                setDriveId("");
                setDriveName("");
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <p className="tiny muted">
          Máximo 1,5 MB. Drive: PDF, TXT y documentos de Google. TXT UTF-8 y
          texto: hasta 24.000 caracteres.
        </p>
        <label className="assistant-consent">
          <input
            type="checkbox"
            checked={includeCalendar}
            onChange={(e) => setIncludeCalendar(e.target.checked)}
          />
          Incluir agenda de Google: próximos 7 días, hasta 50 eventos.
        </label>
        <label className="assistant-consent">
          <input
            type="checkbox"
            checked={includeTasks}
            onChange={(e) => setIncludeTasks(e.target.checked)}
          />
          Incluir hasta 20 tareas pendientes.
        </label>
        <div className="notice">
          Las propuestas no cambian tus datos. Antes de guardar podrás revisar
          títulos, texto y fechas. Comprueba las respuestas y explicaciones
          generadas.
        </div>
        <p className="tiny muted">
          La conversación permanece solo en memoria de esta pestaña. Al recargar
          se pierde. Se envían como máximo los últimos 10 mensajes, limitados a
          24.000 caracteres.
        </p>
      </aside>
      <Modal
        title="Seleccionar material de Drive"
        description="Se muestran solo documentos autorizados para esta aplicación. El contenido se envía a Gemini cuando pulses Enviar y aceptes el consentimiento."
        open={picker}
        onOpenChange={setPicker}
      >
        {files.map((file) => (
          <button
            key={file.id}
            className="assistant-file"
            onClick={() => {
              setDriveId(file.id);
              setDriveName(file.name);
              setAttachment(undefined);
              setPicker(false);
            }}
          >
            <FileText size={16} />
            {file.name}
          </button>
        ))}
        {!files.length && (
          <p className="muted">No hay documentos compatibles en esta página.</p>
        )}
        {page && (
          <Button
            variant="outline"
            disabled={fileBusy}
            onClick={() => void loadFiles(page)}
          >
            Cargar más
          </Button>
        )}
      </Modal>
      {review && (
        <Modal
          open
          title={
            review.kind === "quiz"
              ? "Confirmar preguntas"
              : review.kind === "event"
                ? "Confirmar evento de Google"
                : review.kind === "task"
                  ? "Confirmar tarea"
                  : "Revisar resumen"
          }
          description="Nada se guardará hasta que confirmes esta acción. Puedes revisar y ajustar los datos."
          onOpenChange={(open) => {
            if (!open && !busy) setReview(null);
          }}
        >
          <form onSubmit={saveReview}>
            {review.kind === "quiz" ? (
              <>
                <p className="small muted">
                  Se añadirán{" "}
                  {
                    messages.find((m) => m.id === review.messageId)?.result
                      ?.questions.length
                  }{" "}
                  preguntas con sus respuestas y explicaciones al banco
                  existente. Revísalas en el chat antes de confirmar.
                </p>
                <label className="field-label">
                  Curso
                  <select
                    value={review.courseId}
                    onChange={(e) =>
                      setReview({ ...review, courseId: e.target.value })
                    }
                  >
                    <option value="">Sin curso</option>
                    {state.data.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Tema
                  <input
                    maxLength={300}
                    value={review.topic}
                    onChange={(e) =>
                      setReview({ ...review, topic: e.target.value })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field-label">
                  Título
                  <input
                    required
                    maxLength={200}
                    value={review.title}
                    onChange={(e) =>
                      setReview({ ...review, title: e.target.value })
                    }
                  />
                </label>
                <label className="field-label">
                  {review.kind === "event"
                    ? "Detalles de la propuesta (no se envían al evento)"
                    : "Contenido"}
                  <textarea
                    required={
                      review.kind.startsWith("library") ||
                      review.kind === "download"
                    }
                    maxLength={24000}
                    rows={
                      review.kind === "task" || review.kind === "event" ? 3 : 8
                    }
                    value={review.body}
                    onChange={(e) =>
                      setReview({ ...review, body: e.target.value })
                    }
                  />
                </label>
                {["task", "event"].includes(review.kind) && (
                  <label className="field-label">
                    {review.kind === "task"
                      ? "Fecha límite"
                      : "Inicio (tu hora local)"}
                    <input
                      required={review.kind === "event"}
                      type={review.kind === "event" ? "datetime-local" : "date"}
                      value={review.due}
                      onChange={(e) =>
                        setReview({ ...review, due: e.target.value })
                      }
                    />
                  </label>
                )}
                {review.kind === "event" && (
                  <label className="field-label">
                    Fin (tu hora local)
                    <input
                      required
                      type="datetime-local"
                      min={review.due}
                      value={review.end}
                      onChange={(e) =>
                        setReview({ ...review, end: e.target.value })
                      }
                    />
                  </label>
                )}
                {review.kind.startsWith("library") && (
                  <p className="small muted">
                    Se creará un archivo en Drive y un apunte con su enlace. El
                    contenido existente no se modificará.
                  </p>
                )}
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                <Check size={15} />
                {review.kind === "download"
                  ? "Confirmar y descargar PDF"
                  : review.kind === "event"
                    ? "Confirmar y crear en Google Calendar"
                    : review.kind === "task"
                      ? "Confirmar y crear tarea"
                      : "Confirmar y guardar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
