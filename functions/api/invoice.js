export async function onRequestPost({ request }) {
  try {
    const body = await request.text();
    const cookie = request.headers.get("Cookie") || "";

    const res = await fetch(
      "https://invoice-api.your-worker-name.workers.dev/invoice",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookie       // ⭐⭐⭐ 关键：转发 cookie
        },
        body
      }
    );

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Invoice POST proxy error", detail: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
