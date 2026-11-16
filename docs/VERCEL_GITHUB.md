# GitHub privado y Vercel sin preparar el proyecto en tu computadora

El proyecto está preparado para instalarse y compilarse en Vercel. **Todavía no está desplegado. No pulses Deploy, Redeploy ni actives despliegues automáticos hasta confirmar la publicación.** Crear un repositorio privado y preparar los formularios no requiere compartir secretos en el chat.

La entrega contiene código y una plantilla vacía; excluye `.env.local`, la clave remota, dependencias y builds. No necesitas ejecutar npm ni configurar variables en tu computadora para seguir esta ruta. Solo tendrás que extraer el ZIP para subir sus archivos desde el navegador.

## 1. Preparar el repositorio privado personalmente

1. En tu cuenta personal de GitHub, abre **New repository**. Usa un nombre para este proyecto y selecciona **Private** antes de crearlo. No hace falta contratar un plan.
2. Descarga la entrega actual y extrae el ZIP. Desde **Add file → Upload files**, sube el **contenido** de `mi-espacio-personal`, no el ZIP ni una carpeta adicional alrededor del proyecto.
3. En la raíz del repositorio deben quedar `package.json`, `package-lock.json`, `vercel.json`, `next.config.ts`, `src/`, `scripts/`, `tests/` y `docs/`. Incluye también `.gitignore`, `.vercelignore` y `.env.example`. Activa la visualización de archivos ocultos en tu explorador o crea esos archivos desde el editor web con su contenido exacto.
4. Revisa la lista antes de confirmar: **no subas `.env.local`, otros archivos `.env`, `.next`, `node_modules`, cookies, logs o credenciales**. La carga web de GitHub no usa `.gitignore` como una barrera automática: utiliza exclusivamente la entrega limpia.
5. Confirma el commit en `main` y comprueba que GitHub muestra el candado **Private**. No cambies la visibilidad. No pegues secretos en archivos, commits, issues, capturas o GitHub Actions.

No se ha creado un repositorio ni se ha hecho push desde esta preparación. Se recomienda una cuenta personal para evitar que las condiciones de importar repositorios privados de organizaciones exijan un plan distinto en Vercel. Si se solicita una actualización de pago, detente.

## 2. Preparar la importación en Vercel, sin desplegar aún

1. Entra en tu cuenta personal de Vercel con el plan **Hobby**, apropiado para este uso personal dentro de sus límites.
2. Abre **Add New → Project**, conecta GitHub y concede a Vercel acceso únicamente al repositorio privado seleccionado.
3. Selecciona el repositorio para llegar a su configuración. **No pulses Deploy.** Si la interfaz no permite guardar un proyecto o sus variables sin realizar el primer despliegue, detente en el formulario y espera a la confirmación; no uses un despliegue provisional para completar esta preparación.
4. Verifica estos ajustes:

   | Ajuste           | Valor                                                                       |
   | ---------------- | --------------------------------------------------------------------------- |
   | Framework        | Next.js                                                                     |
   | Root Directory   | La carpeta que contiene `package.json`; será la raíz si seguiste el paso 1. |
   | Node.js          | 24.x, también fijado en `package.json`.                                     |
   | Install Command  | `npm ci`                                                                    |
   | Build Command    | `npm run build`                                                             |
   | Output Directory | Predeterminado de Next.js; no configures un export estático.                |

5. No ejecutes `prepare:local` ni `check:google` como Build Command. Son ayudas locales y no son necesarias para introducir variables en el panel. La compilación funciona sin secretos; el acceso real permanece cerrado mientras la configuración no sea válida.

`vercel.json` contiene `git.deploymentEnabled=false`: las actualizaciones del repositorio no deben lanzar despliegues automáticos. Esto no sustituye la decisión de no pulsar **Deploy** en la importación inicial o un despliegue manual. No se han añadido workflows de GitHub, deploy hooks, cron jobs ni automatizaciones.

## 3. Introducir los secretos exclusivamente en Vercel

En **Environment Variables** de la importación o en **Project Settings → Environment Variables** si el proyecto ya existe, añade personalmente:

| Variable               | Valor que debes introducir                                                       | Entorno    |
| ---------------------- | -------------------------------------------------------------------------------- | ---------- |
| `GOOGLE_CLIENT_ID`     | Tu ID real de cliente OAuth web.                                                 | Production |
| `GOOGLE_CLIENT_SECRET` | El secreto real del mismo cliente.                                               | Production |
| `ALLOWED_EMAIL`        | Tu correo principal autorizado exacto.                                           | Production |
| `SESSION_SECRET`       | Una nueva clave privada aleatoria de 32 bytes, como 64 caracteres hexadecimales. | Production |
| `DEMO_MODE`            | `false`.                                                                         | Production |
| `APP_URL`              | Origen HTTPS definitivo, cuando esté confirmado; véase el paso 4.                | Production |

Marca los secretos como sensibles si el panel permite esa opción en tu plan. No uses `NEXT_PUBLIC_`, no copies las variables de producción a Preview y no reutilices la clave del entorno remoto. Las variables se introducen como valores completos, sin comillas de un archivo dotenv.

Para generar la clave sin configurar un proyecto local, puedes utilizar un gestor de contraseñas que genere 64 caracteres hexadecimales aleatorios. También puedes generar 32 bytes con Web Crypto en la consola de tu propio navegador, con Vercel abierto:

```javascript
Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
  n.toString(16).padStart(2, "0"),
).join("");
```

Ese código solo genera aleatoriedad en tu navegador: no hace llamadas de red. Copia el resultado al campo `SESSION_SECRET` y guárdalo en tu gestor de contraseñas, no en el repositorio ni en el chat. No se proporciona una clave de ejemplo para copiar.

