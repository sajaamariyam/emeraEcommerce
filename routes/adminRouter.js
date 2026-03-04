const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin/adminController");
const dashboardController = require("../controllers/admin/dashboardController");
const orderController = require("../controllers/admin/orderController");
const productController = require("../controllers/admin/productController");
const offerController = require("../controllers/admin/offerController");
const salesController = require("../controllers/admin/salesController");
const couponController = require("../controllers/admin/couponController");
const upload = require("../middlewares/multer");
const { adminAuth, noCache } = require("../middlewares/auth");
const { uploadCategory, uploadProduct } = require("../middlewares/upload");

//AUTH ROUTES
router.get("/adminLogin", adminController.loadLogin);
router.post("/adminLogin", adminController.login);
router.get("/logout", adminController.logout);

//DASHBOARD ROUTES
router.get("/adminDashboard", adminAuth, dashboardController.loadDashboard);

//USER ROUTES
router.get("/users", adminAuth, adminController.loadUsers);
router.post("/users/block/:id", adminAuth, adminController.blockUser);
router.post("/users/unblock/:id", adminAuth, adminController.unblockUser);

//CATEGORY ROUTES
router.get("/categories", adminAuth, adminController.loadCategories);
router.post(
  "/categories",
  adminAuth,
  uploadCategory.single("image"),
  adminController.addCategory,
);
router.post(
  "/categories/edit/:id",
  adminAuth,
  uploadCategory.single("image"),
  adminController.editCategory,
);
router.patch(
  "/categories/toggleCategoryStatus/:id",
  adminAuth,
  adminController.toggleCategoryStatus,
);
router.delete(
  "/categories/delete/:id",
  adminAuth,
  adminController.deleteCategory,
);

//PRODUCT ROUTES
router.get("/products", adminAuth, productController.loadProducts);
router.get("/products/:id", adminAuth, productController.getProduct);
router.post(
  "/products/add",
  adminAuth,
  uploadProduct.array("productImages", 5),
  productController.addProduct,
);
router.post(
  "/products/edit",
  adminAuth,
  uploadProduct.array("productImages", 5),
  productController.editProduct,
);
router.post("/products/update-stock", adminAuth, productController.updateStock);
router.post("/products/block/:id", adminAuth, productController.blockProduct);
router.post(
  "/products/unblock/:id",
  adminAuth,
  productController.unblockProduct,
);
router.delete("/products/delete/:id", adminAuth, productController.deleteProduct);

//ORDER ROUTES
router.get("/orders", adminAuth, noCache, orderController.loadOrders);
router.get("/orders/:id", adminAuth, orderController.getOrderDetails);
router.post(
  "/orders/update-status",
  adminAuth,
  upload.none(),
  orderController.updateOrderStatus,
);
router.patch(
  "/orders/:id/approve-return",
  adminAuth,
  orderController.approveReturn,
);
router.patch(
  "/orders/:id/reject-return",
  adminAuth,
  orderController.rejectReturn,
);

//OFFER ROUTES
router.get("/offers", adminAuth, offerController.loadOffers);
router.post("/offers", adminAuth, offerController.createOffer);
router.post("/offers/toggle/:id", adminAuth, offerController.toggleOfferStatus);
router.post("/offers/delete/:id", adminAuth, offerController.deleteOffer);

//COUPON ROUTES
router.get("/coupons", adminAuth, couponController.loadCoupons);
router.post("/coupons", adminAuth, couponController.createCoupon);
router.delete("/coupons/:id", adminAuth, couponController.deleteCoupon);

//SALES ROUTES
router.get("/sales-report", adminAuth, salesController.loadSalesReport);
router.get("/sales-report/pdf", adminAuth, salesController.downloadSalesPDF);
router.get(
  "/sales-report/excel",
  adminAuth,
  salesController.downloadSalesExcel,
);

module.exports = router;
