// Official English PaddleOCR model, running locally in one shared WASM worker.
import { env, InferenceSession, Tensor } from './runtime/ort.webgpu.min.mjs';
import { lineTensor, decodeLine } from './ctc.mjs';

env.wasm.numThreads = 1;
env.wasm.proxy = false;
env.logLevel = 'error';
env.wasm.wasmPaths = new URL('./runtime/', import.meta.url).href;
let model;
const prepare = () => model ??= (async () => {
  const [response, dictionary] = await Promise.all([
    fetch(new URL('./models/english-mobile/inference.onnx', import.meta.url)),
    fetch(new URL('./models/english-mobile/characters.json', import.meta.url)),
  ]);
  if (!response.ok || !dictionary.ok) throw new Error('localModelUnavailable');
  const characters = await dictionary.json();
  if (!Array.isArray(characters) || characters.length !== 438 || !characters.every(c => typeof c === 'string')) throw new Error('invalidDictionary');
  const session = await InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  // Compile first-run kernels during background preparation, before the pause.
  await session.run({ [session.inputNames[0]]: new Tensor('float32', new Float32Array(3 * 48 * 320), [1, 3, 48, 320]) });
  return { session, characters };
})().catch(error => { model = undefined; throw error; });

self.onmessage = async ({ data }) => {
  const { id, action, lines } = data;
  try {
    self.postMessage({ id, status: 'loading' });
    const { session, characters } = await prepare();
    if (action === 'prepare') { self.postMessage({ id, status: 'done', texts: [] }); return; }
    if (!Array.isArray(lines) || lines.length > 16) throw new Error('invalidLines');
    self.postMessage({ id, status: 'recognizing' });
    const texts = [];
    for (const line of lines) {
      if (!Number.isInteger(line.width) || !Number.isInteger(line.height) || line.width < 1 || line.height < 1 || line.width > 2048 || line.height > 512 || line.pixels.byteLength !== line.width * line.height * 4) throw new Error('invalidCrop');
      const input = lineTensor(new Uint8ClampedArray(line.pixels), line.width, line.height);
      const output = await session.run({ [session.inputNames[0]]: new Tensor('float32', input.data, [1, 3, 48, input.width]) });
      const tensor = output[session.outputNames[0]], [, steps, classes] = tensor.dims;
      if (classes !== characters.length) throw new Error('invalidOutput');
      texts.push(decodeLine(tensor.data, steps, classes, characters));
    }
    self.postMessage({ id, status: 'done', texts });
  } catch {
    // No handwriting or vendor error payload leaves this worker in diagnostics.
    self.postMessage({ id, status: 'error' });
  }
};
