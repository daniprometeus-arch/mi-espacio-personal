# Mi espacio personal

Aplicación privada para un único usuario, preparada para Vercel. Next.js App Router, TypeScript, Tailwind CSS 4, componentes de shadcn/ui con Radix, Recharts y dnd-kit. No contiene asistentes, chats, SDK ni llamadas a modelos de IA. No utiliza Supabase, bases de datos externas ni almacenamiento persistente en el filesystem de Vercel.

El diseño se basa en la captura del sitio de referencia facilitado: azul marino, paneles compactos, barra lateral, acentos azules y celestes. El sitio de referencia no se modifica. Esta entrega es código fuente independiente; no se ha desplegado en Vercel ni en Sites.

## 1. Inicio rápido

**Ruta actual sin configurar tu computadora:** utiliza [docs/VERCEL_GITHUB.md](docs/VERCEL_GITHUB.md) para GitHub privado y variables introducidas personalmente en Vercel. No publiques hasta confirmar el despliegue. El flujo local siguiente es opcional.

Requisitos: Node.js 22 o 24 y npm.

Para preparar de forma segura las variables locales sin sobrescribir credenciales, consulta [docs/SECRETOS_LOCALES.md](docs/SECRETOS_LOCALES.md) y ejecuta `npm run prepare:local`. Ese comando deja las credenciales vacías hasta que las completes personalmente. Nunca incluyas `.env.local` en una entrega o repositorio.

```bash
npm run prepare:local
npm ci
```

Para explorar la interfaz antes de configurar Google, establece `DEMO_MODE=true` en `.env.local` y ejecuta:

```bash
npm run dev
```

Abre http://localhost:3000. El modo local comienza sin datos de ejemplo. Puedes crear cursos, temas, preguntas, notas, tareas y demás registros. Se guardan en `localStorage` del navegador. Drive y Calendar permanecen desactivados y muestran por qué. No es un sustituto del almacenamiento de producción. El servidor **rechaza el modo demo cuando NODE_ENV=production**, incluso si la variable está activa.

Para usar Google, completa las variables indicadas abajo y vuelve a dejar `DEMO_MODE=false`. Reinicia `npm run dev` tras modificar variables. El primer acceso mostrará la pantalla de inicio de sesión.

```bash
npm test
npm run typecheck
npm run build
npm start
```

`npm start` requiere las variables de producción o `.env.local` y un build previo; no habilita demo.

## 2. Configuración de Google Cloud, paso a paso

**Etapa actual:** sigue [docs/GOOGLE_CLOUD.md](docs/GOOGLE_CLOUD.md), que contiene la revisión OAuth y el punto de parada antes de Vercel. Ejecuta `npm run check:google` al completar tu configuración local; no imprime secretos ni contacta con Google.

No compartas el secreto OAuth ni SESSION_SECRET por chat y no los subas al repositorio.

1. Abre https://console.cloud.google.com/ y crea un proyecto de Google Cloud para esta aplicación.
2. En **API y servicios → Biblioteca**, habilita **Google Drive API** y **Google Calendar API**. No necesitas habilitar facturación para el uso básico de estas API. Este código no activa servicios ni planes de pago.
3. En **Google Auth Platform**, configura la marca o pantalla de consentimiento: nombre de aplicación, correo de soporte y correo de contacto.
4. En **Público objetivo**, usa **Externo** si tu cuenta es Gmail personal; **Interno** solo está disponible para organizaciones de Workspace que lo permitan. Durante las pruebas, agrega tu dirección como **usuario de prueba**. Usa la misma dirección en `ALLOWED_EMAIL`.
5. En **Acceso a los datos**, declara estos scopes exactos:

   | Scope                                                   | Uso                                                                  |
   | ------------------------------------------------------- | -------------------------------------------------------------------- |
   | `openid`                                                | Inicio de sesión OAuth/OpenID                                        |
   | `email`                                                 | Comprobar el email verificado autorizado                             |
   | `profile`                                               | Mostrar tu nombre                                                    |
   | `https://www.googleapis.com/auth/drive.appdata`         | JSON de estado y copias privadas de la aplicación                    |
   | `https://www.googleapis.com/auth/drive.file`            | Crear, subir y administrar archivos autorizados para esta aplicación |
   | `https://www.googleapis.com/auth/calendar.events.owned` | Consultar y gestionar eventos de tu calendario principal             |

6. En **Clientes → Crear cliente**, elige **Aplicación web**. Pon un nombre reconocible.
7. Añade esta **URI de redirección autorizada**, exactamente:

   ```text
   http://localhost:3000/api/auth/callback
   ```

   No se ejecuta OAuth desde JavaScript del navegador: no necesitas un origen JavaScript para el flujo implementado. No habilites una API key pública.

