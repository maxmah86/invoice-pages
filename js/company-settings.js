/* ===============================
   COMPANY SETTINGS (GLOBAL)
   =============================== */

const COMPANY_CONFIG = {
  // ===== BASIC INFO =====
  name: "MMAC Construction",
  regNo: "002972725-A",
  address: "52, Jalan Mahogani SD 1/3, Sri Damansara, 52200 Kuala Lumpur.",
  phone: "016-444 2128",
  email: "support@mmaclimousine4u.com",

  // ===== BRANDING =====
  logoUrl: "/icon-512.png",     // 公司 logo
  chopUrl: "/chop.png",         // 公司盖章（signature / chop）

  // ===== BANK =====
  bankName: "Maybank",
  bankAcc: "5142 0863 6636",

  // ===== SIGNATURE =====
  authorizedTitle: ""           // 为空 = 不显示标题
};


/* ===============================
   APPLY SETTINGS TO PAGE
   =============================== */
function applyCompanySettings() {

  /* ===== LOGO ===== */
  const logo = document.getElementById("company-logo");
  if (logo && COMPANY_CONFIG.logoUrl) {
    logo.src = COMPANY_CONFIG.logoUrl;
    logo.onerror = () => logo.style.display = "none";
  }

  /* ===== COMPANY NAME (ID: comp-name) ===== */
  const compName = document.getElementById("comp-name");
  if (compName) {
    compName.innerText = COMPANY_CONFIG.name;
  }

  /* ===== COMPANY NAME (CLASS: company-name) ===== */
  document.querySelectorAll(".company-name").forEach(el => {
    el.innerText = COMPANY_CONFIG.name;
  });

  /* ===== REG NO ===== */
  const reg = document.getElementById("comp-reg");
  if (reg) {
    reg.innerText = `(${COMPANY_CONFIG.regNo})`;
  }

  /* ===== ADDRESS ===== */
  const addr = document.getElementById("comp-address");
  if (addr) {
    addr.innerText = COMPANY_CONFIG.address;
  }

  /* ===== CONTACT ===== */
  const contact = document.getElementById("comp-contact");
  if (contact) {
    contact.innerText =
      `Tel: ${COMPANY_CONFIG.phone} | Email: ${COMPANY_CONFIG.email}`;
  }

  /* ===== BANK INFO ===== */
  const bank = document.getElementById("bank-info");
  if (bank) {
    bank.innerText =
      `${COMPANY_CONFIG.bankName} : ${COMPANY_CONFIG.bankAcc}`;
  }

  /* ===== CHOP / SIGNATURE IMAGE ===== */
  const chopImg = document.getElementById("company-chop");
  if (chopImg && COMPANY_CONFIG.chopUrl) {
    chopImg.src = COMPANY_CONFIG.chopUrl;
    chopImg.onerror = () => chopImg.style.display = "none";
  }

  /* ===== AUTHORIZED TITLE ===== */
  const signTitle = document.getElementById("authorized-title");
  if (signTitle) {
    if (COMPANY_CONFIG.authorizedTitle) {
      signTitle.innerText = COMPANY_CONFIG.authorizedTitle;
    } else {
      signTitle.style.display = "none";
    }
  }

  /* ===== AUTHORIZED NAME ===== */
  const signName = document.getElementById("authorized-name");
  if (signName) {
    signName.innerText = COMPANY_CONFIG.name;
  }
}


/* ===============================
   INIT
   =============================== */
document.addEventListener("DOMContentLoaded", applyCompanySettings);