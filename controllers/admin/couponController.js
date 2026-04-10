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

    res.render("admin/coupons", {
      admin: res.locals.admin,
      coupons,
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
    const {
      code,
      discountAmount,
      minPurchaseAmount,
      expiryDate,
      isPercentage,
      maxDiscount,
    } = req.body;

    if (!code || !discountAmount || !expiryDate) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Coupon code, discount amount and expiry date are required",
        });
    }

    const trimmedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(trimmedCode)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Coupon code must be 4-20 alphanumeric characters",
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

    if (isPercentage) {
      if (discount > 100) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Percentage discount cannot exceed 100%",
          });
      }
    }

    const minPurchase = Number(minPurchaseAmount) || 0;
    if (minPurchase < 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Minimum purchase amount cannot be negative",
        });
    }

    if (!isPercentage && minPurchase > 0 && discount >= minPurchase) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Discount amount must be less than minimum purchase amount",
        });
    }

    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Expiry date must be a future date" });
    }

    const maxDiscountValue =
      isPercentage && maxDiscount ? Number(maxDiscount) : null;
    if (
      maxDiscountValue !== null &&
      (isNaN(maxDiscountValue) || maxDiscountValue <= 0)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Max discount must be a positive number",
        });
    }

    const newCoupon = new Coupon({
      code: trimmedCode,
      discountAmount: discount,
      minPurchaseAmount: minPurchase,
      expiryDate: expiry,
      isPercentage: !!isPercentage,
      maxDiscount: maxDiscountValue,
      isUsed: false,
      isActive: true
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

module.exports = { loadCoupons, createCoupon, deleteCoupon };
