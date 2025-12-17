const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const {adminAuth, userAuth} = require("../middlewares/auth");


router.get("/pageerror", adminController.pageerror);
router.get("/adminLogin", adminController.loadLogin);
router.post("/adminLogin", adminController.login);

router.get("/adminDashboard", adminController.loadDashboard);
router.get("/", (req, res) => {
    res.redirect("/admin/adminDashboard");
});

router.get("/users", adminAuth, adminController.loadUsers);
router.post("/users/block/:id", adminAuth, adminController.blockUser);
router.post("/users/unblock/:id", adminAuth, adminController.unblockUser);

router.get("/categories", adminAuth, adminController.loadCategories);
router.post("/categories/add", adminAuth, adminController.addCategory);
router.post("/categories/edit/:id", adminAuth, adminController.editCategory);
router.post("/categories/toggle-status/:id", adminAuth, adminController.toggleCategoryStatus);

router.get("/products", adminAuth, adminController.loadProducts);
router.get("/products/add", adminAuth, adminController.loadAddProducts);
router.post("/products/add", adminAuth, adminController.addProduct);


router.get("/logout", adminController.logout);

console.log(adminController);


module.exports = router;
