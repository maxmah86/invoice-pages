export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
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
    SELECT username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
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

  const {
    worker_name,
    work_date,
    description,
    amount
  } = body || {};

  if (!worker_name || !work_date || amount === undefined) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return new Response(
      JSON.stringify({ error: "Invalid amount" }),
      { status: 400 }
    );
  }

  /* ===============================
     INSERT DAILY LABOUR
     =============================== */
  const r = await env.DB.prepare(`
    INSERT INTO daily_labours (
      worker_name,
      work_date,
      description,
      amount,
      payment_status,
      created_at,
      created_by
    ) VALUES (?, ?, ?, ?, 'UNPAID', datetime('now'), ?)
  `).bind(
    worker_name,
    work_date,
    description || "",
    amt,
    user.username
  ).run();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      id: r.meta.last_row_id,
      created_by: user.username
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
