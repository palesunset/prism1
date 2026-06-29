import multer from 'multer';
import { csvUploadFileFilter } from '../middleware/security.js';

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: csvUploadFileFilter,
});

/** Read uploaded file from multer (memory buffer or 2.x stream API). */
export async function readUploadedFileBuffer(file) {
  if (!file) return null;
  if (Buffer.isBuffer(file.buffer)) return file.buffer;
  if (!file.stream) return null;
  const chunks = [];
  for await (const chunk of file.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
