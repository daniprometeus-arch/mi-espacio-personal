import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { prepareLocal } from "../scripts/prepare-local.mjs";
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "mep-env-test-"));
  writeFileSync(
    join(directory, ".env.example"),
    "APP_URL=\nDEMO_MODE=true\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nALLOWED_EMAIL=\nSESSION_SECRET=\n",
  );
  writeFileSync(join(directory, ".gitignore"), ".env*\n!.env.example\n");
  return directory;
}
test("crea configuración privada, genera clave una sola vez y deja credenciales vacías", () => {
  const directory = fixture();
  try {
    const first = prepareLocal(directory);
    assert.equal(first.created, true);
    assert.equal(first.ignoreVerified, true);
    const path = join(directory, ".env.local"),
      content = readFileSync(path, "utf8");
    assert.match(content, /APP_URL=http:\/\/localhost:3000/);
    assert.match(content, /DEMO_MODE=false/);
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "ALLOWED_EMAIL",
    ])
      assert.match(content, new RegExp(`^${key}=$`, "m"));
    if (process.platform !== "win32") {
      assert.equal(first.sessionSecret, "generada");
      assert.match(content, /^SESSION_SECRET=[a-f0-9]{64}$/m);
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
    const second = prepareLocal(directory);
    assert.equal(second.created, false);
    assert.equal(readFileSync(path, "utf8"), content);
    assert.equal(
      JSON.stringify(second).includes(
        content.match(/SESSION_SECRET=(.*)/)?.[1] || "never-present",
      ),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("conserva credenciales, clave existente y variables adicionales", () => {
  const directory = fixture();
  try {
    const secret = randomBytes(32).toString("hex");
    const source = `APP_URL=https://example.invalid\nDEMO_MODE=true\nGOOGLE_CLIENT_ID=unit-test-only\nGOOGLE_CLIENT_SECRET="unit-test-not-real"\nALLOWED_EMAIL=owner@example.invalid\nSESSION_SECRET=${secret}\nOTHER_SETTING=keep-me\n`;
    writeFileSync(join(directory, ".env.local"), source, { mode: 0o600 });
    const result = prepareLocal(directory);
    assert.equal(result.sessionSecret, "conservada");
    const saved = readFileSync(join(directory, ".env.local"), "utf8");
    assert.equal(
      saved,
      source
        .replace("https://example.invalid", "http://localhost:3000")
        .replace("DEMO_MODE=true", "DEMO_MODE=false"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("sin exclusión Git no genera una clave", () => {
  const directory = fixture();
  try {
    writeFileSync(join(directory, ".gitignore"), "node_modules/\n");
    const result = prepareLocal(directory);
    assert.equal(result.ignoreVerified, false);
    assert.equal(result.sessionSecret, "pendiente");
    assert.match(
      readFileSync(join(directory, ".env.local"), "utf8"),
      /^SESSION_SECRET=$/m,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test(
  "rechaza enlaces simbólicos y no modifica el archivo de destino",
  { skip: process.platform === "win32" },
  () => {
    const directory = fixture();
    try {
      const target = join(directory, "target");
      writeFileSync(target, "do-not-touch");
      symlinkSync(target, join(directory, ".env.local"));
      assert.throws(() => prepareLocal(directory), /archivo regular/);
      assert.equal(readFileSync(target, "utf8"), "do-not-touch");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
test("rechaza variables duplicadas conservando todo el contenido", () => {
  const directory = fixture();
  try {
    const source = "APP_URL=\nAPP_URL=\n";
    writeFileSync(join(directory, ".env.local"), source, { mode: 0o600 });
    assert.throws(() => prepareLocal(directory), /duplicada/);
    assert.equal(readFileSync(join(directory, ".env.local"), "utf8"), source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
