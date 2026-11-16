# Preparación privada de la configuración

Este proyecto se está preparando en un entorno remoto. No compartas secretos por chat. No copies el archivo privado del entorno remoto a GitHub, Drive, un ZIP ni una captura. La entrega incluye código y una plantilla vacía, nunca `.env.local`.

## Qué se automatizó en el entorno remoto

- Se creó `.env.local` desde `.env.example`, sin sobrescribir un archivo existente.
- Se establecieron `APP_URL=http://localhost:3000` y `DEMO_MODE=false`.
- Se conservaron vacías `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `ALLOWED_EMAIL`, porque sus valores reales aún no han sido configurados.
- Se verificaron las reglas de `.gitignore` con Git. El proyecto todavía no es un repositorio Git: la verificación se realizó en un repositorio temporal que ya se eliminó, sin inicializar ni publicar este proyecto.
- Se comprobó que el directorio pertenece al usuario del proceso y no permite escritura de otros usuarios. `.env.local` tiene permisos POSIX `600`, y el directorio del proyecto `700`. Se generó una clave criptográfica de sesión de 32 bytes para este entorno, guardada únicamente en ese archivo privado.
- Se ejecutó `npm ci`. `npm run check:google` señala que faltan las tres variables de Google; esto es lo esperado y no se ha ocultado con valores inventados.

La clave remota no es una copia de seguridad ni tu clave de producción: puede perderse si se elimina o reemplaza este entorno. No se incluye en la entrega. Tu computadora debe generar su propia clave; cambiarla invalida las sesiones existentes.

## Configurar en tu computadora

1. Descarga y extrae la versión actualizada del proyecto en una carpeta de tu usuario. Instala Node.js 22 o 24 y Git si no los tienes.
2. Desde el directorio del proyecto ejecuta:

   ```bash
   npm run prepare:local
   npm ci
   ```

   El preparador usa únicamente módulos incorporados de Node, por lo que puede ejecutarse antes de instalar las dependencias. No contacta con Google, no instala nada y no publica el proyecto.

3. Revisa el resumen, que nunca muestra valores privados. El preparador:
   - Crea `.env.local` solo si no existe.
   - Establece las dos preferencias locales solicitadas: APP_URL y DEMO_MODE.
   - Conserva los valores existentes de las credenciales, SESSION_SECRET y las demás variables.
   - Genera SESSION_SECRET únicamente si está vacía, puede comprobar permisos privados y verifica su exclusión de Git.
   - No genera una nueva clave en cada ejecución.
   - Rechaza enlaces simbólicos, archivos con múltiples enlaces, variables duplicadas y directorios POSIX modificables por terceros.

4. Abre `.env.local` **en tu editor local** y pega los datos que obtengas de tu propio cliente de Google Cloud:

   | Variable               | Valor que debes introducir personalmente          |
   | ---------------------- | ------------------------------------------------- |
   | `GOOGLE_CLIENT_ID`     | ID real del cliente OAuth de tipo Aplicación web. |
   | `GOOGLE_CLIENT_SECRET` | Secreto real de ese cliente.                      |
   | `ALLOWED_EMAIL`        | Correo principal exacto de tu cuenta autorizada.  |

   No modifiques la clave generada si el resumen indica que se guardó de forma privada. No pegues los valores del archivo en este chat.

5. En el cliente OAuth de Google registra el callback local exacto:

   ```text
   http://localhost:3000/api/auth/callback
   ```

   Confirma también las API, los usuarios de prueba y los scopes de [GOOGLE_CLOUD.md](GOOGLE_CLOUD.md).

6. Ejecuta:

   ```bash
   npm run check:google
   ```

   Hasta completar los tres campos de Google, el comando termina con código 1 y muestra **Configuración pendiente**. No es un fallo de instalación: falta tu configuración real. Cuando pase, confirma solo que el diagnóstico es correcto. Esto todavía no prueba el consentimiento ni el acceso real a Google.

No ejecutes el preparador local sobre una configuración de producción: restablece APP_URL a localhost de forma intencionada. Esos valores locales no deben sustituir variables HTTPS de Vercel.

## Si el preparador no puede comprobar privacidad

No se generará la clave. Revisa el motivo antes de continuar:

- Si Git no está instalado, instálalo y vuelve a ejecutar el preparador para comprobar las reglas.
- Si el proyecto pertenece a otro usuario o el directorio permite escritura a terceros, utiliza una carpeta privada de tu usuario; no relajes los permisos para eludir el control.
- Si `.env.local` ya está rastreado por Git, añadirlo a `.gitignore` no retira sus versiones anteriores. No publiques: retíralo del índice y revisa el historial; rota cualquier secreto que ya se hubiera publicado.
- En Windows, el preparador no considera que los bits POSIX prueben una ACL privada. Puedes trabajar en WSL dentro de su filesystem Linux, en una carpeta privada de tu usuario, y ejecutar el mismo preparador allí. Si prefieres Windows nativo, comprueba personalmente la ACL del archivo o utiliza el almacenamiento de variables de Vercel; no se genera automáticamente una clave sin comprobar su privacidad.

## Alternativa posterior: variables en Vercel

Estos pasos explican dónde guardar secretos; **no se ha creado un proyecto ni realizado un despliegue**.

Cuando tengas un proyecto de Vercel y su dominio real, puedes introducir personalmente las variables en **Project Settings → Environment Variables**:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `ALLOWED_EMAIL`: desde tu configuración real de Google.
- `SESSION_SECRET`: una clave distinta de la local, de 32 bytes aleatorios codificados como 64 caracteres hexadecimales. Genérala en un entorno local privado o con un gestor de contraseñas de confianza que admita ese formato; no la envíes por chat.
- `APP_URL`: el origen HTTPS real del proyecto, sin ruta ni consulta. No uses localhost en producción ni inventes un dominio.
- `DEMO_MODE=false`.

Marca los secretos como sensibles cuando esté disponible esa opción. No uses prefijos `NEXT_PUBLIC_` ni compartas las variables de producción con previews. El cliente de Google deberá incluir la URI HTTPS real terminada en `/api/auth/callback`. Espera a la etapa de despliegue antes de publicar. Si se solicita un plan de pago o activar facturación, detente.

`.env.local` no se sube a Vercel mediante Git. Las variables privadas se configuran en su panel; el archivo local no forma parte del ZIP ni del repositorio.
