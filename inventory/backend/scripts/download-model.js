/**
 * Downloads Llama 3.2 3B Instruct Q4_K_M (~2GB) into backend/models/.
 * Skipped when SKIP_OZ_MODEL_DOWNLOAD=1 or model file already exists.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MODEL_DIR = path.join(ROOT, 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'llama-3.2-3b-instruct-q4_k_m.gguf');
const MODEL_URL =
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf';

async function downloadModel() {
  if (process.env.SKIP_OZ_MODEL_DOWNLOAD === '1' || process.env.SKIP_OZ_MODEL_DOWNLOAD === 'true') {
    console.log('Skipping Oz model download (SKIP_OZ_MODEL_DOWNLOAD).');
    return;
  }

  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  if (fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size > 1_000_000_000) {
    console.log('Oz model already present:', MODEL_PATH);
    return;
  }

  console.log('Downloading Llama 3.2 3B Instruct (Q4_K_M, ~2GB)…');
  console.log('Set SKIP_OZ_MODEL_DOWNLOAD=1 to skip. One-time download.\n');

  const res = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!res.ok) {
    console.error('Download failed:', res.status, res.statusText);
    console.error('Run manually: npm run download-model');
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      console.warn('Continuing without model in CI (Oz local inference disabled for this install).');
      return;
    }
    process.exitCode = 1;
    return;
  }

  const tmp = `${MODEL_PATH}.part`;
  const body = res.body;
  if (!body) {
    console.error('No response body');
    process.exitCode = 1;
    return;
  }

  const out = createWriteStream(tmp);
  await pipeline(Readable.fromWeb(body), out);
  await fs.promises.rename(tmp, MODEL_PATH);
  console.log('\nModel saved to', MODEL_PATH);
}

downloadModel().catch((err) => {
  console.error('download-model error:', err?.message || err);
  process.exitCode = 1;
});
