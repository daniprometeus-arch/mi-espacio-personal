# Etapa 1: Google Cloud y OAuth 2.0

Esta guía prepara el proyecto existente para tu cuenta. **Detente al terminar la configuración local. No despliegues todavía en Vercel.** El diseño permanece igual; no se añaden Supabase, bases de datos externas, IA ni servicios de pago.

## Qué queda preparado en el código

- OAuth Authorization Code con PKCE S256 y estado aleatorio, cifrado y válido diez minutos. El callback elimina la cookie pendiente, valida estado y código y rechaza parámetros duplicados y autorizaciones canceladas o vencidas.
- Los tokens se obtienen exclusivamente en el servidor. Se verifica el perfil mediante el endpoint de Google UserInfo: debe incluir identificador `sub`, correo verificado y coincidencia exacta con `ALLOWED_EMAIL` (ignorando mayúsculas; no se equiparan alias, puntos ni variantes con `+`). No se incluye `login_hint` para evitar revelar el correo autorizado antes del inicio de sesión; la comprobación de seguridad se hace en el servidor.
- El callback comprueba los tres permisos de API realmente concedidos antes de permitir una sesión. En esta versión los tres son obligatorios: si se rechaza alguno, no se crea sesión. No se hace pasar una integración parcial por una conexión completa.
- `calendar.events.owned` sustituye al permiso más amplio `calendar.events`. El código usa únicamente el calendario `primary`; no necesita gestionar calendarios ajenos ni listas de calendarios.
- Sesión con esquema y versión explícitos, correo autorizado, identificador de Google y caducidad absoluta de siete días. Las sesiones del código anterior se invalidan y requieren volver a iniciar sesión; no se borran datos de Drive.
- Cookie cifrada y autenticada AES-256-GCM, `HttpOnly`, `SameSite=Lax`, `Secure` en producción y sin atributo Domain. La renovación del access token no extiende la caducidad absoluta de la sesión. No se usan tokens en `localStorage`, respuestas JSON ni parámetros del navegador.
- Renovación validada: conserva el refresh token si Google lo omite y admite su sustitución si devuelve uno nuevo. Errores temporales no se confunden con una autorización revocada. Una autorización inválida obliga a iniciar sesión de nuevo.
- Comprobación de sesión al entrar en las API de datos, comprobación de `Origin` para escrituras, destinos de Google restringidos y solicitudes con timeout, sin redirecciones de transporte ni reintentos automáticos de creación. No se registran cuerpos con tokens ni códigos.
- `npm run check:google` revisa el formato de tu configuración local sin imprimir credenciales ni contactar con Google.

## 1. Crear o seleccionar el proyecto

