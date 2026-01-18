export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });

  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
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

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
