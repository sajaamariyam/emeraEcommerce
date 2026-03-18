const crypto = require("crypto");
const razorpay = require("../../config/razorpay");
const User = require("../../models/userSchema");

const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id).select(
      "wallet walletTransactions",
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      balance: user.wallet || 0,
      transactions: user.walletTransactions || [],
    });
  } catch (error) {
    console.error("GET WALLET ERROR:", error);
    return res.status(500).json({ message: "Failed to fetch wallet data" });
  }
};

const addMoneyInit = async (req, res) => {
  try {
    const parsed = parseFloat(req.body.amount);

    if (!parsed || parsed < 1 || parsed > 50000) {
      return res
        .status(400)
        .json({ message: "Invalid amount. Must be between ₹1 and ₹50,000." });
    }

    const user = await User.findById(req.session.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(parsed * 100),
      currency: "INR",
      receipt: `wallet_${user._id}_${Date.now()}`,
      notes: { userId: user._id.toString(), type: "wallet_topup" },
    });

    return res.json({
      success: true,
      razorpayOrder: {
        id: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("WALLET ADD INIT ERROR:", error);
    return res.status(500).json({ message: "Failed to create payment order" });
  }
};

const verifyAndCreditWallet = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Missing payment details" });
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    const rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
    const amountInRupees = rzpOrder.amount / 100;

    const user = await User.findById(req.session.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const alreadyCredited = user.walletTransactions.some(
      (t) => t.razorpayPaymentId === razorpay_payment_id,
    );
    if (alreadyCredited) {
      return res.json({ success: true, balance: user.wallet });
    }

    user.wallet = (user.wallet || 0) + amountInRupees;
    user.walletTransactions.push({
      type: "credit",
      amount: amountInRupees,
      description: "Wallet top-up via Razorpay",
      razorpayPaymentId: razorpay_payment_id,
      date: new Date(),
    });

    await user.save();

    return res.json({
      success: true,
      balance: user.wallet,
      message: `₹${amountInRupees.toFixed(2)} added to wallet`,
    });
  } catch (error) {
    console.error("WALLET VERIFY ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to verify payment" });
  }
};

module.exports = { getWallet, addMoneyInit, verifyAndCreditWallet };
