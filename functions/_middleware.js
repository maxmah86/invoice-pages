export async function onRequest({ request, next }) {
  const url = new URL(request.url);

  // 放行 login 页面
  if (url.pathname === "/login") {
    return next();
  }

  // 放行 API
  if (url.pathname.startsWith("/api/")) {
    return next();
  }

  // 检查 cookie
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=ok");

  if (!loggedIn) {
    return Response.redirect(`${url.origin}/login`, 302);
  }

  return next();
}
