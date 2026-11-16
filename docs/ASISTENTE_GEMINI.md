# Asistente IA con Gemini — actualización preparada

El módulo se añade a la aplicación existente. Conserva la autenticación de Google, el almacenamiento en Drive, los módulos de estudio y el diseño Dark Navy. Esta actualización no se ha desplegado desde este entorno.

## Funciones y confirmaciones

- Chat en español con explicaciones paso a paso y modos de resumen, cuestionario y planificación.
- Texto pegado, PDF/TXT adjunto o documento de Drive seleccionado. Drive admite PDF, TXT y documentos nativos de Google exportables como texto, dentro de los permisos `drive.file` existentes. No se descargan URLs arbitrarias.
- Agenda del calendario principal para los próximos siete días (hasta 50 eventos), solo al activar la casilla correspondiente. Las tareas se comparten solo al activar su casilla (hasta 20 pendientes).
- Hasta cinco preguntas con cuatro opciones, respuesta correcta y explicación. Puedes revisarlas y confirmar su incorporación al banco existente, eligiendo curso y tema.
- Propuestas de tareas y eventos. Cada una abre un formulario editable de revisión. **Solo el botón de confirmación crea el elemento.** El chat no tiene herramientas para ejecutar operaciones ni para modificar o eliminar registros. Los eventos se guardan mediante la integración existente de Calendar.
- Resúmenes revisables antes de guardar: TXT o PDF en la biblioteca de Drive, con un apunte que contiene el enlace. También puedes descargar el PDF sin guardarlo en Drive. No se sobrescriben archivos existentes.
- PDF real con una fuente Unicode local, sin cargar fuentes desde servicios externos. Admite acentos españoles y muchos símbolos griegos/matemáticos; los caracteres sin glifo se sustituyen por un cuadrado. Es texto, no un motor de fórmulas LaTeX.

Los detalles de una propuesta de evento ayudan a revisarla; la integración existente de Calendar guarda título, inicio y fin. No se amplía su contrato ni se alteran sus operaciones actuales.

## Modelo y verificación de disponibilidad

Se seleccionó **`gemini-3.5-flash-lite`**. La tabla oficial consultada lo incluye con entrada y salida estándar gratuitas, y su ficha admite PDF y respuestas estructuradas. Las versiones 2.5 tienen restricciones de acceso para proyectos nuevos, por lo que no se eligieron como predeterminado.

El servidor consulta `models/gemini-3.5-flash-lite` con la cabecera `x-goog-api-key` y comprueba el nombre y `generateContent` antes de habilitar la interfaz. La comprobación se conserva en memoria durante cinco minutos. No se realiza una generación para comprobar disponibilidad y no se imprime la clave. Si el modelo no está disponible, el módulo se detiene: **no cambia automáticamente a otro modelo**.

Sin tu clave no se puede comprobar el acceso de tu cuenta, región o cuota concreta. En esta entrega se verificaron la documentación pública, el código y respuestas simuladas. La comprobación real se ejecutará en tu servidor cuando configures las variables y publiques la actualización.

## Configurar personalmente en Vercel

No necesitas compartir ninguna clave ni preparar el proyecto en tu computadora.

1. En Google AI Studio identifica o crea una clave de Gemini API de un proyecto que esté explícitamente en **Free Tier y sin facturación activada**. No actives facturación, una prueba de pago, créditos de un plan pagado, ampliaciones de cuota o servicios de Vertex AI. Si no hay acceso gratuito en tu cuenta/región, detente; los demás módulos siguen funcionando sin Gemini.
2. Revisa la tarifa y la cuota activa del modelo antes de activarlo. Google puede cambiar su disponibilidad y condiciones; el código no tiene capacidad para activar servicios de pago ni ampliar cuotas.
3. En Vercel → tu proyecto → **Settings → Environment Variables**, añade únicamente a **Production**:

   | Variable                     | Valor                                                                                           |
   | ---------------------------- | ----------------------------------------------------------------------------------------------- |
   | `GEMINI_API_KEY`             | Tu clave real, introducida directamente en el panel y marcada como sensible si está disponible. |
   | `GEMINI_FREE_TIER_CONFIRMED` | `true`, exclusivamente después de verificar el paso 1.                                          |

   No uses `NEXT_PUBLIC_`. Conserva las variables existentes de Google OAuth, `SESSION_SECRET`, `APP_URL` si la usas y `DEMO_MODE=false`. No copies secretos de producción a Preview.

