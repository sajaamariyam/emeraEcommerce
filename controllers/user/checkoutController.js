const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Coupon = require("../../models/couponSchema");

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;

    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const user = await User.findById(userId);
    const addresses = user?.addresses || [];

    let subtotal = 0;
    const cartItems = [];

    for (let item of cart.items) {
      if (!item.productId || item.productId.isBlocked) {
        continue;
      }

      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      cartItems.push({
        product: item.productId,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
      });
    }

    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;

    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    const coupons = await Coupon.find({
      userId,
      isUsed: false,
      expiryDate: { $gte: new Date() },
    });

    res.render("user/checkout", {
      user,
      cartItems,
      addresses,
      subtotal,
      tax,
      total,
      cartCount,
      discount: 0,
      coupons,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD CHECKOUT ERROR", error);
    res.redirect("/pageNotFound");
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    const { couponCode } = req.body;

    if (!couponCode) {
      return res
        .status(400)
        .json({ success: false, message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({
      code: couponCode.trim().toUpperCase(),
      userId,
      isUsed: false,
      expiryDate: { $gte: new Date() },
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let subtotal = 0;
    for (const item of cart.items) {
      if (!item.productId || item.productId.isBlocked) continue;
      subtotal += item.price * item.quantity;
    }

    const tax = Math.round(subtotal * 0.18);
    const grossTotal = subtotal + tax;

    if (coupon.discountAmount > grossTotal) {
      return res.status(400).json({
        success: false,
        message: "Coupon discount exceeds order total",
      });
    }

    const newTotal = Math.max(0, grossTotal - coupon.discountAmount);

    return res.json({
      success: true,
      discountAmount: coupon.discountAmount,
      newTotal,
      message: `Coupon applied! You saved ₹${coupon.discountAmount}`,
    });
  } catch (error) {
    console.error("APPLY COUPON ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to apply coupon" });
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, email, phone, paymentMethod, couponCode } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress)
      return res.status(400).json({ message: "Invalid address selected" });

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0)
      return res.status(400).json({ message: "Cart is empty" });

    let totalPrice = 0;
    const orderedItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (!product || product.isBlocked)
        return res.status(400).json({ message: "Product unavailable" });

      const variant = product.variants.find((v) => v.color === item.color);

      if (!variant || variant.quantity < item.quantity)
        return res.status(400).json({ message: "Out of stock" });

      const latestPrice = product.salePrice;
      totalPrice += latestPrice * item.quantity;

      orderedItems.push({
        productId: product._id,
        color: item.color,
        quantity: item.quantity,
        price: latestPrice,
      });
    }

    const tax = Math.round(totalPrice * 0.18);
    const grossAmount = totalPrice + tax;

    let discount = 0;
    let appliedCoupon = null;

    if (couponCode && couponCode.trim() !== "") {
      const coupon = await Coupon.findOne({
        code: couponCode.trim().toUpperCase(),
        userId,
        isUsed: false,
        expiryDate: { $gte: new Date() },
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Coupon is invalid, expired, or already used",
        });
      }

      discount = Math.min(coupon.discountAmount, grossAmount);
      appliedCoupon = coupon;
    }

    const finalAmount = Math.max(0, grossAmount - discount);

    const finalPaymentMethod =
      paymentMethod === "razorpay" || paymentMethod === "wallet"
        ? "ONLINE"
        : "COD";

    const newOrder = new Order({
      orderId: `Emera-${Date.now()}`,
      userId,
      orderedItems,
      totalPrice,
      discount,
      finalAmount,
      paymentMethod: finalPaymentMethod,
      status: "pending",
      paymentStatus: "pending",
      shippingAddress: {
        name: selectedAddress.fullName,
        phone: selectedAddress.phone || phone,
        email,
        address: selectedAddress.street,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.zipCode,
        country: selectedAddress.country,
      },
    });

    await newOrder.save();

    if (appliedCoupon) {
      appliedCoupon.isUsed = true;
      await appliedCoupon.save();
    }

    if (finalPaymentMethod === "COD") {
      for (const item of cart.items) {
        await Product.updateOne(
          { _id: item.productId._id, "variants.color": item.color },
          { $inc: { "variants.$.quantity": -item.quantity } },
        );
      }

      await Cart.deleteOne({ userId });

      return res.json({
        success: true,
        redirectUrl: `/orderConfirmation/${newOrder.orderId}`,
      });
    }

    return res.json({
      success: true,
      redirectUrl: `/payment/${newOrder.orderId}`,
    });
  } catch (error) {
    console.error("PLACE ORDER ERROR", error);
    res.status(500).json({ message: "Order failed" });
  }
};

module.exports = {
  loadCheckout,
  applyCoupon,
  placeOrder,
};
