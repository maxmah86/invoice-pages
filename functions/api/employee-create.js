export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH (session_token + role)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  const { name, role, base_salary, status } = body;

  if (!name || base_salary === undefined) {
    return new Response("Missing required fields", { status: 400 });
  }

  /* ===============================
     INSERT EMPLOYEE
     =============================== */
  await env.DB.prepare(`
    INSERT INTO employees
      (name, role, base_salary, status)
    VALUES
      (?, ?, ?, ?)
  `).bind(
    name,
    role || "",
    base_salary,
    status || "ACTIVE"
  ).run();

  return Response.json({ success: true });
}
