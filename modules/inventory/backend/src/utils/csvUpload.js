import csv from 'csv-parser';
import { Readable } from 'stream';

/** Remove UTF-8 BOM so the first CSV header parses correctly (common in Excel / Windows exports). */
export function stripUtf8Bom(buffer) {
  if (!buffer || buffer.length < 3) return buffer;
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

export function normalizeCsvRowKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.charCodeAt(0) === 0xfeff ? key.slice(1) : key;
    out[normalized] = value;
  }
  return out;
}

export async function parseUploadCsvBuffer(buffer) {
  const cleaned = stripUtf8Bom(buffer);
  const rows = [];
  await new Promise((resolve, reject) => {
    Readable.from(cleaned)
      .pipe(csv())
      .on('data', (row) => rows.push(normalizeCsvRowKeys(row)))
      .on('end', resolve)
      .on('error', reject);
  });
  return rows;
}
