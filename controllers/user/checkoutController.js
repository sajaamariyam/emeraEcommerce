const crypto = require("crypto");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Coupon = require("../../models/couponSchema");

const generateOrderId = () =>
  "ORD-" +
  Date.now() +
  "-" +
  Math.random().toString(36).substring(2, 7).toUpperCase();

const COD_MAX_AMOUNT = 1000;

function mapAddress(addr) {
  const nameParts = (addr.fullName || "").trim().split(" ");
  return {
    _id: addr._id,
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    address1: addr.street || "",
    address2: "",
    city: addr.city || "",
    state: addr.state || "",
    pincode: addr.zipCode || "",
    phone: addr.phone || "",
    isDefault: addr.isDefault || false,
    country: addr.country || "India",
  };
}

function mapCoupon(coupon, subtotal = 0) {
  const obj = coupon.toObject ? coupon.toObject() : { ...coupon };

  let discountAmount = 0;
  if (obj.discountType === "percentage") {
    discountAmount = Math.round(
      (subtotal * (obj.discountValue || obj.discountAmount || 0)) / 100,
    );
    if (obj.maxDiscount)
      discountAmount = Math.min(discountAmount, obj.maxDiscount);
  } else {
    discountAmount = obj.discountValue || obj.discountAmount || 0;
  }

  return { ...obj, discountAmount };
}

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!cart || cart.items.length === 0) {
      req.flash("error", "Your cart is empty");
      return res.redirect("/cart");
    }

    const unavailableNames = [];
    const validRaw = [];

    for (const item of cart.items) {
      const p = item.productId;
      if (!p || p.isBlocked || !p.isListed || !p.category?.isListed) {
        unavailableNames.push(p?.name || "A product");
        continue;
      }
      const variant = p.variants.find((v) => v.color === item.color);
      if (!variant || variant.quantity < item.quantity) {
        unavailableNames.push(p?.name || "A product");
        continue;
      }
      validRaw.push(item);
    }

    if (unavailableNames.length > 0) {
      cart.items = validRaw;
      await cart.save();
      req.flash(
        "error",
        `${unavailableNames.join(", ")} ${
          unavailableNames.length === 1 ? "was" : "were"
        } removed from your cart because ${
          unavailableNames.length === 1 ? "it is" : "they are"
        } unavailable or out of stock.`,
      );
    }

    if (validRaw.length === 0) {
      req.flash("error", "No valid items remain in your cart.");
      return res.redirect("/cart");
    }

    const cartItems = validRaw.map((item) => {
      const p = item.productId;
      const variantStock =
        p.variants.find((v) => v.color === item.color)?.quantity || 0;
      return {
        product: {
          ...p.toObject(),
          stock: variantStock,
        },
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.price * item.quantity,
      };
    });

    const subtotal = cartItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;
    const discount = 0;
    const user = await User.findById(userId);
    const addresses = (user.addresses || []).map(mapAddress);

    const rawCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
    }).catch(() => []);

    const coupons = rawCoupons.map((c) => mapCoupon(c, subtotal));

    res.render("user/checkout", {
      user,
      cartItems,
      subtotal,
      tax,
      total,
      discount,
      walletBalance: user.wallet || 0,
      addresses,
      COD_MAX_AMOUNT,
      coupons,
      showAnnouncement: false,
      messages: {
        success: req.flash("success"),
        error: req.flash("error"),
      },
    });
  } catch (error) {
    console.error("LOAD CHECKOUT ERROR:", error);
    req.flash("error", "Failed to load checkout");
    res.redirect("/cart");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const { addressId, couponCode } = req.body;

    const rawMethod = (req.body.paymentMethod || "").toLowerCase();
    let paymentMethod;
    if (rawMethod === "razorpay") paymentMethod = "ONLINE";
    else if (rawMethod === "cod") paymentMethod = "COD";
    else if (rawMethod === "wallet") paymentMethod = "WALLET";
    else paymentMethod = rawMethod.toUpperCase();

    const user = await User.findById(userId);
    const address = user.addresses.id(addressId);
    if (!address)
      return res
        .status(400)
        .json({ success: false, message: "Invalid address selected" });

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!cart || cart.items.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Your cart is empty" });

    const removedNames = [];
    cart.items = cart.items.filter((item) => {
      const p = item.productId;
      if (!p || p.isBlocked || !p.isListed || !p.category?.isListed) {
        removedNames.push(p?.name || "A product");
        return false;
      }
      const variant = p.variants.find((v) => v.color === item.color);
      if (!variant || variant.quantity < item.quantity) {
        removedNames.push(p?.name || "A product");
        return false;
      }
      return true;
    });

    if (removedNames.length) await cart.save();

    if (cart.items.length === 0)
      return res.status(400).json({
        success: false,
        message: `These items are unavailable: ${removedNames.join(", ")}`,
        removedItems: removedNames,
        redirectTo: "/cart",
      });

    const subtotal = cart.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const tax = Math.round(subtotal * 0.18);
    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
        expiryDate: { $gte: new Date() },
      }).catch(() => null);

      if (coupon && subtotal >= (coupon.minOrderAmount || 0)) {
        discount =
          coupon.discountType === "percentage"
            ? Math.round((subtotal * coupon.discountValue) / 100)
            : coupon.discountValue || coupon.discountAmount || 0;
        if (coupon.maxDiscount)
          discount = Math.min(discount, coupon.maxDiscount);
      }
    }

    const finalAmount = Math.max(subtotal + tax - discount, 0);

    if (paymentMethod === "COD" && finalAmount > COD_MAX_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `COD is not available for orders above ₹${COD_MAX_AMOUNT.toLocaleString("en-IN")}. Please use Online Payment or Wallet.`,
      });
    }

    if (paymentMethod === "WALLET" && (user.wallet || 0) < finalAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Available: ₹${(user.wallet || 0).toLocaleString("en-IN")}, Required: ₹${finalAmount.toLocaleString("en-IN")}`,
      });
    }

    const shippingAddress = {
      name: address.fullName,
      phone: address.phone,
      address: address.street,
      city: address.city,
      state: address.state,
      pincode: address.zipCode,
      country: address.country || "India",
    };

    if (paymentMethod === "ONLINE") {
      const pendingOrder = new Order({
        orderId: generateOrderId(),
        userId,
        orderedItems: cart.items.map((item) => ({
          productId: item.productId._id,
          color: item.color,
          quantity: item.quantity,
          price: item.price,
          itemStatus: "active",
        })),
        totalPrice: subtotal,
        discount,
        finalAmount,
        paymentMethod: "ONLINE",
        paymentStatus: "pending",
        status: "pending",
        shippingAddress,
      });

      await pendingOrder.save();

      return res.json({
        success: true,
        redirectUrl: `/payment/${pendingOrder.orderId}`,
      });
    }

    for (const item of cart.items) {
      await Product.updateOne(
        { _id: item.productId._id, "variants.color": item.color },
        { $inc: { "variants.$.quantity": -item.quantity } },
      );
    }

    const newOrder = new Order({
      orderId: generateOrderId(),
      userId,
      orderedItems: cart.items.map((item) => ({
        productId: item.productId._id,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        itemStatus: "active",
      })),
      totalPrice: subtotal,
      discount,
      finalAmount,
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "pending" : "paid",
      status: "pending",
      shippingAddress,
    });

    await newOrder.save();

    if (paymentMethod === "WALLET") {
      user.wallet -= finalAmount;
      user.walletTransactions.push({
        type: "debit",
        amount: finalAmount,
        description: `Payment for order ${newOrder.orderId}`,
        date: new Date(),
      });
      await user.save();
    }

    cart.items = [];
    await cart.save();

    return res.json({
      success: true,
      redirectUrl: `/order-confirmation/${newOrder.orderId}`,
    });
  } catch (error) {
    console.error("PLACE ORDER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order. Please try again.",
    });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Please login" });

    const { couponCode } = req.body;
    if (!couponCode)
      return res
        .status(400)
        .json({ success: false, message: "No coupon code provided" });

    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      expiryDate: { $gte: new Date() },
    });

    if (!coupon)
      return res
        .status(404)
        .json({ success: false, message: "Invalid or expired coupon" });

    const cart = await Cart.findOne({ userId });
    if (!cart || !cart.items.length)
      return res.status(400).json({ success: false, message: "Cart is empty" });

    const subtotal = cart.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    if (subtotal < (coupon.minOrderAmount || 0))
      return res.status(400).json({
        success: false,
        message: `Minimum order of ₹${coupon.minOrderAmount.toLocaleString("en-IN")} required for this coupon`,
      });

    let discountAmount =
      coupon.discountType === "percentage"
        ? Math.round((subtotal * (coupon.discountValue || 0)) / 100)
        : coupon.discountValue || coupon.discountAmount || 0;
    if (coupon.maxDiscount)
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);

    const tax = Math.round(subtotal * 0.18);
    const newTotal = Math.max(subtotal + tax - discountAmount, 0);

    return res.json({
      success: true,
      discountAmount,
      newTotal,
      message: `Coupon applied! You save ₹${discountAmount.toLocaleString("en-IN")}`,
    });
  } catch (error) {
    console.error("APPLY COUPON ERROR:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to apply coupon" });
  }
};

const handlePaymentFailure = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { razorpay_order_id, error_description } = req.body;

    if (razorpay_order_id) {
      const order = await Order.findOne({
        userId,
        status: "pending",
        paymentStatus: "pending",
      }).sort({ createdAt: -1 });

      if (order) {
        order.status = "cancelled";
        order.cancelReason = error_description || "Payment failed";
        await order.save();
      }
    }

    return res.json({ success: true, message: "Payment failure recorded." });
  } catch (error) {
    console.error("PAYMENT FAILURE HANDLER ERROR:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  applyCoupon,
  handlePaymentFailure,
};
