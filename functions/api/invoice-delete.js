export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const id = Number(body?.id);
  if (!id) {
    return new Response(JSON.stringify({ error: 'Invoice id is required' }), { status: 400 });
  }

  try {
    await env.DB.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM invoice_sections WHERE invoice_id = ?`).bind(id).run();
    const result = await env.DB.prepare(`DELETE FROM invoices WHERE id = ?`).bind(id).run();

    if (!result.success || result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true, deleted_id: id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Delete failed: ' + err.message }), { status: 500 });
  }
}
