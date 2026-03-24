'use strict';
const express = require('express');
const router  = express.Router();
const { getDb, nextSeq } = require('../db/tradeflow_db');

// GET all quotations
router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT q.*, e.enq_number, b.name AS buyer_name, b.company AS buyer_company
    FROM tf_quotations q
    JOIN tf_enquiries e ON e.id = q.enquiry_id
    JOIN tf_buyers    b ON b.id = q.buyer_id
    ORDER BY q.created_at DESC
  `).all();
  res.json(rows);
});

// GET single quotation with line items and negotiation history
router.get('/:id', (req, res) => {
  const db  = getDb();
  const qt  = db.prepare(`
    SELECT q.*,
           e.enq_number, e.delivery_date, e.delivery_addr, e.raw_text,
           b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email,
           b.phone AS buyer_phone, b.whatsapp AS buyer_whatsapp,
           b.address AS buyer_address, b.city AS buyer_city, b.country AS buyer_country,
           b.gstin AS buyer_gstin
    FROM tf_quotations q
    JOIN tf_enquiries e ON e.id = q.enquiry_id
    JOIN tf_buyers    b ON b.id = q.buyer_id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!qt) return res.status(404).json({ error: 'Quotation not found' });

  qt.items = db.prepare(`
    SELECT qi.*, p.code AS product_code
    FROM tf_quotation_items qi
    LEFT JOIN tf_products p ON p.id = qi.product_id
    WHERE qi.quotation_id = ?
  `).all(req.params.id);

  qt.negotiations = db.prepare(`
    SELECT * FROM tf_quote_negotiations WHERE quotation_id = ? ORDER BY created_at ASC
  `).all(req.params.id);

  res.json(qt);
});

// POST create quotation from enquiry
router.post('/', (req, res) => {
  const db = getDb();
  const { enquiry_id, validity_days, payment_terms, currency, discount_pct, notes, items = [] } = req.body;

  if (!enquiry_id) return res.status(400).json({ error: 'enquiry_id required' });
  if (!items.length) return res.status(400).json({ error: 'At least one line item required' });

  const enq = db.prepare('SELECT * FROM tf_enquiries WHERE id = ?').get(enquiry_id);
  if (!enq) return res.status(404).json({ error: 'Enquiry not found' });

  // Compute totals
  let subtotal = 0, gst_amount = 0;
  const computed = items.map(it => {
    const qty       = parseFloat(it.qty) || 0;
    const unit_price= parseFloat(it.unit_price) || 0;
    const disc_pct  = parseFloat(it.discount_pct) || 0;
    const gst_pct   = parseFloat(it.gst_rate_pct) || 18;
    const line_sub  = qty * unit_price * (1 - disc_pct / 100);
    const line_gst  = line_sub * gst_pct / 100;
    subtotal   += line_sub;
    gst_amount += line_gst;
    return { ...it, line_subtotal: line_sub, gst_amount: line_gst, line_total: line_sub + line_gst };
  });

  // Apply overall discount
  const ovDisc = parseFloat(discount_pct) || 0;
  subtotal   *= (1 - ovDisc / 100);
  gst_amount *= (1 - ovDisc / 100);
  const total = subtotal + gst_amount;

  const quote_number = nextSeq('QT');
  const result = db.prepare(`
    INSERT INTO tf_quotations (quote_number, enquiry_id, buyer_id, version, validity_days, payment_terms, currency, subtotal, gst_amount, total, discount_pct, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(quote_number, enquiry_id, enq.buyer_id, 1,
    validity_days || 30, payment_terms || 'Net 30', currency || 'INR',
    subtotal, gst_amount, total, ovDisc, notes || null);

  const qtId = result.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO tf_quotation_items (quotation_id, product_id, description, hsn_code, qty, uom, unit_price, discount_pct, gst_rate_pct, line_subtotal, gst_amount, line_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  computed.forEach(it => insertItem.run(qtId, it.product_id || null, it.description, it.hsn_code || null, it.qty, it.uom || 'PCS', it.unit_price, it.discount_pct || 0, it.gst_rate_pct || 18, it.line_subtotal, it.gst_amount, it.line_total));

  // Log negotiation event
  db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes) VALUES (?,?,?,?)`).run(qtId, 'sent', 'system', 'Quote created');

  // Update enquiry stage
  db.prepare(`UPDATE tf_enquiries SET stage = 2, status = 'quoted', updated_at = datetime('now') WHERE id = ?`).run(enquiry_id);

  res.json({ id: qtId, quote_number });
});

// PATCH update status / send / negotiate
router.patch('/:id', (req, res) => {
  const db = getDb();
  const qt = db.prepare('SELECT * FROM tf_quotations WHERE id = ?').get(req.params.id);
  if (!qt) return res.status(404).json({ error: 'Not found' });

  const { status, action, actor, notes, counter_amount } = req.body;

  if (status) {
    db.prepare(`UPDATE tf_quotations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, req.params.id);
    if (status === 'sent') db.prepare(`UPDATE tf_quotations SET sent_at = datetime('now') WHERE id = ?`).run(req.params.id);
  }

  if (action) {
    db.prepare(`INSERT INTO tf_quote_negotiations (quotation_id, action, actor, notes, counter_amount) VALUES (?,?,?,?,?)`).run(qt.id, action, actor || 'buyer', notes || null, counter_amount || null);

    // Update enquiry stage on approval
    if (action === 'approved') {
      db.prepare(`UPDATE tf_enquiries SET stage = 3, status = 'approved', updated_at = datetime('now') WHERE id = ?`).run(qt.enquiry_id);
      db.prepare(`UPDATE tf_quotations SET status = 'approved', updated_at = datetime('now') WHERE id = ?`).run(qt.id);
    } else if (action === 'rejected') {
      db.prepare(`UPDATE tf_quotations SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`).run(qt.id);
    } else if (action === 'counter_offer') {
      db.prepare(`UPDATE tf_quotations SET status = 'negotiating', updated_at = datetime('now') WHERE id = ?`).run(qt.id);
    }
  }

  res.json({ ok: true });
});

module.exports = router;
