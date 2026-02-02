// js/company-settings.js
const COMPANY_CONFIG = {
    name: "MMAC Construction",
    regNo: "002972725-A",
    address: "52, Jalan Mahogani SD 1/3, Sri Damansara, 52200 Kuala Lumpur.",
    phone: "0164442128",
    email: "support@mmaclimousine4u.com",
    logoUrl: "/icon-512.png",

    // --- 新增银行信息 ---
    bankName: "Maybank",
    bankAcc: "5142 0863 6636",

    // --- 新增公司盖章（CHOP） ---
    chopUrl: "/chop.png",          // 公司盖章图片
    authorizedTitle: ""
};

function applyCompanySettings() {
    const elements = {
        '#comp-name': COMPANY_CONFIG.name,
        '#comp-reg': `(Reg No: ${COMPANY_CONFIG.regNo})`,
        '#comp-address': COMPANY_CONFIG.address,
        '#comp-contact': `Tel: ${COMPANY_CONFIG.phone} | Email: ${COMPANY_CONFIG.email}`,
        '#bank-info': `${COMPANY_CONFIG.bankName} : ${COMPANY_CONFIG.bankAcc}`
    };

    for (const [selector, value] of Object.entries(elements)) {
        const el = document.querySelector(selector);
        if (el) el.innerText = value;
    }

    // ===== CHOP / SIGNATURE =====
    const chopImg = document.getElementById('company-chop');
    if (chopImg && COMPANY_CONFIG.chopUrl) {
        chopImg.src = COMPANY_CONFIG.chopUrl;
    }

const logo = document.getElementById("company-logo");
  if (logo && COMPANY_CONFIG.logoUrl) {
    logo.src = COMPANY_CONFIG.logoUrl;
    logo.onerror = () => logo.style.display = "none";
  }

    const signTitle = document.getElementById('authorized-title');
    if (signTitle) {
        signTitle.innerText = COMPANY_CONFIG.authorizedTitle;
    }

    const signName = document.getElementById('authorized-name');
    if (signName) {
        signName.innerText = COMPANY_CONFIG.name;
    }
}

document.addEventListener('DOMContentLoaded', applyCompanySettings);