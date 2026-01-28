export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     ROLE CHECK (ADMIN ONLY)
     =============================== */
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { id } = body;
  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     LOAD PO
     =============================== */
  const po = await env.DB.prepare(`
    SELECT status
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(
      JSON.stringify({ error: "PO not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (po.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "PO not OPEN" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     APPROVE PO
     =============================== */
  await env.DB.prepare(`
    UPDATE purchase_orders
    SET status = 'APPROVED',
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      approved_by: user.username
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
