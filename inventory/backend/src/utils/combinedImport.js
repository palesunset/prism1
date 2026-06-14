import db from '../db/index.js';
import { newId, isUniqueConstraintError, parseSiteCsvRow, parseCsvRow, normalizeSiteRowForInsert } from './helpers.js';
import {
  importEquipmentFromParsed,
  rowHasCompleteEquipment,
} from './equipmentImport.js';

export function processCombinedImport(rows) {
  const existing = db.prepare('SELECT id, plaid FROM sites').all();
  const existingByPlaid = new Map(existing.map((r) => [r.plaid, r]));
  const serialsBySite = new Map();
  const batchSerialsBySite = new Map();

  let sitesAdded = 0;
  let equipmentAdded = 0;
  const errors = [];

  function getSerialSets(siteId) {
    if (!serialsBySite.has(siteId)) {
      const existingSerials = new Set(
        db
          .prepare('SELECT serial_number FROM equipment WHERE site_id = ?')
          .all(siteId)
          .map((r) => r.serial_number)
      );
      serialsBySite.set(siteId, existingSerials);
    }
    if (!batchSerialsBySite.has(siteId)) {
      batchSerialsBySite.set(siteId, new Set());
    }
    return {
      existing: serialsBySite.get(siteId),
      batch: batchSerialsBySite.get(siteId),
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2;
    const raw = rows[i];
    const siteParsed = parseSiteCsvRow(raw);
    const equipParsed = parseCsvRow(raw);
    const hasCompleteEquipment = rowHasCompleteEquipment(equipParsed);

    const siteNorm = normalizeSiteRowForInsert(siteParsed);
    if (siteNorm.error) {
      errors.push({ line, message: siteNorm.error });
      continue;
    }

    let siteRow = existingByPlaid.get(siteNorm.plaid);

    if (!siteRow) {
      const id = newId();
      try {
        db.prepare(
          `INSERT INTO sites (id, name, plaid, area, territory, region, address, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          siteNorm.name,
          siteNorm.plaid,
          siteNorm.area,
          siteNorm.area,
          siteNorm.region,
          siteNorm.address ?? null,
          siteNorm.lat,
          siteNorm.lng
        );
        siteRow = { id, plaid: siteNorm.plaid };
        existingByPlaid.set(siteNorm.plaid, siteRow);
        sitesAdded++;
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          siteRow = db.prepare('SELECT id, plaid FROM sites WHERE plaid = ?').get(siteNorm.plaid);
          if (siteRow) existingByPlaid.set(siteNorm.plaid, siteRow);
          else {
            errors.push({ line, message: `Duplicate PLAID: ${siteNorm.plaid}` });
            continue;
          }
        } else {
          errors.push({ line, message: e.message || 'Site insert failed' });
          continue;
        }
      }
    }

    if (!hasCompleteEquipment) continue;

    const { existing, batch } = getSerialSets(siteRow.id);
    const result = importEquipmentFromParsed(siteRow.id, equipParsed, existing, batch);
    if (result.ok) {
      equipmentAdded++;
    } else {
      errors.push({ line, message: result.error });
    }
  }

  return {
    success: errors.length === 0,
    sites_added: sitesAdded,
    equipment_added: equipmentAdded,
    added: sitesAdded + equipmentAdded,
    skipped: errors.length,
    errors,
  };
}
