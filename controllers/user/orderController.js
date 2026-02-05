const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
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
    res.redirect("/pageNotFound");
  }
};

const loadOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

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
      showAnnouncement: false,
    });
  } catch (error) {
    console.error("LOAD ORDER ERROR:", error);
    res.redirect("/pageNotFound");
  }
};

const getProfileOrders = async (req, res) => {
  try{
    const orders = await Order.find({userId: req.session.user})
    .populate("orderedItems.productId")
    .sort({createdAt: -1});

    const formattedOrders = orders.map(order => ({
      _id: order._id,
      orderNumber: order.orderId,
      status: order.status,
      createdAt: order.createdAt,
      totalAmount: order.finalAmount,
      items: order.orderedItems.map(item => ({
        quantity: item.quantity,
        price: item.price,
        product:{
          name: item.productId?.name,
          image: item.productId?.productImage?.[0]?.url
        }
      }))
    }));

    res.json(formattedOrders);
  }catch(error){
    console.log("PROFILE ORDERES ERROR:", error);
    res.status(500).json([]);
  }
}

const cancelOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { productId, color, reason } = req.body;

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

    if (order.status === "delivered" || order.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This order cannot be cancelled",
      });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) => item.productId.toString() === productId && item.color === color,
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

    const itemTotal = cancelledItem.price * cancelledItem.quantity;
    order.totalPrice -= itemTotal;

    const tax = Math.round(order.totalPrice * 0.18);
    order.finalAmount = order.totalPrice + tax;

    order.orderedItems.splice(itemIndex, 1);

    if (order.orderedItems.length === 0) {
      order.status = "cancelled";
      order.cancelReason = reason || "";
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
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({
        succes: false,
        message: "Only delevered orders can be returned",
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
        message: "Return period has expired (30 days",
      });
    }

    order.returnReason = reason;
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

    const doc = new PDFDocument({ margin: 50, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${orderId}.pdf`,
    );

    doc.pipe(res);

    const colors = {
      primary: "#2C3E50",
      secondary: "#E74C3C",
      emeraGreen: "#10B981",
      accent: "#3498DB",
      text: "#2C3E50",
      lightGrey: "#ECF0F1",
      darkGrey: "#7F8C8D",
    };

    doc.rect(0, 0, 612, 8).fill(colors.emeraGreen);

    if (order.paymentStatus === "Paid" || order.status === "Delivered") {
      doc.save();
      doc.rotate(-45, { origin: [306, 421] });
      doc
        .fontSize(120)
        .fillColor(colors.emeraGreen)
        .opacity(0.08)
        .font("Helvetica-Bold")
        .text("PAID", 150, 350, { width: 400, align: "center" });
      doc.restore();
    }

    doc.rect(0, 8, 612, 120).fill(colors.lightGrey);

    doc.circle(85, 60, 35).fillAndStroke(colors.emeraGreen, colors.primary);

    doc
      .fillColor("#FFFFFF")
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("E", 75, 46);

    doc
      .fillColor(colors.primary)
      .fontSize(36)
      .font("Helvetica-Bold")
      .text("EMERA", 140, 40);

    doc
      .fillColor(colors.emeraGreen)
      .fontSize(12)
      .font("Helvetica-Oblique")
      .text("Luxury Bags", 140, 80);

    doc.rect(140, 98, 100, 3).fill(colors.emeraGreen);

    doc
      .fillColor(colors.primary)
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("INVOICE", 400, 45);

    doc
      .fillColor(colors.text)
      .fontSize(10)
      .font("Helvetica")
      .text(`Invoice #${orderId}`, 400, 80)
      .text(
        `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        400,
        95,
      );

    let currentY = 150;

    doc
      .rect(50, currentY - 10, 240, 140)
      .fill("#FAFAFA")
      .stroke();

    doc
      .fillColor(colors.primary)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("BILL TO", 60, currentY);

    doc
      .fillColor(colors.text)
      .fontSize(10)
      .font("Helvetica")
      .text(order.shippingAddress.name, 60, currentY + 20)
      .text(order.shippingAddress.address, 60, currentY + 35);

    let addressY = currentY + 50;
    if (order.shippingAddress.address) {
      doc.text(order.shippingAddress.address, 60, addressY);
      addressY += 15;
    }

    doc
      .text(
        `${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`,
        60,
        addressY,
      )
      .text(order.shippingAddress.country, 60, addressY + 15)
      .text(`Phone: ${order.shippingAddress.phone}`, 60, addressY + 30)
      .text(`Email: ${order.shippingAddress.email}`, 60, addressY + 45);

    doc
      .rect(310, currentY - 10, 240, 80)
      .fill("#FAFAFA")
      .stroke();

    doc
      .fillColor(colors.primary)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("ORDER DETAILS", 320, currentY);

    const statusColors = {
      delivered: "#27AE60",
      shipped: "#3498DB",
      processing: "#F39C12",
      pending: "#E67E22",
      cancelled: "#E74C3C",
    };
    const statusColor = statusColors[order.status] || "#95A5A6";

    doc
      .fillColor(colors.text)
      .fontSize(10)
      .font("Helvetica")
      .text("Status:", 320, currentY + 20);

    doc.roundedRect(365, currentY + 18, 80, 16, 3).fill(statusColor);

    doc
      .fillColor("#FFFFFF")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(order.status.toUpperCase(), 370, currentY + 21, {
        width: 70,
        align: "center",
      });

    doc
      .fillColor(colors.text)
      .fontSize(10)
      .font("Helvetica")
      .text("Payment Method:", 320, currentY + 45)
      .font("Helvetica-Bold")
      .text(order.paymentMethod.toUpperCase(), 420, currentY + 45);

    const tableTop = 330;

    doc.rect(50, tableTop - 5, 500, 25).fill(colors.emeraGreen);

    doc
      .fillColor("#FFFFFF")
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("ITEM DESCRIPTION", 60, tableTop + 5)
      .text("QTY", 320, tableTop + 5, { width: 50, align: "center" })
      .text("PRICE", 390, tableTop + 5, { width: 70, align: "right" })
      .text("TOTAL", 480, tableTop + 5, { width: 60, align: "right" });

    let yPosition = tableTop + 35;
    let rowCount = 0;

    order.orderedItems.forEach((item, index) => {
      const itemTotal = item.price * item.quantity;

      if (rowCount % 2 === 0) {
        doc.rect(50, yPosition - 8, 500, 30).fill("#F9F9F9");
      }

      doc
        .fillColor(colors.text)
        .fontSize(10)
        .font("Helvetica")
        .text(item.productId.name, 60, yPosition, { width: 240 })
        .text(item.quantity.toString(), 320, yPosition, {
          width: 50,
          align: "center",
        })
        .text(`₹${item.price.toLocaleString("en-IN")}`, 390, yPosition, {
          width: 70,
          align: "right",
        })
        .font("Helvetica-Bold")
        .text(`₹${itemTotal.toLocaleString("en-IN")}`, 480, yPosition, {
          width: 60,
          align: "right",
        });

      yPosition += 30;
      rowCount++;
    });

    yPosition += 20;

    doc.rect(320, yPosition - 10, 230, 150).fill("#FAFAFA");

    const subtotal = order.totalPrice;
    const tax = order.finalAmount - order.totalPrice;
    const total = order.finalAmount;

    doc
      .fillColor(colors.text)
      .fontSize(10)
      .font("Helvetica")
      .text("Subtotal:", 330, yPosition)
      .text(`₹${subtotal.toLocaleString("en-IN")}`, 480, yPosition, {
        width: 60,
        align: "right",
      });

    yPosition += 22;
    doc
      .text("Tax (GST 18%):", 330, yPosition)
      .text(`₹${tax.toLocaleString("en-IN")}`, 480, yPosition, {
        width: 60,
        align: "right",
      });

    if (order.discount > 0) {
      yPosition += 22;
      doc
        .fillColor(colors.secondary)
        .text("Discount:", 330, yPosition)
        .text(`-₹${order.discount.toLocaleString("en-IN")}`, 480, yPosition, {
          width: 60,
          align: "right",
        });
      doc.fillColor(colors.text);
    }

    yPosition += 22;
    doc
      .text("Shipping:", 330, yPosition)
      .fillColor("#27AE60")
      .font("Helvetica-Bold")
      .text("FREE", 480, yPosition, { width: 60, align: "right" });

    yPosition += 15;
    doc
      .moveTo(330, yPosition)
      .lineTo(540, yPosition)
      .strokeColor(colors.emeraGreen)
      .lineWidth(2)
      .stroke();

    yPosition += 15;
    doc
      .fillColor(colors.primary)
      .fontSize(13)
      .font("Helvetica-Bold")
      .text("TOTAL:", 330, yPosition)
      .fontSize(14)
      .fillColor(colors.emeraGreen)
      .text(`₹${total.toLocaleString("en-IN")}`, 480, yPosition, {
        width: 60,
        align: "right",
      });

    const QRCode = require("qrcode");

    const qrData = `EMERA-ORDER-${orderId}-${order.finalAmount}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 100,
      margin: 1,
      color: {
        dark: colors.primary,
        light: "#FFFFFF",
      },
    });

    const qrBuffer = Buffer.from(qrCodeDataUrl.split(",")[1], "base64");

    doc.image(qrBuffer, 60, 665, { width: 80, height: 80 });

    doc
      .fillColor(colors.darkGrey)
      .fontSize(8)
      .font("Helvetica")
      .text("Scan to verify", 60, 750, { width: 80, align: "center" });

    doc.rect(0, 765, 612, 77).fill(colors.lightGrey);

    doc
      .fillColor(colors.primary)
      .fontSize(12)
      .font("Helvetica-Bold")
      .text("Thank you for shopping with EMERA!", 50, 778, {
        align: "center",
        width: 512,
      });

    doc
      .fillColor(colors.darkGrey)
      .fontSize(9)
      .font("Helvetica")
      .text("For any queries, please contact us:", 50, 798, {
        align: "center",
        width: 512,
      })
      .text("Email: support@emera.com | Phone: +91 1800 123 4567", 50, 813, {
        align: "center",
        width: 512,
      });

    doc.rect(0, 834, 612, 8).fill(colors.emeraGreen);

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
  returnOrder,
  downloadInvoice,
};
