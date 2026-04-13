const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const getBestOffer = require("../../helpers/offerHelper");

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
        cartCount: 0,
        showAnnouncement: false,
      });
    }

    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

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
      cartCount,
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
    const { productId, color, quantity, buyNow } = req.body; 
    const MAX_CART_QTY = 5;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
      });
    }

    if (buyNow) {
      const qty = parseInt(quantity) || 1;
      return res.json({
        success: true,
        redirect: `/checkout?buyNow=${productId}&color=${encodeURIComponent(color || "")}&qty=${qty}`,
      });
    }

    const product = await Product.findById(productId).populate("category");

    if (
      !product ||
      product.isBlocked ||
      !product.isListed ||
      !product.category.isListed
    ) {
      return res.status(400).json({
        success: false,
        message: "Product unavailable",
      });
    }

    let selectedColor = color;

    if (!selectedColor) {
      const firstAvailable = product.variants.find((v) => v.quantity > 0);

      if (!firstAvailable) {
        return res.status(400).json({
          success: false,
          message: "Out of stock",
        });
      }

      selectedColor = firstAvailable.color;
    }

    const variant = product.variants.find((v) => v.color === selectedColor);

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
      (i) => i.productId.toString() === productId && i.color === selectedColor,
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.quantity) {
        return res.status(400).json({
          success: false,
          message: "Stock limit reached",
        });
      }

      if (existingItem.quantity + 1 > MAX_CART_QTY) {
        return res.status(400).json({
          success: false,
          message: "Maximum quantity limit reached",
        });
      }

      const offer = await getBestOffer(product);
      existingItem.price = Math.round(offer.finalPrice);
      existingItem.quantity += 1;
    } else {
      const offer = await getBestOffer(product);
      const finalPrice = Math.round(offer.finalPrice);

      cart.items.push({
        productId,
        color: selectedColor,
        quantity: 1,
        price: finalPrice,
      });
    }

    await cart.save();

    await User.updateOne({ _id: userId }, { $pull: { wishlist: productId } });

    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    return res.json({
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
    const { productId } = req.params;
    const { color } = req.body;

    console.log("PARAMS:", req.params);
    console.log("BODY:", req.body);

    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart)
      return res
        .status(400)
        .json({ success: false, message: "Cart not found" });

    const item = cart.items.find(
      (i) =>
        i.productId._id.toString() === productId &&
        i.color.toLowerCase() === color.toLowerCase(),
    );

    if (!item)
      return res
        .status(400)
        .json({ success: false, message: "Item not found" });

    if (item.productId.isBlocked || !item.productId.isListed) {
      return res.status(400).json({
        success: false,
        message: "Product unavailable",
      });
    }

    if (!item.productId.variants || !item.productId.variants.length) {
      return res.status(400).json({
        success: false,
        message: "variants not available for this product",
      });
    }

    console.log("VARIANTS:", item.productId.variants);

    const variant = item.productId.variants.find(
      (v) => v.color.toLowerCase() === color.toLowerCase(),
    );

    if (!variant) {
      return res.status(400).json({
        success: false,
        message: "Selected variant not found",
      });
    }
    const MAX_CART_QTY = 5;

    if (item.quantity + 1 > variant.quantity) {
      return res.status(400).json({
        success: false,
        message: "Out of stock",
      });
    }

    if (item.quantity + 1 > MAX_CART_QTY) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity limit reached",
      });
    }

    item.quantity += 1;
    await cart.save();

    const updatedCart = await Cart.findOne({ userId });

    res.json({
      success: true,
      quantity: item.quantity,
      itemTotal: item.price * item.quantity,
    });
  } catch (error) {
    console.log("INCREMENT ERROR:", error);
    res.status(500).json({ success: false });
  }
};

const decrementQty = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;
    const { color } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart)
      return res.status(400).json({ success: true, message: "Cart not found" });

    const index = cart.items.findIndex(
      (i) =>
        i.productId.toString() === productId &&
        i.color.toLowerCase() === color.toLowerCase(),
    );

    if (index === -1)
      return res.status(400).json({ success: true, message: "Item not found" });

    if (cart.items[index].quantity === 1) {
      cart.items.splice(index, 1);
    } else {
      cart.items[index].quantity -= 1;
    }

    await cart.save();

    const updatedCart = await Cart.findOne({ userId });
    let subtotal = 0;
    updatedCart.items.forEach((i) => {
      subtotal += i.price * i.quantity;
    });
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;
    const cartEmpty = updatedCart.items.length === 0;

    const updatedItem = updatedCart.items.find(
      (i) => i.productId.toString() === productId,
    );
    res.json({
      success: true,
      quantity: updatedItem ? updatedItem.quantity : 0,
      subtotal,
      tax,
      total,
      cartEmpty,
    });
  } catch (error) {
    console.error("DECREMENT ERROR: ", error);
    res.status(500).json({ success: false });
  }
};

const removeItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.params;
    const { color } = req.body;

    const result = await Cart.updateOne(
      { userId },
      { $pull: { items: { productId, color } } },
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Item not found or already removed",
      });
    }

    const updatedCart = await Cart.findOne({ userId });
    let subtotal = 0;
    if (updatedCart)
      updatedCart.items.forEach((i) => {
        subtotal += i.price * i.quantity;
      });
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;
    const cartEmpty = !updatedCart || updatedCart.items.length === 0;

    res.json({ success: true, subtotal, tax, total, cartEmpty });
  } catch (error) {
    console.error("REMOVE ERROR: ", error);
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
