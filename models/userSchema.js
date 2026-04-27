const mongoose = require("mongoose");
const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    street: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true },
);

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    default: null,
  },
  addresses: [addressSchema],
  profileImage: {
    type: String,
    default: "",
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  password: {
    type: String,
    required: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  wallet: {
    type: Number,
    default: 0,
  },
  walletTransactions: [
    {
      type: { type: String },
      amount: Number,
      description: String,
      razorpayPaymentId: { type: String, default: null },
      date: { type: Date, default: Date.now },
    },
  ],
  orderHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
  ],
  createdOn: {
    type: Date,
    default: Date.now,
  },
  referralCode: {
    type: String,
  },
  referralToken: {
    type: String,
    unique: true,
  },
  redeemed: {
    type: Boolean,
  },
  wishlist: [
    {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
  ],
  cart: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
      quantity: Number,
    },
  ],
  redeemedUsers: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  searchHistory: [
    {
      category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
      brand: {
        type: String,
      },
      searchOn: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

const User = mongoose.model("User", userSchema);

module.exports = User;
