const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");

const loadCheckout = async (req, res) => {
  try {
    const userId = req.user._id;

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

    const cartCount = cart.items.reduce(
      (sum, item) => sum + item.quantity, 0
    )

    res.render("user/checkout", {
      user: req.user,
      cartItems,
      addresses,
      subtotal,
      tax,
      total,
      cartCount,
      discount: 0,
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
    const { addressId, email, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress) {
      return res.status(400).json({ message: "Invalid address selected" });
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    let totalPrice = 0;
    const orderedItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      const variant = product.variants.find(v => v.color === item.color);
      if (!variant || variant.quantity < item.quantity) {
        return res.status(400).json({
          message: `${product.name} (${item.color}) out of stock`,
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
      userId,
      orderedItems,
      totalPrice,
      discount: 0,
      finalAmount,
      paymentMethod: "COD",
      status: "pending",

      shippingAddress: {
      name: selectedAddress.fullName, 
      phone: selectedAddress.phone,
      email,
      address: selectedAddress.street, 
      city: selectedAddress.city,
      state: selectedAddress.state,
      pincode: selectedAddress.zipCode,
      country: selectedAddress.country,
    },

    });

    await newOrder.save();

    for (const item of cart.items) {
      await Product.updateOne(
        { _id: item.productId._id, "variants.color": item.color },
        { $inc: { "variants.$.quantity": -item.quantity } }
      );
    }

    await Cart.deleteOne({ userId });

    res.json({ success: true, orderId: newOrder.orderId });
  } catch (error) {
    console.error("PLACE ORDER ERROR", error);
    res.status(500).json({ message: "Order failed" });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
};
