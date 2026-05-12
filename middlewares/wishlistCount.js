const User = require("../models/userSchema");

const wishlistCount = async (req, res, next) => {
  if (req.path.startsWith("/admin")) return next();
  try {
    if (req.session.user) {
      const user = await User.findById(req.session.user).select("wishlist");
      res.locals.wishlistCount = user?.wishlist?.length || 0;
    } else {
      res.locals.wishlistCount = 0;
    }

    next();
  } catch (error) {
    console.log("Wishlist count middleware error: ", error);
    res.locals.wishlistCount = 0;
    next();
  }
};

module.exports = wishlistCount;
