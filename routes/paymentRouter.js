const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/user/paymentController");
const { userAuth } = require("../middlewares/auth");

router.post("/payment/verify", userAuth, paymentController.verifyPayment);
router.post(
  "/payment/wallet/:orderId",
  userAuth,
  paymentController.walletPayment,
);
router.get(
  "/payment/create-order/:orderId",
  userAuth,
  paymentController.createRazorpayOrder,
);
router.get(
  "/payment-failed/:orderId",
  userAuth,
  paymentController.paymentFailed,
);
router.get("/payment/:orderId", userAuth, paymentController.loadPayment);

module.exports = router;
