const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const Offer = require("../../models/offerSchema");
const Coupon = require("../../models/couponSchema");
const Review = require("../../models/reviewSchema");
const crypto = require("crypto");
const env = require("dotenv").config();
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
    if (req.session.user) {
      return res.redirect("/");
    }
    const refToken = req.query.ref || null;

    return res.render("user/signup", { refToken });
  } catch (error) {
    console.log("Home page not loading", error);
    res.status(500).send("Server Error");
  }
};

const loadHomepage = async (req, res) => {
  try {
    let userData = null;

    if (req.session.user) {
      userData = await User.findById(req.session.user);
    }

    const products = await Product.find({
      isListed: true,
      isBlocked: false,
      "variants.quantity": { $gt: 0 },
    })
      .select("name salePrice productImage")
      .limit(8);

    const categories = await Category.find({
      isListed: true,
    });

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

    if (password !== cPassword) {
      return res.render("user/signup", { message: "Password do not match" });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("user/signup", {
        message: "User with this email already exists",
      });
    }

    const otp = generateOtp();

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
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
    const passwordHash = await bcrypt.hash(password, 10);

    return passwordHash;
  } catch (error) {}
};

const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

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

    const generateReferralCode = () => {
      return "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();
    };

    const generateReferralToken = () => {
      return crypto.randomBytes(16).toString("hex");
    };

    const newReferralCode = generateReferralCode();

    const newReferralToken = generateReferralToken();

    const newUser = new User({
      name: sessionUser.name,
      email: sessionUser.email,
      phone: sessionUser.phone,
      password: passwordHash,
      referralCode: newReferralCode,
      referralToken: newReferralToken,
      redeemed: false,
    });

    await newUser.save();

    if (sessionUser.referralToken) {
      const referrer = await User.findOne({
        referralToken: sessionUser.referralToken,
      });

      if (
        referrer &&
        referrer._id.toString() !== newUser._id.toString() &&
        !referrer.redeemedUsers.some(
          (id) => id.toString() === newUser._id.toString(),
        )
      ) {
        const couponCode =
          "COUP" + Math.random().toString(36).substring(2, 8).toUpperCase();

        const newCoupon = new Coupon({
          code: couponCode,
          userId: referrer._id,
          discountAmount: 200,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        await newCoupon.save();

        referrer.redeemedUsers.push(newUser._id);
        await referrer.save();
      }
    }

    if (sessionUser.referralCode) {
      const referrer = await User.findOne({
        referralCode: sessionUser.referralCode,
      });

      if (
        referrer &&
        referrer._id.toString() !== newUser._id.toString() &&
        !referrer.redeemedUsers.some(
          (id) => id.toString() === newUser._id.toString(),
        )
      ) {
        const generateCouponCode = () => {
          return (
            "COUP" + Math.random().toString(36).substring(2, 8).toUpperCase()
          );
        };

        const couponCode = generateCouponCode();

        const newCoupon = new Coupon({
          code: couponCode,
          userId: referrer._id,
          discountAmount: 200,
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });

        await newCoupon.save();

        referrer.redeemedUsers.push(newUser._id);
        await referrer.save();
      }
    }

    req.session.userOtp = null;
    req.session.userData = null;
    req.session.user = newUser._id;

    const redirectTo = req.session.redirectTo || "/";
    delete req.session.redirectTo;

    return res.json({
      success: true,
      redirectTo,
    });
  } catch (error) {
    console.error("Error Verifying OTP", error);

    res.status(500).json({ success: false, message: "An error occured" });
  }
};

const loadOtp = async (req, res) => {
  try {
    if (!req.session.userData && !req.session.forgotEmail) {
      return res.redirect("/signup");
    }

    res.render("user/verify-otp");
  } catch (error) {
    console.log("Load OTP error:", error);
    res.redirect("/pageNotFound");
  }
};

const resendOtp = async (req, res) => {
  try {
    if (!req.session.userData || !req.session.userData.email) {
      return res.status(400).json({
        success: false,
        message: "Session expired. Please signup again.",
      });
    }

    const email = req.session.userData.email;

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to red=send OTP",
      });
    }

    console.log("RESEND OTP: ", otp);

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error("Error resending OTP", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error. Please try again",
    });
  }
};

const loadLogin = async (req, res) => {
  try {
    if (req.session.user) {
      return res.redirect("/");
    }
    res.render("user/login");
  } catch (error) {
    res.redirect("/pageNotFound");
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: false, email });

    if (!findUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (findUser.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "User is blocked by Admin",
      });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const redirectTo = req.session.redirectTo || "/";
    const pendingAction = req.session.pendingAction;

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Session error. Please try again.",
        });
      }

      req.session.user = findUser._id;

      req.session.redirectTo = redirectTo;
      req.session.pendingAction = pendingAction;

      const finalRedirect = req.session.redirectTo || "/";
      delete req.session.redirectTo;

      return res.json({
        success: true,
        redirectTo: finalRedirect,
      });
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
    res.render("user/forgot-password", { message: null });
  } catch (error) {
    console.log("Forgot password page error:", error);
    res.redirect("/pageNotFound");
  }
};

const sendForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("user/forgot-password", {
        message: "No user found with this email",
      });
    }

    if (user.googleId) {
      return res.render("user/forgot-password", {
        message:
          "This account is linked with Google. Please login using Google.",
      });
    }

    const otp = generateOtp();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.render("user/forgot-password", {
        message: "Failed to send OTP. Try again",
      });
    }

    req.session.forgotEmail = email;
    req.session.forgotOtp = otp;

    console.log("Forgot Password OTP:", otp);

    res.render("user/verify-otp", {
      otpMode: "forgot",
      userEmail: email,
    });
  } catch (error) {
    console.log("Forgot password OTP error:", error);
    res.redirect("/pageNotFound");
  }
};

const verifyForgotOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.forgotOtp || !req.session.forgotEmail) {
      return res.json({
        success: false,
        message: "Session expired. Please restart the process.",
      });
    }

    if (otp !== req.session.forgotOtp) {
      return res.json({
        success: false,
        message: "Invalid OTP. Please try again.",
      });
    }

    return res.redirect("/reset-password");
  } catch (error) {
    console.log("verifyForgotOtp error:", error);
    res.json({ success: false, message: "Server error" });
  }
};

const resendForgotPasswordOtp = async (req, res) => {
  try {
    const email = req.session.forgotEmail;

    if (!email) {
      return res.json({
        success: false,
        message: "Session expired. Start again.",
      });
    }

    const otp = generateOtp();
    req.session.forgotOtp = otp;

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.json({ success: false, message: "Failed to resend OTP." });
    }

    console.log("Resent Forgot Password OTP:", otp);

    return res.json({ success: true });
  } catch (error) {
    console.log("resendForgotPasswordOtp error:", error);
    res.json({ success: false });
  }
};

const loadResetPassword = async (req, res) => {
  try {
    if (!req.session.forgotEmail) {
      return res.redirect("/forgot-password");
    }

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

    res.redirect("/login");
  } catch (error) {
    console.log("Reset password error:", error);
    res.render("user/reset-password", {
      message: "Something went wrong. Try again.",
    });
  }
};

const productsPageDefaults = {
  search: "",
  sort: "newest",
  maxPrice: 100000,
  categoryName: null,
  category: "",
  currentPage: 1,
  totalPages: 1,
  showAnnouncement: false,
};

const loadProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const category = req.query.category || "";
    const sort = req.query.sort || "newest";
    const maxPrice = parseInt(req.query.maxPrice) || 1000000;

    let query = {
      isBlocked: false,
      isListed: true,
      "variants.quantity": { $gt: 0 },
    };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    if (category) {
      query.category = category;
    }

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

      case "newest":
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate("category")
      .sort(sortOption);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updatedProducts = [];

    for (let product of products) {
      const productOffer = await Offer.findOne({
        offerType: "product",
        productId: product._id,
        isActive: true,
        startDate: { $lte: today },
        endDate: { $gte: today },
      });

      const categoryOffer = await Offer.findOne({
        offerType: "category",
        categoryId: product.category._id,
        isActive: true,
        startDate: { $lte: today },
        endDate: { $gte: today },
      });

      let discount = 0;

      if (productOffer && categoryOffer) {
        discount = Math.max(
          productOffer.discountPercentage,
          categoryOffer.discountPercentage,
        );
      } else if (productOffer) {
        discount = productOffer.discountPercentage;
      } else if (categoryOffer) {
        discount = categoryOffer.discountPercentage;
      }

      const finalPrice =
        product.salePrice - (product.salePrice * discount) / 100;

      if (finalPrice <= maxPrice) {
        updatedProducts.push({
          ...product._doc,
          discount,
          finalPrice,
        });
      }
    }

    const totalProducts = updatedProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginatedProducts = updatedProducts.slice(skip, skip + limit);

    const categories = await Category.find({ isListed: true });

    res.render("user/products", {
      products: paginatedProducts,
      categories,
      currentPage: page,
      totalPages,
      search,
      sort,
      category,
      maxPrice,
      showAnnouncement: false,
    });
  } catch (error) {
    console.log(error);
    res.status(500).render("pageNotFound");
  }
};