4. La bandera de confirmación **es una declaración administrativa, no una verificación de facturación por API**. Gemini no ofrece un parámetro de solicitud que fuerce el nivel gratuito de una clave perteneciente a un proyecto con facturación. Por eso el módulo permanece desactivado por defecto. No configures la bandera en `true` para una clave de un proyecto pagado; si activas facturación posteriormente, desactiva el asistente antes de usar esa clave.
5. No es necesario cambiar el cliente OAuth ni solicitar nuevos scopes. Gemini usa una clave independiente, y las lecturas de Drive y Calendar conservan los permisos actuales.

No se ha creado una clave, activado facturación ni consultado Gemini con credenciales reales desde esta entrega.

## Actualizar el repositorio y publicar cuando lo decidas

1. Descarga la entrega y sube los archivos actualizados al **repositorio privado existente**. Incluye `package.json`, `package-lock.json`, la carpeta `src/assets` con su fuente/licencia, los archivos nuevos de `src/lib`, `src/components` y `src/app/api/assistant`, los estilos, configuración, scripts, tests y documentación.
2. No subas `.env.local`, otros `.env` privados, dependencias, `.next`, logs ni claves. La entrega excluye esos archivos; la plantilla `.env.example` contiene la clave vacía y la bandera desactivada. La carga web de GitHub no aplica `.gitignore` como filtro automático.
3. El archivo `vercel.json` mantiene `git.deploymentEnabled=false`, por lo que hacer commit no debe lanzar despliegues automáticos. Cuando decidas publicar, realiza un **despliegue manual de producción del commit nuevo** desde Vercel. Si eliges Redeploy, comprueba que corresponda al código actualizado y no al despliegue anterior; utiliza la opción de desplegar la referencia Git nueva cuando sea necesario.
4. Mantén Next.js, Node.js 24.x, instalación `npm ci`, build `npm run build` y salida predeterminada. No ejecutes el preparador local en el build. La fuente PDF está incluida en el trazado de archivos de la función de Vercel.
5. Las variables nuevas requieren un despliegue para aplicarse. No se ha hecho ninguno desde esta actualización. No es necesario cambiar el diseño, contratar Pro ni añadir una base de datos.

## Uso y privacidad

Al abrir **Asistente IA**, la comprobación de disponibilidad puede mostrar una instrucción si falta configuración. En modo demo y previews la función no se utiliza.

Selecciona un modo y el material que quieras compartir. Antes del primer envío debes marcar la casilla que acepta enviar mensajes y material a Gemini. En el nivel gratuito, Google puede usar contenido para mejorar sus productos; no selecciones documentos o eventos que no quieras enviar a ese servicio. Los tokens OAuth, SESSION_SECRET y GEMINI_API_KEY nunca se añaden al prompt.

El chat se mantiene en memoria de la pestaña y persiste al cambiar de módulo; se pierde al recargar o cerrar. No se guarda automáticamente en Drive ni en localStorage. Para mantener el contexto se envían como máximo diez mensajes recientes (24.000 caracteres, hasta 8.000 por mensaje). Solo los resúmenes, preguntas, tareas o eventos que confirmes se guardan en sus módulos.

El asistente puede equivocarse. Revisa explicaciones y respuestas correctas antes de guardar o estudiar un cuestionario. Los documentos y títulos de agenda se tratan como datos no fiables; aunque el modelo ignorara esas instrucciones, no dispone de herramientas para ejecutar cambios.

## Límites y cuota

- Máximo local: **3 generaciones por minuto y 20 intentos por día UTC**, 4096 tokens de salida por respuesta. Las cuotas de Google pueden ser menores y prevalecen.
- Un solo envío activo por usuario en cada instancia. El bloqueo de instancia expira para evitar bloqueos permanentes por interrupciones del servidor.
- El contador persiste en un JSON separado en `appDataFolder` de Drive. No usa el disco temporal de Vercel, otra base de datos o un servicio de límites de pago. Se reserva un intento con ETag e `If-Match` y se verifica antes de llamar a Gemini.
- Los intentos que ya fueron reservados cuentan aunque Gemini falle. No hay reintentos automáticos ni fallback de modelo.
- Si el contador es inválido, hay archivos duplicados, falta ETag o se detecta conflicto, no se genera contenido. La inicialización simultánea en instancias distintas tiene las limitaciones de unicidad de Drive; la detección de duplicados detiene el módulo en lugar de ignorar el límite. No borres datos de la aplicación para solucionarlo: pide revisar el contador sin compartir secretos.
- Estos controles no son una garantía transaccional de cuotas de proyecto compartidas por otras aplicaciones ni determinan el estado de facturación. La cuenta Free Tier sin billing y las cuotas de Google son la barrera frente al uso pagado.
- Adjuntos: **1,5 MB**; PDF y TXT UTF-8. Texto pegado o exportado de Google Docs: hasta 24.000 caracteres. Archivos grandes deben resumirse por fragmentos. No se admiten DOCX, hojas de cálculo o imágenes sueltas en esta versión.
- Un error 429 se muestra con un mensaje para esperar/revisar AI Studio, sin proponer activar un plan de pago. Errores de clave, región, modelo, timeout, bloqueo de seguridad, respuesta truncada o JSON inválido se muestran sin registrar cuerpos ni secretos.