8. Copia el ID y el secreto del cliente a `.env.local`:

   ```dotenv
   APP_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ALLOWED_EMAIL=
   SESSION_SECRET=
   DEMO_MODE=false
   ```

9. Genera `SESSION_SECRET` con `openssl rand -hex 32`, o con:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

10. Reinicia Next y pulsa **Continuar con Google**. Usa la cuenta exacta de `ALLOWED_EMAIL` y acepta los scopes. Una cuenta diferente nunca obtiene sesión, aunque figure como usuario de prueba.
11. Si aparece `redirect_uri_mismatch`, compara protocolo, host, puerto y ruta exactos con el cliente OAuth. Si Google rechaza permisos, revisa las API habilitadas, los scopes y el usuario de prueba.

En modo de consentimiento **Testing** externo, Google puede hacer caducar el refresh token a los siete días para estos scopes. La sesión de esta aplicación también dura como máximo siete días. Vuelve a iniciar sesión cuando se solicite. La publicación del consentimiento y una posible verificación de Google son procesos distintos del despliegue en Vercel; consulta los requisitos actuales de Google antes de ampliar la audiencia.

## 3. Despliegue en Vercel (etapa posterior)

No ejecutes estos pasos durante la preparación de Google Cloud. Espera a completar la configuración OAuth y su validación.

1. Crea un repositorio privado y sube este directorio, incluyendo `package-lock.json`. `.gitignore` excluye secretos, `.env.local`, `node_modules` y `.next`.
2. En Vercel, importa el repositorio. Selecciona **Next.js**, directorio raíz de la aplicación, Node.js 22 o 24, instalación `npm ci` y compilación `npm run build`. Conserva la configuración de salida predeterminada de Next.js.
3. Obtén el dominio estable del proyecto, por ejemplo `https://mi-espacio.vercel.app`. Usa ese dominio o tu dominio propio; evita URLs aleatorias de cada preview para OAuth.
4. En el cliente OAuth de Google Cloud añade la segunda URI autorizada:

   ```text
   https://mi-espacio.vercel.app/api/auth/callback
   ```

5. En **Vercel → Project Settings → Environment Variables**, añade las seis variables de `.env.example`. Marca los secretos como sensibles si Vercel lo permite. Usa `APP_URL=https://mi-espacio.vercel.app`, tu mismo `ALLOWED_EMAIL`, el cliente y secreto OAuth, un `SESSION_SECRET` nuevo aleatorio y `DEMO_MODE=false`. No uses el prefijo `NEXT_PUBLIC_` para ninguna de ellas.
6. Aplica estas variables a **Production**. No reutilices secretos de producción en previews públicos o de colaboradores. Si necesitas OAuth en preview, usa un cliente separado con redirect URI y APP_URL exactos para ese despliegue.
7. Despliega o haz **Redeploy** después de cambiar variables. Un primer build sin ellas funciona, pero no permite entrar hasta configurarlas.
8. Completa la lista de verificación de [docs/VALIDACION.md](docs/VALIDACION.md) con tu cuenta antes de usar datos importantes.

No se ha creado ningún recurso en tu Google Cloud ni proyecto de Vercel desde esta entrega. Sus credenciales no están disponibles en este entorno.

## 4. Módulos y uso

| Módulo              | Operaciones                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inicio              | Reordenar tarjetas con ratón o teclado, ampliar/reducir, ocultar/restaurar y restablecer distribución. Racha, tareas, actividad semanal, objetivos, documentos y agenda reales.                                                          |
| Biblioteca          | Buscar y paginar archivos autorizados, explorar carpetas, subir hasta 3 MB, crear carpetas, previsualizar PDF y abrir otros archivos en Drive. Renombrar, mover a una carpeta autorizada por su ID o enviar a papelera con confirmación. |
| Cursos y apuntes    | CRUD de cursos, unidades, temas, completado por tema y apuntes enlazados a documentos. El progreso depende de los temas completados.                                                                                                     |
| Práctica            | Banco manual de preguntas, cuatro opciones, respuesta correcta y explicación. Filtrar curso/tema/cantidad, cuestionarios aleatorios, corrección, historial y repetición de errores.                                                      |
| Calendario y tareas | Agenda personal y eventos del calendario principal de Google. Vista mensual y diaria, tareas personales. Crear/editar/eliminar eventos de Google con confirmación y ETag.                                                                |
| Progreso            | Recharts con minutos de concentración, resultados, progreso por curso, meta diaria, hábitos y objetivos. Sin porcentajes ni tendencias inventados.                                                                                       |
| Bloc de notas       | CRUD, categorías, búsqueda y editor con guardado automático.                                                                                                                                                                             |
| Proyectos           | CRUD, fechas y estado, tareas y un nivel de subtareas, avance derivado del completado.                                                                                                                                                   |
| Flashcards          | CRUD, filtros por curso/tema, reverso, práctica y registro de si recordaste cada tarjeta.                                                                                                                                                |
| Objetivos y hábitos | Metas cuantificables, avances, fecha objetivo, marcación diaria e historial de cumplimiento.                                                                                                                                             |
| Pomodoro            | Enfoque, pausa, reinicio, descansos configurables, asociación con curso/proyecto, sesiones completadas y enlace de YouTube.                                                                                                              |
| Configuración       | Temas, duraciones, meta diaria, notificaciones, cuenta, revocación OAuth, exportación/importación y restauración de versiones de Drive.                                                                                                  |

