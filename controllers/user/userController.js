const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Review = require("../../models/reviewSchema");
const getBestOffer = require("../../helpers/offerHelper");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

const pageNotFound = async (req, res) => {
  try {
    res.render("user/page-404");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const loadSignup = async (req, res) => {
  try {
    if (req.session.user) return res.redirect("/");
    const refToken = req.query.ref || null;
    return res.render("user/signup", { refToken, message: null });
  } catch (error) {
    console.log("Home page not loading", error);
    res.status(500).send("Server Error");
  }
};

const loadHomepage = async (req, res) => {
  try {
    let userData = null;
    if (req.session.user) userData = await User.findById(req.session.user);

    const products = await Product.find({
      isListed: true,
      isBlocked: false,
      "variants.quantity": { $gt: 0 },
    })
      .select("name salePrice productImage")
      .limit(8);

    const categories = await Category.find({ isListed: true });

    res.render("user/home", {
      user: userData,
      products,
      categories,
      showAnnouncement: true,
    });
  } catch (error) {
    console.log("Home page error:", error);
    res.status(500).send("Server error");
  }
};

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });
    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify your account",
      text: `Your otp is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    });
    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
}

async function sendEmailChangeOtp(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });
    const info = await transporter.sendMail({
      from: `"Emera Support" <${process.env.NODEMAILER_EMAIL}>`,
      to: email,
      subject: "Emera — Verify your new email address",
      text: `Your email change OTP is ${otp}. It expires in 10 minutes.`,
      html: `<b>Email Change OTP: ${otp}</b>`,
    });
    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email change OTP", error);
    return false;
  }
}

const signup = async (req, res) => {
  try {
    req.session.userOtp = null;
    req.session.userData = null;

    const {
      name,
      email,
      phone,
      password,
      cPassword,
      referralCode,
      referralToken,
    } = req.body;

    if (!name || !email || !phone || !password || !cPassword) {
      return res.render("user/signup", {
        message: "All fields are required",
        refToken: null,
      });
    }

    if (name.trim().length < 3) {
      return res.render("user/signup", {
        message: "Name must be at least 3 characters",
        refToken: null,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.render("user/signup", {
        message: "Invalid email format",
        refToken: null,
      });
    }

    if (!/^[6-9][0-9]{9}$/.test(phone)) {
      return res.render("user/signup", {
        message: "Enter a valid Indian mobile number",
        refToken: null,
      });
    }

    if (password.length < 8) {
      return res.render("user/signup", {
        message: "Password must be at least 8 characters",
        refToken: null,
      });
    }

    if (!/[A-Z]/.test(password)) {
      return res.render("user/signup", {
        message: "Password must contain an uppercase letter",
        refToken: null,
      });
    }

    if (!/\d/.test(password)) {
      return res.render("user/signup", {
        message: "Password must contain a number",
        refToken: null,
      });
    }

    if (password !== cPassword) {
      return res.render("user/signup", {
        message: "Passwords do not match",
        refToken: null,
      });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("user/signup", {
        message: "User with this email already exists",
        refToken: null,
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent)
      return res.status(500).json({
        success: false,
        message: "Failed to send email. Please try again.",
      });

    req.session.userOtp = otp;
    req.session.otpExpiry = Date.now() + 2 * 60 * 1000;
    req.session.userData = {
      name,
      phone,
      email,
      password,
      referralCode,
      referralToken,
    };

    res.render("user/verify-otp", { otpMode: "signup", userEmail: email });
    console.log("OTP sent", otp);
  } catch (error) {
    console.error("signup error", error);
    res.redirect("/pageNotFound");
  }
};

const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {}
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (Date.now() > req.session.otpExpiry) {
      req.session.userOtp = null;
      req.session.otpExpiry = null;
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (!req.session.userOtp || otp !== req.session.userOtp) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP, Please try again" });
    }

    const sessionUser = req.session.userData;
    if (!sessionUser) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please signup again.",
      });
    }

    const existingUser = await User.findOne({ email: sessionUser.email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already registered. Please Login.",
      });
    }

    const passwordHash = await securePassword(sessionUser.password);

    const generateReferralCode = () =>
      "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const generateReferralToken = () => crypto.randomBytes(16).toString("hex");

    const newUser = new User({
      name: sessionUser.name,
      email: sessionUser.email,
      phone: sessionUser.phone,
      password: passwordHash,
      referralCode: generateReferralCode(),
      referralToken: generateReferralToken(),
      redeemed: false,
    });

    await newUser.save();

    const referralIdentifier =
      sessionUser.referralToken || sessionUser.referralCode;

    if (referralIdentifier) {
      const referrer = await User.findOne({
        $or: [
          { referralToken: referralIdentifier },
          { referralCode: referralIdentifier },
        ],
      });

      const alreadyRedeemed = referrer?.redeemedUsers?.some(
        (id) => id.toString() === newUser._id.toString(),
      );

      if (
        referrer &&
        referrer._id.toString() !== newUser._id.toString() &&
        !alreadyRedeemed
      ) {
        referrer.wallet = (referrer.wallet || 0) + 200;
        referrer.walletTransactions.push({
          type: "credit",
          amount: 200,
          description: `Referral bonus — ${newUser.name} signed up using your link`,
          date: new Date(),
        });
        referrer.redeemedUsers.push(newUser._id);

        const couponCode =
          "COUP" + Math.random().toString(36).substring(2, 8).toUpperCase();
        const newCoupon = new Coupon({
          code: couponCode,
          userId: referrer._id,
          discountAmount: 10,
          isPercentage: true,
          maxDiscount: 200,
          minPurchaseAmount: 500,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: true,
          isUsed: false,
          usedBy: [],
        });
        await newCoupon.save();

        await referrer.save();

        newUser.wallet = 100;
        newUser.walletTransactions.push({
          type: "credit",
          amount: 100,
          description: "Welcome bonus — signed up via referral link",
          date: new Date(),
        });
        newUser.redeemed = true;
        await newUser.save();
      }
    }

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.user = newUser._id;

    const redirectTo = req.session.redirectTo || "/";
    delete req.session.redirectTo;

    return res.json({
      success: true,
      message: "Account created successfully! Welcome to Emera",
      redirectTo,
    });
  } catch (error) {
    console.error("Error Verifying OTP", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

const loadOtp = async (req, res) => {
  try {
    if (!req.session.userData && !req.session.forgotEmail)
      return res.redirect("/signup");
    res.render("user/verify-otp");
  } catch (error) {
    console.log("Load OTP error:", error);
    res.redirect("/pageNotFound");
  }
};

const resendOtp = async (req, res) => {
  try {
    const isForgot = !!req.session.forgotEmail;
    const email = isForgot
      ? req.session.forgotEmail
      : req.session.userData?.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please start again.",
      });
    }

    const otp = generateOtp();

    if (isForgot) {
      req.session.forgotOtp = otp;
      req.session.forgotOtpExpiry = Date.now() + 2 * 60 * 1000;
    } else {
      req.session.userOtp = otp;
      req.session.otpExpiry = Date.now() + 2 * 60 * 1000;
    }

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent)
      return res
        .status(500)
        .json({ success: false, message: "Failed to resend OTP" });

    console.log("RESEND OTP:", otp);
    return res.json({ success: true });
  } catch (error) {
    console.error("Error resending OTP", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (req.session.user) return res.redirect("/");
    const blockedMessage =
      req.query.blocked === "true"
        ? "Your account has been blocked. Please contact support."
        : null;
    res.render("user/login", { blockedMessage });
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const findUser = await User.findOne({ isAdmin: false, email });

    if (!findUser) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }
    if (findUser.isBlocked) {
      return res
        .status(403)
        .json({ success: false, message: "User is blocked by Admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    const redirectTo = req.session.redirectTo;
    const pendingAction = req.session.pendingAction;

    req.session.regenerate((err) => {
      if (err)
        return res.status(500).json({
          success: false,
          message: "Session error. Please try again.",
        });
      req.session.user = findUser._id;
      req.session.redirectTo = redirectTo;
      req.session.pendingAction = pendingAction;
      const finalRedirect = req.session.redirectTo || "/";
      delete req.session.redirectTo;
      return res.json({ success: true, redirectTo: finalRedirect });
    });
  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again later",
    });
  }
};

const logout = async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Session destruction error", err.message);
        return res.redirect("/pageNotFound");
      }
      res.clearCookie("connect.sid");
      res.redirect("/login");
    });
  } catch (error) {
    console.log("Logout error", error);
    res.redirect("/pageNotFound");
  }
};

const loadForgotPassword = async (req, res) => {
  try {
    if (req.session.user) return res.redirect("/");
    return res.render("user/forgot-password", { message: null });
  } catch (error) {
    console.error("LOAD FORGOT PASSWORD ERROR:", error);
    res.redirect("/pageNotFound");
  }
};

const sendForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.render("user/forgot-password", {
        message: "Please enter your email address",
      });
    }

    const user = await User.findOne({ email: email.trim() });

    if (!user) {
      return res.render("user/forgot-password", {
        message: "No account found with this email",
      });
    }

    if (user.googleId) {
      return res.render("user/forgot-password", {
        message: "This account uses Google login. Please sign in with Google.",
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email.trim(), otp);

    if (!emailSent) {
      return res.render("user/forgot-password", {
        message: "Failed to send OTP. Please try again.",
      });
    }

    req.session.forgotEmail = email.trim();
    req.session.forgotOtp = otp;
    req.session.forgotOtpExpiry = Date.now() + 2 * 60 * 1000;

    console.log("Forgot Password OTP:", otp);

    req.session.save((err) => {
      if (err) {
        console.error("SESSION SAVE ERROR:", err);
        return res.render("user/forgot-password", {
          message: "Session error. Please try again.",
        });
      }
      res.render("user/verify-otp", {
        otpMode: "forgot",
        userEmail: email.trim(),
      });
    });
  } catch (error) {
    console.error("SEND FORGOT PASSWORD ERROR:", error);
    return res.render("user/forgot-password", {
      message: "Something went wrong. Please try again.",
    });
  }
};

const verifyForgotOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.forgotOtp || !req.session.forgotEmail) {
      return res.json({
        success: false,
        message: "Session expired. Please restart the forgot password process.",
      });
    }

    if (Date.now() > req.session.forgotOtpExpiry) {
      req.session.forgotOtp = null;
      req.session.forgotOtpExpiry = null;
      return res.json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (otp !== req.session.forgotOtp) {
      return res.json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    req.session.forgotOtp = null;
    req.session.forgotOtpExpiry = null;

    return res.json({
      success: true,
      redirectTo: "/reset-password",
      message: "OTP verified. Please reset your password.",
    });
  } catch (error) {
    console.error("VERIFY FORGOT OTP ERROR:", error);
    res.json({ success: false, message: "Server error. Please try again." });
  }
};

const resendForgotPasswordOtp = async (req, res) => {
  try {
    const email = req.session.forgotEmail;
    if (!email)
      return res.json({
        success: false,
        message: "Session expired. Start again.",
      });
    const otp = generateOtp();
    req.session.forgotOtp = otp;
    req.session.forgotOtpExpiry = Date.now() + 2 * 60 * 1000;
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent)
      return res.json({ success: false, message: "Failed to resend OTP." });
    console.log("Resent Forgot Password OTP:", otp);

    req.session.save((err) => {
      if (err) return res.json({ success: false, message: "Session error." });
      return res.json({ success: true });
    });
  } catch (error) {
    console.log("resendForgotPasswordOtp error:", error);
    res.json({ success: false });
  }
};

const loadResetPassword = async (req, res) => {
  try {
    if (!req.session.forgotEmail) return res.redirect("/forgot-password");
    res.render("user/reset-password", { message: null });
  } catch (error) {
    console.log("Reset password page error:", error);
    res.redirect("/pageNotFound");
  }
};

const resetPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!req.session.forgotEmail) {
      return res.redirect("/forgot-password");
    }

    if (!newPassword || !confirmPassword) {
      return res.render("user/reset-password", {
        message: "Both password fields are required",
      });
    }

    if (newPassword.length < 8) {
      return res.render("user/reset-password", {
        message: "Password must be at least 8 characters",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render("user/reset-password", {
        message: "Passwords do not match",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { email: req.session.forgotEmail },
      { $set: { password: hashedPassword } },
    );

    req.session.forgotEmail = null;
    req.session.forgotOtp = null;
    req.session.forgotOtpExpiry = null;

    res.redirect("/login");
  } catch (error) {
    console.log("Reset password error:", error);
    res.render("user/reset-password", {
      message: "Something went wrong. Try again.",
    });
  }
};

function parseCategoryParam(raw) {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
}

const loadProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const categoryIds = parseCategoryParam(req.query.category);
    const sort = req.query.sort || "newest";
    const maxPrice = parseInt(req.query.maxPrice) || 1000000;

    const query = { isBlocked: false, isListed: true };
    if (search) query.name = { $regex: search, $options: "i" };
    if (categoryIds.length > 0) query.category = { $in: categoryIds };

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case "price-asc":
        sortOption = { salePrice: 1 };
        break;
      case "price-desc":
        sortOption = { salePrice: -1 };
        break;
      case "name-asc":
        sortOption = { name: 1 };
        break;
      case "name-desc":
        sortOption = { name: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate("category")
      .sort(sortOption);

    const updatedProducts = [];
    for (const product of products) {
      const offer = await getBestOffer(product);
      const finalPrice = offer.finalPrice;
      const discount = offer.discount;
      if (finalPrice <= maxPrice) {
        updatedProducts.push({
          ...product._doc,
          finalPrice,
          discount,
          quantity: product.variants.reduce((sum, v) => sum + v.quantity, 0),
        });
      }
    }

    if (sort === "price-asc") {
      updatedProducts.sort((a, b) => a.finalPrice - b.finalPrice);
    } else if (sort === "price-desc") {
      updatedProducts.sort((a, b) => b.finalPrice - a.finalPrice);
    }

    const totalProducts = updatedProducts.length;
    const totalPages = Math.ceil(totalProducts / limit) || 1;
    const paginatedProducts = updatedProducts.slice(skip, skip + limit);

    const categories = await Category.find({ isListed: true });
    let userData = null;
    if (req.session.user) userData = await User.findById(req.session.user);

    res.render("user/products", {
      user: userData,
      products: paginatedProducts,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort,
      selectedCategories: categoryIds,
      maxPrice,
      showAnnouncement: false,
    });
  } catch (error) {
    console.log("LOAD PRODUCTS ERROR", error);
    res.status(500).redirect("/pageNotFound");
  }
};

const loadProductDetails = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isBlocked: false,
      isListed: true,
    }).populate("category");

    if (!product) return res.redirect("/products");

    const offer = await getBestOffer(product);
    const discount = offer.discount;
    const finalPrice = offer.finalPrice;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isBlocked: false,
      isListed: true,
      "variants.quantity": { $gt: 0 },
    }).limit(4);

    const reviews = await Review.find({
      productId: product._id,
      isApproved: true,
    })
      .populate("userId", "name profileImage")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const ratingStats = await Review.aggregate([
      { $match: { productId: product._id, isApproved: true } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ]);

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratingStats.forEach((stat) => {
      ratingDistribution[stat._id] = stat.count;
    });

    let canReview = false;
    let hasOrderedProduct = false;
    let eligibleOrderId = null;
    let userData = null;

    if (req.session.user) {
      userData = await User.findById(req.session.user);
      const deliveredOrder = await Order.findOne({
        userId: userData._id,
        status: "delivered",
        orderedItems: { $elemMatch: { productId: product._id } },
      });
      if (deliveredOrder) {
        hasOrderedProduct = true;
        const existingReview = await Review.findOne({
          productId: product._id,
          userId: userData._id,
          orderId: deliveredOrder._id,
        });
        if (!existingReview) {
          canReview = true;
          eligibleOrderId = deliveredOrder._id;
        }
      }
    }

    res.render("user/productDetails", {
      product,
      relatedProducts,
      user: userData,
      discount,
      finalPrice,
      showAnnouncement: false,
      reviews,
      ratingDistribution,
      canReview,
      hasOrderedProduct,
      eligibleOrderId,
    });
  } catch (error) {
    console.log(error);
    res.redirect("/products");
  }
};

const searchProducts = async (req, res) => {
  try {
    const search = req.query.q || req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const maxPrice = Number(req.query.maxPrice) || 100000;
    const sort = req.query.sort || "newest";
    const categoryIds = parseCategoryParam(req.query.category);

    const query = { isBlocked: false, isListed: true };
    if (search) query.name = { $regex: search, $options: "i" };
    if (categoryIds.length > 0) query.category = { $in: categoryIds };

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case "price-asc":
        sortOption = { salePrice: 1 };
        break;
      case "price-desc":
        sortOption = { salePrice: -1 };
        break;
      case "name-asc":
        sortOption = { name: 1 };
        break;
      case "name-desc":
        sortOption = { name: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const allProducts = await Product.find(query)
      .populate("category")
      .sort(sortOption);

    const updatedProducts = [];
    for (const product of allProducts) {
      const offer = await getBestOffer(product);
      if (offer.finalPrice <= maxPrice) {
        updatedProducts.push({
          ...product._doc,
          finalPrice: offer.finalPrice,
          discount: offer.discount,
          quantity: product.variants.reduce((sum, v) => sum + v.quantity, 0),
        });
      }
    }

    if (sort === "price-asc") {
      updatedProducts.sort((a, b) => a.finalPrice - b.finalPrice);
    } else if (sort === "price-desc") {
      updatedProducts.sort((a, b) => b.finalPrice - a.finalPrice);
    }

    const totalProducts = updatedProducts.length;
    const totalPages = Math.ceil(totalProducts / limit) || 1;
    const paginatedProducts = updatedProducts.slice(skip, skip + limit);

    const categories = await Category.find({
      isBlocked: false,
      isListed: true,
    });
    let userData = null;
    if (req.session.user) userData = await User.findById(req.session.user);

    res.render("user/products", {
      user: userData,
      products: paginatedProducts,
      categories,
      search,
      sort,
      selectedCategories: categoryIds,
      maxPrice,
      currentPage: page,
      totalPages,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("SEARCH ERROR", error);
    res.redirect("/pageNotFound");
  }
};

const loadProfile = async (req, res) => {
  try {
    const userData = await User.findById(req.session.user);

    if (!userData) {
      return res.redirect("/login");
    }

    if (userData.isBlocked) {
      return req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.redirect("/login?blocked=true");
      });
    }

    userData.addresses = userData.addresses.sort(
      (a, b) => b.isDefault - a.isDefault,
    );

    if (!userData.referralCode) {
      userData.referralCode =
        "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();
      await userData.save();
    }

    res.render("user/profile", {
      user: userData,
      baseUrl: process.env.BASE_URL || "http://localhost:3000",
      showAnnouncement: false,
    });
  } catch (error) {
    console.log("PROFILE LOAD ERROR", error);
    res.redirect("/pageNotFound");
  }
};

const editProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (name.trim().length < 3 || name.trim().length > 50) {
      return res.status(400).json({ message: "Name must be 3–50 characters" });
    }
    if (!/^[a-zA-Z\s]+$/.test(name.trim())) {
      return res
        .status(400)
        .json({ message: "Name can only contain letters and spaces" });
    }

    if (!phone || !/^[6-9][0-9]{9}$/.test(phone.trim())) {
      return res
        .status(400)
        .json({ message: "Enter a valid 10-digit Indian mobile number" });
    }

    const updateData = { name: name.trim(), phone: phone.trim() };
    if (req.file) updateData.profileImage = req.file.path;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.log("EDIT PROFILE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

const requestEmailOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;
    if (!newEmail)
      return res.status(400).json({ message: "New email is required" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    const user = await User.findById(req.session.user);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.googleId)
      return res
        .status(403)
        .json({ message: "Email cannot be changed for Google accounts" });
    const emailExists = await User.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    });
    if (emailExists)
      return res.status(409).json({ message: "This email is already in use" });
    const otp = generateOtp();
    req.session.emailChangeOtp = otp;
    req.session.emailChangeOtpExpiry = Date.now() + 2 * 60 * 1000;
    req.session.newEmail = newEmail;
    req.session.emailVerified = false;
    const emailSent = await sendEmailChangeOtp(newEmail, otp);
    if (!emailSent)
      return res
        .status(500)
        .json({ message: "Failed to send OTP. Please try again." });
    res.json({ success: true });
  } catch (error) {
    console.log("Request email OTP error:", error);
    res.status(500).json({ message: "failed to send OTP" });
  }
};

const verifyEmailOtp = async (req, res) => {
  const { otp } = req.body;

  if (Date.now() > req.session.emailChangeOtpExpiry) {
    req.session.emailChangeOtp = null;
    req.session.emailChangeOtpExpiry = null;
    return res
      .status(400)
      .json({ message: "OTP has expired. Please request a new one." });
  }

  if (otp !== req.session.emailChangeOtp)
    return res.status(400).json({ message: "Invalid OTP" });
  req.session.emailVerified = true;
  res.json({ success: true });
};

const updateProfileAfterOtp = async (req, res) => {
  if (!req.session.emailVerified)
    return res.status(403).json({ message: "Email not verified" });
  const newEmail = req.session.newEmail;
  if (!newEmail)
    return res.status(400).json({ message: "No email found in session" });
  const emailExists = await User.findOne({
    email: newEmail,
    _id: { $ne: req.session.user },
  });
  if (emailExists)
    return res.status(409).json({ message: "This email is already in use" });
  const user = await User.findById(req.session.user);
  if (!user) return res.status(404).json({ message: "User not found" });
  user.email = newEmail;
  await user.save();
  req.session.user = user._id;
  req.session.emailVerified = false;
  req.session.emailChangeOtp = null;
  req.session.newEmail = null;
  res.json({ success: true });
};

const getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    const sortedAddresses = (user.addresses || []).sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault),
    );
    res.json(sortedAddresses);
  } catch (error) {
    console.log("GET ADDRESSES ERROR", error);
    res.status(500).json({ message: "failed to load addresses" });
  }
};

const addAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const {
      firstName,
      lastName,
      address1,
      address2,
      city,
      state,
      pincode,
      phone,
      isDefault,
    } = req.body;
    const finalPhone = phone?.trim() || user.phone;
    if (
      !firstName ||
      !lastName ||
      !address1 ||
      !finalPhone ||
      !city ||
      !state ||
      !pincode
    ) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }
    if (!/^\d{6}$/.test(pincode))
      return res.status(400).json({ message: "Invalid pincode" });
    if (!/^\d{10}$/.test(finalPhone))
      return res.status(400).json({ message: "Invalid phone number" });
    if (isDefault) user.addresses.forEach((a) => (a.isDefault = false));
    const newAddress = {
      fullName: `${firstName} ${lastName}`,
      street: address1 + (address2 ? `, ${address2}` : ""),
      city,
      state,
      zipCode: pincode,
      country: "India",
      phone: finalPhone,
      isDefault: user.addresses.length === 0 ? true : !!isDefault,
    };
    user.addresses.push(newAddress);
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error("ADD ADDRESS ERROR", error);
    res.status(500).json({ message: "Failed to add address" });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.addresses.forEach((address) => {
      address.isDefault = address._id.toString() === req.params.id;
    });
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error("SET DEFAULT ADDRESS ERROR:", error);
    res.status(500).json({ message: "Failed to update default address" });
  }
};

const updateAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const address = user.addresses.id(req.params.id);
    if (!address) return res.status(404).json({ message: "Address not found" });
    const {
      firstName,
      lastName,
      address1,
      address2,
      city,
      state,
      pincode,
      phone,
      isDefault,
    } = req.body;
    if (!firstName || !lastName || !address1 || !city || !state || !pincode) {
      return res
        .status(400)
        .json({ message: "All required fields must be filled" });
    }
    if (!/^\d{6}$/.test(pincode))
      return res.status(400).json({ message: "Invalid pincode" });
    if (phone && !/^[6-9][0-9]{9}$/.test(phone.trim()))
      return res.status(400).json({ message: "Invalid phone number" });
    if (isDefault) user.addresses.forEach((a) => (a.isDefault = false));
    address.fullName = `${firstName} ${lastName}`;
    address.street = address1 + (address2 ? `, ${address2}` : "");
    address.city = city;
    address.state = state;
    address.zipCode = pincode;
    address.country = "India";
    address.phone = phone || address.phone;
    address.isDefault = !!isDefault;
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error("UPDATE ADDRESS ERROR:", error);
    res.status(500).json({ message: "Failed to update address" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.addresses = user.addresses.filter(
      (a) => a._id.toString() !== req.params.id,
    );
    if (user.addresses.length > 0 && !user.addresses.some((a) => a.isDefault)) {
      user.addresses[0].isDefault = true;
    }
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error("DELETE ADDRESS ERROR:", error);
    res.status(500).json({ message: "Failed to delete address" });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.googleId)
      return res
        .status(403)
        .json({ message: "Password can't be changed for Google accounts" });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const loadAbout = async (req, res) => {
  try {
    let userData = null;
    if (req.session.user) userData = await User.findById(req.session.user);
    res.render("user/about", { user: userData, showAnnouncement: false });
  } catch (error) {
    console.log("About page error:", error);
    res.redirect("/pageNotFound");
  }
};

module.exports = {
  loadHomepage,
  pageNotFound,
  loadSignup,
  signup,
  verifyOtp,
  loadOtp,
  securePassword,
  resendOtp,
  loadLogin,
  login,
  logout,
  loadForgotPassword,
  sendForgotPassword,
  verifyForgotOtp,
  resendForgotPasswordOtp,
  loadResetPassword,
  resetPassword,
  loadProducts,
  loadProductDetails,
  searchProducts,
  loadProfile,
  editProfile,
  requestEmailOtp,
  verifyEmailOtp,
  updateProfileAfterOtp,
  getAddresses,
  addAddress,
  setDefaultAddress,
  updateAddress,
  deleteAddress,
  changePassword,
  loadAbout,
};
