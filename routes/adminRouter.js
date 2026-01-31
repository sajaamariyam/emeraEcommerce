const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin/adminController");
const orderController = require("../controllers/admin/orderController");
const productController = require("../controllers/admin/productController");

const upload = require("../middlewares/multer");
const { adminAuth, noCache } = require("../middlewares/auth");
const { uploadCategory, uploadProduct } = require("../middlewares/upload");

router.get("/adminLogin", adminController.loadLogin);
router.post("/adminLogin", adminController.login);
router.get("/logout", adminController.logout);

router.get("/adminDashboard", adminAuth, adminController.loadDashboard);

router.get("/users", adminAuth, adminController.loadUsers);
router.post("/users/block/:id", adminAuth, adminController.blockUser);
router.post("/users/unblock/:id", adminAuth, adminController.unblockUser);

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

router.get("/products", adminAuth, productController.loadProducts);
router.get("/products/:id", productController.getProduct);
router.get("/products/:id", adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product) return res.status(404).json({ message: "Not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Error fetching product" });
  }
});

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
router.post("/products/delete/:id", adminAuth, productController.deleteProduct);

//ORDER ROUTES

router.get("/orders", adminAuth, noCache, orderController.loadOrders);
router.get("/orders/:id", adminAuth, orderController.getOrderDetails);
router.post(
  "/orders/update-status",
  adminAuth,
  upload.none(),
  orderController.updateOrderStatus,
);

module.exports = router;
