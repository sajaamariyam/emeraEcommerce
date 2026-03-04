const mongoose = require("mongoose");
const Review = require("../../models/reviewSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");

const submitReview = async (req, res) => {
  try {
    const { productId, orderId, rating, title, comment } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Login required" });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }

    if (!title || title.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Review title is required" });
    }

    if (!comment || comment.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Review comment is required" });
    }

    const order = await Order.findOne({
      _id: orderId,
      userId,
      status: "delivered",
      "orderedItems.productId": productId,
    });

    if (!order) {
      return res.status(403).json({
        success: false,
        message: "You can only review products from delivered orders",
      });
    }

    const existingReview = await Review.findOne({ productId, userId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    const newReview = new Review({
      productId,
      userId,
      orderId,
      rating: parseInt(rating),
      title: title.trim(),
      comment: comment.trim(),
      isVerifiedPurchase: true,
    });

    await newReview.save();
    await updateProductRating(productId);

    res.json({ success: true, message: "Review submitted successfully" });
  } catch (error) {
    console.error("SUBMIT REVIEW ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to submit review" });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ productId, isApproved: true })
      .populate("userId", "name profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalReviews = await Review.countDocuments({
      productId,
      isApproved: true,
    });

    const ratingStats = await Review.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
          isApproved: true,
        },
      },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratingStats.forEach((stat) => {
      distribution[stat._id] = stat.count;
    });

    res.json({
      success: true,
      reviews,
      totalReviews,
      currentPage: page,
      totalPages: Math.ceil(totalReviews / limit),
      distribution,
    });
  } catch (error) {
    console.error("GET REVIEWS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to load reviews" });
  }
};

const canUserReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user;

    if (!userId) {
      return res.json({ canReview: false, reason: "not_logged_in" });
    }

    const order = await Order.findOne({
      userId,
      status: "delivered",
      "orderedItems.productId": productId,
    });

    if (!order) {
      return res.json({ canReview: false, reason: "not_purchased" });
    }

    const existingReview = await Review.findOne({ productId, userId });
    if (existingReview) {
      return res.json({ canReview: false, reason: "already_reviewed" });
    }

    res.json({ canReview: true, orderId: order._id });
  } catch (error) {
    console.error("CAN USER REVIEW ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to check review eligibility" });
  }
};

const markHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;
    await Review.findByIdAndUpdate(reviewId, { $inc: { helpful: 1 } });
    res.json({ success: true });
  } catch (error) {
    console.error("MARK HELPFUL ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to mark as helpful" });
  }
};

async function updateProductRating(productId) {
  try {
    const stats = await Review.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
          isApproved: true,
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: Math.round(stats[0].avgRating * 10) / 10,
        totalReviews: stats[0].totalReviews,
      });
    }
  } catch (error) {
    console.error("UPDATE RATING ERROR:", error);
  }
}

module.exports = {
  submitReview,
  getProductReviews,
  canUserReview,
  markHelpful,
};
