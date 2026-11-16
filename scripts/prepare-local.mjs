import {
  existsSync,
  lstatSync,
  statSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
  unlinkSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fields = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_EMAIL",
  "SESSION_SECRET",
];
const blank = (value) => /^\s*(?:""|'')?\s*(?:#.*)?$/.test(value);
function matches(content, key) {
  return [
    ...content.matchAll(
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=([^\\r\\n]*)$`, "gm"),
    ),
  ];
}
function setField(content, key, value, preserve = false) {
  const entries = matches(content, key);
  if (entries.length > 1)
    throw new Error(
      `La variable ${key} está duplicada. Resuélvelo en tu editor; no se modificó su valor.`,
    );
  if (!entries.length)
    return `${content}${content.endsWith("\n") ? "" : "\n"}${key}=${value}\n`;
  if (preserve && !blank(entries[0][1])) return content;
  const entry = entries[0];
  return (
    content.slice(0, entry.index) +
    `${key}=${value}` +
    content.slice(entry.index + entry[0].length)
  );
}

export function verifyIgnored(directory) {
  const ignore = readFileSync(join(directory, ".gitignore"), "utf8");
  const git = (cwd, args, input) =>
    spawnSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      input,
      windowsHide: true,
    });
  const repository = git(directory, ["rev-parse", "--show-toplevel"]);
  if (repository.error) return { verified: false, repository: false };
  if (repository.status === 0) {
    if (
      git(directory, ["ls-files", "--error-unmatch", "--", ".env.local"])
        .status === 0
    )
      throw new Error(
        ".env.local está rastreado por Git. Retíralo del índice y revisa su historial antes de guardar secretos.",
      );
    return {
      verified:
        git(directory, ["check-ignore", "--no-index", "--", ".env.local"])
          .status === 0,
      repository: true,
    };
  }
  // Todavía no hay repositorio: verificar las reglas con Git, sin inicializar el proyecto.
  const temporary = mkdtempSync(join(tmpdir(), "mep-ignore-"));
  try {
    if (git(temporary, ["init", "--quiet"]).status !== 0)
      return { verified: false, repository: false };
    writeFileSync(join(temporary, ".gitignore"), ignore, { mode: 0o600 });
    const result = git(
      temporary,
      ["check-ignore", "--no-index", "--stdin"],
      ".env.local\n.env.example\n",
    );
    return {
      verified: result.status === 0 && result.stdout.trim() === ".env.local",
      repository: false,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function prepareLocal(directory) {
  const path = join(directory, ".env.local");
  const parent = statSync(directory);
  const posix =
    process.platform !== "win32" && typeof process.getuid === "function";
  if (posix && (parent.uid !== process.getuid() || (parent.mode & 0o022) !== 0))
    throw new Error(
      "El directorio debe pertenecer a tu usuario y no permitir escritura de otros usuarios. No se generaron secretos.",
    );
  const ignore = verifyIgnored(directory);
  const created = !existsSync(path);
  if (created)
    writeFileSync(path, readFileSync(join(directory, ".env.example")), {
      flag: "wx",
      mode: 0o600,
    });
  const info = lstatSync(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    (posix && info.uid !== process.getuid())
  )
    throw new Error(
      ".env.local debe ser un archivo regular de tu usuario, sin enlaces simbólicos ni enlaces físicos adicionales.",
    );
  if (posix) chmodSync(path, 0o600);
  const original = readFileSync(path, "utf8");
  let content = setField(
    setField(original, "APP_URL", "http://localhost:3000"),
    "DEMO_MODE",
    "false",
  );
  for (const key of fields) content = setField(content, key, "", true);
  const needsSecret = blank(matches(content, "SESSION_SECRET")[0][1]);
  const privateStorage =
    posix && (statSync(path).mode & 0o777) === 0o600 && ignore.verified;
  if (needsSecret && privateStorage)
    content = setField(
      content,
      "SESSION_SECRET",
      randomBytes(32).toString("hex"),
    );
  if (content !== original) {
    const temporary = join(directory, `.env.local.prepare-${randomUUID()}`);
    try {
      writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
      const current = lstatSync(path);
      if (
        !current.isFile() ||
        current.ino !== info.ino ||
        current.nlink !== 1 ||
        readFileSync(path, "utf8") !== original
      )
        throw new Error(
          ".env.local cambió durante la preparación. Se conservó la versión existente; vuelve a ejecutar con el editor cerrado.",
        );
      renameSync(temporary, path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
  return {
    created,
    ignoreVerified: ignore.verified,
    repository: ignore.repository,
    privateStorage,
    sessionSecret: !needsSecret
      ? "conservada"
      : privateStorage
        ? "generada"
        : "pendiente",
    credentials: Object.fromEntries(
      fields
        .slice(0, 3)
        .map((key) => [
          key,
          blank(matches(content, key)[0][1])
            ? "pendiente"
            : "conservado (valor oculto)",
        ]),
    ),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = prepareLocal(
      dirname(dirname(fileURLToPath(import.meta.url))),
    );
    console.log(
      `.env.local: ${result.created ? "creado desde la plantilla" : "configuración existente conservada"}.`,
    );
    console.log("APP_URL: localhost:3000; DEMO_MODE: false.");
    console.log(
      `Exclusión Git: ${result.ignoreVerified ? "verificada" : "no verificada"}${result.repository ? "" : " (el proyecto aún no es un repositorio Git)"}.`,
    );
    console.log(
      `SESSION_SECRET: ${result.sessionSecret}; su valor no se muestra.`,
    );
    for (const [key, status] of Object.entries(result.credentials))
      console.log(`${key}: ${status}.`);
    if (!result.privateStorage)
      console.log(
        "No se pudo comprobar almacenamiento privado y exclusión Git; completa la clave solo en un entorno seguro. Consulta docs/SECRETOS_LOCALES.md.",
      );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "No se pudo preparar la configuración.",
    );
    process.exitCode = 1;
  }
}
