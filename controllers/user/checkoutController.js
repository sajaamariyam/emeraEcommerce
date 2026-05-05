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
  if (addr.firstName !== undefined) {
    return {
      _id: addr._id,
      firstName: addr.firstName || "",
      lastName: addr.lastName || "",
      address1: addr.address1 || addr.street || "",
      address2: addr.address2 || "",
      city: addr.city || "",
      state: addr.state || "",
      pincode: addr.pincode || addr.zipCode || "",
      phone: addr.phone || "",
      isDefault: addr.isDefault || false,
      country: addr.country || "India",
    };
  }

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
    Number(product.regularPrice) ||
    Number(product.price) ||
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

const computeCouponDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;

  let discountAmount = 0;
  if (coupon.isPercentage) {
    discountAmount = Math.round((subtotal * coupon.discountAmount) / 100);
    if (coupon.maxDiscount != null && coupon.maxDiscount > 0) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    }
  } else {
    discountAmount = coupon.discountAmount || coupon.discountValue || 0;
  }

  return Math.min(discountAmount, subtotal);
};

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
    const walletBalance = Number(user.wallet) || 0;

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
      $and: [
        { $or: [{ isUsed: { $ne: true } }, { isPercentage: true }] },
        {
          $or: [{ usedBy: { $exists: false } }, { usedBy: { $nin: [userId] } }],
        },
      ],
    });

    res.render("user/checkout", {
      user,
      cartItems,
      subtotal,
      tax,
      total,
      discount: 0,
      walletBalance,
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
    if (typeof paymentMethod === "string" && paymentMethod.trim()) {
      method = paymentMethod.toLowerCase().trim();
    }

    const user = await User.findById(userId);
    const rawAddress = user?.addresses.id(addressId);
    if (!rawAddress) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid address selected" });
    }
    const address = mapAddress(rawAddress);

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
        return res
          .status(400)
          .json({ success: false, message: "Your cart is empty" });
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

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({
          success: false,
          message: "One or more products no longer exist",
        });
      }
      const variant = product.variants.find((v) => v.color === item.color);
      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Color "${item.color}" is no longer available for ${product.name}`,
        });
      }
      if (variant.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.quantity} unit(s) left for ${product.name} (${item.color}). Please update your cart.`,
        });
      }
      if (product.isBlocked || !product.isListed) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is no longer available`,
        });
      }
    }

    const subtotal = orderItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    let discount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase().trim(),
        isActive: true,
        expiryDate: { $gte: new Date() },
      });

      if (coupon) {
        const minPurchase =
          coupon.minPurchaseAmount || coupon.minOrderAmount || 0;
        if (subtotal >= minPurchase) {
          discount = computeCouponDiscount(coupon, subtotal);
        }
      }
    }

    const discountedSubtotal = subtotal - discount;
    const tax = Math.round(discountedSubtotal * 0.18);
    const finalAmount = Math.max(discountedSubtotal + tax, 0);

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
      paymentMethod: method.toLowerCase(),
      paymentStatus: "pending",
      status: "pending",
      shippingAddress: {
        name: `${address.firstName} ${address.lastName}`.trim(),
        phone: address.phone,
        address: address.address1,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
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
      const walletBalance = Number(user.wallet) || 0;
      if (walletBalance < finalAmount) {
        await Order.deleteOne({ _id: order._id });
        return res
          .status(400)
          .json({ success: false, message: "Insufficient wallet balance" });
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
    return res
      .status(500)
      .json({ success: false, message: "Failed to place order" });
  }
};

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
