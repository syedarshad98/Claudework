const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'manufacturing.db'));
db.pragma('journal_mode = WAL');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Clear existing data
db.exec(`
  DELETE FROM kpi;
  DELETE FROM production_hourly;
  DELETE FROM machines;
  DELETE FROM work_orders;
  DELETE FROM inventory;
  DELETE FROM quality_metrics;
  DELETE FROM alerts;
`);

// ── KPI ─────────────────────────────────────────────────────────────────────
db.prepare(`
  INSERT INTO kpi
    (id, units_produced, units_target, machine_uptime_pct, machines_offline,
     uptime_delta, defect_rate_pct, defect_threshold_pct,
     inventory_alerts, inventory_critical, inventory_low,
     open_work_orders, work_orders_in_progress, work_orders_completed_today)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(4812, 5000, 87.4, 2, -3.1, 2.3, 3.0, 3, 2, 1, 18, 6, 4);

// ── Production Hourly ────────────────────────────────────────────────────────
const insertProd = db.prepare(
  'INSERT INTO production_hourly (hour_label, day, units) VALUES (?, ?, ?)'
);

const todayData = [
  ['06:00', 280], ['07:30', 322], ['09:00', 358],
  ['10:30', 391], ['12:00', 540], ['13:30', 482],
  ['15:00', 511], ['16:30', 443], ['18:00', 418],
];
const yesterdayData = [
  ['06:00', 241], ['07:30', 274], ['09:00', 301],
  ['10:30', 328], ['12:00', 352], ['13:30', 314],
  ['15:00', 341], ['16:30', 293], ['18:00', 278],
];

for (const [h, u] of todayData)     insertProd.run(h, 'today',     u);
for (const [h, u] of yesterdayData) insertProd.run(h, 'yesterday', u);

// ── Machines (12 total) ──────────────────────────────────────────────────────
const insertMachine = db.prepare(
  'INSERT INTO machines (name, status, uptime_pct, status_message) VALUES (?, ?, ?, ?)'
);

const machines = [
  ['CNC Mill 01',       'online',  98.2, 'Uptime: 98.2%'],
  ['CNC Mill 02',       'online',  95.7, 'Uptime: 95.7%'],
  ['CNC Mill 03',       'online',  91.3, 'Uptime: 91.3%'],
  ['CNC Mill 04',       'warn',    72.0, 'Maintenance Due'],
  ['Stamping SP-01',    'online',  99.1, 'Uptime: 99.1%'],
  ['Stamping SP-02',    'online',  88.4, 'Uptime: 88.4%'],
  ['Welding WD-01',     'offline',  0.0, 'OFFLINE — Error E-04'],
  ['Assembly AS-01',    'offline',  0.0, 'OFFLINE — Calibrating'],
  ['Lathe LT-01',       'online',  93.5, 'Uptime: 93.5%'],
  ['Lathe LT-02',       'online',  97.8, 'Uptime: 97.8%'],
  ['Paint Line PL-01',  'online',  89.2, 'Uptime: 89.2%'],
  ['QC Station QC-01',  'online', 100.0, 'Uptime: 100.0%'],
];

for (const [name, status, uptime, msg] of machines)
  insertMachine.run(name, status, uptime, msg);

// ── Work Orders ──────────────────────────────────────────────────────────────
const insertWO = db.prepare(
  'INSERT INTO work_orders (order_id, name, due_time, line, progress_pct, status) VALUES (?, ?, ?, ?, ?, ?)'
);

const workOrders = [
  ['WO-2038', 'Engine Block Batch A',    '17:00',    'Line A', 82,  'on_time'],
  ['WO-2039', 'Transmission Housing',    '15:30',    'Line B', 100, 'done'],
  ['WO-2040', 'Suspension Arms × 400',   '18:00',    'Line C', 61,  'on_track'],
  ['WO-2041', 'Brake Caliper Set',       '14:00',    'Line A', 38,  'delayed'],
  ['WO-2042', 'Exhaust Manifold',        'Tomorrow', 'Line B', 15,  'scheduled'],
];

for (const [oid, name, due, line, pct, status] of workOrders)
  insertWO.run(oid, name, due, line, pct, status);

// ── Inventory ────────────────────────────────────────────────────────────────
const insertInv = db.prepare(
  'INSERT INTO inventory (name, level_pct, reorder_threshold_pct, alert_level) VALUES (?, ?, ?, ?)'
);

const inventory = [
  ['Steel Sheet (Grade A)',  12, 25, 'critical'],
  ['Aluminum Alloy 6061',    28, 25, 'low'],
  ['High-Str. Bolts M12',     8, 20, 'critical'],
  ['Titanium Fasteners',     74, 20, 'ok'],
  ['Rubber Seals (Set B)',   91, 15, 'ok'],
  ['Copper Wire (Spool)',    55, 15, 'ok'],
];

for (const [name, level, threshold, alert] of inventory)
  insertInv.run(name, level, threshold, alert);

// ── Quality Metrics ──────────────────────────────────────────────────────────
const insertQM = db.prepare(
  'INSERT INTO quality_metrics (category, label, pct, color) VALUES (?, ?, ?, ?)'
);

const qualityMetrics = [
  ['passed',            'Passed QC',         97.7, '#00e5a0'],
  ['surface_defect',    'Surface Defects',    1.1,  '#ff4455'],
  ['dimensional_error', 'Dimensional Error',  0.7,  '#ffaa00'],
  ['assembly_fault',    'Assembly Fault',     0.5,  '#a855f7'],
];

for (const [cat, label, pct, color] of qualityMetrics)
  insertQM.run(cat, label, pct, color);

// ── Alerts ───────────────────────────────────────────────────────────────────
const insertAlert = db.prepare(
  'INSERT INTO alerts (message_before, message_highlight, highlight_class, type) VALUES (?, ?, ?, ?)'
);

const alerts = [
  ['CNC-04 \u00a0',             '⬤ MAINTENANCE DUE',                   'dn', 'warn'],
  ['Line B throughput ',         '↑ 8% vs yesterday',                   'up', 'info'],
  ['Raw Steel inventory ',       '⬤ LOW STOCK — reorder recommended',   'dn', 'danger'],
  ['WO-2041 delayed by ',        '2.5 hrs',                             '',   'warn'],
  ['Defect rate ',               '↓ 0.3% improvement this shift',       'up', 'info'],
  ['Stamping Press SP-02 ',      '↑ back online',                       'up', 'success'],
  ['Assembly AS-01 ',            '⬤ OFFLINE — Calibrating',             'dn', 'danger'],
  ['Bolts M12 ',                 '⬤ CRITICAL — reorder now',            'dn', 'danger'],
  ['Unit target achievement ',   '↑ 96.2% of daily goal',               'up', 'info'],
];

for (const [before, highlight, cls, type] of alerts)
  insertAlert.run(before, highlight, cls, type);

console.log('✓ Database seeded successfully.');
db.close();
