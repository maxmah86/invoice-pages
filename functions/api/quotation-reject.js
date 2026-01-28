export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== ADMIN ONLY ===== */
  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { quotation_id, reason } = body;

  if (!quotation_id) {
    return new Response("Missing quotation_id", { status: 400 });
  }

  /* ===============================
     LOAD QUOTATION
     =============================== */
  const q = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(quotation_id).first();

  if (!q) {
    return new Response("Quotation not found", { status: 404 });
  }

  if (q.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "Only OPEN quotation can be rejected" }),
      { status: 400 }
    );
  }

  /* ===============================
     REJECT (SAFE UPDATE)
     =============================== */
  await env.DB.prepare(`
    UPDATE quotations
    SET status = 'VOID'
    WHERE id = ?
  `).bind(quotation_id).run();

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    quotation_id,
    rejected_by: user.username,
    note: reason || ""
  });
}
