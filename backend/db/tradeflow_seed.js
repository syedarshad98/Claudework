'use strict';
const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DB_PATH  = path.join(__dirname, 'tradeflow.db');
const db       = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'tradeflow_schema.sql'), 'utf8');
db.exec(schema);

// ── Helper: next sequence number ────────────────────────────
function nextSeq(prefix) {
  const row = db.prepare('SELECT last_seq FROM tf_sequences WHERE prefix = ?').get(prefix);
  const next = (row ? row.last_seq : 0) + 1;
  db.prepare('UPDATE tf_sequences SET last_seq = ? WHERE prefix = ?').run(next, prefix);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

// ── Seed buyers ─────────────────────────────────────────────
const buyers = [
  { name: 'Rajesh Mehta', company: 'Mehta Traders Pvt Ltd', email: 'rajesh@mehtatraders.com', phone: '9876543210', whatsapp: '9876543210', address: '12, MG Road', city: 'Mumbai', country: 'India', gstin: '27AABCM1234A1Z5', pan: 'AABCM1234A' },
  { name: 'Priya Singh', company: 'Singh Exports', email: 'priya@singhexports.com', phone: '9812345678', whatsapp: '9812345678', address: '45, Sector 18', city: 'Delhi', country: 'India', gstin: '07AADCS5678B1Z3', pan: 'AADCS5678B' },
  { name: 'Ahmed Al-Farsi', company: 'Al-Farsi Trading LLC', email: 'ahmed@alfarsi.ae', phone: '+971501234567', whatsapp: '+971501234567', address: 'Al Quoz Industrial Area', city: 'Dubai', country: 'UAE', gstin: null, pan: null },
  { name: 'Lin Wei', company: 'Wei Industrial Co.', email: 'lin@weiind.cn', phone: '+8613812345678', whatsapp: null, address: 'Shenzhen Industrial Park', city: 'Shenzhen', country: 'China', gstin: null, pan: null },
  { name: 'Suresh Patel', company: 'Patel Hardware & Tools', email: 'suresh@patelhw.com', phone: '9654321098', whatsapp: '9654321098', address: '78, GIDC', city: 'Ahmedabad', country: 'India', gstin: '24AACCP4321C1Z8', pan: 'AACCP4321C' },
];

const insertBuyer = db.prepare(`
  INSERT OR IGNORE INTO tf_buyers (name, company, email, phone, whatsapp, address, city, country, gstin, pan)
  VALUES (@name, @company, @email, @phone, @whatsapp, @address, @city, @country, @gstin, @pan)
`);
buyers.forEach(b => insertBuyer.run(b));

// ── Seed products ────────────────────────────────────────────
const products = [
  { code: 'SS-PIPE-25',  name: 'SS Pipe 25mm',              description: 'Stainless Steel Pipe 25mm OD, 2mm thick, 6m length', hsn_code: '73041910', uom: 'MTR', base_price: 850,  gst_rate_pct: 18, stock_qty: 500,  reorder_qty: 100 },
  { code: 'MS-PLT-6MM',  name: 'MS Plate 6mm',              description: 'Mild Steel Plate 6mm thick, 2440x1220mm',             hsn_code: '72085110', uom: 'KG',  base_price: 65,   gst_rate_pct: 18, stock_qty: 8000, reorder_qty: 2000 },
  { code: 'BOLT-M12-SS', name: 'Bolt M12x50 SS',            description: 'Stainless Steel Hex Bolt M12x50mm Grade 316',         hsn_code: '73181510', uom: 'PCS', base_price: 28,   gst_rate_pct: 18, stock_qty: 5000, reorder_qty: 1000 },
  { code: 'VALVE-GATE-2',name: 'Gate Valve 2 inch',         description: 'Cast Iron Gate Valve 2 inch PN16',                   hsn_code: '84818010', uom: 'PCS', base_price: 1200, gst_rate_pct: 18, stock_qty: 200,  reorder_qty: 50 },
  { code: 'PUMP-CENT-5HP',name:'Centrifugal Pump 5HP',      description: '5HP Centrifugal Water Pump 3-phase',                 hsn_code: '84137010', uom: 'PCS', base_price: 18500,gst_rate_pct: 18, stock_qty: 25,   reorder_qty: 5 },
  { code: 'GASKET-RING',  name: 'Ring Gasket 150#',         description: 'Spiral Wound Ring Gasket 150# SS+Graphite',          hsn_code: '84841000', uom: 'PCS', base_price: 320,  gst_rate_pct: 18, stock_qty: 1500, reorder_qty: 300 },
  { code: 'FLANGE-150-2', name: 'Flange 2" 150#',           description: 'Carbon Steel Weld Neck Flange 2" 150# ANSI B16.5',   hsn_code: '73079100', uom: 'PCS', base_price: 650,  gst_rate_pct: 18, stock_qty: 800,  reorder_qty: 200 },
  { code: 'CABLE-4SQ',   name: 'Armoured Cable 4sq mm',     description: '4-core 4sq mm Armoured PVC Cable (per meter)',       hsn_code: '85441100', uom: 'MTR', base_price: 185,  gst_rate_pct: 18, stock_qty: 3000, reorder_qty: 500 },
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO tf_products (code, name, description, hsn_code, uom, base_price, gst_rate_pct, stock_qty, reorder_qty)
  VALUES (@code, @name, @description, @hsn_code, @uom, @base_price, @gst_rate_pct, @stock_qty, @reorder_qty)
`);
products.forEach(p => insertProduct.run(p));

// ── Seed sample workflow ─────────────────────────────────────
function seedSampleWorkflow() {
  const existing = db.prepare("SELECT COUNT(*) as cnt FROM tf_enquiries").get();
  if (existing.cnt > 0) return; // already seeded

  const buyer1 = db.prepare("SELECT id FROM tf_buyers WHERE company = 'Mehta Traders Pvt Ltd'").get();
  const buyer2 = db.prepare("SELECT id FROM tf_buyers WHERE company = 'Singh Exports'").get();
  const buyer3 = db.prepare("SELECT id FROM tf_buyers WHERE company = 'Al-Farsi Trading LLC'").get();
  const prod1  = db.prepare("SELECT id FROM tf_products WHERE code = 'SS-PIPE-25'").get();
  const prod2  = db.prepare("SELECT id FROM tf_products WHERE code = 'BOLT-M12-SS'").get();
  const prod3  = db.prepare("SELECT id FROM tf_products WHERE code = 'VALVE-GATE-2'").get();
  const prod4  = db.prepare("SELECT id FROM tf_products WHERE code = 'PUMP-CENT-5HP'").get();

  // ── Enquiry 1 (fully dispatched - all 8 stages) ─────────
  const enq1Id = db.prepare(`
    INSERT INTO tf_enquiries (enq_number, buyer_id, source, subject, raw_text, delivery_date, delivery_addr, stage, status)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('ENQ'), buyer1.id, 'email',
    'Requirement: SS Pipes and Bolts',
    'Hi, We need 200 mtrs of SS Pipe 25mm and 2000 nos of M12 Bolts. Delivery needed by end of month to our Mumbai warehouse.',
    '2026-03-31', '12, MG Road, Andheri, Mumbai 400053', 8, 'dispatched').lastInsertRowid;

  db.prepare(`INSERT INTO tf_enquiry_items (enquiry_id, product_id, description, qty, uom) VALUES (?,?,?,?,?)`).run(enq1Id, prod1.id, 'SS Pipe 25mm OD 2mm thick', 200, 'MTR');
  db.prepare(`INSERT INTO tf_enquiry_items (enquiry_id, product_id, description, qty, uom) VALUES (?,?,?,?,?)`).run(enq1Id, prod2.id, 'SS Hex Bolt M12x50mm Grade 316', 2000, 'PCS');

  // Quote for Enquiry 1
  const qt1Id = db.prepare(`
    INSERT INTO tf_quotations (quote_number, enquiry_id, buyer_id, version, validity_days, payment_terms, subtotal, gst_amount, total, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(nextSeq('QT'), enq1Id, buyer1.id, 1, 30, 'Net 30 days', 226000, 40680, 266680, 'approved').lastInsertRowid;

  db.prepare(`INSERT INTO tf_quotation_items (quotation_id, product_id, description, hsn_code, qty, uom, unit_price, gst_rate_pct, line_subtotal, gst_amount, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(qt1Id, prod1.id, 'SS Pipe 25mm', '73041910', 200, 'MTR', 850, 18, 170000, 30600, 200600);
  db.prepare(`INSERT INTO tf_quotation_items (quotation_id, product_id, description, hsn_code, qty, uom, unit_price, gst_rate_pct, line_subtotal, gst_amount, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(qt1Id, prod2.id, 'SS Bolt M12x50', '73181510', 2000, 'PCS', 28, 18, 56000, 10080, 66080);

  db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes) VALUES (?,?,?,?)`).run(qt1Id, 'sent', 'system', 'Quote sent via email');
  db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes) VALUES (?,?,?,?)`).run(qt1Id, 'approved', 'buyer', 'Approved as-is. Please send PI.');

  // PI
  const pi1Id = db.prepare(`
    INSERT INTO tf_proforma_invoices (pi_number, quotation_id, enquiry_id, buyer_id, payment_terms, due_date, subtotal, gst_amount, total, advance_pct, advance_amount, balance_amount, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(nextSeq('PI'), qt1Id, enq1Id, buyer1.id, 'Net 30 days', '2026-02-28', 226000, 40680, 266680, 30, 80004, 186676, 'paid').lastInsertRowid;

  // PO
  const po1Id = db.prepare(`
    INSERT INTO tf_purchase_orders (po_number, pi_id, enquiry_id, buyer_id, buyer_po_ref, po_date, delivery_date, delivery_addr, payment_terms, po_amount, inventory_checked, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('PO'), pi1Id, enq1Id, buyer1.id, 'MT/PO/2026/001', '2026-02-10', '2026-03-31', '12, MG Road, Andheri, Mumbai 400053', 'Net 30 days', 266680, 1, 'dispatched').lastInsertRowid;

  db.prepare(`INSERT INTO tf_stock_reservations (po_id, product_id, required_qty, reserved_qty, shortfall_qty, status) VALUES (?,?,?,?,?,?)`).run(po1Id, prod1.id, 200, 200, 0, 'fulfilled');
  db.prepare(`INSERT INTO tf_stock_reservations (po_id, product_id, required_qty, reserved_qty, shortfall_qty, status) VALUES (?,?,?,?,?,?)`).run(po1Id, prod2.id, 2000, 2000, 0, 'fulfilled');

  // Packing list
  const pl1Id = db.prepare(`
    INSERT INTO tf_packing_lists (pl_number, po_id, enquiry_id, buyer_id, total_cartons, gross_weight_kg, net_weight_kg, marks, invoice_number, invoice_amount, invoice_gst, invoice_total, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('PL'), po1Id, enq1Id, buyer1.id, 12, 485.5, 460.0, 'MT/2026/001 — MUMBAI', nextSeq('INV'), 226000, 40680, 266680, 'dispatched').lastInsertRowid;

  db.prepare(`INSERT INTO tf_packing_items (packing_list_id, product_id, description, hsn_code, qty, uom, cartons, gross_weight_kg, net_weight_kg, unit_price, gst_rate_pct, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(pl1Id, prod1.id, 'SS Pipe 25mm', '73041910', 200, 'MTR', 8, 340, 320, 850, 18, 200600);
  db.prepare(`INSERT INTO tf_packing_items (packing_list_id, product_id, description, hsn_code, qty, uom, cartons, gross_weight_kg, net_weight_kg, unit_price, gst_rate_pct, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(pl1Id, prod2.id, 'SS Bolt M12x50', '73181510', 2000, 'PCS', 4, 145.5, 140, 28, 18, 66080);

  // Shipping
  db.prepare(`INSERT INTO tf_shipping_docs (packing_list_id, enquiry_id, buyer_id, shipment_type, eway_bill_no, eway_bill_date, transporter, vehicle_no, dispatch_date, status) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(pl1Id, enq1Id, buyer1.id, 'domestic', 'EWB/2026/MT001', '2026-03-15', 'Gati Logistics', 'MH-01-AB-1234', '2026-03-15', 'delivered');

  // ── Enquiry 2 (at Stage 5 — PO received) ───────────────
  const enq2Id = db.prepare(`
    INSERT INTO tf_enquiries (enq_number, buyer_id, source, subject, raw_text, delivery_date, delivery_addr, stage, status)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('ENQ'), buyer2.id, 'whatsapp',
    'Urgent: Gate Valves and Gaskets',
    'Need 50 nos gate valve 2 inch and 300 ring gaskets for our pipeline project. Delivery to Delhi site by 15 April.',
    '2026-04-15', '45, Sector 18, Noida, UP 201301', 5, 'po_received').lastInsertRowid;

  db.prepare(`INSERT INTO tf_enquiry_items (enquiry_id, product_id, description, qty, uom) VALUES (?,?,?,?,?)`).run(enq2Id, prod3.id, 'Cast Iron Gate Valve 2" PN16', 50, 'PCS');

  const qt2Id = db.prepare(`
    INSERT INTO tf_quotations (quote_number, enquiry_id, buyer_id, version, validity_days, payment_terms, subtotal, gst_amount, total, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(nextSeq('QT'), enq2Id, buyer2.id, 1, 21, 'Advance 50%, Balance on delivery', 60000, 10800, 70800, 'approved').lastInsertRowid;

  db.prepare(`INSERT INTO tf_quotation_items (quotation_id, product_id, description, hsn_code, qty, uom, unit_price, gst_rate_pct, line_subtotal, gst_amount, line_total) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(qt2Id, prod3.id, 'Gate Valve 2 inch PN16', '84818010', 50, 'PCS', 1200, 18, 60000, 10800, 70800);

  db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes) VALUES (?,?,?,?)`).run(qt2Id, 'sent', 'system', 'Sent via WhatsApp');
  db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes) VALUES (?,?,?,?)`).run(qt2Id, 'approved', 'buyer', 'OK. Send PI with bank details.');

  const pi2Id = db.prepare(`
    INSERT INTO tf_proforma_invoices (pi_number, quotation_id, enquiry_id, buyer_id, payment_terms, due_date, subtotal, gst_amount, total, advance_pct, advance_amount, balance_amount, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(nextSeq('PI'), qt2Id, enq2Id, buyer2.id, 'Advance 50%, Balance on delivery', '2026-03-30', 60000, 10800, 70800, 50, 35400, 35400, 'partially_paid').lastInsertRowid;

  db.prepare(`
    INSERT INTO tf_purchase_orders (po_number, pi_id, enquiry_id, buyer_id, buyer_po_ref, po_date, delivery_date, delivery_addr, payment_terms, po_amount, inventory_checked, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('PO'), pi2Id, enq2Id, buyer2.id, 'SE/PO/26/087', '2026-03-20', '2026-04-15', '45, Sector 18, Noida, UP 201301', 'Advance 50%, Balance on delivery', 70800, 0, 'received');

  // ── Enquiry 3 (at Stage 2 — Quote draft) ───────────────
  const enq3Id = db.prepare(`
    INSERT INTO tf_enquiries (enq_number, buyer_id, source, subject, raw_text, delivery_date, delivery_addr, stage, status)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(nextSeq('ENQ'), buyer3.id, 'email',
    'Export Enquiry: Centrifugal Pumps',
    'Dear Sir, We are interested in procuring 5 units of 5HP centrifugal pumps for our facility in Dubai. Please provide best CIF Dubai price with export documentation.',
    '2026-05-01', 'Al Quoz Industrial Area, Dubai, UAE', 2, 'quoted').lastInsertRowid;

  db.prepare(`INSERT INTO tf_enquiry_items (enquiry_id, product_id, description, qty, uom) VALUES (?,?,?,?,?)`).run(enq3Id, prod4.id, '5HP Centrifugal Pump 3-phase', 5, 'PCS');

  db.prepare(`
    INSERT INTO tf_quotations (quote_number, enquiry_id, buyer_id, version, validity_days, payment_terms, subtotal, gst_amount, total, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `).run(nextSeq('QT'), enq3Id, buyer3.id, 1, 15, 'LC at sight', 92500, 0, 92500, 'sent').lastInsertRowid;
}

seedSampleWorkflow();

console.log('✓ TradeFlow database seeded successfully at', DB_PATH);
module.exports = db;
