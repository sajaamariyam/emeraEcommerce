const mongoose = require("mongoose");
const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    usedBy: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },

    minPurchaseAmount: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
    },
    isPercentage: {
      type: Boolean,
      default: false,
    },
    maxDiscount: {
      type: Number,
      default: null,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);
couponSchema.index({ expiryDate: 1, isActive: 1 });

const Coupon = mongoose.model("Coupon", couponSchema);
module.exports = Coupon;
