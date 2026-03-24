'use strict';
const express = require('express');
const router  = express.Router();
const { getDb, nextSeq } = require('../db/tradeflow_db');

// GET all enquiries (with buyer info)
router.get('/', (req, res) => {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT e.*, b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email
    FROM tf_enquiries e
    LEFT JOIN tf_buyers b ON b.id = e.buyer_id
    ORDER BY e.created_at DESC
  `).all();
  res.json(rows);
});

// GET single enquiry with items
router.get('/:id', (req, res) => {
  const db  = getDb();
  const enq = db.prepare(`
    SELECT e.*, b.name AS buyer_name, b.company AS buyer_company, b.email AS buyer_email,
           b.phone AS buyer_phone, b.whatsapp AS buyer_whatsapp, b.gstin AS buyer_gstin,
           b.address AS buyer_address, b.city AS buyer_city, b.country AS buyer_country
    FROM tf_enquiries e
    LEFT JOIN tf_buyers b ON b.id = e.buyer_id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!enq) return res.status(404).json({ error: 'Enquiry not found' });

  enq.items = db.prepare(`
    SELECT ei.*, p.code AS product_code, p.hsn_code, p.base_price
    FROM tf_enquiry_items ei
    LEFT JOIN tf_products p ON p.id = ei.product_id
    WHERE ei.enquiry_id = ?
  `).all(req.params.id);

  res.json(enq);
});

// POST create enquiry
router.post('/', (req, res) => {
  const db = getDb();
  const { buyer_id, source, subject, raw_text, delivery_date, delivery_addr, notes, items = [] } = req.body;

  if (!buyer_id) return res.status(400).json({ error: 'buyer_id required' });

  const enq_number = nextSeq('ENQ');
  const result = db.prepare(`
    INSERT INTO tf_enquiries (enq_number, buyer_id, source, subject, raw_text, delivery_date, delivery_addr, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(enq_number, buyer_id, source || 'email', subject, raw_text, delivery_date, delivery_addr, notes);

  const enqId = result.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO tf_enquiry_items (enquiry_id, product_id, description, qty, uom, notes)
    VALUES (?,?,?,?,?,?)
  `);
  items.forEach(it => insertItem.run(enqId, it.product_id || null, it.description, it.qty, it.uom || 'PCS', it.notes || null));

  res.json({ id: enqId, enq_number });
});

// PATCH update enquiry
router.patch('/:id', (req, res) => {
  const db  = getDb();
  const enq = db.prepare('SELECT id FROM tf_enquiries WHERE id = ?').get(req.params.id);
  if (!enq) return res.status(404).json({ error: 'Not found' });

  const allowed = ['source','subject','raw_text','delivery_date','delivery_addr','notes','stage','status','buyer_id'];
  const sets = [], vals = [];
  allowed.forEach(f => {
    if (req.body[f] !== undefined) { sets.push(`${f} = ?`); vals.push(req.body[f]); }
  });
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push("updated_at = datetime('now')");
  vals.push(req.params.id);
  db.prepare(`UPDATE tf_enquiries SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

module.exports = router;
