const mongoose = require("mongoose");
const { Schema } = mongoose;


const variantSchema = new Schema(
  {
    color: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);


const productSchema = new Schema(
  {
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
      required: true,
      trim: true
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
      required: true,
      min: 0
    },

  
    productImage: [
      {
        url: {
          type: String,
          required: true
        },
        public_id: {
          type: String,
          required: true
        }
      }
    ],

    variants: {
      type: [variantSchema],
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "At least one variant is required"
      }
    },

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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