En **Personalizar**, activa el modo de edición del dashboard. Arrastra desde el asa. Con teclado: enfoca el asa, pulsa espacio, usa flechas y confirma con espacio; escape cancela. Las opciones de tamaño alternan los anchos de la cuadrícula. En móvil, las tarjetas ocupan el ancho disponible. Los cambios se guardan con el resto del estado.

El buscador global (`Ctrl K` o `⌘ K`) busca tus registros de la aplicación. La búsqueda de contenido binario/PDF de Drive se realiza desde Google Drive; la biblioteca busca por nombre. El centro de notificaciones muestra tareas pendientes con fecha de hoy o vencidas. Las notificaciones del temporizador requieren permiso y la pestaña abierta; no se incluye un servicio push en segundo plano.

## 5. Almacenamiento en Drive y sus límites

Se eligió `appDataFolder` de Google Drive: es una carpeta privada de datos de la aplicación, accesible únicamente con sus permisos. No se ha implementado una base de datos alternativa. El archivo `mi-espacio-v1.json` contiene el estado completo, schemaVersion, revision y updatedAt. Los archivos de la biblioteca viven en tu Drive normal; los eventos sincronizados viven en Calendar. Ningún token se guarda en ese JSON.

Ventajas: evita una base de datos adicional, funciona con tu cuenta y admite exportación portable. Limitaciones relevantes:

- Drive no es una base de datos transaccional. Se descarga y escribe el JSON completo; no hay consultas indexadas, bloqueos distribuidos ni transacciones entre Drive y Calendar. No es apropiado para muchos usuarios o gran volumen.
- El guardado comprueba revisión y ETag, manda `If-Match`, crea un respaldo previo y verifica el contenido tras escribir. Un conflicto pausa la sincronización y permite exportar la copia local. Si Google no proporciona ETag, falla de forma conservadora y no sobrescribe. **El soporte condicional real debe comprobarse con tu cuenta**, como indica la validación; no se presupone que una prueba simulada lo garantice.
- La creación inicial no dispone de un nombre único atómico en Drive. Haz el primer inicio y primer guardado en una sola pestaña. Si se detectan dos archivos principales, se detiene la escritura en lugar de elegir uno automáticamente.
- Después de un guardado se conservan las diez copias explícitas más recientes. Si falla la depuración por cuota o conexión, pueden acumularse más hasta el siguiente guardado. Cada guardado usa varias llamadas API y está sujeto a cuotas y latencia.
- El JSON se limita a 2 MB. Los PDF y documentos no se incrustan en el JSON. La carga de archivos se limita a 3 MB para mantenerse dentro del límite habitual del cuerpo de las funciones de Vercel; los archivos mayores se suben desde Google Drive.
- `drive.file` **no permite explorar todo tu Drive existente**. Solo archivos creados o autorizados para este cliente. Esta versión admite subir archivos y enlazar documentos existentes desde apuntes; no incluye Google Picker. No amplía silenciosamente a `drive.readonly` ni `drive`.
- La agenda personal se guarda en el JSON. Los eventos de Google se crean directamente desde **Evento en Google** y se consultan desde Calendar; no se duplican automáticamente entre ambos almacenes. Se puede editar o borrar una ocurrencia recurrente con hora; los eventos de todo el día se abren en Google para su edición. No hay editor de series recurrentes ni gestión de calendarios secundarios.
- El Pomodoro usa una hora límite para tolerar intervalos ralentizados, y registra solo bloques de enfoque terminados. Si cierras o recargas la pestaña, la sesión activa no continúa ni se registra como completada. YouTube requiere interacción, puede mostrar anuncios o impedir el vídeo embebido y no reproduce automáticamente.

