import { loadEnvFile } from "node:process";
import { authConfig } from "../src/lib/auth-config";
import { OAUTH_SCOPES } from "../src/lib/auth-policy";

// Node conserva las variables ya presentes; .env.local tiene prioridad sobre .env.
for (const path of [".env.local", ".env"]) {
  try {
    loadEnvFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`No se pudo leer ${path}. Revisa sus permisos y formato.`);
      process.exit(1);
    }
  }
}
for (const name of [
  "APP_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_EMAIL",
  "SESSION_SECRET",
])
  console.log(
    `${name}: ${process.env[name]?.trim() ? "presente (valor oculto)" : "pendiente"}`,
  );
try {
  const config = authConfig();
  if (process.env.DEMO_MODE === "true")
    throw new Error(
      "Desactiva DEMO_MODE para comprobar la autenticación real.",
    );
  console.log(
    "Configuración local válida por formato. No se han contactado servicios de Google.",
  );
  console.log(
    `Redirect URI que debes registrar: ${config.origin}/api/auth/callback`,
  );
  console.log("Scopes solicitados:");
  for (const scope of OAUTH_SCOPES) console.log(`- ${scope}`);
  console.log(
    "No se imprimieron el correo autorizado, el ID OAuth, el secreto del cliente ni SESSION_SECRET.",
  );
  console.log(
    "Esto no certifica credenciales, API habilitadas ni acceso real; se verificarán después de configurar Google Cloud.",
  );
} catch (error) {
  console.error("Configuración pendiente.");
  console.error(
    error instanceof Error ? error.message : "Revisa docs/GOOGLE_CLOUD.md.",
  );
  process.exitCode = 1;
}
