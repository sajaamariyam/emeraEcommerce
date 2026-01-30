const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  orderedItems: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },
      color: String,
      quantity: Number,
      price: Number
    }
  ],

  finalAmount: Number,

  totalPrice: Number,

  discount: {
    type: Number,
    default: 0
  },
  
  status: {
    type: String,
    enum: [
      'pending',
      'shipped',
      'out-for-delivery',
      'delivered',
      'cancelled'
    ],
    default: 'pending'
  },

  paymentMethod: {
    type: String,
    enum: ['COD', 'ONLINE'],
    default: "COD"
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },

  shippingAddress: {
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  pincode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: "India"
  }
}


}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
