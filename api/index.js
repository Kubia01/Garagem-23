import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_SHARED_SECRET = process.env.API_SHARED_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const resourceToTable = {
  'customers': 'customers',
  'vehicles': 'vehicles',
  'suppliers': 'suppliers',
  'service-items': 'service_items',
  'quotes': 'quotes',
  'quote-items': 'quote_items',
  'maintenance-reminders': 'maintenance_reminders',
  'service-orders': 'service_orders',
  'stock-movements': 'stock_movements',
  'vehicle-mileage-history': 'vehicle_mileage_history',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function unauthorized(res) {
  cors(res);
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

function badRequest(res, message) {
  cors(res);
  res.statusCode = 400;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message || 'bad_request' }));
}

function notFound(res) {
  cors(res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found' }));
}

function ok(res, data) {
  cors(res);
  res.statusCode = 200;
  if (data === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

// Convert empty strings to null recursively to avoid DB casting errors (e.g., uuid "")
function normalizePayload(value) {
  if (value === '') return null;
  if (Array.isArray(value)) return value.map((v) => normalizePayload(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizePayload(v);
    return out;
  }
  return value;
}

function getSort(query) {
  const sort = query.get('sort');
  if (!sort) return { column: 'created_date', ascending: false };
  if (sort.startsWith('-')) return { column: sort.slice(1), ascending: false };
  return { column: sort, ascending: true };
}

function getFilters(query) {
  const filters = {};
  for (const [key, value] of query.entries()) {
    if (key === 'sort') continue;
    if (value === undefined || value === null || value === '') continue;
    filters[key] = value;
  }
  return filters;
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.statusCode = 204;
    return res.end();
  }

  // Optional shared-secret auth
  if (API_SHARED_SECRET) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== API_SHARED_SECRET) return unauthorized(res);
  }

  const urlObj = new URL(req.url, 'http://localhost');
  let pathname = urlObj.pathname || '';
  // Normalize to remove possible /api/index prefix
  if (pathname.startsWith('/api/index')) pathname = pathname.replace('/api/index', '/api');
  const apiPrefix = '/api/';
  if (!pathname.startsWith(apiPrefix)) {
    return notFound(res);
  }
  const restPath = pathname.slice(apiPrefix.length); // e.g., "customers/123" or "admin/users"
  const [resource, idMaybe] = restPath.split('/');
  const table = resourceToTable[resource];
  
  // Admin endpoints (e.g., POST /api/admin/users)
  if (resource === 'admin' && idMaybe === 'users') {
    // Enforce shared-secret strictly for admin endpoints
    if (!API_SHARED_SECRET) return badRequest(res, 'missing_server_secret');
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== API_SHARED_SECRET) return unauthorized(res);

    if (req.method === 'POST') {
      try {
        const raw = await parseBody(req);
        const body = normalizePayload(raw);
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        const fullName = body?.full_name ? String(body.full_name) : undefined;
        const role = String(body?.role || '').toLowerCase();

        if (!email) return badRequest(res, 'missing_email');
        if (!password || password.length < 8) return badRequest(res, 'invalid_password_min_8_chars');
        const allowedRoles = ['admin', 'manager', 'operator'];
        const roleValid = !role || allowedRoles.includes(role);
        if (!roleValid) return badRequest(res, 'invalid_role');

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: role || 'operator',
          },
        });
        if (createErr) return badRequest(res, createErr.message);

        const userId = created?.user?.id;
        if (!userId) return badRequest(res, 'user_creation_failed');

        // Ensure profile exists and reflects provided metadata
        const profilePayload = {
          user_id: userId,
          full_name: fullName || null,
          role: (roleValid && role) ? role : 'operator',
        };
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'user_id' });
        if (upsertErr) return badRequest(res, upsertErr.message);

        return ok(res, {
          id: userId,
          email,
          role: profilePayload.role,
        });
      } catch (e) {
        cors(res);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
      }
    }

    return notFound(res);
  }

  if (!table) return notFound(res);

  try {
    if (req.method === 'GET') {
      if (idMaybe) {
        const { data, error } = await supabase.from(table).select('*').eq('id', idMaybe).limit(1);
        if (error) return badRequest(res, error.message);
        return ok(res, data || []);
      }
      const { column, ascending } = getSort(urlObj.searchParams);
      let query = supabase.from(table).select('*').order(column, { ascending });
      const filters = getFilters(urlObj.searchParams);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query;
      if (error) return badRequest(res, error.message);
      return ok(res, data || []);
    }

    if (req.method === 'POST') {
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const { data, error } = await supabase.from(table).insert(body).select('*').single();
      if (error) return badRequest(res, error.message);
      return ok(res, data);
    }

    if (req.method === 'PUT') {
      if (!idMaybe) return badRequest(res, 'missing_id');
      const raw = await parseBody(req);
      const body = normalizePayload(raw);
      const { data, error } = await supabase
        .from(table)
        .update(body)
        .eq('id', idMaybe)
        .select('*')
        .single();
      if (error) return badRequest(res, error.message);
      return ok(res, data);
    }

    if (req.method === 'DELETE') {
      if (!idMaybe) return badRequest(res, 'missing_id');
      const { error } = await supabase.from(table).delete().eq('id', idMaybe);
      if (error) return badRequest(res, error.message);
      return ok(res, {});
    }

    return notFound(res);
  } catch (e) {
    cors(res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error', message: e?.message || String(e) }));
  }
}
