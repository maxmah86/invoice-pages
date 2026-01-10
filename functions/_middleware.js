export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1️⃣ 永远放行 login 页面
  if (path === "/login.html") {
    return context.next();
  }

  // 2️⃣ 放行 auth API
  if (path === "/api/login" || path === "/api/logout") {
    return context.next();
  }

  // 3️⃣ 放行静态资源（防止死循环）
  if (
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg")
  ) {
    return context.next();
  }

  // 4️⃣ 检查 session cookie
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=valid");

  if (!loggedIn) {
    return Response.redirect(
      new URL("/login.html", request.url),
      302
    );
  }

  return context.next();
}
