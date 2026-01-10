export async function onRequestPost({ request }) {
  const body = await request.text();
  const cookie = request.headers.get("Cookie") || "";

  const res = await fetch("https://invoice-api.yourdomain.workers.dev/invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookie          // ⭐⭐⭐ 核心
    },
    body
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" }
  });
}
