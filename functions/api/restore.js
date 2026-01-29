export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH (ADMIN ONLY)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
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

  const { sql, confirm } = body;

  if (!confirm) {
    return new Response(
      JSON.stringify({
        error: "Confirmation required",
        hint: "Set confirm=true to execute restore"
      }),
      { status: 400 }
    );
  }

  if (!sql || typeof sql !== "string") {
    return new Response("Missing SQL", { status: 400 });
  }

  /* ===============================
     BASIC SQL SAFETY CHECK
     =============================== */
  const forbidden = /(DROP|ALTER|PRAGMA|ATTACH|DETACH)/i;
  if (forbidden.test(sql)) {
    return new Response(
      JSON.stringify({ error: "Forbidden SQL detected" }),
      { status: 403 }
    );
  }

  /* ===============================
     EXECUTE SQL (LINE BY LINE)
     =============================== */
  const statements = sql
    .split(";\n")
    .map(s => s.trim())
    .filter(Boolean);

  let executed = 0;

  for (const stmt of statements) {
    if (!stmt.toUpperCase().startsWith("INSERT")) {
      continue; // 只允许 INSERT
    }

    await env.DB.prepare(stmt).run();
    executed++;
  }

  /* ===============================
     AUDIT LOG (OPTIONAL)
     =============================== */
  await env.DB.prepare(`
    INSERT INTO system_logs (
      action,
      performed_by,
      created_at
    ) VALUES (?, ?, datetime('now'))
  `).bind(
    "RESTORE",
    user.username
  ).run().catch(() => {});

  return Response.json({
    success: true,
    executed,
    restored_by: user.username
  });
}
