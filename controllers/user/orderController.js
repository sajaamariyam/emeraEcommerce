const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const calculateAmounts = (order) => {
  const subtotal = order.totalPrice;
  const tax = Math.round(subtotal * 0.18);
  const grossAmount = subtotal + tax;

  let discount = order.discount || 0;
  if (discount > grossAmount) {
    discount = grossAmount;
  }

  const finalAmount = grossAmount - discount;

  return { subtotal, tax, finalAmount };
};

const loadOrderConfirmation = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user._id,
    }).populate("orderedItems.productId");

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/pageNotFound");
    }

    const { subtotal, tax, finalAmount } = calculateAmounts(order);

    res.render("user/orderConfirmation", {
      order,
      subtotal,
      tax,
      total: finalAmount,
      showAnnouncement: false,
    });
  } catch (error) {
    console.log("LOAD ORDER CONFIRMATION ERROR", error);
    req.flash("error", "Failed to load order confirmation");
    res.redirect("/pageNotFound");
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user._id,
    }).populate("orderedItems.productId");

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/pageNotFound");
    }

    const { subtotal, tax, finalAmount } = calculateAmounts(order);

    res.render("user/orderDetails", {
      order,
      subtotal,
      tax,
      total: finalAmount,
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD ORDER DETAILS ERROR: ", error);
    req.flash("error", "Failed to load order details");
    res.redirect("/pageNotFound");
  }
};

const loadOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const search = req.query.search?.trim() || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = { userId };

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ];
    }

    const totalOrders = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate("orderedItems.productId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("user/order", {
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      search,
      showAnnouncement: false,
      messages: {
        success: req.flash("success"),
        error: req.flash("error"),
      },
    });
  } catch (error) {
    console.error("LOAD ORDER ERROR:", error);
    req.flash("error", "Failed to load orders");
    res.redirect("/pageNotFound");
  }
};

const getProfileOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.session.user })
      .populate("orderedItems.productId")
      .sort({ createdAt: -1 });

    const formattedOrders = orders.map((order) => ({
      _id: order._id,
      orderNumber: order.orderId,
      status: order.status,
      createdAt: order.createdAt,
      totalAmount: order.finalAmount,
      items: order.orderedItems.map((item) => ({
        quantity: item.quantity,
        price: item.price,
        product: {
          name: item.productId?.name,
          image: item.productId?.productImage?.[0]?.url,
        },
      })),
    }));

    res.json(formattedOrders);
  } catch (error) {
    console.log("PROFILE ORDERS ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      orderId,
      userId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const currentStatus = order.status.toLowerCase();

    if (
      currentStatus === "delivered" ||
      currentStatus === "cancelled" ||
      currentStatus === "return-requested"
    ) {
      return res.status(400).json({
        success: false,
        message: "This order cannot be cancelled",
      });
    }

    for (const item of order.orderedItems) {
      await Product.updateOne(
        { _id: item.productId, "variants.color": item.color },
        { $inc: { "variants.$.quantity": item.quantity } },
      );
    }

    if (order.paymentMethod !== "COD") {
      if (order.paymentStatus !== "refunded") {
        const user = await User.findById(order.userId);

        user.wallet += order.finalAmount;

        user.walletTransactions.push({
          type: "credit",
          amount: order.finalAmount,
          description: `Refund for cancelled order ${order.orderId}`,
          date: new Date(),
        });

        await user.save();

        order.paymentStatus = "refunded";
      }
    }

    order.status = "cancelled";
    order.cancelReason = reason || "Cancelled by user";

    await order.save();

    return res.json({
      success: true,
      message:
        "Order cancelled successfully and refund processed if applicable.",
    });
  } catch (error) {
    console.error("CANCEL ORDER ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while cancelling order",
    });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, color, reason } = req.body;

    const order = await Order.findOne({
      orderId,
      userId: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const status = order.status.toLowerCase();

    if (
      status === "delivered" ||
      status === "cancelled" ||
      status === "return-requested"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel items from this order",
      });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) =>
        item.productId.toString() === productId &&
        (!color || item.color === color),
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found in this order",
      });
    }

    const cancelledItem = order.orderedItems[itemIndex];

    await Product.updateOne(
      { _id: cancelledItem.productId, "variants.color": cancelledItem.color },
      { $inc: { "variants.$.quantity": cancelledItem.quantity } },
    );

    const itemSubtotal = cancelledItem.price * cancelledItem.quantity;
    const itemTax = Math.round(itemSubtotal * 0.18);
    const itemTotal = itemSubtotal + itemTax;

    let refundAmount = itemTotal;

    if (order.discount > 0) {
      const orderGross = order.totalPrice + Math.round(order.totalPrice * 0.18);
      const discountRatio = order.discount / orderGross;

      const itemDiscountShare = Math.round(itemTotal * discountRatio);
      refundAmount = itemTotal - itemDiscountShare;

      order.discount -= itemDiscountShare;
      if (order.discount < 0) order.discount = 0;
    }

    order.totalPrice -= itemSubtotal;
    if (order.totalPrice < 0) order.totalPrice = 0;

    order.orderedItems.splice(itemIndex, 1);

    const newTax = Math.round(order.totalPrice * 0.18);
    order.finalAmount = order.totalPrice + newTax - order.discount;

    if (order.finalAmount < 0) order.finalAmount = 0;

    if (order.paymentMethod !== "COD" && order.paymentStatus !== "refunded") {
      const user = await User.findById(order.userId);

      user.wallet += refundAmount;

      user.walletTransactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled product in order ${order.orderId}`,
        date: new Date(),
      });

      await user.save();
    }

    if (order.orderedItems.length === 0) {
      order.status = "cancelled";
      order.cancelReason = reason || "All items cancelled";
      order.paymentStatus =
        order.paymentMethod !== "COD" ? "refunded" : order.paymentStatus;
    }

    await order.save();

    return res.json({
      success: true,
      message: "Product cancelled and refund processed successfully.",
    });
  } catch (error) {
    console.error("CANCEL PRODUCT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel product. Please try again.",
    });
  }
};

const returnOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user._id,
    });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const lowerStatus = order.status.toLowerCase();
    if (lowerStatus !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    if (!req.body.reason || req.body.reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Return reason is mandatory",
      });
    }

    const currentDate = new Date();
    const deliveredDate = order.updatedAt;
    const daysSinceDelivery = Math.floor(
      (currentDate - deliveredDate) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceDelivery > 30) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired (30 days limit)",
      });
    }

    order.status = "return-requested";
    order.returnStatus = "requested";
    order.returnReason = req.body.reason;

    await order.save();

    res.json({
      success: true,
      message: "Return request submitted successfully. We'll review shortly.",
    });
  } catch (error) {
    console.error("RETURN ORDER ERROR", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId,
      userId: req.user._id,
    }).populate("orderedItems.productId");

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const { subtotal, tax, finalAmount } = calculateAmounts(order);

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.orderId}.pdf`,
    );
    doc.pipe(res);

    doc.fontSize(22).text("EMERA", { align: "center" });
    doc.moveDown();

    doc.fontSize(10).text(`Order ID: ${order.orderId}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
    doc.moveDown();

    order.orderedItems.forEach((item) => {
      const itemTotal = item.price * item.quantity;
      doc.text(`${item.productId.name} x${item.quantity} - ₹${itemTotal}`);
    });

    doc.moveDown();
    doc.text(`Subtotal: ₹${subtotal}`);
    doc.text(`Tax (18%): ₹${tax}`);
    if (order.discount > 0) doc.text(`Discount: -₹${order.discount}`);
    doc.text(`Total: ₹${finalAmount}`);

    const qrData = `EMERA-${order.orderId}-${finalAmount}`;
    const qrImage = await QRCode.toDataURL(qrData);
    const qrBuffer = Buffer.from(qrImage.split(",")[1], "base64");
    doc.image(qrBuffer, { width: 80 });

    doc.end();
  } catch (error) {
    console.error("DOWNLOAD INVOICE ERROR:", error);
    res.status(500).send("Failed to generate invoice");
  }
};

module.exports = {
  loadOrderConfirmation,
  loadOrderDetails,
  loadOrder,
  getProfileOrders,
  cancelOrder,
  cancelProduct,
  returnOrder,
  downloadInvoice,
};
