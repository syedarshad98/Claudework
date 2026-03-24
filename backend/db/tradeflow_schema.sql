-- ============================================================
-- TradeFlow — 8-Stage Trade Workflow Engine
-- ============================================================

-- ─── MASTER DATA ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tf_buyers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  company       TEXT    NOT NULL,
  email         TEXT,
  phone         TEXT,
  whatsapp      TEXT,
  address       TEXT,
  city          TEXT,
  country       TEXT    NOT NULL DEFAULT 'India',
  gstin         TEXT,
  pan           TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tf_products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  description   TEXT,
  hsn_code      TEXT    NOT NULL,
  uom           TEXT    NOT NULL DEFAULT 'PCS',
  base_price    REAL    NOT NULL DEFAULT 0,
  gst_rate_pct  REAL    NOT NULL DEFAULT 18,
  stock_qty     REAL    NOT NULL DEFAULT 0,
  reorder_qty   REAL    NOT NULL DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── STAGE 1: ENQUIRY CAPTURE ───────────────────────────────

CREATE TABLE IF NOT EXISTS tf_enquiries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  enq_number      TEXT    NOT NULL UNIQUE,
  buyer_id        INTEGER REFERENCES tf_buyers(id),
  source          TEXT    NOT NULL DEFAULT 'email' CHECK(source IN ('email','whatsapp','phone','walk-in','portal')),
  subject         TEXT,
  raw_text        TEXT,
  delivery_date   DATE,
  delivery_addr   TEXT,
  notes           TEXT,
  stage           INTEGER NOT NULL DEFAULT 1,
  status          TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','quoted','approved','pi_sent','po_received','dispatched','closed','cancelled')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tf_enquiry_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id    INTEGER NOT NULL REFERENCES tf_enquiries(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES tf_products(id),
  description   TEXT    NOT NULL,
  qty           REAL    NOT NULL,
  uom           TEXT    NOT NULL DEFAULT 'PCS',
  notes         TEXT
);

-- ─── STAGE 2: QUOTATION ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS tf_quotations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number    TEXT    NOT NULL UNIQUE,
  enquiry_id      INTEGER NOT NULL REFERENCES tf_enquiries(id),
  buyer_id        INTEGER NOT NULL REFERENCES tf_buyers(id),
  version         INTEGER NOT NULL DEFAULT 1,
  validity_days   INTEGER NOT NULL DEFAULT 30,
  payment_terms   TEXT    NOT NULL DEFAULT 'Net 30',
  currency        TEXT    NOT NULL DEFAULT 'INR',
  subtotal        REAL    NOT NULL DEFAULT 0,
  gst_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  discount_pct    REAL    NOT NULL DEFAULT 0,
  notes           TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','approved','rejected','negotiating','expired')),
  sent_at         DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tf_quotation_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id  INTEGER NOT NULL REFERENCES tf_quotations(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES tf_products(id),
  description   TEXT    NOT NULL,
  hsn_code      TEXT,
  qty           REAL    NOT NULL,
  uom           TEXT    NOT NULL DEFAULT 'PCS',
  unit_price    REAL    NOT NULL,
  discount_pct  REAL    NOT NULL DEFAULT 0,
  gst_rate_pct  REAL    NOT NULL DEFAULT 18,
  line_subtotal REAL    NOT NULL DEFAULT 0,
  gst_amount    REAL    NOT NULL DEFAULT 0,
  line_total    REAL    NOT NULL DEFAULT 0
);

-- ─── STAGE 3: APPROVAL & NEGOTIATION ────────────────────────

CREATE TABLE IF NOT EXISTS tf_quote_negotiations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  quotation_id    INTEGER NOT NULL REFERENCES tf_quotations(id),
  action          TEXT    NOT NULL CHECK(action IN ('sent','approved','rejected','counter_offer','revised')),
  actor           TEXT    NOT NULL DEFAULT 'buyer',
  notes           TEXT,
  counter_amount  REAL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── STAGE 4: PROFORMA INVOICE ──────────────────────────────

CREATE TABLE IF NOT EXISTS tf_proforma_invoices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pi_number       TEXT    NOT NULL UNIQUE,
  quotation_id    INTEGER NOT NULL REFERENCES tf_quotations(id),
  enquiry_id      INTEGER NOT NULL REFERENCES tf_enquiries(id),
  buyer_id        INTEGER NOT NULL REFERENCES tf_buyers(id),
  payment_terms   TEXT    NOT NULL,
  bank_name       TEXT    NOT NULL DEFAULT 'State Bank of India',
  bank_account    TEXT    NOT NULL DEFAULT 'XXXXXXXXXXXX',
  bank_ifsc       TEXT    NOT NULL DEFAULT 'SBIN0000XXX',
  bank_branch     TEXT,
  due_date        DATE,
  subtotal        REAL    NOT NULL DEFAULT 0,
  gst_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  advance_pct     REAL    NOT NULL DEFAULT 0,
  advance_amount  REAL    NOT NULL DEFAULT 0,
  balance_amount  REAL    NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'sent' CHECK(status IN ('draft','sent','partially_paid','paid','cancelled')),
  sent_at         DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── STAGE 5: PURCHASE ORDER RECEIPT ────────────────────────

