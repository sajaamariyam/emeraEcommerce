const Coupon = require("../../models/couponSchema");
const Cart = require("../../models/cartSchema");

const getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const now = new Date();

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: now },
      $and: [
        {
          $or: [{ isUsed: { $ne: true } }, { isPercentage: true }],
        },
        {
          $or: [{ usedBy: { $exists: false } }, { usedBy: { $nin: [userId] } }],
        },
        {
          $or: [
            { userId: { $exists: false } },
            { userId: null },
            { userId: userId },
          ],
        },
      ],
    }).select(
      "code discountAmount minPurchaseAmount expiryDate isPercentage maxDiscount",
    );

    return res.json({ success: true, coupons });
  } catch (error) {
    console.error("GET COUPONS ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch coupons" });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const { couponCode, isBuyNow, buyNowProductId, buyNowQty } = req.body;

    if (!couponCode)
      return res
        .status(400)
        .json({ success: false, message: "No coupon code provided" });

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase().trim(),
      isActive: true,
      expiryDate: { $gte: new Date() },
    });

    if (!coupon)
      return res
        .status(404)
        .json({ success: false, message: "Invalid or expired coupon" });

    const alreadyUsed =
      (coupon.usedBy &&
        coupon.usedBy.some((id) => id.toString() === userId.toString())) ||
      (coupon.isUsed && !coupon.isPercentage);

    if (alreadyUsed)
      return res
        .status(400)
        .json({ success: false, message: "You have already used this coupon" });

    if (coupon.userId && coupon.userId.toString() !== userId.toString())
      return res.status(403).json({
        success: false,
        message: "This coupon is not valid for your account",
      });

    let subtotal = 0;

    if (isBuyNow && buyNowProductId) {
      const Product = require("../../models/productSchema");
      const product = await Product.findById(buyNowProductId);
      if (product) {
        const qty = Math.max(1, parseInt(buyNowQty) || 1);
        const price =
          Number(product.salePrice) ||
          Number(product.price) ||
          Number(product.regularPrice) ||
          0;
        subtotal = price * qty;
      }
    } else {
      const cart = await Cart.findOne({ userId });
      if (!cart || !cart.items.length)
        return res
          .status(400)
          .json({ success: false, message: "Your cart is empty" });
      subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    }

    const minPurchase = coupon.minPurchaseAmount || coupon.minOrderAmount || 0;
    if (subtotal < minPurchase)
      return res.status(400).json({
        success: false,
        message: `Minimum purchase of ₹${minPurchase.toLocaleString("en-IN")} required for this coupon`,
      });

    let discountAmount = 0;

    if (coupon.isPercentage) {
      discountAmount = Math.round((subtotal * coupon.discountAmount) / 100);
      if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else {
      discountAmount = coupon.discountAmount || coupon.discountValue || 0;
    }

    discountAmount = Math.min(discountAmount, subtotal);

    const discountedSubtotal = subtotal - discountAmount;
    const tax = Math.round(discountedSubtotal * 0.18);
    const newTotal = Math.max(discountedSubtotal + tax, 0);

    return res.json({
      success: true,
      discountAmount,
      newTotal,
      isPercentage: coupon.isPercentage || false,
      message: `Coupon applied! You save ₹${discountAmount.toLocaleString("en-IN")}`,
    });
  } catch (error) {
    console.error("APPLY COUPON ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to apply coupon" });
  }
};

const markCouponAsUsed = async (couponCode, userId) => {
  try {
    if (!couponCode) return;

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase().trim(),
    });

    if (!coupon) return;
    await Coupon.findByIdAndUpdate(coupon._id, {
      $addToSet: { usedBy: userId },
    });
  } catch (error) {
    console.error("MARK COUPON USED ERROR:", error);
  }
};

module.exports = {
  getAvailableCoupons,
  applyCoupon,
  markCouponAsUsed,
};