const loadProductDetails = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isBlocked: false,
      isListed: true,
    }).populate("category");

    if (!product) {
      return res.redirect("/products");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const productOffer = await Offer.findOne({
      offerType: "product",
      productId: product._id,
      isActive: true,
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    const categoryOffer = await Offer.findOne({
      offerType: "category",
      categoryId: product.category._id,
      isActive: true,
      startDate: { $lte: today },
      endDate: { $gte: today },
    });

    let discount = 0;

    if (productOffer && categoryOffer) {
      discount = Math.max(
        productOffer.discountPercentage,
        categoryOffer.discountPercentage,
      );
    } else if (productOffer) {
      discount = productOffer.discountPercentage;
    } else if (categoryOffer) {
      discount = categoryOffer.discountPercentage;
    }

    const finalPrice = product.salePrice - (product.salePrice * discount) / 100;

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
      {
        $match: {
          productId: product._id,
          isApproved: true,
        },
      },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
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
        orderedItems: {
          $elemMatch: {productId: product._id}
        }
      });

      if (deliveredOrder) {
        hasOrderedProduct = true;

        const existingReview = await Review.findOne({
          productId: product._id,
          userId: userData._id,
          orderId: deliveredOrder._id
        });

        if (!existingReview) {
          canReview = true;
          eligibleOrderId = deliveredOrder._id;
        }
      }
    }
    console.log("DEBUG canReview:", canReview);
    console.log("DEBUG hasOrderedProduct:", hasOrderedProduct);
    console.log("DEBUG eligibleOrderId:", eligibleOrderId);
    console.log("DEBUG session user:", req.session.user);

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
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;
    const maxPrice = Number(req.query.maxPrice) || 100000;

    const query = {
      isBlocked: false,
      isListed: true,
      salePrice: { $lte: maxPrice },
    };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const totalProducts = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category")
      .skip(skip)
      .limit(limit);

    const categories = await Category.find({
      isBlocked: false,
      isListed: true,
    });

    const totalPages = Math.ceil(totalProducts / limit);

    res.render("user/products", {
      ...productsPageDefaults,
      products,
      categories,
      search,
      maxPrice,
      currentPage: page,
      totalPages,
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

    userData.addresses = userData.addresses.sort(
      (a, b) => b.isDefault - a.isDefault,
    );

    res.render("user/profile", {
      user: userData,
      showAnnouncement: false,
    });
  } catch (error) {
    console.log("PROFILE LOAD ERROR", error);
    res.status(500).json({ message: "Profile update failed" });
  }
};

const editProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, phone } = req.body;

    const updateData = {
      name,
      phone,
    };

    if (req.file) {
      updateData.profileImage = req.file.path;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    });

    console.log("Updated User:", updatedUser);

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.log("EDIT PROFILE ERROR:", error);

    res.status(500).json({ message: error.message });
  }
};

const requestEmailOtp = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return res.status(400).json({ message: "New email is required" });
    }

    const user = await User.findById(req.session.user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.googleId) {
      return res.status(403).json({
        message: "Email cannot be changed for Google accounts",
      });
    }

    const emailExists = await User.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    });

    if (emailExists) {
      return res.status(409).json({ message: "This email is already in use" });
    }

    const otp = generateOtp();

    req.session.emailChangeOtp = otp;
    req.session.newEmail = newEmail;
    req.session.emailVerified = false;

    await sendVerificationEmail(newEmail, otp);

    res.json({ success: true });
  } catch (error) {
    console.log("Request email OTP error: ", error);
    res.status(500).json({ message: "failed to send OTP" });
  }
};

const verifyEmailOtp = async (req, res) => {
  const { otp } = req.body;

  if (otp !== req.session.emailChangeOtp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  req.session.emailVerified = true;
  res.json({ success: true });
};

const updateProfileAfterOtp = async (req, res) => {
  if (!req.session.emailVerified) {
    return res.status(403).json({ message: "Email not verified" });
  }

  const newEmail = req.session.newEmail;

  if (!newEmail) {
    return res.status(400).json({ message: "No email found in session" });
  }

  console.log("Saving email:", newEmail);

  const emailExists = await User.findOne({
    email: newEmail,
    _id: { $ne: req.session.user },
  });

  if (emailExists) {
    return res.status(409).json({
      message: "This email is already in use",
    });
  }

  const user = await User.findById(req.session.user);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

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

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const sortedAddresses = (user.addresses || []).sort((a, b) => {
      return Number(b.isDefault) - Number(a.isDefault);
    });

    res.json(sortedAddresses);
  } catch (error) {
    console.log("GET ADDRESSES ERROR", error);
    res.status(500).json({ message: "failed to load addresses" });
  }
};

const addAddress = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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

    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ message: "Invalid pincode" });
    }

    if (!/^\d{10}$/.test(finalPhone)) {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    if (isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const address = user.addresses.id(req.params.id);
    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

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

    if (isDefault) {
      user.addresses.forEach((a) => (a.isDefault = false));
    }

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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.addresses = user.addresses.filter(
      (address) => address._id.toString() !== req.params.id,
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
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.googleId) {
      return res
        .status(403)
        .json({ message: "Password can't be changed for Google accounts" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true });
  } catch (error) {
    console.error("CHANGE PASSW0RD ERROR", error);
    res.status(500).json({ message: "Something went wrong" });
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
};
