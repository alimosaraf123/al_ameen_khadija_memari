const path = require('path');
const sharp = require('sharp');
const { fork } = require('child_process');

let worker;
let pending;
let nextId = 0;
let inferenceQueue = Promise.resolve();

async function cleanHandwritingCrop(imageBuffer) {
  const { data, info } = await sharp(imageBuffer).greyscale().threshold(150).median(3)
    .raw().toBuffer({ resolveWithObject: true });
  const rowCounts = new Uint32Array(info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 128) rowCounts[y]++;
  }
  // Ignore scan background speckles and blank signature-box space. A plain
  // image trim retains isolated speckles and shrinks the actual text too far
  // when the handwriting model resizes the input to its fixed canvas.
  const active = Array.from(rowCounts, (count, y) => ({ count, y }))
    .filter(row => row.count >= Math.max(5, info.width * 0.012));
  if (!active.length) return imageBuffer;
  const bands = [];
  for (const row of active) {
    const band = bands[bands.length - 1];
    if (band && row.y - band.bottom <= Math.max(8, info.height * 0.04)) {
      band.bottom = row.y; band.ink += row.count;
    } else bands.push({ top: row.y, bottom: row.y, ink: row.count });
  }
  const band = bands.sort((a, b) => b.ink - a.ink)[0];
  const top = Math.max(0, band.top - 8), bottom = Math.min(info.height - 1, band.bottom + 8);
  const columns = new Uint32Array(info.width);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 128) columns[x]++;
  }
  const xs = Array.from(columns, (count, x) => ({ count, x })).filter(column => column.count >= 3);
  if (!xs.length) return imageBuffer;
  const left = Math.max(0, xs[0].x - 8), right = Math.min(info.width - 1, xs[xs.length - 1].x + 8);
  // Use the binary image only to locate the ink; retain the original stroke
  // shades for recognition (thresholding can merge overwritten signatures).
  return sharp(imageBuffer)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#fff' }).png().toBuffer();
}

function finish(error, text) {
  const job = pending;
  pending = null;
  if (worker) { worker.unref(); worker.channel?.unref(); }
  if (!job) return;
  clearTimeout(job.timeout);
  if (error) job.reject(error); else job.resolve(text);
}

function getWorker() {
  if (worker) return worker;
  const child = fork(path.join(__dirname, 'omrHandwritingWorker.cjs'), [], {
    serialization: 'advanced', windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  worker = child;
  child.on('message', message => {
    if (pending?.id !== message.id) return;
    finish(message.error ? new Error(message.error) : null, message.text);
  });
  child.on('error', error => { finish(error); if (worker === child) worker = null; });
  child.on('exit', code => {
    if (worker === child) {
      finish(new Error(`Handwriting recognition stopped (${code})`));
      worker = null;
    }
  });
  return child;
}

function readHandwriting(imageBuffer) {
  const job = inferenceQueue.then(async () => {
    const { data, info } = await sharp(imageBuffer)
      .trim({ background: '#ffffff', threshold: 40 })
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#ffffff' })
      .removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const child = getWorker();
    child.ref(); child.channel?.ref();
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        finish(new Error('Handwriting recognition timed out'));
        if (worker === child) worker = null;
        child.kill();
      }, 120000);
      pending = { id, resolve, reject, timeout };
      child.send({ id, data, width: info.width, height: info.height, channels: info.channels }, error => {
        if (error) finish(error);
      });
    });
  });
  inferenceQueue = job.catch(() => {});
  return job;
}

module.exports = { readHandwriting, cleanHandwritingCrop };
