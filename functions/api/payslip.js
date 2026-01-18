import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function onRequestGet({ request, env }) {

  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const salary = await env.DB.prepare(`
    SELECT
      s.salary_month,
      s.base_salary,
      s.allowance,
      s.deduction,
      s.net_salary,
      s.status,
      e.name
    FROM salaries s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.id = ?
  `).bind(id).first();

  if (!salary) return new Response("Not found", { status: 404 });

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let y = 780;
  const line = (t, s = 12) => {
    page.drawText(t, { x: 50, y, size: s, font, color: rgb(0,0,0) });
    y -= s + 8;
  };

  line("PAYSLIP", 18);
  y -= 10;

  line(`Employee Name: ${salary.name}`);
  line(`Salary Month: ${salary.salary_month}`);
  line(`Status: ${salary.status}`);
  y -= 10;

  line(`Base Salary: RM ${salary.base_salary}`);
  line(`Allowance: RM ${salary.allowance}`);
  line(`Deduction: RM ${salary.deduction}`);
  y -= 10;

  line(`Net Salary: RM ${salary.net_salary}`, 14);
  y -= 30;

  line("This is a computer generated payslip.");
  line("No signature is required.");

  const bytes = await pdf.save();

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${salary.salary_month}.pdf"`
    }
  });
}
