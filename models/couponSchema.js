const mongoose = require("mongoose");
const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: Schema.Types.ObjectId,  // ← for user-specific coupons
      ref: "User",
      default: null,
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
    isUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Coupon = mongoose.model("Coupon", couponSchema);
module.exports = Coupon;