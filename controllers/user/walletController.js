const crypto = require("crypto");
const razorpay = require("../../config/razorpay");
const User = require("../../models/userSchema");

const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.session.user).select(
      "wallet walletTransactions name",
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    return res.json({
      success: true,
      balance: user.wallet || 0,
      transactions: (user.walletTransactions || []).sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      ),
    });
  } catch (error) {
    console.error("GET WALLET ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch wallet data" });
  }
};

const addMoneyInit = async (req, res) => {
  try {
    const parsed = parseFloat(req.body.amount);

    if (!parsed || isNaN(parsed) || parsed < 1 || parsed > 50000) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Must be between ₹1 and ₹50,000.",
      });
    }

    const user = await User.findById(req.session.user);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    let rzpOrder;
    try {
      rzpOrder = await razorpay.orders.create({
        amount: Math.round(parsed * 100),
        currency: "INR",
        receipt: `w_${user._id.toString().slice(-8)}_${Date.now().toString().slice(-6)}`,
        notes: {
          userId: user._id.toString(),
          type: "wallet_topup",
          amount: parsed.toString(),
        },
      });
    } catch (rzpErr) {
      console.error("RAZORPAY ORDER CREATE ERROR:", rzpErr);
      return res.status(502).json({
        success: false,
        message:
          rzpErr?.error?.description ||
          "Payment gateway error. Please try again.",
      });
    }

    return res.json({
      success: true,
      razorpayOrder: {
        id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
      userName: user.name,
    });
  } catch (error) {
    console.error("WALLET ADD INIT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again.",
    });
  }
};

const verifyAndCreditWallet = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message:
          "Missing payment verification details. Please contact support.",
      });
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      console.warn(
        `WALLET: Signature mismatch for payment ${razorpay_payment_id}`,
      );
      return res.status(400).json({
        success: false,
        message:
          "Payment verification failed. If money was deducted, it will be refunded within 5–7 business days. Contact support with your payment ID.",
        paymentId: razorpay_payment_id,
      });
    }

    let rzpOrder;
    try {
      rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
    } catch (rzpErr) {
      console.error("RAZORPAY FETCH ORDER ERROR:", rzpErr);
      return res.status(502).json({
        success: false,
        message:
          "Could not verify payment with Razorpay. Please contact support with your payment ID.",
        paymentId: razorpay_payment_id,
      });
    }

    const amountInRupees = rzpOrder.amount / 100;

    const user = await User.findById(req.session.user);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const alreadyCredited = (user.walletTransactions || []).some(
      (t) => t.razorpayPaymentId === razorpay_payment_id,
    );
    if (alreadyCredited) {
      return res.json({
        success: true,
        balance: user.wallet,
        message: "Payment already credited to wallet.",
      });
    }

    user.wallet = (user.wallet || 0) + amountInRupees;
    user.walletTransactions.push({
      type: "credit",
      amount: amountInRupees,
      description: "Wallet top-up via Razorpay",
      razorpayPaymentId: razorpay_payment_id,
      date: new Date(),
    });

    try {
      await user.save();
    } catch (saveErr) {
      return res.status(500).json({
        success: false,
        message:
          "Payment was received but wallet update failed. Please contact support with your payment ID and we will credit your wallet manually.",
        paymentId: razorpay_payment_id,
      });
    }

    return res.json({
      success: true,
      balance: user.wallet,
      message: `₹${amountInRupees.toLocaleString("en-IN")} added to your wallet successfully!`,
    });
  } catch (error) {
    console.error("WALLET VERIFY ERROR:", error);
    return res.status(500).json({
      success: false,
      message:
        "Failed to verify payment. Please contact support if amount was deducted.",
    });
  }
};

const handleWalletPaymentFailure = async (req, res) => {
  try {
    const { razorpay_order_id, error_description } = req.body;

    console.log(
      `WALLET: Payment failed/dismissed for order ${razorpay_order_id}. Reason: ${error_description}`,
    );

    return res.json({
      success: true,
      message:
        "Payment was not completed. No amount was deducted from your account.",
    });
  } catch (error) {
    console.error("WALLET FAILURE HANDLER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getWallet,
  addMoneyInit,
  verifyAndCreditWallet,
  handleWalletPaymentFailure,
};
