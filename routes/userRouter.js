const express = require("express");
const router = express.Router();
const passport = require("passport");

const userController = require("../controllers/user/userController");
const cartController = require("../controllers/user/cartController");
const {
  requireLogin,
  userAuth,
  noCache,
  saveRedirect,
} = require("../middlewares/auth");
const { uploadProduct, uploadProfile } = require("../middlewares/upload");
const checkoutController = require("../controllers/user/checkoutController");
const orderController = require("../controllers/user/orderController");
const wishlistController = require("../controllers/user/wishlistController");

//AUTHENTICATION ROUTES
router.get("/login", noCache, userController.loadLogin);
router.post("/login", userController.login);

router.get("/signup", noCache, userController.loadSignup);
router.post("/signup", userController.signup);

router.get("/otp", userController.loadOtp);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);

router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
  }),
  (req, res) => {
    req.session.user = req.user._id;
    const redirectTo = req.session.redirectTo || "/";
    delete req.session.redirectTo;
    res.redirect(redirectTo);
  },
);

router.get("/forgot-password", userController.loadForgotPassword);
router.post("/forgot-password", userController.sendForgotPassword);

router.post("/verify-forgot-otp", userController.verifyForgotOtp);
router.post("/forgot-resend-otp", userController.resendForgotPasswordOtp);

router.get("/reset-password", userController.loadResetPassword);
router.post("/reset-password", userController.resetPassword);

router.get("/", userController.loadHomepage);
router.get("/logout", noCache, userController.logout);

//PRODUCT ROUTES
router.get("/products", userController.loadProducts);
router.get("/products/:id", saveRedirect, userController.loadProductDetails);

router.get("/pageNotFound", userController.pageNotFound);

router.get("/search", userController.searchProducts);

//PROFILE ROUTES
router.get("/profile", requireLogin, noCache, userController.loadProfile);
router.get(
  "/api/profile/orders",
  userAuth,
  noCache,
  orderController.getProfileOrders,
);
router.post(
  "/profile/edit",
  userAuth,
  noCache,
  uploadProfile.single("profileImage"),
  userController.editProfile,
);
router.post(
  "/profile/request-email-otp",
  userAuth,
  userController.requestEmailOtp,
);
router.post(
  "/profile/verify-email-otp",
  userAuth,
  userController.verifyEmailOtp,
);
router.post(
  "/profile/update-after-otp",
  userAuth,
  uploadProfile.single("profileImage"),
  userController.updateProfileAfterOtp,
);
router.get("/profile/addresses", userAuth, userController.getAddresses);
router.post("/profile/addresses", userAuth, userController.addAddress);
router.put(
  "/profile/addresses/:id/set-default",
  userAuth,
  userController.setDefaultAddress,
);
router.put("/profile/addresses/:id", userAuth, userController.updateAddress);
router.delete("/profile/addresses/:id", userAuth, userController.deleteAddress);
router.post(
  "/profile/change-password",
  userAuth,
  userController.changePassword,
);

//CART ROUTES
router.get("/cart", requireLogin, noCache, cartController.loadCart);
router.post("/cart/add", requireLogin, cartController.addToCart);
router.put("/cart/increment/:productId", userAuth, cartController.incrementQty);
router.put("/cart/decrement/:productId", userAuth, cartController.decrementQty);
router.delete("/cart/remove/:productId", userAuth, cartController.removeItem);

//CHECKOUT ROUTES
router.get("/checkout", requireLogin, noCache, checkoutController.loadCheckout);
router.post("/checkout/apply-coupon", userAuth, checkoutController.applyCoupon);
router.post("/checkout", userAuth, checkoutController.placeOrder);

//ORDER ROUTES
router.get(
  "/orderConfirmation/:orderId",
  userAuth,
  noCache,
  orderController.loadOrderConfirmation,
);
router.get("/orders/:orderId", userAuth, orderController.loadOrderDetails);
router.get("/orders", userAuth, orderController.loadOrder);

router.post("/orders/:orderId/cancel", userAuth, orderController.cancelOrder);
router.post(
  "/orders/:orderId/cancel-product",
  userAuth,
  orderController.cancelProduct,
);
router.post("/orders/:orderId/return", userAuth, orderController.returnOrder);
router.get(
  "/orders/:orderId/invoice",
  userAuth,
  orderController.downloadInvoice,
);

//WISHLIST
router.get("/wishlist", requireLogin, wishlistController.getWishlist);
router.post(
  "/wishlist/add/:productId",
  requireLogin,
  wishlistController.addToWishlist,
);
router.delete(
  "/wishlist/remove/:productId",
  userAuth,
  wishlistController.removeFromWishlist,
);
router.post(
  "/wishlist/add-all-to-cart",
  userAuth,
  wishlistController.addAllToCart,
);

module.exports = router;
