# Revisión de la primera etapa

Este informe documenta la revisión OAuth inicial. La preparación posterior de `.env.local`, con una clave privada exclusiva del entorno remoto y credenciales de Google todavía pendientes, se describe en [SECRETOS_LOCALES.md](SECRETOS_LOCALES.md). No se distribuye ese archivo privado.

## Cambios realizados

| Archivos                                                         | Cambio y motivo                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/auth-config.ts`, `.env.example`                         | Variables verificadas por formato: un origen válido, único correo autorizado, secretos no vacíos y clave de sesión de 32 bytes en hexadecimal. HTTP permitido solo en loopback durante desarrollo.                                        |
| `src/lib/auth-policy.ts`                                         | Scopes centralizados; Calendar reducido a `calendar.events.owned`; cuenta Google con `sub`, correo verificado y coincidencia con ALLOWED_EMAIL; esquema y versión de sesión; comprobaciones de estado OAuth.                              |
| `src/lib/oauth.ts`, rutas `api/auth/login` y `api/auth/callback` | PKCE S256, estado aleatorio y comprobación de permisos concedidos. Validación de respuestas de tokens, autorización offline obligatoria y perfil obtenido desde Google en el servidor. Un callback inválido no elimina la sesión vigente. |
| `src/lib/auth.ts`                                                | Cookie cifrada AES-256-GCM con validación estricta, fallo cerrado si es demasiado grande y caducidad absoluta: renovar un access token no extiende los siete días. Las sesiones del código anterior deben renovarse mediante login.       |
| `api/auth/logout`                                                | Cierre de sesión y limpieza de autorización pendiente, revocación con timeout y resultado que no simula una revocación si no había sesión válida.                                                                                         |
| `src/lib/google.ts`, `src/lib/errors.ts`                         | Destinos restringidos, cabecera Bearer bajo control del servidor, errores sin secretos, timeout y distinción entre conflicto, permiso denegado, cuota y fallo temporal. Sin reintentos automáticos de creación.                           |
| Rutas de Drive, Calendar, estado y copias                        | Autenticación explícita antes de leer entradas de datos. Se conserva la protección de Origin para escrituras.                                                                                                                             |
| `src/components/workspace.tsx`                                   | Enlace de reconexión al caducar la sesión y conservación del borrador local tras volver a entrar; leer Drive no elimina una copia pendiente de recuperación. Sin cambiar colores o distribución.                                          |
| `scripts/check-google.ts`, `package.json`                        | Comando `npm run check:google` con valores ocultos. Revisa formato; no verifica credenciales contra Google ni contacta servicios externos.                                                                                                |
| `README.md`, `docs/GOOGLE_CLOUD.md`, pruebas                     | Instrucciones revisadas, scopes actualizados, limitaciones explícitas y parada antes de Vercel.                                                                                                                                           |

## Verificación

- Suite previa: 27 pruebas aprobadas.
- Suite ampliada: **44 pruebas aprobadas**, con simulaciones controladas de OAuth y Google, sin credenciales reales. Incluye configuración, PKCE, rechazo de cuentas ajenas y correo sin verificar, permisos parciales, expiración, respuestas malformadas, renovación, límites de cookie, CSRF y recuperación del borrador al reconectar.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado.
- `npm run check:google`: detecta configuración pendiente en el entorno de trabajo, como corresponde al no haber configurado variables reales. No se ha creado ni rellenado `.env.local` con datos inventados.

Las pruebas simuladas no certifican que el cliente OAuth exista, que se hayan habilitado las API o que Drive aplique las precondiciones ETag de la forma esperada. Esa validación real queda para después de tu configuración personal.

## Restricciones y punto de parada

- El único usuario permitido se configura personalmente en `ALLOWED_EMAIL`; no se ha elegido ni supuesto una cuenta real en tu lugar.
- `DEMO_MODE=false` es obligatorio para comprobar el acceso privado. El modo de demostración local se conserva como herramienta de desarrollo, nunca funciona en producción.
- `drive.file` no permite navegar libremente por todo el Drive; no se amplían permisos ni se añade Picker en esta etapa. Calendar se limita en el código al calendario principal.
- No hay base de datos central de sesiones. Los tokens están cifrados en la cookie, con el límite de tamaño documentado; no están disponibles para JavaScript ni se escriben en el JSON de Drive.
- No se han creado recursos de Google Cloud, concedido permisos en tu nombre, accedido a tus documentos mediante el cliente OAuth nuevo, modificado eventos, activado facturación ni desplegado en Vercel o Sites.
- El siguiente paso es exclusivamente que completes `docs/GOOGLE_CLOUD.md`. Después confirma el estado sin compartir secretos.
