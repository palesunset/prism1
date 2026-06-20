import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.join(__dirname, '..', '..');
export const DEFAULT_OZ_MODEL_FILENAME = 'llama-3.2-3b-instruct-q4_k_m.gguf';
export const DEFAULT_OZ_MODEL_PATH = path.join(BACKEND_ROOT, 'models', DEFAULT_OZ_MODEL_FILENAME);

/**
 * Resolve the Oz GGUF model path from OZ_MODEL_PATH or the default under backend/models/.
 * Relative paths are resolved from the backend root (inventory/backend).
 */
export function resolveOzModelPath() {
  const configured = process.env.OZ_MODEL_PATH?.trim();
  if (!configured) {
    return DEFAULT_OZ_MODEL_PATH;
  }
  return path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(BACKEND_ROOT, configured);
}

export function usesDefaultOzModelPath(modelPath = resolveOzModelPath()) {
  return path.normalize(modelPath) === path.normalize(DEFAULT_OZ_MODEL_PATH);
}
