import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'public', 'notes-pdf');
await mkdir(destination, { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(path.join(source, name), path.join(destination, name), { recursive: true });
}
await cp(path.join(source, 'legacy/build/pdf.worker.min.mjs'), path.join(destination, 'pdf.worker.min.mjs'));
await cp(path.join(source, 'legacy/build/pdf.min.mjs'), path.join(destination, 'pdf.min.mjs'));
await cp(path.join(source, 'LICENSE'), path.join(destination, 'LICENSE'));
console.log('Notes PDF worker, fonts, CMaps and decoders prepared locally.');
