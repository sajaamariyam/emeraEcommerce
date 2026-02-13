const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const loadOrderConfirmation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      userId,
    }).populate("orderedItems.productId");

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/pageNotFound");
    }

    const subtotal = order.totalPrice;
    const tax = order.finalAmount - order.totalPrice;
    const total = order.finalAmount;

    res.render("user/orderConfirmation", {
      userId: req.user,
      order,
      subtotal,
      tax,
      total,
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
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      userId,
    }).populate("orderedItems.productId");

    if (!order) {
      req.flash("error", "Order not found");
      return res.redirect("/pageNotFound");
    }

    const subtotal = order.totalPrice;
    const tax = order.finalAmount - order.totalPrice;
    const total = order.finalAmount;

    res.render("user/orderDetails", {
      userId: req.user,
      order,
      subtotal,
      tax,
      total,
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

    let query = {userId};

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ];
    }

    const totalOrders = await Order.countDocuments({ userId });

    const orders = await Order.find({ userId })
      .populate("orderedItems.productId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalOrders / limit);

    res.render("user/order", {
      userId: req.user,
      orders,
      currentPage: page,
      totalPages,
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
    console.log("PROFILE ORDERES ERROR:", error);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({
      orderId,
      userId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const lowerStatus = order.status.toLowerCase();
    if (
      lowerStatus === "delivered" ||
      lowerStatus === "cancelled" ||
      lowerStatus === "return-requested"
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

    order.status = "cancelled";
    order.cancelReason = reason || "No reason provided";
    order.orderedItems = [];
    order.totalPrice = 0;
    order.finalAmount = 0;
    
    if(order.paymentMethod === "ONLINE"){
      order.paymentStatus = "refunded"
    }

    await order.save();

    res.json({
      success: true,
      message: "Order cancelled successfully.",
    });
  } catch (error) {
    console.error("CANCEL ORDER ERROR", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const cancelProduct = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { productId, color, reason } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const order = await Order.findOne({
      orderId,
      userId,
    });

    if (!order) {
      return res.status(404).json({
        success: fasle,
        message: "Order not found",
      });
    }

    const lowerStatus = order.status.toLowerCase();
    if (
      lowerStatus === "delivered" ||
      lowerStatus === "cancelled" ||
      lowerStatus === "return-requested"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel items from ths order",
      });
    }

    const itemIndex = order.orderedItems.findIndex((item) => {
      if (item.productId.toString() !== productId) {
        return false;
      }
      if (item.color && color) {
        return item.color === color;
      }

      return true;
    });

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

    const itemTotal = cancelledItem.price * cancelledItem.quantity;
    order.totalPrice -= itemTotal;

    const tax = Math.round(order.totalPrice * 0.18);
    order.finalAmount = order.totalPrice + tax;

    order.orderedItems.splice(itemIndex, 1);

    if (order.orderedItems.length === 0) {
      order.status = "cancelled";
      order.cancelReason = reason || "All items cancelled";
      order.totalPrice = 0;
      order.finalAmount = 0;
    }

    await order.save();

    res.json({
      success: true,
      message: "Product cancelled successfully. Stock has been restored.",
    });
  } catch (error) {
    console.error("CANCEL PRODUCT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel product. Please try again.",
    });
  }
};

const returnOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Return reason is required",
      });
    }

    const order = await Order.findOne({
      orderId,
      userId,
    }).populate("orderedItems.productId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const lowerStatus = order.status.toLowerCase();
    if (lowerStatus !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    const deliveredDate = order.updatedAt;
    const currentDate = new Date();
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
    order.returnReason = reason.trim();
    await order.save();

    res.json({
      success: true,
      message: "Return request submitted successfully. We'll review shortly",
    });
  } catch (error) {
    console.error("RETURN ORDER ERROR", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({
      orderId,
      userId,
    }).populate("orderedItems.productId");

    if (!order) {
      return res.status(404).send("Order not found");
    }

    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      bufferPages: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${orderId}.pdf`,
    );

    doc.pipe(res);

    // Minimalist color palette
    const colors = {
      primary: "#000000", // Pure black
      secondary: "#4A4A4A", // Dark gray
      border: "#E5E5E5", // Light gray
      subtle: "#F8F8F8", // Very light gray
    };

    // ============================================
    // HEADER SECTION
    // ============================================

    // Thin top border
    doc.rect(0, 0, 612, 1).fill(colors.primary);

    // Company Name - Minimalist
    doc
      .fontSize(32)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text("EMERA", 40, 35);

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("LUXURY BAGS", 40, 70);

    // Invoice Title & Number - Right aligned
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("INVOICE", 450, 40, { align: "right", width: 122 });

    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text(`#${orderId}`, 450, 55, { align: "right", width: 122 });

    // Date
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text(
        new Date(order.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        450,
        78,
        { align: "right", width: 122 },
      );

    // Separator line
    doc
      .moveTo(40, 105)
      .lineTo(572, 105)
      .strokeColor(colors.border)
      .lineWidth(0.5)
      .stroke();

    // ============================================
    // BILLING & ORDER INFO
    // ============================================

    let currentY = 125;

    // Bill To Section
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(colors.secondary)
      .text("BILL TO", 40, currentY);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text(order.shippingAddress.name, 40, currentY + 15);

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text(order.shippingAddress.address, 40, currentY + 30, { width: 220 });

    doc.text(
      `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`,
      40,
      currentY + 44,
      { width: 220 },
    );

    doc.text(order.shippingAddress.phone, 40, currentY + 58, { width: 220 });

    // Order Details Section - Right side
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(colors.secondary)
      .text("ORDER DETAILS", 320, currentY);

    // Status
    const lowerStatus = order.status.toLowerCase();
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Status:", 320, currentY + 15)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text(order.status.toUpperCase(), 390, currentY + 15);

    // Payment Method
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Payment:", 320, currentY + 30)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text(order.paymentMethod.toUpperCase(), 390, currentY + 30);

    // Payment Status
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Status:", 320, currentY + 45)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text(order.paymentStatus || "Pending", 390, currentY + 45);

    // ============================================
    // ITEMS TABLE
    // ============================================

    const tableTop = 230;

    // Table Header with subtle background
    doc.rect(40, tableTop, 532, 20).fill(colors.subtle);

    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(colors.secondary)
      .text("ITEM", 50, tableTop + 6)
      .text("QTY", 360, tableTop + 6, { width: 40, align: "center" })
      .text("PRICE", 420, tableTop + 6, { width: 70, align: "right" })
      .text("AMOUNT", 510, tableTop + 6, { width: 52, align: "right" });

    // Table Header Border
    doc
      .moveTo(40, tableTop + 20)
      .lineTo(572, tableTop + 20)
      .strokeColor(colors.border)
      .lineWidth(0.5)
      .stroke();

    let yPosition = tableTop + 30;

    // Items - Calculate available space
    const maxItems = 8; // Maximum items that fit on one page
    const itemsToShow = order.orderedItems.slice(0, maxItems);

    itemsToShow.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;

      // Subtle alternating rows
      if (index % 2 === 1) {
        doc.rect(40, yPosition - 5, 532, 20).fill(colors.subtle);
      }

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(colors.primary)
        .text(item.productId.name, 50, yPosition, {
          width: 300,
          lineBreak: false,
        });

      doc.text(item.quantity.toString(), 360, yPosition, {
        width: 40,
        align: "center",
      });

      doc
        .fillColor(colors.secondary)
        .text(`₹${item.price.toLocaleString("en-IN")}`, 420, yPosition, {
          width: 70,
          align: "right",
        });

      doc
        .font("Helvetica-Bold")
        .fillColor(colors.primary)
        .text(`₹${itemTotal.toLocaleString("en-IN")}`, 510, yPosition, {
          width: 52,
          align: "right",
        });

      yPosition += 20;
    });

    // If more items, show indicator
    if (order.orderedItems.length > maxItems) {
      doc
        .fontSize(8)
        .font("Helvetica-Oblique")
        .fillColor(colors.secondary)
        .text(
          `+ ${order.orderedItems.length - maxItems} more item(s)`,
          50,
          yPosition,
          { width: 300 },
        );
      yPosition += 20;
    }

    // ============================================
    // TOTALS SECTION
    // ============================================

    const totalsY = 620; // Fixed position for totals

    // Separator before totals
    doc
      .moveTo(350, totalsY - 15)
      .lineTo(572, totalsY - 15)
      .strokeColor(colors.border)
      .lineWidth(0.5)
      .stroke();

    const subtotal = order.totalPrice;
    const tax = order.finalAmount - order.totalPrice;
    const total = order.finalAmount;

    let summaryY = totalsY;

    // Subtotal
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Subtotal:", 420, summaryY, { width: 80, align: "right" })
      .fillColor(colors.primary)
      .text(`₹${subtotal.toLocaleString("en-IN")}`, 510, summaryY, {
        width: 52,
        align: "right",
      });

    summaryY += 18;

    // Tax
    doc
      .fillColor(colors.secondary)
      .text("Tax (GST 18%):", 420, summaryY, { width: 80, align: "right" })
      .fillColor(colors.primary)
      .text(`₹${tax.toLocaleString("en-IN")}`, 510, summaryY, {
        width: 52,
        align: "right",
      });

    summaryY += 18;

    // Discount (if applicable)
    if (order.discount > 0) {
      doc
        .fillColor(colors.secondary)
        .text("Discount:", 420, summaryY, { width: 80, align: "right" })
        .fillColor(colors.primary)
        .text(`-₹${order.discount.toLocaleString("en-IN")}`, 510, summaryY, {
          width: 52,
          align: "right",
        });
      summaryY += 18;
    }

    doc
      .fillColor(colors.secondary)
      .text("Shipping:", 420, summaryY, { width: 80, align: "right" })
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text("FREE", 510, summaryY, { width: 52, align: "right" });

    summaryY += 10;

    doc
      .moveTo(350, summaryY)
      .lineTo(572, summaryY)
      .strokeColor(colors.primary)
      .lineWidth(1)
      .stroke();

    summaryY += 12;

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(colors.primary)
      .text("TOTAL:", 420, summaryY, { width: 80, align: "right" })
      .fontSize(14)
      .text(`₹${total.toLocaleString("en-IN")}`, 510, summaryY, {
        width: 52,
        align: "right",
      });

    const QRCode = require("qrcode");
    const qrData = `EMERA-ORDER-${orderId}-${order.finalAmount}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 80,
      margin: 0,
      color: {
        dark: colors.primary,
        light: "#FFFFFF",
      },
    });

    const qrBuffer = Buffer.from(qrCodeDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, 40, 720, { width: 60, height: 60 });

    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Scan to verify", 40, 785, { width: 60, align: "center" });

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(colors.secondary)
      .text("Thank you for your purchase", 120, 730, {
        align: "center",
        width: 372,
      });

    doc
      .fontSize(7)
      .fillColor(colors.secondary)
      .text("For support: support@emera.com | +91 1800 123 4567", 120, 750, {
        align: "center",
        width: 372,
      });

    doc.rect(0, 841, 612, 1).fill(colors.primary);

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
