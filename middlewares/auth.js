const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
  try {
    if (!req.session.user) {
      req.session.redirectTo = req.originalUrl;
      return req.session.save(() => {
        res.redirect("/login");
      });
    }

    const user = await User.findById(req.session.user);

    if (!user || user.isBlocked) {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        return res.redirect("/login");
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.log("Error in userAuth middleware:", error);
    res.redirect("/login");
  }
};

const saveRedirect = (req, res, next) => {
  if (
    !req.session.user &&
    req.method === "GET" &&
    !req.originalUrl.startsWith("/login") &&
    !req.originalUrl.startsWith("/signup") &&
    !req.originalUrl.startsWith("/auth")
  ) {
    req.session.redirectTo = req.originalUrl;
    console.log("REDIRECT SAVED:", req.session.redirectTo);
  }

  next();
};

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    req.session.redirectTo = req.originalUrl;
    return req.session.save(() => {
      res.redirect("/login");
    });
  }
  next();
};

const noCache = (req, res, next) => {
  res.set("Cache-control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

const adminAuth = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/adminLogin");
    }

    const admin = await User.findById(req.session.admin);

    if (!admin || !admin.isAdmin) {
      return req.session.destroy((err) => {
        res.clearCookie("connect.sid");
        return res.redirect("/admin/adminLogin");
      });
    }

    if (admin.isBlocked) {
      return req.session.destroy((err) => {
        res.clearCookie("connect.sid");
        return res.redirect("/admin/adminLogin");
      });
    }

    res.locals.admin = admin;

    next();
  } catch (error) {
    console.log("Admin auth error:", error);
    res.redirect("/admin/adminLogin");
  }
};

module.exports = {
  userAuth,
  adminAuth,
  noCache,
  saveRedirect,
  requireLogin,
};
