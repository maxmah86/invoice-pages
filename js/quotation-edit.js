
/* =========================================================
 * Admin only guard
 * ========================================================= */
fetch("/api/auth-check", { credentials:"include" })
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => {
    if (d.role !== "admin") location.replace("/index.html");
  })
  .catch(() => location.replace("/login.html"));

/* =========================================================
 * Globals
 * ========================================================= */
const sectionsEl = document.getElementById("sections");
const quotationId = new URL(location.href).searchParams.get("id");

/* =========================================================
 * Load Terms
 * ========================================================= */
fetch("/api/quotation-terms-list",{credentials:"include"})
.then(r=>r.json())
.then(list=>{
  const sel = document.getElementById("terms_id");
  sel.innerHTML = `<option value="">-- Select Terms --</option>`;
  list.forEach(t=>{
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.title;
    sel.appendChild(opt);
  });
});

/* =========================================================
 * Load Item Catalog
 * ========================================================= */
fetch("/api/item-catalog-list",{credentials:"include"})
.then(r=>r.json())
.then(list=>{
  const dl = document.getElementById("catalogs");
  dl.innerHTML="";
  list
    .filter(i=>Number(i.is_active)===1)
    .forEach(i=>{
      const opt=document.createElement("option");
      opt.value=i.description;
      opt.dataset.price=i.default_amount;
      dl.appendChild(opt);
    });
});

/* =========================================================
 * Section / Item UI
 * ========================================================= */
function addSection(title="") {
  const sec=document.createElement("div");
  sec.className="section box";
  sec.innerHTML=`
    <div style="display:flex; gap:10px;">
        <input placeholder="Section Title" value="${title}" style="font-weight:bold; flex:1;">
        <button class="btn-cancel" style="width:auto; padding:0 10px; margin-top:6px; border-radius:4px;"
          onclick="this.parentElement.parentElement.remove(); calc();">Remove</button>
    </div>
    <div class="items"></div>
    <button class="btn btn-add" style="font-size:13px; padding:8px; background:#f1f1f1; color:#333;"
      onclick="addItem(this)">+ Add Item</button>
    <div class="subtotal">Subtotal: RM <span>0.00</span></div>
  `;
  sectionsEl.appendChild(sec);
  return sec;
}

function addItem(btn) {
  const itemsContainer = btn.previousElementSibling;
  addItemFromData(itemsContainer, {});
}

function addItemFromData(container, it={}) {
  const div=document.createElement("div");
  div.className="item";
  div.innerHTML=`
    <input list="catalogs" placeholder="Item Description" class="desc-input" value="${it.description||""}">
    <div class="row">
      <input type="text" placeholder="UOM" class="uom-input" value="${it.UOM||""}">
      <input type="number" placeholder="Qty" class="qty-input" value="${it.qty||1}">
      <input type="number" placeholder="Price" class="price-input" value="${it.unit_price||it.price||0}">
    </div>
    <div style="text-align:right;">
      <small style="color:red; cursor:pointer;" onclick="this.closest('.item').remove(); calc();">Remove Item</small>
    </div>
  `;
  container.appendChild(div);

  const desc = div.querySelector(".desc-input");
  const priceInput = div.querySelector(".price-input");

  desc.onchange=()=>{
    const opt=[...document.querySelectorAll("#catalogs option")]
      .find(o=>o.value===desc.value);
    if(opt) priceInput.value=opt.dataset.price;
    calc();
  };

  div.querySelectorAll("input").forEach(i=>i.oninput=calc);
  calc();
}

/* =========================================================
 * Calculation
 * ========================================================= */
function calc() {
  let grand=0;
  document.querySelectorAll(".section").forEach(sec=>{
    let sub=0;
    sec.querySelectorAll(".item").forEach(it=>{
      const qty = Number(it.querySelector(".qty-input").value)||0;
      const price = Number(it.querySelector(".price-input").value)||0;
      sub += qty * price;
    });
    sec.querySelector(".subtotal span").textContent = sub.toFixed(2);
    grand += sub;
  });
  const discount = Number(document.getElementById("discount").value)||0;
  document.getElementById("grandTotal").textContent =
    `Total: RM ${Math.max(0, grand - discount).toFixed(2)}`;
}

/* =========================================================
 * Load quotation for edit (VIEW → EDIT)
 * ========================================================= */
async function loadQuotationForEdit() {
  if (!quotationId) {
    addSection();
    addItem(document.querySelector(".btn-add"));
    return;
  }

  const res = await fetch("/api/quotation-view?id=" + quotationId, {
    credentials: "include"
  });
  const json = await res.json();
  if (!json.success) {
    alert(json.error || "Load failed");
    return;
  }

  const q = json.data;

  document.getElementById("customer").value = q.customer || "";
  document.getElementById("project_title").value = q.project_title || "";
  document.getElementById("project_address").value = q.project_address || "";
  document.getElementById("discount").value = q.discount || 0;

  if (q.terms_id) document.getElementById("terms_id").value = q.terms_id;

  sectionsEl.innerHTML = "";

  (q.sections||[]).forEach(sec=>{
    const secEl = addSection(sec.section_title);
    const itemsContainer = secEl.querySelector(".items");
    itemsContainer.innerHTML="";
    (sec.items||[]).forEach(it=>{
      addItemFromData(itemsContainer, it);
    });
  });

  calc();
}

/* =========================================================
 * Save (EDIT)
 * ========================================================= */
async function save() {
  const customer = document.getElementById("customer").value.trim();
  if (!customer) {
    alert("Customer required");
    return;
  }

  const sections = [];
  document.querySelectorAll(".section").forEach(sec=>{
    const title = sec.querySelector("input").value.trim();
    if (!title) return;

    const items=[];
    sec.querySelectorAll(".item").forEach(it=>{
      const desc = it.querySelector(".desc-input").value.trim();
      if (!desc) return;
      items.push({
        description: desc,
        UOM: it.querySelector(".uom-input").value.trim(),
        qty: Number(it.querySelector(".qty-input").value)||0,
        price: Number(it.querySelector(".price-input").value)||0
      });
    });

    if (items.length) sections.push({ section_title:title, items });
  });

  if (!sections.length) {
    alert("At least one section required");
    return;
  }

  const payload = {
    id: quotationId,
    customer,
    project_title: document.getElementById("project_title").value,
    project_address: document.getElementById("project_address").value,
    terms_id: document.getElementById("terms_id").value||null,
    discount: Number(document.getElementById("discount").value)||0,
    sections
  };

  const res = await fetch("/api/quotation-edit",{
    method:"POST",
    credentials:"include",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!json.success) {
    alert(json.error || "Save failed");
    return;
  }

  alert("Quotation updated");
  location.href="/quotation-view.html?id="+quotationId;
}

/* =========================================================
 * Init
 * ========================================================= */
loadQuotationForEdit();
