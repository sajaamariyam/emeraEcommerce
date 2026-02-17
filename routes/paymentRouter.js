const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/user/paymentController");

router.get("/payment/:orderId", paymentController.loadPayment);

router.get(
  "/payment/create-order/:orderId",
  paymentController.createRazorpayOrder,
);

router.post("/payment/verify", paymentController.verifyPayment);

router.post("/payment/wallet/:orderId", paymentController.walletPayment);

router.get("/payment-failed/:orderId", paymentController.paymentFailed);

module.exports = router;
