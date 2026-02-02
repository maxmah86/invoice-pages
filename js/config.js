/**
 * MMAC Management System - Global Configuration
 */
const CONFIG = {
  // API 基础路径 (如果前端和后端在同一域名，通常为空或 '/api')
  API_BASE_URL: "/api",

  // 系统信息
  SYSTEM_NAME: "Demo Sys",
  VERSION: "1.0.2",

  // 货币符号
  CURRENCY: "RM",

  // 状态颜色配置 (对应 CSS class)
  STATUS_COLORS: {
    PAID: "#2f9e44",
    UNPAID: "#c92a2a",
    OPEN: "#f39c12",
    ACCEPTED: "#27ae60",
    DRAFT: "#7f8c8d"
  },

  // 常用跳转页面
  ROUTES: {
    LOGIN: "/login.html",
    DASHBOARD: "/index.html",
    CHECKLIST: "/work-checklist.html"
  }
};

// 冻结配置对象防止意外修改
Object.freeze(CONFIG);