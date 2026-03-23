CREATE TABLE IF NOT EXISTS kpi (
  id                          INTEGER PRIMARY KEY,
  units_produced              INTEGER NOT NULL,
  units_target                INTEGER NOT NULL,
  machine_uptime_pct          REAL    NOT NULL,
  machines_offline            INTEGER NOT NULL,
  uptime_delta                REAL    NOT NULL DEFAULT 0,
  defect_rate_pct             REAL    NOT NULL,
  defect_threshold_pct        REAL    NOT NULL,
  inventory_alerts            INTEGER NOT NULL,
  inventory_critical          INTEGER NOT NULL,
  inventory_low               INTEGER NOT NULL,
  open_work_orders            INTEGER NOT NULL,
  work_orders_in_progress     INTEGER NOT NULL,
  work_orders_completed_today INTEGER NOT NULL,
  updated_at                  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_hourly (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hour_label  TEXT    NOT NULL,
  day         TEXT    NOT NULL CHECK(day IN ('today', 'yesterday')),
  units       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS machines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL CHECK(status IN ('online', 'warn', 'offline')),
  uptime_pct     REAL NOT NULL DEFAULT 0,
  status_message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  due_time     TEXT    NOT NULL,
  line         TEXT    NOT NULL,
  progress_pct INTEGER NOT NULL,
  status       TEXT    NOT NULL CHECK(status IN ('on_time','done','on_track','delayed','scheduled'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  level_pct             REAL NOT NULL,
  reorder_threshold_pct REAL NOT NULL,
  alert_level           TEXT NOT NULL CHECK(alert_level IN ('ok', 'low', 'critical'))
);

CREATE TABLE IF NOT EXISTS quality_metrics (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  label    TEXT NOT NULL,
  pct      REAL NOT NULL,
  color    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  message_before    TEXT NOT NULL,
  message_highlight TEXT NOT NULL,
  highlight_class   TEXT NOT NULL DEFAULT 'neutral',
  type              TEXT NOT NULL CHECK(type IN ('warn','info','danger','success')),
  active            INTEGER DEFAULT 1,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
