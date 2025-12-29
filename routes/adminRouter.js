const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin/adminController");
const { adminAuth } = require("../middlewares/auth");
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
  adminController.addCategory
);
router.post("/categories/edit/:id",adminAuth,uploadCategory.single("image"),adminController.editCategory);

router.patch("/categories/toggleCategoryStatus/:id", adminAuth, adminController.toggleCategoryStatus);

router.delete(
  "/categories/delete/:id",
  adminAuth,
  adminController.deleteCategory
);



router.get("/products", adminAuth, adminController.loadProducts);
router.post(
  "/products/add",
  adminAuth,
  uploadProduct.array("productImages", 5),
  adminController.addProduct
);
router.post(
  "/products/edit",
  adminAuth,
  uploadProduct.array("productImages", 5),
  adminController.editProduct
);
router.post("/products/block/:id", adminAuth, adminController.blockProduct);
router.post("/products/unblock/:id", adminAuth, adminController.unblockProduct);
router.post("/products/delete/:id", adminAuth, adminController.deleteProduct);

module.exports = router;
