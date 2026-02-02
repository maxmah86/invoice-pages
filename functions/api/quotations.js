export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  // ===== admin auth =====
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const rows = await db.prepare(`
      SELECT
        id,
        quotation_no,
        customer,
        project_title,
        status,
        subtotal,
        grand_total,
        created_at
      FROM quotations
      ORDER BY created_at DESC
    `).all();

    return jsonOK({
      list: rows.results || []
    });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || 'Failed to load quotations', 500);
  }
}

/* ================= helpers ================= */

async function requireAdmin(request) {
  const res = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });

  const auth = await res.json();

  if (!auth.loggedIn) {
    return { ok: false, response: jsonError('Not logged in', 401) };
  }

  if (auth.role !== 'admin') {
    return { ok: false, response: jsonError('Permission denied', 403) };
  }

  return { ok: true, user: auth };
}

function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}