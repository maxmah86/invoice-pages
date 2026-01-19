async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return new Response(
      JSON.stringify({ error: "Missing credentials" }),
      { status: 400 }
    );
  }

  // 查用户
  const user = await env.DB.prepare(
    "SELECT id, password_hash FROM users WHERE username = ?"
  ).bind(username).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Invalid username or password" }),
      { status: 401 }
    );
  }

  // 计算 hash
  const hash = await sha256(password);

  if (hash !== user.password_hash) {
    return new Response(
      JSON.stringify({ error: "Invalid username or password" }),
      { status: 401 }
    );
  }

  // 登录成功 → 写 cookie
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": [
          "session=ok",
          "Path=/",
          "SameSite=Lax"
        ].join("; ")
      }
    }
  );
}

