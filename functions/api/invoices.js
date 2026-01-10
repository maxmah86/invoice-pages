export async function onRequest({ request }) {
  const cookie = request.headers.get("Cookie") || "";

  const res = await fetch("https://invoice-api.yourdomain.workers.dev/invoices", {
    headers: {
      "Cookie": cookie          // ⭐⭐⭐ 核心
    }
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" }
  });
}
