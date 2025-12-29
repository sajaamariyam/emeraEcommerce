const express = require("express");
const router = express.Router();
const passport = require("passport");

const userController = require("../controllers/user/userController");
const { userAuth, noCache } = require("../middlewares/auth");

console.log("loadOtp:", userController.loadOtp);


router.get("/login", userController.loadLogin);
router.post("/login", userController.login);

router.get("/signup",  userController.loadSignup);
router.post("/signup", userController.signup);

router.get("/otp", userController.loadOtp);
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



router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotPassword);

router.post("/verify-forgot-otp", userController.verifyForgotOtp);
router.post("/forgot-resend-otp", userController.resendForgotPasswordOtp);

router.get("/reset-password",  userController.loadResetPassword);
router.post("/reset-password", userController.resetPassword);



router.get("/", userController.loadHomepage);

router.get("/logout", userController.logout);

router.get("/products", userController.loadProducts);

router.get("/products/:id", userController.loadProductDetails);



router.get("/pageNotFound", userController.pageNotFound);




module.exports = router;
