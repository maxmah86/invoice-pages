export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // ✅ 1. 永远放行 login 页面
  if (path === "/login.html") {
    return context.next();
  }

  // ✅ 2. 永远放行 login / logout API
  if (path === "/api/login" || path === "/api/logout") {
    return context.next();
  }

  // ✅ 3. 读取 cookie
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=valid");

  // ❌ 未登录 → 重定向 login
  if (!loggedIn) {
    return Response.redirect(
      new URL("/login.html", request.url),
      302
    );
  }

  // ✅ 已登录 → 放行
  return context.next();
}