## 4. Vincular el dominio definitivo con OAuth

El código usa este orden:

1. `APP_URL`, si está definida como un origen HTTPS válido, sin ruta ni consulta.
2. Si no está definida y se está ejecutando en producción de Vercel: `https://` más el valor automático **`VERCEL_PROJECT_PRODUCTION_URL`**.
3. Si no hay una configuración válida, OAuth permanece cerrado. Nunca se utiliza `VERCEL_URL`, una URL de preview o la cabecera Host del visitante como callback.

No copies `http://localhost:3000` a Vercel. No inventes un dominio basándote en el nombre del proyecto. Si aún no tienes un dominio confirmado, deja `APP_URL` **sin definir** y mantén habilitada la exposición de variables de sistema de Vercel. Su variable de dominio de producción estará disponible cuando se ejecute el despliegue autorizado. Si utilizas varios dominios, es preferible fijar APP_URL explícitamente al dominio que elijas y mantenerlo estable.

Cuando el dominio real esté confirmado en Vercel, abre el cliente OAuth de Google Cloud y agrega como **Authorized redirect URI** ese origen exacto seguido de:

```text
/api/auth/callback
```

La URI completa debe empezar con HTTPS y coincidir exactamente con el origen configurado. Este flujo no necesita orígenes JavaScript ni Google Picker. No cambies el ID o secreto de cliente para resolver una discrepancia de URL.

Si Vercel no confirma el dominio hasta el primer despliegue, la conexión con Google se comprobará después de ese despliegue autorizado, una vez que añadas la URI real en Google Cloud. Hasta entonces no se podrá completar OAuth; no se anuncian Drive o Calendar como conectados.

El inicio de sesión desde un alias se redirige al origen canónico antes de crear la cookie de estado. Las previews de Vercel tienen OAuth y sesiones de producción desactivados, incluso si se copian variables por error. Para probar previews en el futuro se requerirá una configuración separada que no forma parte de esta entrega.

## 5. Confirmación y despliegue: etapa pendiente

Detente ahora. Cuando hayas preparado el repositorio y el formulario o proyecto de Vercel, puedes confirmar que quieres publicar. No necesitas enviar los valores de ninguna variable; basta con indicar que están introducidas y si ya existe un dominio definitivo.

Solo después de esa confirmación se realizará el primer despliegue manual desde el panel. Se mantienen desactivados los despliegues automáticos por Git. Cambiar posteriormente una variable de Vercel requiere un nuevo despliegue autorizado para que se aplique.

No se contrata Pro, no se activa una prueba de pago y no se crean servicios de almacenamiento, bases de datos, dominios de pago o integraciones. Se utiliza tu almacenamiento de Drive existente. Si se alcanza una cuota o se exige facturación, se detiene el proceso y se revisa contigo; no hay ampliaciones automáticas.

## 6. Verificaciones después del despliegue autorizado

Utiliza archivos y eventos de prueba que puedas eliminar:

1. Abre el dominio estable en una ventana sin sesión. `/` debe llevar a `/login`; las API de estado, archivos, copias y calendario deben devolver 401 sin sesión. Los archivos JavaScript y la pantalla de login son públicos; el contenido personal está protegido por la sesión, no por la privacidad del repositorio.
2. Entra con tu cuenta autorizada. Otra cuenta debe ser rechazada. Acepta los scopes de Drive y Calendar ya documentados en `GOOGLE_CLOUD.md`.
3. Crea una tarea y un curso, espera **Guardado**, recarga y comprueba su persistencia. Prueba el conflicto entre dos pestañas y exporta una copia antes de recuperar una versión. Drive no es una base de datos transaccional; las precondiciones ETag deben comprobarse con la cuenta real.
4. En Biblioteca crea una carpeta y sube un PDF de menos de 3 MB. Busca, abre, renombra y envía a la papelera con confirmación. `drive.file` solo permite archivos creados o autorizados para este cliente; no da acceso a todo el Drive ni incluye Picker.
5. En Calendario consulta el calendario principal y crea un evento de prueba con confirmación. Verifícalo en Google Calendar, edítalo y elimínalo con confirmación. El scope es `calendar.events.owned`.
6. Revisa cookies `Secure`, `HttpOnly`, `SameSite=Lax`, el cierre de sesión y la revocación. En Testing externo de Google puede ser necesario volver a autorizar tras siete días.
7. Revisa los logs reales de Vercel sin copiar cuerpos, cookies, códigos OAuth o cabeceras Authorization al chat. El código no imprime valores privados y sus errores internos son genéricos; las políticas de retención y acceso de la plataforma se revisan en su panel. No se han añadido capturas de peticiones ni integraciones de logging.

El ID OAuth es un identificador público del protocolo y aparecerá en la redirección a Google; no es el secreto del cliente. `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` y los tokens no deben aparecer en código de cliente o respuestas JSON. El correo autorizado ya no se incluye como `login_hint` antes de autenticar.

## Evidencia y límites de la preparación

Se ha comprobado una instalación y compilación limpias sin `.env.local`, las pruebas automatizadas y la protección HTTP del build de producción en loopback. No equivale a un build ejecutado dentro de tu cuenta de Vercel: ese resultado y la integración real con Google solo podrán verificarse tras tu autorización de despliegue y configuración privada de las variables.

## Referencias oficiales

- [Configuración Git y pausa de despliegues automáticos](https://vercel.com/docs/project-configuration/git-configuration).
- [Variables de sistema y dominio de producción](https://vercel.com/docs/environment-variables/system-environment-variables).
- [Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
- [Variables de entorno](https://vercel.com/docs/environment-variables).
- [Plan Hobby](https://vercel.com/docs/plans/hobby).
