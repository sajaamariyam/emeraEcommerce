const mongoose = require("mongoose");
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    isVerifiedPurchase: {
      type: Boolean,
      default: true,
    },

    helpful: {
      type: Number,
      default: 0,
    },

    notHelpful: {
      type: Number,
      default: 0,
    },

    isApproved: {
      type: Boolean,
      default: true, // Auto-approve for now, can add admin moderation later
    },
  },
  { timestamps: true }
);

reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
