export async function onRequestPost({ request }) {
  try {
    const token = request.headers.get("Authorization");
    const body = await request.text();

    const res = await fetch(
      "https://invoice-api.myfong86.workers.dev/invoice-with-customer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token || ""
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
      JSON.stringify({
        error: "invoice-with-customer proxy error",
        detail: String(e)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}