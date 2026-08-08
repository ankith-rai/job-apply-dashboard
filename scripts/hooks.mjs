/**
 * Resolve hook so Node's native type-stripping can load the project's .ts
 * sources: the code uses extensionless relative imports and the "@/" alias,
 * neither of which Node's ESM resolver handles on its own.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Project root — this file lives in tests/, so one level up. */
const ROOT = path.dirname(fileURLToPath(new URL("./", import.meta.url)).replace(/\/$/, ""));

function firstExisting(base) {
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let base = null;
  if (specifier.startsWith("@/")) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const hit = firstExisting(base);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
