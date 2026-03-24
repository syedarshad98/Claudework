'use strict';
const express = require('express');
const router  = express.Router();
const { getDb, nextSeq } = require('../db/tradeflow_db');

// GET all PIs
router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT pi.*, e.enq_number, b.name AS buyer_name, b.company AS buyer_company, q.quote_number
    FROM tf_proforma_invoices pi
    JOIN tf_enquiries  e ON e.id = pi.enquiry_id
    JOIN tf_buyers     b ON b.id = pi.buyer_id
    JOIN tf_quotations q ON q.id = pi.quotation_id
    ORDER BY pi.created_at DESC
  `).all();
  res.json(rows);
});

// GET single PI
router.get('/:id', (req, res) => {
  const db = getDb();
  const pi = db.prepare(`
    SELECT pi.*,
           e.enq_number, e.delivery_date, e.delivery_addr,
           b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email,
           b.phone AS buyer_phone, b.address AS buyer_address, b.city AS buyer_city,
           b.country AS buyer_country, b.gstin AS buyer_gstin,
           q.quote_number, q.validity_days, q.currency
    FROM tf_proforma_invoices pi
    JOIN tf_enquiries  e ON e.id = pi.enquiry_id
    JOIN tf_buyers     b ON b.id = pi.buyer_id
    JOIN tf_quotations q ON q.id = pi.quotation_id
    WHERE pi.id = ?
  `).get(req.params.id);
  if (!pi) return res.status(404).json({ error: 'PI not found' });

  // Get line items from quotation
  pi.items = db.prepare(`
    SELECT qi.*, p.code AS product_code
    FROM tf_quotation_items qi
    LEFT JOIN tf_products p ON p.id = qi.product_id
    WHERE qi.quotation_id = ?
  `).all(pi.quotation_id);

  res.json(pi);
});

// POST generate PI from approved quote
router.post('/', (req, res) => {
  const db = getDb();
  const { quotation_id, payment_terms, bank_name, bank_account, bank_ifsc, bank_branch, due_date, advance_pct, notes } = req.body;

  if (!quotation_id) return res.status(400).json({ error: 'quotation_id required' });

  const qt = db.prepare('SELECT * FROM tf_quotations WHERE id = ? AND status = ?').get(quotation_id, 'approved');
  if (!qt) return res.status(400).json({ error: 'Quotation not found or not approved' });

  // Check not already PI'd
  const existing = db.prepare('SELECT id FROM tf_proforma_invoices WHERE quotation_id = ?').get(quotation_id);
  if (existing) return res.status(400).json({ error: 'PI already generated for this quotation', pi_id: existing.id });

  const adv_pct = parseFloat(advance_pct) || 0;
  const adv_amt = qt.total * adv_pct / 100;
  const bal_amt = qt.total - adv_amt;

  const pi_number = nextSeq('PI');
  const result = db.prepare(`
    INSERT INTO tf_proforma_invoices
      (pi_number, quotation_id, enquiry_id, buyer_id, payment_terms, bank_name, bank_account, bank_ifsc, bank_branch, due_date, subtotal, gst_amount, total, advance_pct, advance_amount, balance_amount, status, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sent',datetime('now'))
  `).run(pi_number, quotation_id, qt.enquiry_id, qt.buyer_id,
    payment_terms || qt.payment_terms,
    bank_name    || 'State Bank of India',
    bank_account || 'XXXXXXXXXXXX',
    bank_ifsc    || 'SBIN0000XXX',
    bank_branch  || null,
    due_date     || null,
    qt.subtotal, qt.gst_amount, qt.total,
    adv_pct, adv_amt, bal_amt);

  const piId = result.lastInsertRowid;

  // Update enquiry stage
  db.prepare(`UPDATE tf_enquiries SET stage = 4, status = 'pi_sent', updated_at = datetime('now') WHERE id = ?`).run(qt.enquiry_id);

  res.json({ id: piId, pi_number });
});

// PATCH update PI status
router.patch('/:id', (req, res) => {
  const db = getDb();
  const pi = db.prepare('SELECT id FROM tf_proforma_invoices WHERE id = ?').get(req.params.id);
  if (!pi) return res.status(404).json({ error: 'Not found' });

  const { status } = req.body;
  if (status) db.prepare(`UPDATE tf_proforma_invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
