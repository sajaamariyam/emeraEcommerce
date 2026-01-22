const express = require("express");
const router = express.Router();
const passport = require("passport");

const userController = require("../controllers/user/userController");
const cartController = require("../controllers/user/cartController");
const { userAuth, noCache } = require("../middlewares/auth");
const { uploadProduct, uploadProfile } = require("../middlewares/upload");

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
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    req.session.user = req.user._id; 
    res.redirect("/");
  }
);


//AUTHENTICATION ROUTES
router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotPassword);

router.post("/verify-forgot-otp", userController.verifyForgotOtp);
router.post("/forgot-resend-otp", userController.resendForgotPasswordOtp);

router.get("/reset-password",  userController.loadResetPassword);
router.post("/reset-password", userController.resetPassword);


router.get("/", userController.loadHomepage);
router.get("/logout", noCache, userController.logout);

//PRODUCT ROUTES
router.get("/products", userController.loadProducts);
router.get("/products/:id", userController.loadProductDetails);

router.get("/pageNotFound", userController.pageNotFound);

//PROFILE ROUTES
router.get("/profile", userAuth, noCache, userController.loadProfile);
router.post("/profile/edit", userAuth, noCache, uploadProfile.single("profileImage"), userController.editProfile);
router.post("/profile/request-email-otp", userAuth, userController.requestEmailOtp);
router.post("/profile/verify-email-otp", userAuth, userController.verifyEmailOtp);
router.post("/profile/update-after-otp", userAuth, uploadProfile.single("profileImage"), userController.updateProfileAfterOtp);
router.get("/profile/addresses", userAuth, userController.getAddresses);
router.post("/profile/addresses", userAuth, userController.addAddress);
router.put("/profile/addresses/:id/set-default", userAuth, userController.setDefaultAddress);
router.put("/profile/addresses/:id", userAuth, userController.updateAddress);
router.delete("/profile/addresses/:id", userAuth, userController.deleteAddress);
router.post("/profile/change-password", userAuth, userController.changePassword);


//CART ROUTES
router.get("/cart", userAuth, cartController.loadCart);
router.post("/cart/add", userAuth, cartController.addToCart);
router.put("/cart/increment/:productId", userAuth, cartController.incrementQty);
router.put("/cart/decrement/:productId", userAuth, cartController.decrementQty);
router.delete("/cart/remove/:productId", userAuth, cartController.removeItem);



module.exports = router;
