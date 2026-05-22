const { createClient } = require('@supabase/supabase-js');

let _client;

function supabase() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment');
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}

module.exports = supabase;
