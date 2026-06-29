import db from "./db/index.js";
import { formatPgError } from "prism-db";
import { escapeCsvCell } from "./middleware/security.js";

const INVENTORY_API = "/api/inventory";

/** Heavy inventory routes — loaded on first non-bootstrap request. */
export async function mountInventoryRoutes(router) {
  const [
    { default: sitesRouter },
    { default: equipmentRouter },
    { default: slotsRouter },
    { default: portsRouter },
    { default: searchRouter },
    { default: statsRouter },
    { default: equipmentBaysRouter },
    { default: dashboardRouter },
    { default: integrityRouter },
  ] = await Promise.all([
    import("./routes/sites.js"),
    import("./routes/equipment.js"),
    import("./routes/slots.js"),
    import("./routes/ports.js"),
    import("./routes/search.js"),
    import("./routes/stats.js"),
    import("./routes/equipmentBays.js"),
    import("./routes/dashboard.js"),
    import("./routes/integrity.js"),
  ]);

  router.use(`${INVENTORY_API}/sites`, sitesRouter);
  router.use(`${INVENTORY_API}/equipment`, equipmentRouter);
  router.use(`${INVENTORY_API}/slots`, slotsRouter);
  router.use(`${INVENTORY_API}/ports`, portsRouter);
  router.use(INVENTORY_API, equipmentBaysRouter);
  router.use(INVENTORY_API, statsRouter);
  router.use(INVENTORY_API, searchRouter);
  router.use(`${INVENTORY_API}/dashboard`, dashboardRouter);
  router.use(INVENTORY_API, integrityRouter);

  router.get(`${INVENTORY_API}/export/equipment`, async (_req, res) => {
    const rows = await db
      .prepare(
        `
    SELECT
      s.name AS site_name,
      s.plaid AS site_plaid,
      s.area,
      s.region,
      e.vendor,
      e.model,
      COALESCE(NULLIF(TRIM(e.network_element), ''), e.model) AS network_element,
      e.serial_number,
      e.ip_address,
      e.software_version,
      e.descriptor_version,
      e.status,
      e.rack_position,
      e.end_of_life,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    GROUP BY e.id, s.id
    ORDER BY s.name, e.vendor, e.model
  `,
      )
      .all();

    const header = [
      "Site Name",
      "PLAID",
      "Area",
      "Region",
      "Vendor",
      "Network Element",
      "Model",
      "Serial Number",
      "IP Address",
      "Software Version",
      "Descriptor Version",
      "Status",
      "Rack Position",
      "End of Life",
      "Total Ports",
      "Utilized Ports",
      "Free Ports",
      "Utilization %",
    ];
    const lines = [header.join(",")];
    for (const e of rows) {
      const total = e.total_ports || 0;
      const used = e.utilized_ports || 0;
      const free = total - used;
      const pct = total > 0 ? ((used / total) * 100).toFixed(1) : "0.0";
      lines.push(
        [
          escapeCsvCell(e.site_name),
          escapeCsvCell(e.site_plaid),
          escapeCsvCell(e.area),
          escapeCsvCell(e.region),
          escapeCsvCell(e.vendor),
          escapeCsvCell(e.network_element),
          escapeCsvCell(e.model),
          escapeCsvCell(e.serial_number),
          escapeCsvCell(e.ip_address),
          escapeCsvCell(e.software_version),
          escapeCsvCell(e.descriptor_version),
          escapeCsvCell(e.status),
          escapeCsvCell(e.rack_position),
          escapeCsvCell(e.end_of_life),
          total,
          used,
          free,
          pct,
        ].join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="all-equipment-export.csv"');
    res.send(lines.join("\n"));
  });
}
