const mongoose = require("mongoose");
const { Schema } = mongoose;

const offerSchema = new Schema(
  {
    offerType: {
      type: String,
      enum: ["product", "category"],
      required: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    discountPercentage: {
      type: Number,
      required: true,
      min: 1,
      max: 90,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

const Offer = mongoose.model("Offer", offerSchema);

module.exports = Offer;
