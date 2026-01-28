export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH (session_token + role)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403 }
    );
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const { id, status } = data || {};

  if (!id || !["PAID", "UNPAID"].includes(status)) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  /* ===============================
     UPDATE STATUS
     =============================== */
  const r = await env.DB.prepare(`
    UPDATE invoices
    SET status = ?
    WHERE id = ?
  `).bind(status, id).run();

  if (r.meta.changes === 0) {
    return new Response(
      JSON.stringify({ error: "Invoice not found" }),
      { status: 404 }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated_by: user.id,
      role: user.role,
      status
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
