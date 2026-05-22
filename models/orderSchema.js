const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderedItems: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        color: String,
        quantity: Number,
        price: Number,

        itemStatus: {
          type: String,
          enum: ["active", "cancelled", "return-requested", "returned"],
          default: "active",
        },
        cancelReason: { type: String },
        cancelledAt: { type: Date },

        returnReason: { type: String },
        returnRequestedAt: { type: Date },
        returnApprovedAt: { type: Date },
        returnStatus: {
          type: String,
          enum: ["none", "requested", "approved", "rejected"],
          default: "none",
        },
      },
    ],

    finalAmount: Number,
    totalPrice: Number,

    discount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "shipped",
        "processing",
        "out-for-delivery",
        "delivered",
        "cancelled",
        "return-requested",
        "returned",
      ],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      enum: ["razorpay", "cod", "wallet"],
      default: "cod",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    razorpayOrderId: {
      type: String,
      default: null,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundAmount: {
      type: Number,
      default: 0,
    },

    cancelReason: { type: String },
    returnReason: { type: String },

    returnStatus: {
      type: String,
      enum: ["none", "requested", "approved", "rejected"],
      default: "none",
    },
    returnProcessedAt: Date,

    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String },
      address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: "India" },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);