CREATE TABLE IF NOT EXISTS tf_purchase_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number       TEXT    NOT NULL,
  pi_id           INTEGER NOT NULL REFERENCES tf_proforma_invoices(id),
  enquiry_id      INTEGER NOT NULL REFERENCES tf_enquiries(id),
  buyer_id        INTEGER NOT NULL REFERENCES tf_buyers(id),
  buyer_po_ref    TEXT    NOT NULL,
  po_date         DATE    NOT NULL,
  delivery_date   DATE,
  delivery_addr   TEXT,
  payment_terms   TEXT,
  special_terms   TEXT,
  po_amount       REAL    NOT NULL DEFAULT 0,
  inventory_checked INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'received' CHECK(status IN ('received','inventory_checked','confirmed','dispatched')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── STAGE 6: INVENTORY & PROCUREMENT ───────────────────────

CREATE TABLE IF NOT EXISTS tf_stock_reservations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id           INTEGER NOT NULL REFERENCES tf_purchase_orders(id),
  product_id      INTEGER NOT NULL REFERENCES tf_products(id),
  required_qty    REAL    NOT NULL,
  reserved_qty    REAL    NOT NULL DEFAULT 0,
  shortfall_qty   REAL    NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','fulfilled','shortage')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tf_purchase_requisitions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number       TEXT    NOT NULL UNIQUE,
  po_id           INTEGER NOT NULL REFERENCES tf_purchase_orders(id),
  product_id      INTEGER NOT NULL REFERENCES tf_products(id),
  required_qty    REAL    NOT NULL,
  estimated_cost  REAL,
  status          TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','ordered','received','cancelled')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── STAGE 7: PACKING & DISPATCH PREP ───────────────────────

CREATE TABLE IF NOT EXISTS tf_packing_lists (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pl_number       TEXT    NOT NULL UNIQUE,
  po_id           INTEGER NOT NULL REFERENCES tf_purchase_orders(id),
  enquiry_id      INTEGER NOT NULL REFERENCES tf_enquiries(id),
  buyer_id        INTEGER NOT NULL REFERENCES tf_buyers(id),
  total_cartons   INTEGER NOT NULL DEFAULT 0,
  gross_weight_kg REAL    NOT NULL DEFAULT 0,
  net_weight_kg   REAL    NOT NULL DEFAULT 0,
  marks           TEXT,
  invoice_number  TEXT    NOT NULL UNIQUE,
  invoice_amount  REAL    NOT NULL DEFAULT 0,
  invoice_gst     REAL    NOT NULL DEFAULT 0,
  invoice_total   REAL    NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalised','dispatched')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tf_packing_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  packing_list_id INTEGER NOT NULL REFERENCES tf_packing_lists(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES tf_products(id),
  description     TEXT    NOT NULL,
  hsn_code        TEXT,
  qty             REAL    NOT NULL,
  uom             TEXT    NOT NULL DEFAULT 'PCS',
  cartons         INTEGER NOT NULL DEFAULT 1,
  gross_weight_kg REAL    NOT NULL DEFAULT 0,
  net_weight_kg   REAL    NOT NULL DEFAULT 0,
  unit_price      REAL    NOT NULL DEFAULT 0,
  gst_rate_pct    REAL    NOT NULL DEFAULT 18,
  line_total      REAL    NOT NULL DEFAULT 0
);

-- ─── STAGE 8: SHIPPING & COMPLIANCE ─────────────────────────

CREATE TABLE IF NOT EXISTS tf_shipping_docs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  packing_list_id INTEGER NOT NULL REFERENCES tf_packing_lists(id),
  enquiry_id      INTEGER NOT NULL REFERENCES tf_enquiries(id),
  buyer_id        INTEGER NOT NULL REFERENCES tf_buyers(id),
  shipment_type   TEXT    NOT NULL DEFAULT 'domestic' CHECK(shipment_type IN ('domestic','export')),
  -- Domestic
  eway_bill_no    TEXT,
  eway_bill_date  DATE,
  transporter     TEXT,
  vehicle_no      TEXT,
  -- Export
  bol_number      TEXT,
  awb_number      TEXT,
  vessel_name     TEXT,
  port_loading    TEXT,
  port_discharge  TEXT,
  country_origin  TEXT    DEFAULT 'India',
  country_dest    TEXT,
  incoterm        TEXT,
  co_number       TEXT,   -- Certificate of Origin
  dgft_ref        TEXT,
  lc_number       TEXT,
  -- Common
  dispatch_date   DATE,
  expected_arrival DATE,
  tracking_ref    TEXT,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','booked','in_transit','delivered','pod_received')),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── SEQUENCE COUNTER ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tf_sequences (
  prefix    TEXT PRIMARY KEY,
  last_seq  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO tf_sequences (prefix, last_seq) VALUES
  ('ENQ', 0),
  ('QT',  0),
  ('PI',  0),
  ('PO',  0),
  ('PR',  0),
  ('PL',  0),
  ('INV', 0),
  ('SH',  0);
