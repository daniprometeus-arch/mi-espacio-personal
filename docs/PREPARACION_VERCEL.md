# Resultado de la preparación para GitHub privado y Vercel

Este informe corresponde a la preparación anterior al módulo IA. Para la actualización actual y sus nuevas pruebas, consulta [REVISION_GEMINI.md](REVISION_GEMINI.md).

## Cambios

- `vercel.json`: preset Next.js, instalación `npm ci`, compilación `npm run build` y `git.deploymentEnabled=false` para detener despliegues automáticos de Git. Los campos utilizados se validaron contra el esquema oficial publicado por Vercel.
- `package.json` y lockfile: Node.js 24.x, una versión compatible con Vercel, sin actualizar las dependencias de la aplicación ni añadir servicios.
- `.vercelignore`: exclusión de archivos privados `.env*`, Git, builds previos, dependencias y logs. `.gitignore` conserva sus reglas de privacidad. El paquete entregado también excluye estos archivos.
- `auth-config.ts`: origen canónico HTTPS explícito o dominio estable automático `VERCEL_PROJECT_PRODUCTION_URL` en producción. No se utiliza la URL efímera del despliegue ni Host. Configuración inválida falla cerrada.
- `auth.ts`: las previews de Vercel no admiten sesiones de producción ni modo demo. Las rutas de datos siguen comprobando sesión y las escrituras comprueban Origin.
- Login OAuth: un alias se redirige al origen canónico antes de crear la cookie de estado. Se elimina `login_hint` para no revelar el correo autorizado antes de autenticar.
- Errores y cabeceras: logging interno genérico sin nombres ni mensajes dinámicos de excepciones; `Referrer-Policy: no-referrer` en las rutas OAuth.
- `tests/deployment.test.ts` y pruebas OAuth: configuración, límites entre cliente y servidor, origen de producción, aliases y bloqueo de previews.
- `scripts/check-production.mjs`: verificación HTTP reproducible de una copia limpia ya compilada. Solo inicia un servidor en loopback, sin credenciales, y lo detiene al terminar; no publica en Internet.
- `docs/VERCEL_GITHUB.md`: ruta desde el navegador para repositorio privado, importación detenida antes de Deploy, variables introducidas personalmente en Vercel, callback real y pruebas posteriores.

No se modificaron los componentes visuales ni los estilos Dark Navy. No se añadieron bases de datos, servicios de almacenamiento o workflows que ejecuten despliegues.

## Comprobaciones realizadas

| Comprobación           | Resultado                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite automatizada     | 55 pruebas aprobadas.                                                                                                                                                                                                     |
| TypeScript             | `npm run typecheck` aprobado.                                                                                                                                                                                             |
| Instalación limpia     | `npm ci` aprobado en una copia sin `.env.local`, dependencias ni build anteriores.                                                                                                                                        |
| Build de producción    | `npm run build` aprobado en esa copia, con Node.js 24, sin necesitar secretos reales.                                                                                                                                     |
| HTTP del build real    | 24 comprobaciones aprobadas: login, redirección privada, datos sin sesión, CSRF, callback inválido y limpieza de cookies Secure/HttpOnly/SameSite. Se comprueba también que DEMO_MODE no abre el dashboard en producción. |
| Separación de secretos | Ninguna dependencia local alcanzable desde los componentes cliente importa los módulos de tokens, configuración privada o transporte de Google.                                                                           |
| Archivos y logs        | Los recursos de cliente compilados y logs de instalación, build, tests y prueba HTTP no contienen la clave privada generada en este entorno. El código de errores no registra valores recibidos.                          |

## Lo que permanece pendiente

- Crear o elegir el repositorio privado y preparar la importación en tus cuentas. No se hizo push, no se conectó Vercel y no se ejecutó ningún despliegue remoto.
- Introducir personalmente las cuatro variables privadas en Vercel y mantener `DEMO_MODE=false`.
- Confirmar el dominio real. Puede definirse en `APP_URL` o usarse el dominio automático de producción; no se inventó una URL de tu proyecto. Registrar en Google Cloud ese origen HTTPS más `/api/auth/callback`.
- Ejecutar el build dentro de tu cuenta de Vercel, revisar sus logs y verificar la integración real con Google después de autorizar el despliegue. La compilación limpia local verifica portabilidad, pero no es una certificación de la ejecución aún no realizada en Vercel.
- Probar Drive, ETag y conflictos, Calendar, acceso de la cuenta autorizada y revocación con datos de prueba. No se utilizaron tus credenciales reales ni se escribieron documentos o eventos a través de esta aplicación.

No se activó facturación, planes de pago, dominios de pago ni recursos externos. La publicación y el primer despliegue manual quedan detenidos hasta tu confirmación.
