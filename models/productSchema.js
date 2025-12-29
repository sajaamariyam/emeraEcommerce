const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  brand: {
    type: String,
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  regularPrice: {
    type: Number,
    required: true,
    min: 0
  },
  salePrice: {
    type: Number,
    min: 0
  },
  productOffer: {
    type: Number,
    default: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  color: {
    type: String,
    required: true
  },

 
  productImage: [
    {
      url: String,
      public_id: String
    }
  ],

  rating: {
    type: Number,
    default: 0
  },
  reviewsCount: {
    type: Number,
    default: 0
  },

  isBlocked: {
    type: Boolean,
    default: false
  },
  isListed: {
    type: Boolean,
    default: true
  },

  status: {
    type: String,
    enum: ["Available", "Out of Stock", "Discontinued"],
    default: "Available"
  }
}, { timestamps: true });

module.exports = mongoose.model("Product", productSchema);
