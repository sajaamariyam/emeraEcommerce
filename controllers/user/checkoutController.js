const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");

const loadCheckout = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

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

    res.render("user/checkout", {
      user: req.user,
      cartItems,
      subtotal,
      tax,
      total,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD CHECKOUT ERROR", error);
    res.redirect("/pageNotFound");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    let totalPrice = 0;
    const orderedItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (!product || product.isBlocked || !product.isListed) {
        return res.status(400).json({
          success: false,
          message: "Some products are unavailable",
        });
      }

      const variant = product.variants.find((v) => v.color === item.color);

      if (!variant || variant.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} (${item.color}) is out of stock`,
        });
      }

      totalPrice += item.price * item.quantity;

      orderedItems.push({
        productId: product._id,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
      });
    }

    const tax = Math.round(totalPrice * 0.18);
    const finalAmount = totalPrice + tax;

    const newOrder = new Order({
      orderId: `Emera-${Date.now()}`,
      userId: userId,
      orderedItems,
      totalPrice,
      discount: 0,
      finalAmount,
      shippingAddress: {
        name: `${req.body.firstName} ${req.body.lastName}`,
        phone: req.body.phone,
        email: req.body.email,
        address: `${req.body.address1}, ${req.body.address2 || ""}`,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
        country: "India",
      },
      paymentMethod: "COD",
      status: "pending",
    });

    await newOrder.save();

    for (const item of cart.items) {
      await Product.updateOne(
        { _id: item.productId._id, "variants.color": item.color },
        { $inc: { "variants.$.quantity": -item.quantity } },
      );
    }

    await Cart.deleteOne({ userId });

    res.json({
      success: true,
      orderId: newOrder.orderId,
    });
  } catch (error) {
    console.error("PLACE ORDER ERROR ", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
};
