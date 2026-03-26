function randomCode(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function onRequestPost({ request, env }) {
  /* ===== 身份验证 (仅限 admin) ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }

  /* ===== 处理请求数据 ===== */
  try {
    const { role = "user", days = 7 } = await request.json();
    const code = randomCode(12);

    // 安全处理过期时间：使用 SQL 的 datetime 函数并绑定参数
    // 如果 days 为 0 或 null，则设置为永久有效（NULL）
    const daysInt = parseInt(days);
    
    if (isNaN(daysInt) || daysInt < 0) {
        return new Response(JSON.stringify({ error: "Invalid days value" }), { status: 400 });
    }

    await env.DB.prepare(`
      INSERT INTO invite_codes (code, role, expires_at)
      VALUES (?, ?, datetime('now', '+' || ? || ' days'))
    `).bind(code, role, daysInt).run();

    return new Response(JSON.stringify({
      success: true,
      code,
      role,
      expires_in_days: daysInt
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
