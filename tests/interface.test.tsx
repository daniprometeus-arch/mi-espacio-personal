import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { initialState, newItem } from "../src/lib/model";

test("flujos de interfaz en DOM simulado", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3000",
    pretendToBeVisual: true,
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "NodeFilter",
    "HTMLInputElement",
    "HTMLButtonElement",
    "HTMLTextAreaElement",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "CustomEvent",
    "MutationObserver",
    "getComputedStyle",
    "localStorage",
    "DOMRect",
  ] as const) {
    const value = (dom.window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value:
        typeof value === "function" && key === "getComputedStyle"
          ? value.bind(dom.window)
          : value,
    });
  }
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: dom.window.requestAnimationFrame.bind(dom.window),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: dom.window.cancelAnimationFrame.bind(dom.window),
  });
  const confirms: string[] = [];
  Object.defineProperty(globalThis, "confirm", {
    configurable: true,
    value: (m: string) => {
      confirms.push(m);
      return true;
    },
  });
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserver,
  });
  const { render, cleanup, waitFor, within } =
    await import("@testing-library/react/pure");
  const { default: userEvent } = await import("@testing-library/user-event");
  const { default: Workspace } = await import("../src/components/workspace");
  const user = userEvent.setup({ document: dom.window.document });
  async function mount(seed = initialState()) {
    cleanup();
    localStorage.clear();
    localStorage.setItem("mep-draft-demo", JSON.stringify(seed));
    const view = render(<Workspace demo name="Estudiante" email="" />);
    await waitFor(() =>
      assert.equal(
        view.getByRole("button", { name: "Tarea" }).hasAttribute("disabled"),
        false,
      ),
    );
    return view;
  }
  await t.test(
    "crear una tarea, completarla y conservar los datos locales",
    async () => {
      const view = await mount();
      await user.click(view.getByRole("button", { name: "Tarea" }));
      await user.type(
        view.getByLabelText("Título", { exact: true }),
        "Estudiar el tema uno",
      );
      await user.click(view.getByRole("button", { name: "Guardar" }));
      await user.click(
        view.getByRole("button", { name: "Calendario y tareas" }),
      );
      const toggle = view.getByRole("button", {
        name: "Completar Estudiar el tema uno",
      });
      await user.click(toggle);
      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem("mep-draft-demo")!);
        assert.equal(saved.data.tasks[0].completed, true);
      });
      cleanup();
    },
  );
  await t.test(
    "crear curso, añadir tema y calcular progreso real",
    async () => {
      const view = await mount();
      await user.click(view.getByRole("button", { name: "Cursos y apuntes" }));
      await user.click(view.getByRole("button", { name: "Crear curso" }));
      await user.type(
        view.getByLabelText("Título", { exact: true }),
        "Biología",
      );
      await user.click(view.getByRole("button", { name: "Guardar" }));
      await user.click(
        view.getByRole("button", { name: /Biología Tu próximo aprendizaje/ }),
      );
      await user.click(view.getByRole("button", { name: "Añadir tema" }));
      await user.type(
        view.getByLabelText("Título", { exact: true }),
        "La célula",
      );
      await user.type(
        view.getByLabelText("Unidad", { exact: true }),
        "Unidad 1",
      );
      await user.click(view.getByRole("button", { name: "Guardar" }));
      await user.click(
        view.getByRole("button", { name: "Completar La célula" }),
      );
      await waitFor(() =>
        assert.equal(
          view.getByRole("progressbar").getAttribute("aria-valuenow"),
          "100",
        ),
      );
      cleanup();
    },
  );
  await t.test(
    "corregir un cuestionario y guardar puntuación y errores",
    async () => {
      const s = initialState();
      s.data.questions = [
        newItem({
          title: "¿Cuánto es 2 + 2?",
          choices: ["Cuatro", "Cinco", "Seis", "Siete"],
          correct: 0,
          explanation: "Dos pares suman cuatro.",
        }),
      ];
      const view = await mount(s);
      await user.click(view.getByRole("button", { name: "Práctica" }));
      await user.click(view.getByRole("button", { name: /Empezar \(1\)/ }));
      await user.click(view.getByRole("button", { name: "Opción 1: Cuatro" }));
      await user.click(
        view.getByRole("button", { name: "Corregir y guardar" }),
      );
      await view.findByText("Resultado: 100%");
      assert.ok(view.getByText("Dos pares suman cuatro."));
      await waitFor(() => {
        const data = JSON.parse(localStorage.getItem("mep-draft-demo")!).data;
        assert.equal(data.results[0].score, 100);
        assert.equal(data.results[0].answers[0].correct, true);
      });
      cleanup();
    },
  );
  await t.test("editar nota con guardado automático y categoría", async () => {
    const s = initialState();
    s.data.notes = [
      newItem({
        title: "Ideas",
        body: "Versión inicial",
        category: "Personal",
      }),
    ];
    const view = await mount(s);
    await user.click(view.getByRole("button", { name: "Bloc de notas" }));
    await user.click(view.getByRole("button", { name: "Abrir nota Ideas" }));
    const textarea = view.getByLabelText("Contenido de nota");
    await user.clear(textarea);
    await user.type(textarea, "Una idea nueva");
    await waitFor(() =>
      assert.equal(
        JSON.parse(localStorage.getItem("mep-draft-demo")!).data.notes[0].body,
        "Una idea nueva",
      ),
    );
    cleanup();
  });
  await t.test("ocultar y restaurar una tarjeta del dashboard", async () => {
    const view = await mount();
    await user.click(view.getByRole("button", { name: "Personalizar" }));
    await user.click(
      view.getByRole("button", { name: "Ocultar Racha de estudio" }),
    );
    assert.equal(
      view.queryByRole("button", { name: "Ocultar Racha de estudio" }),
      null,
    );
    await user.click(view.getByRole("button", { name: "Racha de estudio" }));
    assert.ok(view.getByRole("button", { name: "Ocultar Racha de estudio" }));
    cleanup();
  });
  await t.test(
    "las acciones de Google permanecen desactivadas en modo local",
    async () => {
      const view = await mount();
      await user.click(view.getByRole("button", { name: "Biblioteca" }));
      assert.equal(
        view
          .getByRole("button", { name: "Subir archivo" })
          .hasAttribute("disabled"),
        true,
      );
      assert.equal(
        view.getByRole("button", { name: "Carpeta" }).hasAttribute("disabled"),
        true,
      );
      cleanup();
    },
  );
  await t.test("la eliminación solicita confirmación", async () => {
    const s = initialState();
    s.data.courses = [newItem({ title: "Curso temporal" })];
    const view = await mount(s);
    await user.click(view.getByRole("button", { name: "Cursos y apuntes" }));
    await user.click(view.getByRole("button", { name: "Eliminar" }));
    assert.ok(confirms.some((m) => m.includes("Curso temporal")));
    assert.equal(view.queryByRole("heading", { name: "Curso temporal" }), null);
    cleanup();
  });
  await t.test(
    "Pomodoro registra una sola sesión completada y su curso",
    async () => {
      const s = initialState();
      s.preferences.focus = 1;
      const course = newItem({ title: "Lectura" });
      s.data.courses = [course];
      const view = await mount(s);
      await user.click(view.getByRole("button", { name: "Pomodoro" }));
      await user.selectOptions(
        view.getByRole("combobox", { name: "Asociar sesión" }),
        `c:${course.id}`,
      );
      await user.click(view.getByRole("button", { name: "Iniciar" }));
      const originalNow = Date.now;
      const start = originalNow();
      try {
        Date.now = () => start + 61000;
        await waitFor(
          () => {
            const sessions = JSON.parse(localStorage.getItem("mep-draft-demo")!)
              .data.sessions;
            assert.equal(sessions.length, 1);
            assert.equal(sessions[0].seconds, 60);
            assert.equal(sessions[0].courseId, course.id);
          },
          { timeout: 2500 },
        );
      } finally {
        Date.now = originalNow;
        cleanup();
      }
    },
  );
  await t.test("los repasos de flashcards y hábitos se guardan", async () => {
    const s = initialState();
    s.data.flashcards = [newItem({ title: "Capital del Perú", body: "Lima" })];
    s.data.habits = [newItem({ title: "Leer", dates: [] })];
    const view = await mount(s);
    await user.click(view.getByRole("button", { name: "Flashcards" }));
    await user.click(view.getByRole("button", { name: "Practicar" }));
    await user.click(view.getByRole("button", { name: "Revelar respuesta" }));
    await user.click(view.getByRole("button", { name: "La recordé" }));
    await user.click(view.getByRole("button", { name: "Objetivos y hábitos" }));
    await user.click(view.getByRole("button", { name: "Marcar hoy" }));
    await waitFor(() => {
      const data = JSON.parse(localStorage.getItem("mep-draft-demo")!).data;
      assert.equal(data.reviews.length, 1);
      assert.equal(data.reviews[0].known, true);
      assert.equal(data.habits[0].dates.length, 1);
    });
    cleanup();
  });
  await t.test(
    "guardado remoto envía revisión y ETag y confirma la nueva versión",
    async () => {
      cleanup();
      localStorage.clear();
      const originalFetch = globalThis.fetch;
      const initial = { ...initialState(), revision: 3 };
      let writes = 0;
      globalThis.fetch = async (url, init) => {
        const path = String(url);
        if (path === "/api/state" && init?.method === "PUT") {
          const payload = JSON.parse(String(init.body));
          assert.equal(payload.etag, '"etag-3"');
          assert.equal(payload.state.revision, 3);
          assert.equal(payload.fileId, "state-file");
          writes++;
          return Response.json({
            state: { ...payload.state, revision: 4 },
            etag: '"etag-4"',
            fileId: "state-file",
          });
        }
        if (path === "/api/state")
          return Response.json({
            state: initial,
            etag: '"etag-3"',
            fileId: "state-file",
          });
        return Response.json({ files: [], items: [] });
      };
      try {
        const view = render(
          <Workspace demo={false} name="Usuario" email="owner@example.com" />,
        );
        await waitFor(() =>
          assert.equal(
            view
              .getByRole("button", { name: "Tarea" })
              .hasAttribute("disabled"),
            false,
          ),
        );
        await user.click(view.getByRole("button", { name: "Tarea" }));
        await user.type(view.getByLabelText("Título"), "Sincronizar mi tarea");
        await user.click(view.getByRole("button", { name: "Guardar" }));
        await waitFor(
          () => {
            assert.equal(writes, 1);
            assert.ok(view.getByText("Guardado", { exact: true }));
          },
          { timeout: 3500 },
        );
        assert.equal(localStorage.getItem("mep-draft-owner@example.com"), null);
      } finally {
        cleanup();
        globalThis.fetch = originalFetch;
      }
    },
  );
  await t.test(
    "un conflicto remoto conserva el borrador y detiene nuevas escrituras",
    async () => {
      cleanup();
      localStorage.clear();
      const originalFetch = globalThis.fetch;
      let writes = 0;
      globalThis.fetch = async (url, init) => {
        const path = String(url);
        if (path === "/api/state" && init?.method === "PUT") {
          writes++;
          return Response.json(
            { error: "Conflicto de versiones" },
            { status: 409 },
          );
        }
        if (path === "/api/state")
          return Response.json({
            state: initialState(),
            etag: '"etag-0"',
            fileId: "state-file",
          });
        return Response.json({ files: [], items: [] });
      };
      try {
        const view = render(
          <Workspace demo={false} name="Usuario" email="owner@example.com" />,
        );
        await waitFor(() =>
          assert.equal(
            view
              .getByRole("button", { name: "Tarea" })
              .hasAttribute("disabled"),
            false,
          ),
        );
        await user.click(view.getByRole("button", { name: "Tarea" }));
        await user.type(view.getByLabelText("Título"), "Conservar borrador");
        await user.click(view.getByRole("button", { name: "Guardar" }));
        await waitFor(
          () =>
            assert.ok(
              view.getByText(/Conflicto: el guardado automático está detenido/),
            ),
          { timeout: 3500 },
        );
        assert.equal(writes, 1);
        assert.equal(
          JSON.parse(localStorage.getItem("mep-draft-owner@example.com")!).data
            .tasks[0].title,
          "Conservar borrador",
        );
      } finally {
        cleanup();
        globalThis.fetch = originalFetch;
      }
    },
  );
  await t.test(
    "una sesión vencida permite reconectar sin borrar el borrador al cargar Drive",
    async () => {
      cleanup();
      localStorage.clear();
      const draft = initialState();
      draft.data.tasks = [newItem({ title: "Borrador que debo conservar" })];
      const draftKey = "mep-draft-owner@example.com";
      localStorage.setItem(draftKey, JSON.stringify(draft));
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () =>
          Response.json(
            { error: "Inicia sesión con tu cuenta autorizada" },
            { status: 401 },
          );
        const expired = render(
          <Workspace demo={false} name="Usuario" email="owner@example.com" />,
        );
        const link = await expired.findByRole("link", {
          name: "Volver a iniciar sesión",
        });
        assert.equal(link.getAttribute("href"), "/api/auth/login");
        assert.equal(
          JSON.parse(localStorage.getItem(draftKey)!).data.tasks[0].title,
          "Borrador que debo conservar",
        );
        cleanup();
        globalThis.fetch = async (url) =>
          String(url) === "/api/state"
            ? Response.json({
                state: initialState(),
                etag: '"etag-0"',
                fileId: "state-file",
              })
            : Response.json({ files: [], items: [] });
        const reconnected = render(
          <Workspace demo={false} name="Usuario" email="owner@example.com" />,
        );
        await waitFor(() =>
          assert.equal(
            reconnected
              .getByRole("button", { name: "Tarea" })
              .hasAttribute("disabled"),
            false,
          ),
        );
        assert.ok(
          reconnected.getByText("Hay una copia local de una sesión anterior."),
        );
        assert.equal(
          JSON.parse(localStorage.getItem(draftKey)!).data.tasks[0].title,
          "Borrador que debo conservar",
        );
      } finally {
        cleanup();
        globalThis.fetch = originalFetch;
      }
    },
  );
  await t.test(
    "Asistente IA exige consentimiento y confirma tareas, preguntas, eventos y biblioteca",
    async () => {
      cleanup();
      localStorage.clear();
      const originalFetch = globalThis.fetch;
      const seed = initialState();
      seed.data.courses = [newItem({ title: "Biología" })];
      const result = {
        answer: "Podemos repasar la célula.",
        title: "Resumen de la célula",
        summary: "La célula es la unidad básica de la vida.",
        questions: [
          {
            title: "¿Cuál es la unidad básica de la vida?",
            choices: ["Célula", "Tejido", "Órgano", "Sistema"],
            correct: 0,
            explanation: "Las células son las unidades funcionales básicas.",
          },
        ],
        proposals: [
          {
            kind: "task",
            title: "Repasar la célula",
            due: "2026-12-01",
            end: null,
            details: "Leer el resumen y practicar.",
          },
          {
            kind: "event",
            title: "Sesión de biología",
            due: "2026-12-01T15:00:00-05:00",
            end: "2026-12-01T15:25:00-05:00",
            details: "Bloque de concentración.",
          },
        ],
      };
      let generations = 0,
        eventWrites = 0,
        exports = 0;
      globalThis.fetch = async (url, init) => {
        const path = String(url);
        if (path === "/api/state" && init?.method === "PUT") {
          const payload = JSON.parse(String(init.body));
          return Response.json({
            state: { ...payload.state, revision: payload.state.revision + 1 },
            etag: '"next"',
            fileId: "state-file",
          });
        }
        if (path === "/api/state")
          return Response.json({
            state: seed,
            etag: '"initial"',
            fileId: "state-file",
          });
        if (path === "/api/assistant" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body));
          assert.equal(payload.consent, true);
          generations++;
          return Response.json({
            result,
            usage: { used: 1, limit: 20 },
            model: "gemini-3.5-flash-lite",
          });
        }
        if (path === "/api/assistant")
          return Response.json({
            available: true,
            model: "gemini-3.5-flash-lite",
          });
        if (path === "/api/calendar" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body));
          assert.equal(payload.confirmed, true);
          assert.equal(payload.title, "Sesión de biología");
          eventWrites++;
          return Response.json({ id: "event-unit-test" });
        }
        if (path === "/api/assistant/export") {
          const payload = JSON.parse(String(init?.body));
          assert.equal(payload.confirmed, true);
          assert.equal(payload.saveToLibrary, true);
          exports++;
          return Response.json({
            id: "summary-unit-test",
            name: "Resumen.txt",
            url: "https://drive.google.com/file/d/summary-unit-test/view",
          });
        }
        return Response.json({ files: [], items: [] });
      };
      try {
        const view = render(
          <Workspace demo={false} name="Usuario" email="owner@example.com" />,
        );
        await waitFor(() =>
          assert.equal(
            view
              .getByRole("button", { name: "Tarea" })
              .hasAttribute("disabled"),
            false,
          ),
        );
        await user.click(view.getByRole("button", { name: "Asistente IA" }));
        const send = view.getByRole("button", { name: "Enviar a Gemini" });
        await user.type(
          view.getByLabelText("Tu mensaje"),
          "Explícame la célula y ayúdame a organizar el estudio.",
        );
        assert.equal(send.hasAttribute("disabled"), true);
        await user.click(
          view.getByRole("checkbox", { name: /Acepto enviar mis mensajes/ }),
        );
        await waitFor(() => assert.equal(send.hasAttribute("disabled"), false));
        await user.click(send);
        await view.findByText("Podemos repasar la célula.");
        assert.equal(generations, 1);
        assert.equal(eventWrites, 0);
        assert.equal(exports, 0);
        assert.equal(localStorage.getItem("mep-draft-owner@example.com"), null);
        await user.click(
          view.getAllByRole("button", { name: "Revisar propuesta" })[0],
        );
        await user.click(view.getByRole("button", { name: "Cancelar" }));
        assert.equal(localStorage.getItem("mep-draft-owner@example.com"), null);
        await user.click(
          view.getAllByRole("button", { name: "Revisar propuesta" })[0],
        );
        await user.click(
          view.getByRole("button", { name: "Confirmar y crear tarea" }),
        );
        await waitFor(() =>
          assert.equal(
            JSON.parse(localStorage.getItem("mep-draft-owner@example.com")!)
              .data.tasks[0].title,
            "Repasar la célula",
          ),
        );
        await user.click(
          within(
            view
              .getByText("Sesión de biología")
              .closest(".assistant-proposal") as HTMLElement,
          ).getByRole("button", { name: "Revisar propuesta" }),
        );
        assert.equal(eventWrites, 0);
        await user.click(
          view.getByRole("button", {
            name: "Confirmar y crear en Google Calendar",
          }),
        );
        await waitFor(() => assert.equal(eventWrites, 1));
        await user.click(
          view.getByRole("button", { name: "Revisar y guardar preguntas" }),
        );
        await user.selectOptions(
          view.getByLabelText("Curso"),
          seed.data.courses[0].id,
        );
        await user.click(
          view.getByRole("button", { name: "Confirmar y guardar" }),
        );
        await waitFor(() =>
          assert.equal(
            JSON.parse(localStorage.getItem("mep-draft-owner@example.com")!)
              .data.questions[0].correct,
            0,
          ),
        );
        await user.click(
          view.getByRole("button", { name: "Guardar en biblioteca (TXT)" }),
        );
        assert.equal(exports, 0);
        await user.click(
          view.getByRole("button", { name: "Confirmar y guardar" }),
        );
        await waitFor(() => assert.equal(exports, 1));
        await waitFor(() =>
          assert.equal(
            JSON.parse(localStorage.getItem("mep-draft-owner@example.com")!)
              .data.notes[0].category,
            "Resumen IA",
          ),
        );
      } finally {
        cleanup();
        globalThis.fetch = originalFetch;
      }
    },
  );
  dom.window.close();
});
