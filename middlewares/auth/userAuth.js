const User = require("../../models/userSchema");

const userAuth = async (req, res, next) => {
  try {
    if (!req.session.user) {
      req.session.redirectTo = req.originalUrl;
      return req.session.save(() => res.redirect("/login"));
    }

    const user = await User.findById(req.session.user);

    if (!user || user.isBlocked) {
      req.session.user = null;
      return req.session.save(() => {
        res.clearCookie("user.sid");
        res.redirect("/login?blocked=true");
      });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error); 
  }
};

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.session.redirectTo = req.originalUrl;
    return req.session.save(() => res.redirect("/login"));
  }
  next();
};

const noCache = (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

module.exports = { userAuth, requireLogin, noCache };