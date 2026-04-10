const crypto = require("crypto");

const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const { markCouponAsUsed } = require("./couponController");

const COD_MAX_AMOUNT = 1000;

const generateOrderId = () =>
  "ORD-" +
  Date.now() +
  "-" +
  Math.random().toString(36).substring(2, 7).toUpperCase();

const mapAddress = (addr) => {
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
};

const getBestOfferPrice = async (product) => {
  const now = new Date();

  const basePrice =
    Number(product.price) ||
    Number(product.regularPrice) ||
    Number(product.basePrice) ||
    0;

  const salePrice =
    Number(product.salePrice) || Number(product.offerPrice) || 0;

  const [productOffer, categoryOffer] = await Promise.all([
    Offer.findOne({
      offerType: "product",
      productId: product._id,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }),
    Offer.findOne({
      offerType: "category",
      categoryId: product.category,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }),
  ]);

  let discount = 0;

  if (productOffer) discount = productOffer.discountPercentage;
  if (categoryOffer && categoryOffer.discountPercentage > discount) {
    discount = categoryOffer.discountPercentage;
  }

  if (discount > 0) {
    return Math.round(basePrice - (basePrice * discount) / 100);
  }

  return salePrice || basePrice;
};

//
// ========================== LOAD CHECKOUT ==========================
//
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const { buyNow, color: buyColor, qty: buyQty } = req.query;

    let cartItems = [];
    let isBuyNow = false;

    if (buyNow) {
      isBuyNow = true;

      const product = await Product.findById(buyNow).populate("category");
      const quantity = Math.max(1, parseInt(buyQty) || 1);

      const variant = product?.variants.find((v) => v.color === buyColor);

      if (
        !product ||
        product.isBlocked ||
        !product.isListed ||
        !product.category?.isListed ||
        !variant ||
        variant.quantity < quantity
      ) {
        req.flash("error", "Product unavailable");
        return res.redirect("/");
      }

      const finalPrice = await getBestOfferPrice(product);

      cartItems = [
        {
          product: { ...product.toObject(), stock: variant.quantity },
          color: buyColor,
          quantity,
          price: finalPrice,
          totalPrice: finalPrice * quantity,
        },
      ];
    } else {
      const cart = await Cart.findOne({ userId }).populate({
        path: "items.productId",
        populate: { path: "category" },
      });

      if (!cart || !cart.items.length) {
        req.flash("error", "Your cart is empty");
        return res.redirect("/cart");
      }

      const validItems = cart.items.filter((item) => {
        const p = item.productId;
        const variant = p?.variants.find((v) => v.color === item.color);

        return (
          p &&
          !p.isBlocked &&
          p.isListed &&
          p.category?.isListed &&
          variant &&
          variant.quantity >= item.quantity
        );
      });

      if (!validItems.length) {
        req.flash("error", "No valid items in cart");
        return res.redirect("/cart");
      }

      cartItems = await Promise.all(
        validItems.map(async (item) => {
          const p = item.productId;

          const variantStock =
            p.variants.find((v) => v.color === item.color)?.quantity || 0;

          const finalPrice = await getBestOfferPrice(p);

          const quantity = Math.max(1, parseInt(item.quantity) || 1);

          return {
            product: { ...p.toObject(), stock: variantStock },
            color: item.color,
            quantity,
            price: finalPrice,
            totalPrice: finalPrice * quantity,
          };
        }),
      );
    }

    const subtotal = cartItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;

    const user = await User.findById(userId);

    const coupons = await Coupon.find({
      isActive: true,
      isUsed: false,
      expiryDate: { $gte: new Date() },
    });

    res.render("user/checkout", {
      user,
      cartItems,
      subtotal,
      tax,
      total,
      discount: 0,
      walletBalance: user.wallet || 0,
      addresses: (user.addresses || []).map(mapAddress),
      COD_MAX_AMOUNT,
      coupons,
      isBuyNow,
      buyNowProductId: buyNow || null,
      buyNowColor: buyColor || null,
      buyNowQty: buyQty || null,
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

//
// ========================== PLACE ORDER ==========================
//

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please login" });
    }

    const {
      addressId,
      couponCode,
      paymentMethod,
      isBuyNow,
      buyNowProductId,
      buyNowColor,
      buyNowQty,
    } = req.body;

    let method = "razorpay";

    if (typeof paymentMethod === "string") {
      method = paymentMethod.toLowerCase();
    }

    console.log("FIXED PAYMENT METHOD:", method);

    const user = await User.findById(userId);
    const address = user?.addresses.id(addressId);

    if (!address) {
      return res.status(400).json({
        success: false,
        message: "Invalid address selected",
      });
    }

    let items = [];
    let cartRef = null;

    if (isBuyNow) {
      const product =
        await Product.findById(buyNowProductId).populate("category");

      if (!product) {
        return res
          .status(400)
          .json({ success: false, message: "Product not found" });
      }

      items = [
        {
          productId: product,
          color: buyNowColor,
          quantity: Math.max(1, parseInt(buyNowQty) || 1),
        },
      ];
    } else {
      cartRef = await Cart.findOne({ userId }).populate({
        path: "items.productId",
        populate: { path: "category" },
      });

      if (!cartRef || !cartRef.items.length) {
        return res.status(400).json({
          success: false,
          message: "Your cart is empty",
        });
      }

      items = cartRef.items;
    }

    const orderItems = await Promise.all(
      items.map(async (item) => {
        const p = item.productId;

        const price = await getBestOfferPrice(p);
        const quantity = Math.max(1, parseInt(item.quantity) || 1);

        return {
          productId: p._id,
          color: item.color,
          quantity,
          price,
          itemStatus: "active",
        };
      }),
    );

    const subtotal = orderItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const tax = Math.round(subtotal * 0.18);

    let discount = 0;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
        isUsed: false,
        expiryDate: { $gte: new Date() },
      });

      if (coupon && subtotal >= (coupon.minPurchaseAmount || 0)) {
        discount = coupon.isPercentage
          ? Math.min(
              Math.round((subtotal * coupon.discountAmount) / 100),
              coupon.maxDiscount || Infinity,
            )
          : coupon.discountAmount;
      }
    }

    const finalAmount = Math.max(subtotal + tax - discount, 0);

    if (method === "cod" && finalAmount > COD_MAX_AMOUNT) {
      return res.status(400).json({
        success: false,
        message: `COD not available above ₹${COD_MAX_AMOUNT}`,
      });
    }

    const order = new Order({
      orderId: generateOrderId(),
      userId,
      orderedItems: orderItems,
      totalPrice: subtotal,
      discount,
      finalAmount,
      paymentMethod: method.toUpperCase(),
      paymentStatus: method === "cod" ? "pending" : "pending",
      status: "pending",
      shippingAddress: {
        name: address.fullName,
        phone: address.phone,
        address: address.street,
        city: address.city,
        state: address.state,
        pincode: address.zipCode,
        country: address.country || "India",
      },
      couponCode: couponCode || null,
    });

    await order.save();

    if (method === "razorpay") {
      return res.json({
        success: true,
        redirectUrl: `/payment/${order.orderId}`,
      });
    }

    if (method === "wallet") {
      if ((user.wallet || 0) < finalAmount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }

      user.wallet -= finalAmount;

      user.walletTransactions.push({
        type: "debit",
        amount: finalAmount,
        description: `Payment for order ${order.orderId}`,
        date: new Date(),
      });

      await user.save();

      order.paymentStatus = "paid";
      await order.save();
    }

    for (const item of orderItems) {
      await Product.updateOne(
        { _id: item.productId, "variants.color": item.color },
        { $inc: { "variants.$.quantity": -item.quantity } },
      );
    }

    if (!isBuyNow && cartRef) {
      cartRef.items = [];
      await cartRef.save();
    }

    if (couponCode) {
      await markCouponAsUsed(couponCode, userId);
    }

    return res.json({
      success: true,
      redirectUrl: `/orderConfirmation/${order.orderId}`,
    });
  } catch (error) {
    console.error("PLACE ORDER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
};

// ========================== PAYMENT FAILURE ==========================

const handlePaymentFailure = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.body.orderId });

    if (order) {
      order.status = "cancelled";
      order.cancelReason = req.body.error_description || "Payment failed";
      await order.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("PAYMENT FAILURE ERROR:", error);
    res.status(500).json({ success: false });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  handlePaymentFailure,
};
