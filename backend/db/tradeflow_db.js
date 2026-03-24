'use strict';
const path     = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'tradeflow.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function nextSeq(prefix) {
  const d    = getDb();
  const row  = d.prepare('SELECT last_seq FROM tf_sequences WHERE prefix = ?').get(prefix);
  const next = (row ? row.last_seq : 0) + 1;
  d.prepare('UPDATE tf_sequences SET last_seq = ? WHERE prefix = ?').run(next, prefix);
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

module.exports = { getDb, nextSeq };
