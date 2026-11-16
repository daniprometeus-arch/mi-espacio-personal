"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  RefreshCw,
  Upload,
  CalendarDays,
  Plus,
  X,
  Search,
  Loader2,
  CloudOff,
  ExternalLink,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import type { Item } from "@/lib/model";
import { dayKey } from "@/lib/model";
import {
  api,
  json,
  Empty,
  SectionTitle,
  ItemActions,
  formatDate,
  safeUrl,
  type ModuleProps,
  type Notify,
} from "./workspace";
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  parents?: string[];
  size?: string;
};
export function Library({
  demo,
  notify,
  notes,
}: {
  demo: boolean;
  notify: Notify;
  notes: Item[];
}) {
  const [files, setFiles] = useState<DriveFile[]>([]),
    [path, setPath] = useState<{ id: string; name: string }[]>([]),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [nextPage, setNextPage] = useState(""),
    [preview, setPreview] = useState<DriveFile | null>(null),
    [dialog, setDialog] = useState<{
      type: "folder" | "rename" | "move";
      file?: DriveFile;
    } | null>(null),
    [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  const parent = path.at(-1)?.id ?? "";
  const load = useCallback(
    async (page = "") => {
      if (demo) return;
      const n = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const p = new URLSearchParams({
          parent,
          q: search,
          ...(page ? { page } : {}),
        });
        const r = await api(`/api/drive?${p}`);
        if (n !== sequence.current) return;
        setFiles((prev) => (page ? [...prev, ...r.files] : r.files));
        setNextPage(r.nextPageToken ?? "");
      } catch (e) {
        if (n === sequence.current) setError((e as Error).message);
      } finally {
        if (n === sequence.current) setBusy(false);
      }
    },
    [demo, parent, search],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(file: File) {
    if (file.size > 3_000_000) {
      notify(
        "El límite es 3 MB por archivo. Sube archivos mayores directamente en Drive.",
      );
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      if (parent) form.set("parent", parent);
      await api("/api/drive", { method: "POST", body: form });
      notify("Archivo subido a Drive.");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!value.trim() || !dialog) return;
    setBusy(true);
    try {
      if (dialog.type === "folder")
        await api(
          "/api/drive",
          json("POST", { name: value.trim(), parent: parent || undefined }),
        );
      else {
        if (
          !confirm(
            `¿Confirmar ${dialog.type === "rename" ? "el cambio de nombre" : "el traslado"} de «${dialog.file!.name}» en Google Drive?`,
          )
        )
          return;
        await api(
          "/api/drive",
          json("PATCH", {
            id: dialog.file!.id,
            confirmed: true,
            ...(dialog.type === "rename"
              ? { name: value.trim() }
              : {
                  parent: value.trim(),
                  previousParent: dialog.file!.parents?.[0],
                }),
          }),
        );
      }
      setDialog(null);
      notify("Cambios guardados en Google Drive.");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <SectionTitle title="Biblioteca de documentos">
          <Button
            variant="outline"
            size="sm"
            disabled={demo || busy}
            onClick={() => void load()}
            aria-label="Actualizar archivos"
          >
            <RefreshCw size={15} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={demo || busy}
            onClick={() => {
              setDialog({ type: "folder" });
              setValue("");
            }}
          >
            <FolderPlus size={15} />
            Carpeta
          </Button>
          <Button
            size="sm"
            disabled={demo || busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={15} />
            Subir archivo
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </SectionTitle>
        <p className="muted small">
          Archivos creados o autorizados para esta aplicación (permiso
          drive.file). Los demás archivos de tu Drive no aparecen. Puedes subir
          materiales o vincularlos desde un apunte.
        </p>
        {demo && (
          <div className="notice row">
            <CloudOff size={17} />
            Configura Google OAuth para explorar y gestionar tus archivos. Estas
            acciones están desactivadas en modo local.
          </div>
        )}
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <input
            placeholder="Buscar documentos por nombre…"
            aria-label="Buscar documentos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="outline" type="submit" disabled={demo || busy}>
            <Search size={15} />
            Buscar
          </Button>
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noreferrer"
            className="button button-ghost"
          >
            <ExternalLink size={15} />
            Abrir Drive
          </a>
        </form>
        <div className="folder-breadcrumb">
          <button onClick={() => setPath([])}>Mis archivos autorizados</button>
          {path.map((p, i) => (
            <span key={p.id}>
              <ChevronRight size={13} />
              <button onClick={() => setPath(path.slice(0, i + 1))}>
                {p.name}
              </button>
            </span>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {busy && (
          <div className="row muted small">
            <Loader2 className="spin" size={16} />
            Consultando Google Drive…
          </div>
        )}
        <div className="file-table">
          <div className="file-table-head">
            <span>Nombre</span>
            <span>Modificado</span>
            <span>Acciones</span>
          </div>
          {files.map((file) => {
            const folder =
              file.mimeType === "application/vnd.google-apps.folder";
            return (
              <div className="file-row" key={file.id}>
                <button
                  className="file-name"
                  onClick={() => {
                    if (folder) {
                      setPath([...path, { id: file.id, name: file.name }]);
                      setSearch("");
                      setQuery("");
                    } else if (file.mimeType === "application/pdf")
                      setPreview(file);
                    else
                      window.open(
                        safeUrl(
                          file.webViewLink ??
                            `https://drive.google.com/file/d/${file.id}/view`,
                        ),
                        "_blank",
                        "noopener,noreferrer",
                      );
                  }}
                >
                  {folder ? <Folder size={20} /> : <FileText size={20} />}
                  <span>
                    {file.name}
                    <small>
                      {folder
                        ? "Carpeta"
                        : file.mimeType === "application/pdf"
                          ? "PDF"
                          : file.mimeType.split(".").at(-1)}
                    </small>
                  </span>
                </button>
                <span className="small muted file-date">
                  {formatDate(file.modifiedTime)}
                </span>
                <div className="row file-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setDialog({ type: "rename", file });
                      setValue(file.name);
                    }}
                  >
                    Renombrar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setDialog({ type: "move", file });
                      setValue("");
                    }}
                  >
                    Mover
                  </Button>
                  <button
                    className="icon-button danger"
                    disabled={busy}
                    aria-label={`Enviar ${file.name} a la papelera`}
                    onClick={async () => {
                      if (
                        !confirm(
                          `¿Enviar «${file.name}» a la papelera de Google Drive?${folder ? " La carpeta y su contenido dejarán de estar disponibles." : ""}`,
                        )
                      )
                        return;
                      setBusy(true);
                      try {
                        await api(
                          "/api/drive",
                          json("DELETE", { id: file.id, confirmed: true }),
                        );
                        notify("Enviado a la papelera.");
                        await load();
                      } catch (e) {
                        notify((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {!files.length && !busy && !error && (
          <Empty
            text={
              demo
                ? "Tu biblioteca de Google Drive aparecerá al conectar tu cuenta."
                : "Esta carpeta está vacía. Añade tu primer material."
            }
          />
        )}
        {nextPage && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(nextPage)}
          >
            Cargar más archivos
          </Button>
        )}
        <p className="tiny muted">
          Subidas de hasta 3 MB para respetar los límites de funciones de
          Vercel. Los cambios de nombre, traslado y eliminación requieren
          confirmación.
        </p>
      </section>
      <section className="card section-gap">
        <SectionTitle title="Documentos vinculados en apuntes" />
        {notes
          .filter((n) => n.url)
          .map((n) => (
            <a
              key={n.id}
              className="document-link"
              href={safeUrl(n.url)}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={17} />
              <span>{n.title}</span>
              <ArrowUpRight size={15} />
            </a>
          ))}
        {!notes.some((n) => n.url) && (
          <p className="small muted">
            Añade un enlace de Drive al crear o editar un apunte.
          </p>
        )}
      </section>
      {preview && (
        <Modal
          title={preview.name}
          description="Vista PDF del archivo autorizado de Google Drive."
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        >
          <iframe
            className="pdf-preview"
            title={`PDF: ${preview.name}`}
            src={`/api/drive?id=${encodeURIComponent(preview.id)}&preview=true`}
          />
          <a
            className="button button-outline"
            target="_blank"
            rel="noreferrer"
            href={safeUrl(
              preview.webViewLink ??
                `https://drive.google.com/file/d/${preview.id}/view`,
            )}
          >
            Abrir en Google Drive <ArrowUpRight size={15} />
          </a>
        </Modal>
      )}
      {dialog && (
        <Modal
          open
          title={
            dialog.type === "folder"
              ? "Crear carpeta"
              : dialog.type === "rename"
                ? "Renombrar archivo"
                : "Mover a otra carpeta"
          }
          description={
            dialog.type === "move"
              ? "Copia el ID de una carpeta autorizada (el segmento después de /folders/ en su enlace de Drive)."
              : "El cambio se realizará en tu Google Drive."
          }
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field-label">
              {dialog.type === "move" ? "ID de carpeta de destino" : "Nombre"}
              <input
                required
                maxLength={200}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Guardar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

type GoogleEvent = {
  id: string;
  summary?: string;
  etag: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  htmlLink?: string;
};
export function CalendarPanel({
  state,
  add,
  remove,
  notify,
  demo,
}: ModuleProps & { demo: boolean }) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [selected, setSelected] = useState(dayKey()),
    [events, setEvents] = useState<GoogleEvent[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<{
      id?: string;
      title: string;
      due: string;
      end: string;
      etag?: string;
    } | null>(null);
  const seq = useRef(0);
  const start = new Date(month.getFullYear(), month.getMonth(), 1),
    end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const load = useCallback(async () => {
    if (demo) return;
    const n = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const all: GoogleEvent[] = [];
      let page = "";
      do {
        const p = new URLSearchParams({
          start: new Date(
            month.getFullYear(),
            month.getMonth(),
            1,
          ).toISOString(),
          end: new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            1,
          ).toISOString(),
          ...(page ? { page } : {}),
        });
        const r = await api(`/api/calendar?${p}`);
        all.push(...r.items);
        page = r.nextPageToken ?? "";
      } while (page);
      if (n === seq.current) setEvents(all);
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }, [demo, month]);
  useEffect(() => {
    void load();
  }, [load]);
  const offset = (start.getDay() + 6) % 7,
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const datePart = (v: string) =>
    dayKey(new Date(v.length === 10 ? `${v}T12:00:00` : v));
  const localForDay = state.data.events.filter(
    (e) => e.due && datePart(e.due) === selected,
  );
  const googleForDay = events.filter(
    (e) => datePart(e.start.dateTime ?? e.start.date!) === selected,
  );
  const localInput = (date: string) => {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  async function save() {
    if (!dialog) return;
    if (
      !confirm(
        `¿${dialog.id ? "Actualizar" : "Crear"} este evento en tu Google Calendar?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api(
        "/api/calendar",
        json(dialog.id ? "PATCH" : "POST", {
          ...dialog,
          due: new Date(dialog.due).toISOString(),
          end: new Date(dialog.end).toISOString(),
          confirmed: true,
        }),
      );
      setDialog(null);
      notify("Evento guardado en Google Calendar.");
      await load();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="two-columns calendar-layout">
        <section className="card">
          <div className="section-title">
            <h2 className="month-name">
              {month.toLocaleDateString("es", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <div className="row">
              <button
                className="icon-button"
                aria-label="Mes anterior"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={18} />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonth(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  );
                  setSelected(dayKey());
                }}
              >
                Hoy
              </Button>
              <button
                className="icon-button"
                aria-label="Mes siguiente"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <span className="weekday" key={i}>
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const key = dayKey(
                new Date(month.getFullYear(), month.getMonth(), i + 1),
              );
              const has =
                state.data.events.some(
                  (e) => e.due && datePart(e.due) === key,
                ) ||
                events.some(
                  (e) => datePart(e.start.dateTime ?? e.start.date!) === key,
                ) ||
                state.data.tasks.some(
                  (t) => t.due?.slice(0, 10) === key && !t.completed,
                );
              return (
                <button
                  className={`${selected === key ? "selected" : ""} ${key === dayKey() ? "today" : ""}`}
                  key={key}
                  onClick={() => setSelected(key)}
                >
                  <span>{i + 1}</span>
                  {has && <i />}
                </button>
              );
            })}
          </div>
          <div className="calendar-key">
            <span className="notification-dot" /> Actividades o tareas
          </div>
        </section>
        <section className="card">
          <SectionTitle
            title={formatDate(selected)}
            action="Evento personal"
            onClick={() =>
              add("events", undefined, {
                due: `${selected}T09:00`,
                end: `${selected}T10:00`,
              })
            }
          />
          <p className="small muted">Agenda personal</p>
          {localForDay.map((e) => (
            <div className="list-row" key={e.id}>
              <CalendarDays size={17} />
              <div className="grow">
                <strong>{e.title}</strong>
                <small>
                  {formatDate(e.due)} – {formatDate(e.end)}
                </small>
              </div>
              <ItemActions
                onEdit={() => add("events", e)}
                onDelete={() => remove("events", e)}
              />
            </div>
          ))}
          <p className="small muted">Google Calendar · calendario principal</p>
          {googleForDay.map((e) => (
            <div className="list-row" key={e.id}>
              <span className="notification-dot" />
              <div className="grow">
                <strong>{e.summary || "Sin título"}</strong>
                <small>
                  {e.start.date ? "Todo el día" : formatDate(e.start.dateTime)}
                </small>
              </div>
              {e.start.dateTime && e.end.dateTime ? (
                <ItemActions
                  onEdit={() =>
                    setDialog({
                      id: e.id,
                      title: e.summary ?? "",
                      due: localInput(e.start.dateTime!),
                      end: localInput(e.end.dateTime!),
                      etag: e.etag,
                    })
                  }
                  onDelete={async () => {
                    if (
                      !confirm(
                        `¿Eliminar «${e.summary ?? "Sin título"}» de Google Calendar? Si es recurrente, se eliminará solo esta ocurrencia.`,
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      await api(
                        "/api/calendar",
                        json("DELETE", {
                          id: e.id,
                          etag: e.etag,
                          confirmed: true,
                        }),
                      );
                      notify("Evento eliminado de Google Calendar.");
                      await load();
                    } catch (err) {
                      notify((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              ) : (
                <a
                  className="icon-button"
                  aria-label="Editar evento de todo el día en Google"
                  href={safeUrl(e.htmlLink)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowUpRight size={16} />
                </a>
              )}
            </div>
          ))}
          {!localForDay.length && !googleForDay.length && (
            <Empty compact text="Un día con espacio para lo que importa." />
          )}
          <div className="task-list">
            {state.data.tasks
              .filter((t) => t.due?.slice(0, 10) === selected)
              .map((t) => (
                <div className="list-row" key={t.id}>
                  <span className="tag">Tarea</span>
                  <strong className={t.completed ? "done" : ""}>
                    {t.title}
                  </strong>
                </div>
              ))}
          </div>
          <div className="row wrap">
            <Button
              variant="outline"
              size="sm"
              disabled={demo || busy}
              onClick={() =>
                setDialog({
                  title: "",
                  due: `${selected}T09:00`,
                  end: `${selected}T10:00`,
                })
              }
            >
              <Plus size={14} />
              Evento en Google
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={demo || busy}
              onClick={() => void load()}
            >
              <RefreshCw size={14} className={busy ? "spin" : ""} />
              Sincronizar
            </Button>
          </div>
          {demo && (
            <p className="tiny muted">
              Google Calendar requiere configurar OAuth. La agenda personal
              funciona en modo local.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <p className="tiny muted">
            Los eventos personales y de Google se muestran juntos. «Evento en
            Google» crea directamente en Calendar. Los eventos de todo el día se
            editan desde Google.
          </p>
        </section>
      </div>
      {dialog && (
        <Modal
          title={
            dialog.id ? "Editar en Google Calendar" : "Crear en Google Calendar"
          }
          description="Los cambios se aplicarán a tu calendario principal, tras tu confirmación."
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="field-label">
              Título
              <input
                required
                maxLength={500}
                value={dialog.title}
                onChange={(e) =>
                  setDialog({ ...dialog, title: e.target.value })
                }
              />
            </label>
            <label className="field-label">
              Inicio
              <input
                required
                type="datetime-local"
                value={dialog.due}
                onChange={(e) => setDialog({ ...dialog, due: e.target.value })}
              />
            </label>
            <label className="field-label">
              Fin
              <input
                required
                type="datetime-local"
                min={dialog.due}
                value={dialog.end}
                onChange={(e) => setDialog({ ...dialog, end: e.target.value })}
              />
            </label>
            <div className="dialog-actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setDialog(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Guardar en Google
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
