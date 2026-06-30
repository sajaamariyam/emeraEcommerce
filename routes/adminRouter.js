const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin/adminController");
const dashboardController = require("../controllers/admin/dashboardController");
const orderController = require("../controllers/admin/orderController");
const productController = require("../controllers/admin/productController");
const offerController = require("../controllers/admin/offerController");
const salesController = require("../controllers/admin/salesController");
const couponController = require("../controllers/admin/couponController");

const { adminAuth } = require("../middlewares/auth/adminAuth");
const { uploadCategory, uploadProduct } = require("../middlewares/upload");

// ── AUTH ─────────────────────────────────────────────────────
router.get("/adminLogin", adminController.loadLogin);
router.post("/adminLogin", adminController.login);
router.get("/logout", adminController.logout);

router.use(adminAuth);
router.use(noCache);

// ── DASHBOARD ────────────────────────────────────────────────
router.get("/adminDashboard", dashboardController.loadDashboard);
router.get("/dashboard/chart-data", dashboardController.getDashboardChartData);
router.get(
  "/best-selling/products",
  dashboardController.getBestSellingProducts,
);
router.get(
  "/best-selling/categories",
  dashboardController.getBestSellingCategories,
);
router.get("/best-selling/brands", dashboardController.getBestSellingBrands);
router.get("/ledger", dashboardController.generateLedger);

// ── USERS ────────────────────────────────────────────────────
router.get("/users", adminController.loadUsers);
router.post("/users/block/:id", adminController.blockUser);
router.post("/users/unblock/:id", adminController.unblockUser);

// ── CATEGORIES ───────────────────────────────────────────────
router.get("/categories", adminController.loadCategories);
router.post(
  "/categories",
  uploadCategory.single("image"),
  adminController.addCategory,
);
router.post(
  "/categories/edit/:id",
  uploadCategory.single("image"),
  adminController.editCategory,
);
router.patch(
  "/categories/toggleCategoryStatus/:id",
  adminController.toggleCategoryStatus,
);
router.delete("/categories/delete/:id", adminController.deleteCategory);

// ── PRODUCTS ─────────────────────────────────────────────────
router.get("/products", productController.loadProducts);
router.get("/products/:id", productController.getProduct);
router.post(
  "/products/add",
  uploadProduct.array("productImages", 5),
  productController.addProduct,
);
router.post(
  "/products/edit",
  uploadProduct.array("productImages", 5),
  productController.editProduct,
);
router.post("/products/update-stock", productController.updateStock);
router.post("/products/block/:id", productController.blockProduct);
router.post("/products/unblock/:id", productController.unblockProduct);
router.delete("/products/delete/:id", productController.deleteProduct);

// ── ORDERS ───────────────────────────────────────────────────
router.get("/orders", noCache, orderController.loadOrders);
router.post("/orders/update-status", orderController.updateOrderStatus);
router.post("/orders/:id/approve-return", orderController.approveReturn);
router.post("/orders/:id/reject-return", orderController.rejectReturn);
router.get("/orders/:id", orderController.getOrderDetails);

// ── OFFERS ───────────────────────────────────────────────────
router.get("/offers", offerController.loadOffers);
router.post("/offers", offerController.createOffer);
router.get("/offers/:id", offerController.getOffer);
router.put("/offers/:id", offerController.editOffer);
router.post("/offers/toggle/:id", offerController.toggleOfferStatus);
router.post("/offers/delete/:id", offerController.deleteOffer);

// ── COUPONS ──────────────────────────────────────────────────
router.get("/coupons", couponController.loadCoupons);
router.post("/coupons", couponController.createCoupon);
router.delete("/coupons/:id", couponController.deleteCoupon);

// ── SALES REPORT ─────────────────────────────────────────────
router.get("/sales-report", salesController.loadSalesReport);
router.get("/sales-report/pdf", salesController.downloadSalesPDF);
router.get("/sales-report/excel", salesController.downloadSalesExcel);

module.exports = router;
