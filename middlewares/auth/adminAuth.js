const User = require("../../models/userSchema");

const adminAuth = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/adminLogin");
    }

    const admin = await User.findById(req.session.admin);

    if (!admin || !admin.isAdmin || admin.isBlocked) {
      req.session.admin = null;
      return req.session.save(() => {
        res.clearCookie("admin.sid");
        res.redirect("/admin/adminLogin");
      });
    }

    res.locals.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { adminAuth };