1. Abre [Google Cloud Console](https://console.cloud.google.com/) personalmente con tu cuenta.
2. En el selector superior, crea un proyecto para **Mi espacio personal** o selecciona el que hayas creado para esta aplicación. Mantén el mismo proyecto para ambas API y el cliente OAuth.
3. No actives la prueba gratuita, una cuenta de facturación, servicios de cómputo, almacenamiento de pago o ampliaciones de cuota para seguir esta guía. Si Google exige facturación o un plan para continuar, detente y comunica únicamente el nombre del paso y el mensaje sin datos sensibles.
4. Ve a **API y servicios → Biblioteca** y habilita **Google Drive API** y **Google Calendar API**.

No necesitas Google Docs API, Google Sheets API, Google Picker API, una cuenta de servicio, Firebase ni una API key para el alcance implementado. El uso está sujeto a las cuotas de Google; no se amplían automáticamente. Google publica cambios de cuotas y condiciones, por lo que no se presupone uso ilimitado gratuito.

## 2. Configurar la pantalla de consentimiento

1. Abre **Google Auth Platform**. Si aparece la configuración inicial, pulsa **Comenzar / Get started**.
2. En **Branding / Marca**, usa el nombre **Mi espacio personal** y completa tu correo de soporte y contacto de desarrollador en la consola.
3. En **Audience / Público**, elige **External / Externo** si usas una cuenta personal de Google. **Internal / Interno** solo corresponde a una organización de Google Workspace que lo permita.
4. Mantén la aplicación en **Testing / Pruebas** para esta etapa. En **Test users / Usuarios de prueba**, añade solo la cuenta con la que vas a entrar. No publiques todavía la pantalla de consentimiento.
5. El correo del usuario de prueba debe ser exactamente el que introducirás en `ALLOWED_EMAIL`. La lista de prueba de Google y la restricción del código son controles distintos: ambos deben estar bien configurados.

Los nombres de menús pueden aparecer en inglés o español. No inventes dominios públicos, enlaces legales ni datos para completar campos opcionales durante las pruebas locales. Si la consola exige un campo que no tienes, detente en ese punto.

## 3. Declarar los permisos

En **Data Access / Acceso a los datos → Add or remove scopes / Añadir o quitar permisos**, agrega los siguientes:

| Scope                                                   | Uso y límite                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `openid`                                                | Identidad del usuario autenticado.                                                                                          |
| `email`                                                 | Correo y verificación para restringir el acceso. La consola puede mostrar `https://www.googleapis.com/auth/userinfo.email`. |
| `profile`                                               | Nombre del usuario. La consola puede mostrar `https://www.googleapis.com/auth/userinfo.profile`.                            |
| `https://www.googleapis.com/auth/drive.appdata`         | Estado JSON y versiones en la carpeta privada `appDataFolder` de esta aplicación.                                           |
| `https://www.googleapis.com/auth/drive.file`            | Crear y gestionar archivos creados o autorizados para esta aplicación; no da acceso general al Drive.                       |
| `https://www.googleapis.com/auth/calendar.events.owned` | Consultar, crear, editar y eliminar eventos de calendarios propios; la aplicación usa solo el principal.                    |

No agregues `drive`, `drive.readonly`, `calendar` ni el antiguo `calendar.events` para solucionar un error sin revisarlo antes. No necesitas `calendar.calendarlist` porque el código usa `primary` directamente.

Google puede clasificar Calendar como permiso sensible y mostrar una advertencia de aplicación sin verificar. El modo Pruebas limita el acceso a los usuarios añadidos; no convierte por sí solo una aplicación en verificada. Si una política de tu organización bloquea el permiso, habrá que revisarla con su administrador, sin ampliar scopes a ciegas.

## 4. Crear el cliente OAuth

1. En **Clients / Clientes → Create client / Crear cliente**, elige **Web application / Aplicación web**.
2. Asigna un nombre reconocible al cliente.
3. En **Authorized redirect URIs / URI de redirección autorizadas**, añade exactamente:

   ```text
   http://localhost:3000/api/auth/callback
   ```

4. No añadas comodines, la página de inicio ni un dominio de Vercel todavía. `localhost` y `127.0.0.1` son orígenes distintos. Si trabajas con otro puerto, cambia tanto `APP_URL` como esta URI al mismo puerto.
5. Puedes dejar **Authorized JavaScript origins / Orígenes JavaScript autorizados** vacío: el flujo implementado es de servidor, no utiliza Google Identity Services en el navegador ni Google Picker.
6. Guarda el cliente. Copia el **Client ID / ID de cliente** y el **Client secret / Secreto de cliente** directamente a tu configuración local privada. Guarda el secreto de forma segura cuando Google lo muestre. No lo pegues por chat ni lo subas al repositorio.

Si estás utilizando un entorno remoto, `localhost` corresponde a la computadora cuyo navegador abre el callback. Para esta primera configuración, ejecuta el proyecto en tu computadora y abre Google desde ese mismo navegador. Si necesitas probar desde un entorno remoto, primero habrá que definir su origen HTTPS accesible y registrar su callback exacto; no lo sustituyas por una URL inventada.

## 5. Completar `.env.local` en tu computadora

Desde el directorio del proyecto, instala dependencias y copia la plantilla si aún no tienes `.env.local`:

```bash
npm ci
```

En macOS o Linux, **solo si no existe ya `.env.local`**, copia `.env.example` a `.env.local` con tu editor o gestor de archivos. Evita sobrescribir una configuración existente. En Windows también puedes crear esa copia desde el editor.

Completa estos campos únicamente en `.env.local`:

| Variable               | Qué debes poner personalmente                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `APP_URL`              | `http://localhost:3000` para esta etapa local. Sin ruta, consulta, fragmento ni credenciales. |
| `GOOGLE_CLIENT_ID`     | El ID del cliente web recién creado, copiado desde Google.                                    |
| `GOOGLE_CLIENT_SECRET` | Su secreto real, copiado desde Google.                                                        |
| `ALLOWED_EMAIL`        | El correo principal exacto de tu única cuenta autorizada.                                     |
| `SESSION_SECRET`       | Un valor nuevo generado localmente de 32 bytes, escrito como 64 caracteres hexadecimales.     |
| `DEMO_MODE`            | `false`, también en desarrollo, para comprobar la autenticación real.                         |

Genera `SESSION_SECRET` con **uno** de estos comandos en tu computadora y copia el resultado únicamente a `.env.local`:

```bash
openssl rand -hex 32
```

O, si tienes Node instalado:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No uses ninguno de los datos de las pruebas automatizadas como credencial. No añadas el prefijo `NEXT_PUBLIC_`. `.gitignore` ya excluye `.env.local` y las demás variantes de `.env`, salvo `.env.example`.

## 6. Revisar sin conectarse aún

Ejecuta:

```bash
npm run check:google
```

Debe confirmar que el formato local es válido y mostrar el callback y los scopes públicos. Nunca muestra tu correo autorizado, cliente OAuth, secreto ni clave de sesión. Un resultado válido **no confirma** que el cliente exista en Google, las API estén habilitadas o se haya obtenido consentimiento; eso se comprueba al iniciar sesión después de esta preparación.

Si el comando falla, corrige la variable que indica sin enviar su valor al chat. Reinicia Next después de cambiar variables. No ejecutes un despliegue.

## Límites que debes conocer antes de conectar

- **Drive:** una carpeta existente no se vuelve accesible para la API por pegar su enlace. Esta versión permite subir archivos y guardar enlaces en apuntes; no incluye Google Picker. El JSON interno vive en `appDataFolder`, que no aparece como una carpeta normal en la interfaz de Drive. Sus copias se gestionan desde la aplicación. Las subidas se limitan a 3 MB.
- **Calendar:** se usa el calendario principal y se distinguen los eventos locales de los de Google. No se gestionan calendarios secundarios ni ajenos. Los eventos de todo el día se editan desde Google.
- **Testing:** con estos scopes, Google limita habitualmente los refresh tokens de aplicaciones externas en Pruebas a siete días. La sesión local también tiene un máximo de siete días y puede caducar antes si se revoca el permiso. Será necesario volver a entrar. No se cambia a Production en esta etapa.
- **Sesión sin base de datos:** los tokens viajan en una cookie cifrada y `HttpOnly`, no como texto disponible para JavaScript. No hay lista central de sesiones ni procesos de sincronización cuando la aplicación está cerrada. Una cookie de más de 3800 caracteres se rechaza en lugar de crear una sesión incompleta. No se ha introducido otra infraestructura para eludir ese límite.
- **Concurrencia del JSON:** se conserva el control existente de revisión, ETag, `If-Match` y copias. Su comportamiento real con Google debe validarse después de conectar. Si faltan garantías suficientes, se detendrá el guardado y se revisará contigo antes de cambiar de almacenamiento. No se considera una base de datos transaccional.
- **Permisos anteriores:** si ya autorizaste el cliente con scopes más amplios, cambiar el código no revoca esa autorización. Puedes retirar tú mismo su acceso anterior en [las conexiones de tu cuenta de Google](https://myaccount.google.com/connections) y autorizar de nuevo más adelante. No elimines los datos de la aplicación en Drive. No hagas esto hasta identificar inequívocamente el cliente correcto.

## Punto de parada

Cuando hayas terminado los pasos 1–6, basta con confirmar **«Google Cloud configurado y check:google correcto»**, o indicar el paso que falla y un mensaje redactado sin secretos. No envíes `.env.local`, secretos, códigos de callback, cookies ni capturas que los muestren.

En la siguiente etapa podremos comprobar el inicio de sesión y las API con tu cuenta. **Esta etapa no incluye un despliegue en Vercel, cambios en el sitio de referencia, recursos de pago ni escrituras reales en tus documentos o calendarios.**

## Fuentes oficiales

- [Configurar consentimiento OAuth y usuarios de prueba](https://developers.google.com/workspace/guides/configure-oauth-consent).
- [OAuth para aplicaciones de servidor](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Scopes de Google Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- [Carpeta privada de datos de aplicación](https://developers.google.com/workspace/drive/api/guides/appdata).
- [Scopes de Google Calendar](https://developers.google.com/workspace/calendar/api/auth).
- [Caducidad y revocación de tokens](https://developers.google.com/identity/protocols/oauth2).
- [Cuotas de Drive](https://developers.google.com/workspace/drive/api/guides/limits) y [cuotas de Calendar](https://developers.google.com/workspace/calendar/api/guides/quota).
