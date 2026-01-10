export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // ✅ 永远放行 login 页面
  if (path === "/login.html") {
    return context.next();
  }

  const cookie = context.request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=valid");

  if (!loggedIn) {
    return Response.redirect(
      new URL("/login.html", context.request.url),
      302
    );
  }

  return context.next();
}
