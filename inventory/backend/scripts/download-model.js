/**
 * Downloads the default Llama 3.2 3B Instruct Q4_K_M (~2GB) into backend/models/.
 * Skipped when SKIP_OZ_MODEL_DOWNLOAD=1, a custom OZ_MODEL_PATH is set, or the file exists.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  resolveOzModelPath,
  usesDefaultOzModelPath,
} from '../src/utils/ozModelPath.js';

const MODEL_PATH = resolveOzModelPath();
const MODEL_DIR = path.dirname(MODEL_PATH);
const MODEL_URL =
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf';

async function downloadModel() {
  if (process.env.SKIP_OZ_MODEL_DOWNLOAD === '1' || process.env.SKIP_OZ_MODEL_DOWNLOAD === 'true') {
    console.log('Skipping Oz model download (SKIP_OZ_MODEL_DOWNLOAD).');
    return;
  }

  if (!usesDefaultOzModelPath(MODEL_PATH)) {
    console.log('OZ_MODEL_PATH is set to a custom model file. Skipping default download.');
    console.log('Place your GGUF at:', MODEL_PATH);
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
  console.log('Set SKIP_OZ_MODEL_DOWNLOAD=1 to skip. One-time download.');
  console.log('For a different model, set OZ_MODEL_PATH in backend/.env and add your own GGUF.\n');

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
