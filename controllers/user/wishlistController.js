const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");

const getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.session.user).populate("wishlist");

    if (!user) {
      return res.redirect("/login");
    }

    const wishlistItems = user.wishlist;

    let inStockCount = 0;
    let totalValue = 0;

    wishlistItems.forEach((product) => {
      const totalStock = product.variants.reduce(
        (sum, v) => sum + v.quantity,
        0,
      );

      product.stock = totalStock;

      if (totalStock > 0) {
        inStockCount++;
        totalValue += product.salePrice;
      }
    });

    const cart = await Cart.findOne({userId: req.session.user});
    const cartProductIds = cart 
    ? cart.items.map( i => i.productId.toString())
    : [];

    res.render("user/wishlist", {
      user,
      wishlistItems,
      inStockCount,
      totalValue,
      cartProductIds,
      showAnnouncement: false,
    });
  } catch (error) {
    console.log("GET WISHLSIT ERROR: ", error);
    res.redirect("/pageNotFound");
  }
};

const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.session.user);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Please login",
        code: "AUTH_REQUIRED",
      });
    }

    const alreadyExists = user.wishlist.some(
      (id) => id.toString() === productId,
    );

    if (alreadyExists) {
      return res.json({
        success: false,
        message: "Already in wishlist",
        wishlistCount: user.wishlist.length,
      });
    }

    user.wishlist.push(productId);
    await user.save();

    return res.json({
      success: true,
      message: "Added to wishlist",
      wishlistCount: user.wishlist.length,
    });
  } catch (error) {
    console.log("ADD WISHLIST ERROR:", error);
    res.status(500).json({ success: false });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const user = await User.findById(req.session.user);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Please login",
      });
    }

    user.wishlist = user.wishlist.filter((id) => id.toString() !== productId);

    await user.save();

    return res.json({
      success: true,
      message: "Removed from wishlist",
      wishlistCount: user.wishlist.length,
    });
  } catch (error) {
    console.log("REMOVE WISHLIST ERROR:", error);
    res.status(500).json({ success: false });
  }
};

const addAllToCart = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Login required",
      });
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({
        userId,
        items: [],
      });
    }

    const user = await User.findById(userId).populate("wishlist");

    let addedCount = 0;

    for (const product of user.wishlist) {
      const totalStock = product.variants.reduce(
        (sum, v) => sum + v.quantity,
        0,
      );

      if (totalStock > 0) {
        const exists = cart.items.find(
          (item) =>
            item.productId.toString() === product._id.toString() &&
            item.color === (product.variants[0]?.color || "Default"),
        );

        if (!exists) {
          cart.items.push({
            productId: product._id,
            color: product.variants[0]?.color || "Default",
            quantity: 1,
            price: product.salePrice,
          });

          addedCount++;

          user.wishlist = user.wishlist.filter(
            (id) => id.toString() !== product._id.toString(),
          );
        }
      }
    }

    await cart.save();
    await user.save();

    return res.json({
      success: true,
      cartCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      message: `${addedCount} items added to cart`,
    });
  } catch (error) {
    console.log("ADD ALL ERROR:", error);
    res.status(500).json({ success: false });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  addAllToCart,
};
