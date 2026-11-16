import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { errorResponse } from "../src/lib/errors";

test("configuración Vercel para Next.js y Node 24 con despliegues automáticos detenidos", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(config.framework, "nextjs");
  assert.equal(config.installCommand, "npm ci");
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(pkg.engines.node, "24.x");
  assert.equal(config.env, undefined);
  assert.equal(config.build?.env, undefined);
  assert.match(readFileSync(".vercelignore", "utf8"), /^\.env\*$/m);
});
test("ningún componente de cliente alcanza módulos de tokens o variables privadas", () => {
  const visited = new Set<string>();
  const forbidden = new Set([
    "auth.ts",
    "auth-config.ts",
    "auth-policy.ts",
    "oauth.ts",
    "google.ts",
    "backups.ts",
  ]);
  function visit(file: string) {
    if (visited.has(file)) return;
    visited.add(file);
    assert.equal(
      forbidden.has(file.split("/").at(-1)!),
      false,
      `Módulo de servidor alcanzable desde cliente: ${file}`,
    );
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /process\.env\.(GOOGLE_CLIENT_SECRET|SESSION_SECRET|ALLOWED_EMAIL)/,
    );
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of parsed.statements) {
      if (
        !ts.isImportDeclaration(node) ||
        !ts.isStringLiteral(node.moduleSpecifier) ||
        node.importClause?.isTypeOnly
      )
        continue;
      const name = node.moduleSpecifier.text;
      const base = name.startsWith("@/")
        ? resolve("src", name.slice(2))
        : name.startsWith(".")
          ? resolve(dirname(file), name)
          : null;
      if (!base) continue;
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
      ].find(existsSync);
      assert.ok(target, `Importación local no resuelta: ${name}`);
      visit(target!);
    }
  }
  for (const file of [
    "src/components/workspace.tsx",
    "src/components/google-panels.tsx",
    "src/components/ui/dialog.tsx",
  ])
    visit(resolve(file));
});
test("los errores internos no registran mensajes ni nombres controlados por excepciones", async () => {
  const original = console.error,
    recorded: unknown[][] = [];
  const marker = "unit-test-sensitive-value";
  const error = new Error(marker);
  error.name = marker;
  console.error = (...args) => {
    recorded.push(args);
  };
  try {
    const response = errorResponse(error);
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(recorded).includes(marker), false);
    assert.equal((await response.text()).includes(marker), false);
  } finally {
    console.error = original;
  }
});
