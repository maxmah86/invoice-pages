export async function onRequestPost() {
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
