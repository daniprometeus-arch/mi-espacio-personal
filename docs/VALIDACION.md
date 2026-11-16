# Validación y aceptación

El módulo opcional de Gemini tiene su guía de pruebas y publicación en [ASISTENTE_GEMINI.md](ASISTENTE_GEMINI.md), con resultados actuales en [REVISION_GEMINI.md](REVISION_GEMINI.md).

Para la preparación actual de OAuth, consulta [GOOGLE_CLOUD.md](GOOGLE_CLOUD.md) y el informe [REVISION_OAUTH.md](REVISION_OAUTH.md). La validación con tu cuenta y el despliegue de la lista siguiente pertenecen a etapas posteriores: no los ejecutes antes de completar Google Cloud.

## Automatización incluida

Ejecuta `npm ci`, `npm test`, `npm run typecheck` y `npm run build`.

Las pruebas comprueban: estado inicial e importaciones, corrección y respuestas faltantes, progreso por curso, racha y fechas, enlaces de YouTube, cifrado y manipulación de cookies, comprobación de Origin, demo bloqueada en producción y rechazo de versiones obsoletas. Los flujos de interfaz se ejercitan en JSDOM con React Testing Library: crear/completar tareas, cursos/temas/progreso, corrección de cuestionarios, edición de notas, personalización y confirmación de eliminación. No utilizan credenciales reales ni escriben en tu cuenta.

## Verificación con tu cuenta (pendiente de configuración)

Usa datos prescindibles para estas comprobaciones.

1. Configura Google Cloud y las variables siguiendo README. Deja `DEMO_MODE=false`.
2. Abre `/` sin sesión: debe redirigir a `/login`. Una cuenta diferente de ALLOWED_EMAIL no debe entrar.
3. Con tu cuenta autorizada, acepta los scopes y verifica que aparece el dashboard vacío, sin números inventados. En las herramientas de red, ninguna respuesta JSON debe incluir access_token, refresh_token o el secreto del cliente. La cookie HttpOnly contiene exclusivamente el sobre cifrado.
4. Crea un curso, una unidad, dos temas y completa uno. El progreso debe ser 50%. Añade una nota con categoría y enlace de Drive. Busca su título con Ctrl K y ábrela.
5. Espera el indicador **Guardado**, recarga y abre la aplicación en otro navegador con la misma cuenta. Deben aparecer los registros. La cuota de Drive puede demorar respuestas; no cierres mientras indica Guardando.
6. **Prueba de concurrencia:** carga la misma revisión en dos pestañas A/B. Cambia un dato en A y espera Guardado. Cambia en B: debe aparecer conflicto y no sobrescribir A. Exporta B antes de cargar Drive. Confirma en tu cuenta que la respuesta HTTP de lectura incluye ETag y que Google rechaza If-Match obsoleto. Si no hay ETag o no se garantiza escritura condicional, la aplicación debe bloquear el guardado y el enfoque de almacenamiento requiere revisión antes de usar datos valiosos.
7. En Configuración consulta versiones anteriores, exporta tu estado actual y restaura una copia de prueba. Debe crearse una nueva revisión y conservar la recuperación por exportación.
8. Sube un PDF pequeño y crea una carpeta. Navega, busca, abre la vista PDF y vuelve a Drive. Renombra, mueve el archivo usando el ID de una carpeta autorizada y envíalo a papelera. Todas las modificaciones deben solicitar confirmación. Un archivo mayor de 3 MB debe rechazarse claramente.
9. En Calendario crea un evento de prueba en Google con hora de inicio y fin. Compruébalo en calendar.google.com, edítalo en la aplicación y elimínalo con confirmación. Un cambio externo concurrente debe producir un conflicto por ETag. Verifica la hora en tu zona local. Para un evento de todo el día usa su enlace a Google.
10. Crea una tarea con fecha de hoy: debe aparecer en dashboard, agenda y centro de notificaciones. Márcala y comprueba los contadores.
11. Crea un proyecto, una tarea y una subtarea, completa ambas y revisa el porcentaje. Elimina una tarea tras confirmar.
12. Crea dos preguntas, sus cuatro opciones y explicaciones. Responde una mal. El resultado debe ser 50%; repetir errores debe ofrecer solo la incorrecta. Comprueba el historial y filtros.
13. Crea una flashcard, filtra por curso/tema, revela la respuesta y registra si la recuerdas. Debe aumentar el contador de repasos.
14. Crea un objetivo de 3 pasos y un hábito. Añade un avance y marca hoy: verifica ambos en Progreso.
15. Configura un Pomodoro de 1 minuto, asócialo a un curso, inicia, pausa, continúa y espera su finalización sin cerrar la pestaña. Se debe registrar una sola sesión de 60 segundos. Un descanso no debe contarse como estudio. Revisa los gráficos, la racha y la meta diaria. Al recargar se pierde el temporizador activo, como se documenta.
16. Añade un vídeo válido de YouTube y pulsa reproducir en su reproductor. Comprueba el mensaje para enlaces inválidos y respeta los vídeos que no permiten reproducción embebida.
17. Personaliza el dashboard: reordena con asa y teclado, cambia tamaño, oculta y restaura. Recarga y comprueba la distribución. Prueba temas oscuro/claro y anchos de 375, 768 y 1440 píxeles, navegación móvil y foco en diálogos.
18. Desactiva la red y modifica una nota. Debe indicar Sin guardar y conservar un borrador local. Exporta antes de recargar, reconecta y reintenta. No debe anunciar Guardado si Google rechazó la escritura.
19. Exporta, modifica un registro y restaura el JSON original con confirmación. Un JSON inválido debe rechazarse sin tocar los datos.
20. Cierra sesión y comprueba que se bloquean las rutas. Vuelve a entrar y prueba Desconectar Google. Revoca manualmente en https://myaccount.google.com/permissions si Google no confirma la revocación.

## Límites de esta entrega

- No se han suministrado credenciales propias del proyecto OAuth ni acceso a un proyecto de Vercel. No se ha podido completar el flujo real de Google ni desplegar o certificar el comportamiento de ETag en esa cuenta.
- El diseño se contrastó con la captura del sitio de referencia obtenida mediante Sites. No se realizó una sesión visual en navegador del proyecto nuevo porque la herramienta de navegador requerida no está disponible.
- El alcance de permisos `drive.file`, el límite de archivos, la separación de eventos personales/Google y el comportamiento de Pomodoro con la pestaña cerrada se detallan en README; no se ocultan mediante botones simulados.