## Probar después de configurar y desplegar

1. Sin sesión, `/api/assistant` y la exportación deben estar protegidos. El resto de módulos debe seguir funcionando aunque GEMINI_API_KEY no esté configurada.
2. En Asistente IA comprueba disponibilidad. Ver un modelo disponible verifica metadatos, no garantiza que quede cuota para generar; un 429 posterior debe detenerse sin reintentos.
3. Envía un tema sencillo y una segunda pregunta relacionada. Verifica que no se envíe nada antes de aceptar el consentimiento.
4. Resume un TXT y un PDF pequeño. Selecciona después un documento autorizado de Drive. Revisa el resumen, cancela un guardado y comprueba que no haya archivos nuevos. Confirma otro y comprueba biblioteca y apunte.
5. Descarga un PDF y verifica acentos, saltos y paginación. Guarda un PDF de prueba en Drive y ábrelo desde Biblioteca.
6. Genera preguntas; cancela primero y después confirma su incorporación a un curso. Compruébalas en Práctica y revisa las respuestas.
7. Comparte explícitamente la agenda y pide un plan. Revisa una tarea y un evento. Cancelar no debe guardar nada; confirmar debe crear solo el elemento revisado, en el módulo o Calendar correspondiente.
8. Prueba el límite por minuto y los errores de cuota. No restablezcas el contador para eludir límites. Comprueba que no se amplíen planes ni cambien modelos.

Las pruebas automáticas utilizan dobles de Google/Gemini y un DOM simulado, además de generar un PDF real y compilar Next.js. No sustituyen la prueba con tu cuenta o una revisión visual en navegador, que quedan pendientes. No se han utilizado claves privadas reales para generar contenido.

## Archivos principales

| Archivo                                                               | Función                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/components/assistant-panel.tsx`                                  | Chat, consentimiento, material, revisiones y confirmaciones.                     |
| `src/components/workspace.tsx`, `src/app/globals.css`                 | Entrada de navegación, montaje del módulo y estilos Dark Navy añadidos.          |
| `src/lib/gemini.ts`                                                   | Clave privada, comprobación de modelo, solicitud REST y validación de respuesta. |
| `src/lib/assistant-schema.ts`, `assistant-conversation.ts`            | Esquemas y límites de conversación.                                              |
| `src/lib/assistant-quota.ts`                                          | Contador persistente y exclusión de envíos simultáneos.                          |
| `src/lib/assistant-documents.ts`                                      | Lectura limitada y autorizada de materiales y Calendar.                          |
| `src/lib/assistant-pdf.ts`, `src/assets/`                             | PDF Unicode y fuente con licencia.                                               |
| `src/app/api/assistant/route.ts`                                      | Estado y generación, protegidos por sesión y Origin.                             |
| `src/app/api/assistant/export/route.ts`                               | Descarga o creación explícita de archivo de biblioteca.                          |
| `next.config.ts`, `.env.example`, `package.json`, `package-lock.json` | Trazado de fuente, variables vacías y dependencias PDF.                          |
| Tests y `scripts/check-production.mjs`                                | Seguridad, cuota, generación, PDF, confirmaciones y regresiones.                 |

## Fuentes oficiales consultadas

- [Precios: Gemini 3.5 Flash-Lite, nivel gratuito estándar](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite).
- [Modelo Gemini 3.5 Flash-Lite y capacidades](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).
- [Disponibilidad programática de modelos](https://ai.google.dev/api/models).
- [Límites y cuotas](https://ai.google.dev/gemini-api/docs/rate-limits).
- [Facturación de Gemini API](https://ai.google.dev/gemini-api/docs/billing).
- [Condiciones y tratamiento de datos](https://ai.google.dev/gemini-api/terms).
