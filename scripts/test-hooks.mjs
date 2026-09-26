// Lets `node --test` run the app's TypeScript lib code as-is (Node strips the
// types natively): resolves the `@/` path alias and extensionless relative
// imports the way the Next bundler does. No test framework / dependency needed.
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const EXTS = ["", ".ts", ".tsx", ".js", "/index.ts"];
const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

registerHooks({
  resolve(specifier, context, next) {
    let base = null;
    if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
    // Only the app's own files: packages resolve their relative requires themselves.
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !context.parentURL.includes("/node_modules/"))
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (base) {
      for (const ext of EXTS) {
        if (isFile(base + ext)) return next(pathToFileURL(base + ext).href, context);
      }
    }
    return next(specifier, context);
  },
});
