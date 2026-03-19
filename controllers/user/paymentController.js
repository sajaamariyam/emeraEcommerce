const razorpay = require("../../config/razorpay");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const crypto = require("crypto");

const loadPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).populate(
      "orderedItems.productId",
    );

    if (!order) {
      return res.redirect("/pageNotFound");
    }

    if (order.paymentStatus === "paid") {
      return res.redirect(`/orderConfirmation/${order.orderId}`);
    }

    const user = await User.findById(order.userId);

    res.render("user/payment", {
      order,
      user,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD PAYMENT ERROR:", error);
    res.redirect("/pageNotFound");
  }
};

const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({
        success: false,
        message: "Order already paid",
      });
    }

    const options = {
      amount: Math.round(order.finalAmount * 100),
      currency: "INR",
      receipt: order.orderId,
    };

    const razorpayOrder = await razorpay.orders.create(options);

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      order_id: razorpayOrder.id,
    });
  } catch (error) {
    console.error("CREATE RAZORPAY ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize payment",
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    console.log("VERIFY PAYMNET BODY", req.body);

    const order = await Order.findOne({ orderId }).populate(
      "orderedItems.productId",
    );

    console.log("ORDER FOUND:", order ? order.orderId : "NOT FOUND");

    if (!order) {
      return res.json({ success: false });
    }

    if (order.paymentStatus === "paid") {
      return res.json({
        success: true,
        redirectUrl: `/orderConfirmation/${order.orderId}`,
      });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    console.log("EXPECTED SIG:", expectedSignature);
    console.log("RECEIVED SIG:", razorpay_signature);
    console.log("SIG MATCH:", expectedSignature === razorpay_signature);

    if (expectedSignature === razorpay_signature) {
      for (const item of order.orderedItems) {
        await Product.updateOne(
          { _id: item.productId._id, "variants.color": item.color },
          { $inc: { "variants.$.quantity": -item.quantity } },
        );
      }

      await Cart.deleteOne({ userId: order.userId });

      order.paymentStatus = "paid";
      order.status = "pending";
      order.razorpayPaymentId = razorpay_payment_id;
      order.paidAt = new Date();

      await order.save();

      return res.json({
        success: true,
        redirectUrl: `/orderConfirmation/${order.orderId}`,
      });
    }

    order.paymentStatus = "failed";
    await order.save();

    return res.json({
      success: false,
      redirectUrl: `/payment-failed/${order.orderId}`,
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error);
    res.json({
      success: false,
      redirectUrl: "/pageNotFound",
    });
  }
};

const walletPayment = async (req, res) => {
  try {
    console.log("WALLET PAYMENT HIT, orderId:", req.params.orderId);
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId }).populate(
      "orderedItems.productId",
    );
    const user = await User.findById(order.userId);

    console.log("USER WALLET:", user.wallet);
    console.log("ORDER FINAL AMOUNT:", order.finalAmount);
    console.log("ORDER PAYMENT STATUS:", order.paymentStatus);

    if (!order || !user) {
      return res.json({ success: false, message: "Invalid order" });
    }

    if (order.paymentStatus === "paid") {
      return res.json({ success: false, message: "Already paid" });
    }

    if (user.wallet < order.finalAmount) {
      return res.json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    user.wallet -= order.finalAmount;

    user.walletTransactions.push({
      type: "debit",
      amount: order.finalAmount,
      description: `Payment for order ${order.orderId}`,
      date: new Date(),
    });

    await user.save();
    console.log("USER SAVED");

    console.log("PRODUCTS UPDATED");

    await Cart.deleteOne({ userId: order.userId });
    console.log("CART DELETED");

    order.status = "pending";
    order.paymentMethod = "WALLET";
    order.paymentStatus = "paid";
    order.paidAt = new Date();
    console.log("SAVING ORDER...");

    await order.save();

    console.log("ORDER SAVED");

    console.log(
      "SENDING SUCCESS RESPONSE:",
      `/orderConfirmation/${order.orderId}`,
    );
    res.json({
      success: true,
      redirectUrl: `/orderConfirmation/${order.orderId}`,
    });
  } catch (error) {
    console.error("WALLET PAYMENT ERROR:", error);
    res.json({
      success: false,
      message: "Wallet payment failed",
    });
  }
};

const paymentFailed = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId });

    if (!order) {
      return res.redirect("/pageNotFound");
    }

    res.render("user/paymentFailed", {
      order,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("PAYMENT FAILED PAGE ERROR:", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  loadPayment,
  createRazorpayOrder,
  verifyPayment,
  walletPayment,
  paymentFailed,
};
