export async function onRequest({ request, env }) {
  // ===== 登录检查 =====
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  // ===== 读取 body =====
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const quotationId = body.quotation_id;
  if (!quotationId) {
    return new Response(
      JSON.stringify({ error: "Missing quotation_id" }),
      { status: 400 }
    );
  }

  // ===== 读取 quotation =====
  const quotation = await env.DB.prepare(
    `
    SELECT *
    FROM quotations
    WHERE id = ? AND status = 'OPEN'
    `
  ).bind(quotationId).first();

  if (!quotation) {
    return new Response(
      JSON.stringify({ error: "Quotation not found or not OPEN" }),
      { status: 400 }
    );
  }

  // ===== 读取 quotation items =====
  const itemsResult = await env.DB.prepare(
    `
    SELECT description, qty, price
    FROM quotation_items
    WHERE quotation_id = ?
    `
  ).bind(quotationId).all();

  if (!itemsResult.results.length) {
    return new Response(
      JSON.stringify({ error: "Quotation has no items" }),
      { status: 400 }
    );
  }

  // ===== 生成 invoice_no =====
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g, "");
  const invoiceNo = `INV-${dateStr}-${Math.floor(Math.random() * 9000 + 1000)}`;

  // ===== 插入 invoice =====
  const invoiceInsert = await env.DB.prepare(
    `
    INSERT INTO invoices (invoice_no, customer, amount, status, created_at)
    VALUES (?, ?, ?, 'UNPAID', CURRENT_TIMESTAMP)
    `
  ).bind(
    invoiceNo,
    quotation.customer,
    quotation.amount
  ).run();

  const invoiceId = invoiceInsert.meta.last_row_id;

  // ===== 插入 invoice_items =====
  for (const item of itemsResult.results) {
    await env.DB.prepare(
      `
      INSERT INTO invoice_items (invoice_id, description, qty, price)
      VALUES (?, ?, ?, ?)
      `
    ).bind(
      invoiceId,
      item.description,
      item.qty,
      item.price
    ).run();
  }

  // ===== 更新 quotation 状态 =====
  await env.DB.prepare(
    `
    UPDATE quotations
    SET status = 'ACCEPTED'
    WHERE id = ?
    `
  ).bind(quotationId).run();

  // ===== 返回成功 =====
  return new Response(
    JSON.stringify({
      success: true,
      invoice_id: invoiceId
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
