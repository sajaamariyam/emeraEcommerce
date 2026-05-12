const Cart = require("../models/cartSchema");

const cartCount = async (req, res, next) => {
  if (req.path.startsWith("/admin")) return next();
  try {
    let count = 0;

    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user });

      if (cart && cart.items.length > 0) {
        count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      }
    }

    res.locals.cartCount = count;

    next();
  } catch (error) {
    console.error("Cart count middleware error:", error);
    res.locals.cartCount = 0;
    next();
  }
};

module.exports = cartCount;
