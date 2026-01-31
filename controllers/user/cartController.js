const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");

const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart || cart.items.length === 0) {
      return res.render("user/cart", {
        user: req.user,
        cartItems: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        showAnnouncement: false,
      });
    }

    let subtotal = 0;
    const cartItems = [];

    for (const item of cart.items) {
      if (
        !item.productId ||
        item.productId.isBlocked ||
        !item.productId.isListed
      ) {
        continue;
      }

      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      cartItems.push({
        product: item.productId,
        color: item.color,
        quantity: item.quantity,
        price: item.price,
        totalPrice: itemTotal,
      });
    }

    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;

    res.render("user/cart", {
      user: req.user,
      cartItems,
      subtotal,
      tax,
      total,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD CART ERROR:", error);
    res.redirect("/pageNotFound");
  }
};

const addToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, color, buyNow } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
      });
    }

    if (!color) {
      return res.status(400).json({
        success: false,
        message: "Please select a color",
      });
    }

    const product = await Product.findById(productId);

    if (!product || product.isBlocked || !product.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product unavailable",
      });
    }

    const variant = product.variants.find((v) => v.color === color);

    if (!variant || variant.quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Selected variant out of stock",
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      (i) => i.productId.toString() === productId && i.color === color,
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.quantity) {
        return res.status(400).json({
          success: false,
          message: "Stock limit reached",
        });
      }
      existingItem.quantity += 1;
    } else {
      cart.items.push({
        productId,
        color,
        quantity: 1,
        price: product.salePrice,
      });
    }

    await cart.save();

    if (buyNow) {
      return res.json({
        success: true,
        redirect: "/checkout",
      });
    }

    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      cartCount,
    });
  } catch (error) {
    console.error("ADD TO CART ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const incrementQty = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, color } = req.body;

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart) return res.json({ success: false });

    const item = cart.items.find(
      (i) => i.productId._id.toString() === productId && i.color === color,
    );

    if (!item) return res.json({ success: false });

    const variant = item.productId.variants.find((v) => v.color === color);
    if (!variant || item.quantity + 1 > variant.quantity) {
      return res.status(400).json({
        success: false,
        message: "Out of stock",
      });
    }

    item.quantity += 1;
    await cart.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

const decrementQty = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, color } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ success: true });

    const index = cart.items.findIndex(
      (i) => i.productId.toString() === productId && i.color === color,
    );

    if (index === -1) return res.json({ success: true });

    if (cart.items[index].quantity === 1) {
      cart.items.splice(index, 1);
    } else {
      cart.items[index].quantity -= 1;
    }

    await cart.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

const removeItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, color } = req.body;

    await Cart.updateOne(
      { userId },
      { $pull: { items: { productId, color } } },
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
};

module.exports = {
  loadCart,
  addToCart,
  incrementQty,
  decrementQty,
  removeItem,
};