La copia local de seguridad se guarda bajo `mep-draft-<email>` en `localStorage`. Puede contener información personal en este navegador; usa tu propio perfil de navegador. No almacena tokens. Si falla Drive, conserva la pestaña y exporta antes de recargar o salir. **Cargar Drive** reemplaza el estado en memoria tras confirmación; no fusiona registros de forma automática. Para recuperar un borrador anterior, descárgalo desde el aviso inicial e impórtalo desde Configuración. Las copias de Drive se consultan y restauran desde Configuración, siempre como una nueva revisión.

Si en el futuro necesitas edición concurrente fuerte, datos grandes o colaboración, conviene reevaluar el almacenamiento contigo antes de introducir otro servicio.

## 6. Seguridad

- Rutas de datos en servidor, comprobación de sesión en todas las llamadas a Google y página principal protegida. Sin sesión, `/` redirige al login y las API de datos devuelven 401.
- OAuth Authorization Code + PKCE, estado de un solo uso en cookie cifrada y caducidad de diez minutos. Se verifica el email confirmado de Google contra `ALLOWED_EMAIL`, y los tres scopes de API concedidos. Las sesiones anteriores a la revisión OAuth requieren iniciar sesión de nuevo.
- Access y refresh token solo en cookie de sesión **cifrada y autenticada con AES-256-GCM**, `HttpOnly`, `SameSite=Lax`, `Secure` en producción. La cookie se transporta por el navegador como texto cifrado; JavaScript no puede leerla. No hay un almacén de sesiones en disco o en una base de datos.
- Sesión con caducidad absoluta de siete días, esquema validado e identificación de Google. Renovación del access token en servidor sin prolongar ese plazo; se conservan o rotan los refresh tokens según la respuesta de Google. Cerrar sesión borra la cookie; **Desconectar Google** intenta revocar el refresh token. La revocación no elimina tus documentos.
- El servidor exige que `Origin` coincida exactamente con `APP_URL` para operaciones de escritura. Validación con Zod, límites de tamaño y filtrado de enlaces de navegación.
- `.env.example` no contiene credenciales. `.env.local` está excluido. Rotar `SESSION_SECRET` invalida las sesiones existentes. Ninguna variable OAuth se expone con `NEXT_PUBLIC_`.
- La cookie cifrada es una sesión portadora: protege tu navegador y usa HTTPS. Esta solución sin base de datos no ofrece una lista central de sesiones o invalidación individual de una cookie robada; revoca acceso en Google y rota SESSION_SECRET si hay un incidente.

## 7. Estructura

```text
src/app/                      App Router y estilos responsive
src/app/api/auth/             OAuth, callback, cierre y revocación
src/app/api/state/            Estado versionado y escritura condicional
src/app/api/backups/          Listado y lectura de versiones anteriores
src/app/api/drive/            Archivos, carpetas y PDF
src/app/api/calendar/         Eventos de Google Calendar
src/components/workspace.tsx Dashboard, módulos y estado del cliente
src/components/google-panels.tsx Biblioteca y calendario
src/components/ui/           Componentes shadcn/Radix de botón y diálogo
src/lib/model.ts              Esquema de datos y cálculos
src/lib/auth.ts               Sesión, cifrado y CSRF
src/lib/auth-config.ts        Validación privada de variables
src/lib/auth-policy.ts        Cuenta autorizada, sesión y scopes
src/lib/oauth.ts              PKCE, canje de código y renovación
src/lib/errors.ts             Errores sin secretos
scripts/check-google.ts       Diagnóstico local sin contactar Google
docs/GOOGLE_CLOUD.md          Configuración personal de Google Cloud
src/lib/google.ts             Transporte autenticado con Google
src/lib/backups.ts            Copias y retención
src/lib/versioning.ts         Comprobaciones de concurrencia
tests/                        Pruebas de lógica, seguridad e interfaz DOM
docs/VALIDACION.md             Verificación con Google y despliegue
```

## 8. Estado de verificación

Consulta [docs/VALIDACION.md](docs/VALIDACION.md). Los tests de interfaz utilizan un DOM simulado; no equivalen a una revisión visual en un navegador. El entorno de entrega no dispone de la herramienta de navegador requerida para esa revisión. La autenticación y las API reales necesitan tus credenciales y quedan pendientes de la comprobación integrada indicada en esa guía. El build de producción y las pruebas automatizadas se ejecutan durante la preparación de esta entrega.
