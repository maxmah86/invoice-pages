export async function onRequestPost({ request }) {
  try {
    // 1. 原样读取 body
    const body = await request.text();

    // 2. 原样读取 cookie
    const cookie = request.headers.get("Cookie") || "";

    // 3. 转发到 invoice-api（Worker）
    const apiRes = await fetch(
      "https://invoice-api.your-worker-name.workers.dev/invoice",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookie
        },
        body
      }
    );

    // 4. 不做任何解析，直接拿 text
    const text = await apiRes.text();

    // 5. 明确返回 JSON
    return new Response(text, {
      status: apiRes.status,
      headers: {
        "Content-Type": "application/json"
      }
    });

  } catch (err) {
    // 6. 兜底错误，也必须返回 JSON
    return new Response(
      JSON.stringify({
        error: "Pages Function invoice proxy error",
        detail: String(err)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
