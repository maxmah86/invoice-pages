export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      cookie: request.headers.get("cookie") || ""
    }
  });

  if (!authRes.ok) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
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
      { status: 400 }
    );
  }

  const { id } = body;
  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      { status: 400 }
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
      { status: 404 }
    );
  }

  if (po.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "PO not OPEN" }),
      { status: 403 }
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
    JSON.stringify({ success: true }),
    { status: 200 }
  );
}
