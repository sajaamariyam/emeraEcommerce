const Coupon = require("../../models/couponSchema");
const Cart   = require("../../models/cartSchema");

const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const now = new Date();

    const coupons = await Coupon.find({
      expiryDate: { $gte: now },
      isUsed: false,
      $or: [
        { userId: { $exists: false } }, 
        { userId: null },
        { userId: userId },             
      ],
    }).select("code discountAmount minPurchaseAmount expiryDate isPercentage maxDiscount");

    return res.json({ success: true, coupons });
  } catch (error) {
    console.error("GET COUPONS ERROR:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch coupons" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const { couponCode } = req.body;
    if (!couponCode)
      return res.status(400).json({ success: false, message: "No coupon code provided" });

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase().trim(),
      expiryDate: { $gte: new Date() },
      isUsed: false,
    });

    if (!coupon)
      return res.status(404).json({ success: false, message: "Invalid or expired coupon" });

    if (coupon.userId && coupon.userId.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: "This coupon is not valid for your account" });

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items.length)
      return res.status(400).json({ success: false, message: "Your cart is empty" });

    const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const minPurchase = coupon.minPurchaseAmount || 0;
    if (subtotal < minPurchase)
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${minPurchase.toLocaleString("en-IN")} required for this coupon`,
      });

    let discountAmount = 0;

    if (coupon.isPercentage) {
      discountAmount = Math.round((subtotal * coupon.discountAmount) / 100);
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountAmount;
    }

    if (discountAmount > subtotal) discountAmount = subtotal;

    const tax      = Math.round(subtotal * 0.18);
    const newTotal = Math.max(subtotal + tax - discountAmount, 0);

    return res.json({
      success: true,
      discountAmount,
      newTotal,
      isPercentage: coupon.isPercentage || false,
      message: `Coupon applied! You save ₹${discountAmount.toLocaleString("en-IN")}`,
    });

  } catch (error) {
    console.error("APPLY COUPON ERROR:", error);
    return res.status(500).json({ success: false, message: "Failed to apply coupon" });
  }
};


const markCouponAsUsed = async (couponCode, userId) => {
  try {
    if (!couponCode) return;
    await Coupon.findOneAndUpdate(
      {
        code: couponCode.toUpperCase().trim(),
        $or: [
          { userId: { $exists: false } },
          { userId: null },
          { userId: userId },
        ],
      },
      { $set: { isUsed: true } }
    );
  } catch (error) {
    console.error("MARK COUPON USED ERROR:", error);
  }
};

module.exports = {
  getAvailableCoupons,
  applyCoupon,
  markCouponAsUsed,
};