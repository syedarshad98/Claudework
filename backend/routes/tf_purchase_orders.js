'use strict';
const express = require('express');
const router  = express.Router();
const { getDb, nextSeq } = require('../db/tradeflow_db');

// GET all POs
router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT po.*, e.enq_number, b.name AS buyer_name, b.company AS buyer_company, pi.pi_number
    FROM tf_purchase_orders po
    JOIN tf_enquiries          e  ON e.id  = po.enquiry_id
    JOIN tf_buyers             b  ON b.id  = po.buyer_id
    JOIN tf_proforma_invoices  pi ON pi.id = po.pi_id
    ORDER BY po.created_at DESC
  `).all();
  res.json(rows);
});

// GET single PO
router.get('/:id', (req, res) => {
  const db = getDb();
  const po = db.prepare(`
    SELECT po.*,
           e.enq_number, e.delivery_date AS enq_delivery_date,
           b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email,
           b.phone AS buyer_phone, b.gstin AS buyer_gstin,
           pi.pi_number, pi.payment_terms AS pi_payment_terms, pi.total AS pi_total
    FROM tf_purchase_orders po
    JOIN tf_enquiries          e  ON e.id  = po.enquiry_id
    JOIN tf_buyers             b  ON b.id  = po.buyer_id
    JOIN tf_proforma_invoices  pi ON pi.id = po.pi_id
    WHERE po.id = ?
  `).get(req.params.id);
  if (!po) return res.status(404).json({ error: 'PO not found' });

  po.stock_reservations = db.prepare(`
    SELECT sr.*, p.code AS product_code, p.name AS product_name, p.stock_qty AS available_stock
    FROM tf_stock_reservations sr
    JOIN tf_products p ON p.id = sr.product_id
    WHERE sr.po_id = ?
  `).all(req.params.id);

  po.purchase_requisitions = db.prepare(`
    SELECT pr.*, p.code AS product_code, p.name AS product_name
    FROM tf_purchase_requisitions pr
    JOIN tf_products p ON p.id = pr.product_id
    WHERE pr.po_id = ?
  `).all(req.params.id);

  res.json(po);
});

// POST log buyer PO against PI
router.post('/', (req, res) => {
  const db = getDb();
  const { pi_id, buyer_po_ref, po_date, delivery_date, delivery_addr, payment_terms, special_terms, po_amount } = req.body;

  if (!pi_id || !buyer_po_ref) return res.status(400).json({ error: 'pi_id and buyer_po_ref required' });

  const pi = db.prepare('SELECT * FROM tf_proforma_invoices WHERE id = ?').get(pi_id);
  if (!pi) return res.status(404).json({ error: 'PI not found' });

  const existing = db.prepare('SELECT id FROM tf_purchase_orders WHERE pi_id = ?').get(pi_id);
  if (existing) return res.status(400).json({ error: 'PO already exists for this PI', po_id: existing.id });

  const po_number = nextSeq('PO');
  const result = db.prepare(`
    INSERT INTO tf_purchase_orders (po_number, pi_id, enquiry_id, buyer_id, buyer_po_ref, po_date, delivery_date, delivery_addr, payment_terms, special_terms, po_amount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(po_number, pi_id, pi.enquiry_id, pi.buyer_id,
    buyer_po_ref, po_date || new Date().toISOString().split('T')[0],
    delivery_date || null, delivery_addr || null,
    payment_terms || pi.payment_terms, special_terms || null,
    po_amount || pi.total);

  const poId = result.lastInsertRowid;

  // Update enquiry stage
  db.prepare(`UPDATE tf_enquiries SET stage = 5, status = 'po_received', updated_at = datetime('now') WHERE id = ?`).run(pi.enquiry_id);

  res.json({ id: poId, po_number });
});

// POST trigger inventory check
router.post('/:id/inventory-check', (req, res) => {
  const db = getDb();
  const po = db.prepare(`
    SELECT po.*, q.id AS quotation_id
    FROM tf_purchase_orders po
    JOIN tf_proforma_invoices pi ON pi.id = po.pi_id
    JOIN tf_quotations q ON q.id = pi.quotation_id
    WHERE po.id = ?
  `).get(req.params.id);
  if (!po) return res.status(404).json({ error: 'PO not found' });

  const qtItems = db.prepare(`
    SELECT qi.*, p.stock_qty
    FROM tf_quotation_items qi
    JOIN tf_products p ON p.id = qi.product_id
    WHERE qi.quotation_id = ? AND qi.product_id IS NOT NULL
  `).all(po.quotation_id);

  const insertRes = db.prepare(`
    INSERT OR IGNORE INTO tf_stock_reservations (po_id, product_id, required_qty, reserved_qty, shortfall_qty, status)
    VALUES (?,?,?,?,?,?)
  `);
  const insertPR = db.prepare(`
    INSERT INTO tf_purchase_requisitions (pr_number, po_id, product_id, required_qty, estimated_cost)
    VALUES (?,?,?,?,?)
  `);

  const reservations = [];
  qtItems.forEach(it => {
    const available = parseFloat(it.stock_qty) || 0;
    const required  = parseFloat(it.qty) || 0;
    const reserved  = Math.min(available, required);
    const shortfall = Math.max(0, required - available);
    const status    = shortfall > 0 ? (reserved > 0 ? 'partial' : 'shortage') : 'fulfilled';

    insertRes.run(po.id, it.product_id, required, reserved, shortfall, status);

    if (shortfall > 0) {
      const pr_number = nextSeq('PR');
      insertPR.run(pr_number, po.id, it.product_id, shortfall, null);
      // Reduce stock
      db.prepare(`UPDATE tf_products SET stock_qty = stock_qty - ? WHERE id = ?`).run(reserved, it.product_id);
    } else {
      db.prepare(`UPDATE tf_products SET stock_qty = stock_qty - ? WHERE id = ?`).run(required, it.product_id);
    }

    reservations.push({ product_id: it.product_id, required, reserved, shortfall, status });
  });

  db.prepare(`UPDATE tf_purchase_orders SET inventory_checked = 1, status = 'inventory_checked', updated_at = datetime('now') WHERE id = ?`).run(po.id);
  db.prepare(`UPDATE tf_enquiries SET stage = 6, updated_at = datetime('now') WHERE id = ?`).run(po.enquiry_id);

  res.json({ ok: true, reservations });
});

module.exports = router;
