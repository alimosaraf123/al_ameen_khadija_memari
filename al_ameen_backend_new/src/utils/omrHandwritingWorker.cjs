// Keep the model runtime in its own process: it bundles a different libvips
// version from the main backend's Sharp image processor.
const path = require('path');
let recognizerPromise;
async function load() {
  if (!recognizerPromise) recognizerPromise = (async () => {
    const { env, pipeline, RawImage } = await import('@huggingface/transformers');
    env.cacheDir = path.join(__dirname, '../../tmp/omr-handwriting-model');
    const recognize = await pipeline('image-to-text', 'Xenova/trocr-small-handwritten', {
      dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    });
    return { recognize, RawImage };
  })();
  return recognizerPromise;
}
process.on('message', async message => {
  try {
    const { recognize, RawImage } = await load();
    const image = new RawImage(new Uint8Array(message.data), message.width, message.height, message.channels);
    const output = await recognize(image, { max_new_tokens: 40 });
    process.send({ id: message.id, text: String(output[0]?.generated_text || '').trim() });
  } catch (error) { process.send({ id: message.id, error: error.message }); }
});
process.on('disconnect', () => process.exit(0));
