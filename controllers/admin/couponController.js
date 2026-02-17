const Coupon = require("../../models/couponSchema");
const User = require("../../models/userSchema");

const loadCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";

    let filter = {};
    if (search) {
      filter.code = { $regex: search, $options: "i" };
    }

    const totalCoupons = await Coupon.countDocuments(filter);
    const coupons = await Coupon.find(filter)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const activeCoupons = await Coupon.countDocuments({
      isUsed: false,
      expiryDate: { $gte: new Date() },
    });
    const usedCoupons = await Coupon.countDocuments({ isUsed: true });
    const expiredCoupons = await Coupon.countDocuments({
      expiryDate: { $lt: new Date() },
      isUsed: false,
    });

    const users = await User.find({ isAdmin: false })
      .select("name email")
      .sort({ name: 1 });

    res.render("admin/coupons", {
      admin: res.locals.admin,
      coupons,
      users,
      totalCoupons,
      activeCoupons,
      usedCoupons,
      expiredCoupons,
      currentPage: page,
      totalPages: Math.ceil(totalCoupons / limit),
      search,
      activePage: "coupons",
    });
  } catch (error) {
    console.error("LOAD COUPONS ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};

const createCoupon = async (req, res) => {
  try {
    const { code, userId, discountAmount, expiryDate } = req.body;

    if (!code || !userId || !discountAmount || !expiryDate) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    const trimmedCode = code.trim().toUpperCase();

    if (!/^[A-Z0-9]{4,20}$/.test(trimmedCode)) {
      return res.status(400).json({
        success: false,
        message: "Coupon code must be 4–20 alphanumeric characters",
      });
    }

    const existingCoupon = await Coupon.findOne({ code: trimmedCode });
    if (existingCoupon) {
      return res
        .status(409)
        .json({ success: false, message: "Coupon code already exists" });
    }

    const discount = Number(discountAmount);
    if (isNaN(discount) || discount <= 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Discount amount must be a positive number",
        });
    }

    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Expiry date must be a future date" });
    }

    const userExists = await User.findById(userId);
    if (!userExists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const newCoupon = new Coupon({
      code: trimmedCode,
      userId,
      discountAmount: discount,
      expiryDate: expiry,
      isUsed: false,
    });

    await newCoupon.save();

    res
      .status(201)
      .json({ success: true, message: "Coupon created successfully" });
  } catch (error) {
    console.error("CREATE COUPON ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create coupon" });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res
        .status(404)
        .json({ success: false, message: "Coupon not found" });
    }

    await Coupon.findByIdAndDelete(id);

    res.json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("DELETE COUPON ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete coupon" });
  }
};

module.exports = {
  loadCoupons,
  createCoupon,
  deleteCoupon,
};
