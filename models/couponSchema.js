const mongoose = require("mongoose");

const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },

    minPurchaseAmount: {
      type: Number,
      default: 0
    },

    discountAmount: {
      type: Number,
      required: true
    },

    expiryDate: {
      type: Date,
      requied: true
    },

    isUsed: {
      type: Boolean,
      default: false
    },
  },
  {timestamps: true}
);
 
const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;
