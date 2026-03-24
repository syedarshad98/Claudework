'use strict';
const express = require('express');
const router  = express.Router();
const { getDb, nextSeq } = require('../db/tradeflow_db');

// GET all packing lists
router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT pl.*, e.enq_number, b.name AS buyer_name, b.company AS buyer_company
    FROM tf_packing_lists pl
    JOIN tf_enquiries e ON e.id = pl.enquiry_id
    JOIN tf_buyers    b ON b.id = pl.buyer_id
    ORDER BY pl.created_at DESC
  `).all();
  res.json(rows);
});

// GET single packing list with items
router.get('/:id', (req, res) => {
  const db = getDb();
  const pl = db.prepare(`
    SELECT pl.*,
           e.enq_number, e.delivery_date, e.delivery_addr,
           b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email,
           b.address AS buyer_address, b.city AS buyer_city, b.country AS buyer_country,
           b.gstin AS buyer_gstin, po.buyer_po_ref, po.po_date
    FROM tf_packing_lists pl
    JOIN tf_enquiries       e  ON e.id  = pl.enquiry_id
    JOIN tf_buyers          b  ON b.id  = pl.buyer_id
    JOIN tf_purchase_orders po ON po.id = pl.po_id
    WHERE pl.id = ?
  `).get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Packing list not found' });

  pl.items = db.prepare(`
    SELECT pki.*, p.code AS product_code
    FROM tf_packing_items pki
    LEFT JOIN tf_products p ON p.id = pki.product_id
    WHERE pki.packing_list_id = ?
  `).all(req.params.id);

  res.json(pl);
});

// POST create packing list from PO
router.post('/', (req, res) => {
  const db = getDb();
  const { po_id, marks, items = [] } = req.body;

  if (!po_id) return res.status(400).json({ error: 'po_id required' });
  if (!items.length) return res.status(400).json({ error: 'At least one packing item required' });

  const po = db.prepare(`
    SELECT po.*, pi.quotation_id, pi.gst_amount AS pi_gst
    FROM tf_purchase_orders po
    JOIN tf_proforma_invoices pi ON pi.id = po.pi_id
    WHERE po.id = ?
  `).get(po_id);
  if (!po) return res.status(404).json({ error: 'PO not found' });

  // Compute totals
  let total_cartons   = 0;
  let gross_weight_kg = 0;
  let net_weight_kg   = 0;
  let invoice_amount  = 0;
  let invoice_gst     = 0;

  items.forEach(it => {
    total_cartons   += parseInt(it.cartons)       || 0;
    gross_weight_kg += parseFloat(it.gross_weight_kg) || 0;
    net_weight_kg   += parseFloat(it.net_weight_kg)   || 0;
    const line_sub   = (parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0);
    const line_gst   = line_sub * ((parseFloat(it.gst_rate_pct) || 18) / 100);
    invoice_amount  += line_sub;
    invoice_gst     += line_gst;
    it.line_total    = line_sub + line_gst;
  });

  const invoice_total = invoice_amount + invoice_gst;
  const pl_number     = nextSeq('PL');
  const inv_number    = nextSeq('INV');

  const result = db.prepare(`
    INSERT INTO tf_packing_lists
      (pl_number, po_id, enquiry_id, buyer_id, total_cartons, gross_weight_kg, net_weight_kg, marks, invoice_number, invoice_amount, invoice_gst, invoice_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(pl_number, po_id, po.enquiry_id, po.buyer_id,
    total_cartons, gross_weight_kg, net_weight_kg, marks || null,
    inv_number, invoice_amount, invoice_gst, invoice_total);

  const plId = result.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO tf_packing_items (packing_list_id, product_id, description, hsn_code, qty, uom, cartons, gross_weight_kg, net_weight_kg, unit_price, gst_rate_pct, line_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  items.forEach(it => insertItem.run(plId, it.product_id || null, it.description, it.hsn_code || null, it.qty, it.uom || 'PCS', it.cartons || 1, it.gross_weight_kg || 0, it.net_weight_kg || 0, it.unit_price || 0, it.gst_rate_pct || 18, it.line_total || 0));

  // Advance enquiry stage
  db.prepare(`UPDATE tf_enquiries SET stage = 7, updated_at = datetime('now') WHERE id = ?`).run(po.enquiry_id);

  res.json({ id: plId, pl_number, invoice_number: inv_number });
});

// PATCH finalise packing list
router.patch('/:id', (req, res) => {
  const db = getDb();
  const pl = db.prepare('SELECT id FROM tf_packing_lists WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Not found' });

  const { status } = req.body;
  if (status) db.prepare(`UPDATE tf_packing_lists SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
