const express = require("express");
const router = express.Router();
const passport = require("passport");

const userController = require("../controllers/user/userController");
const { userAuth, noCache } = require("../middlewares/auth");

console.log("noCache:", noCache);
console.log("loadOtp:", userController.loadOtp);


router.get("/login", noCache, userController.loadLogin);
router.post("/login", userController.login);

router.get("/signup", noCache, userController.loadSignup);
router.post("/signup", userController.signup);

router.get("/otp", noCache, userController.loadOtp);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);



router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res) => {
    req.session.user = req.user._id; 
    res.redirect("/");
  }
);



router.get("/forgot-password", noCache, userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotPassword);

router.post("/verify-forgot-otp", userController.verifyForgotOtp);
router.post("/forgot-resend-otp", userController.resendForgotPasswordOtp);

router.get("/reset-password", noCache, userController.loadResetPassword);
router.post("/reset-password", userController.resetPassword);



router.get("/", noCache, userAuth, userController.loadHomepage);



router.get("/logout", noCache, userController.logout);




router.get("/category/:id", userController.loadCategoryProducts);
router.get("/product/:id", userController.loadProductDetails);

router.get("/pageNotFound", userController.pageNotFound);

module.exports = router;
