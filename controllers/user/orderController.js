const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const calculateAmounts = (order) => {
  const activeItems = order.orderedItems.filter(
    (item) => item.itemStatus === "active",
  );

  const subtotal = activeItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const tax = Math.round(subtotal * 0.18);
  const grossAmount = subtotal + tax;

  let discount = order.discount || 0;
  if (discount > grossAmount) discount = grossAmount;

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

    const status = req.query.status?.trim();

    let query = { userId };

    if (status) {
      query.status = { $regex: `^${status}$`, $options: "i" };
    }

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
        itemStatus: item.itemStatus,
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

    const order = await Order.findOne({ orderId, userId: req.user._id });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    const currentStatus = order.status.toLowerCase();

    if (
      currentStatus === "delivered" ||
      currentStatus === "cancelled" ||
      currentStatus === "return-requested"
    ) {
      return res
        .status(400)
        .json({ success: false, message: "This order cannot be cancelled" });
    }

    for (const item of order.orderedItems) {
      if (item.itemStatus === "active") {
        await Product.updateOne(
          { _id: item.productId, "variants.color": item.color },
          { $inc: { "variants.$.quantity": item.quantity } },
        );
      }
    }

    const shouldRefund =
      order.paymentStatus === "paid" &&
      order.paymentMethod.toLowerCase() !== "cod";

    if (shouldRefund) {
      const refundAmount = order.finalAmount;
      const user = await User.findById(order.userId);
      user.wallet = (user.wallet || 0) + refundAmount;
      user.walletTransactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order ${order.orderId}`,
        date: new Date(),
      });
      await user.save();
      order.paymentStatus = "refunded";
    }

    order.orderedItems.forEach((item) => {
      if (item.itemStatus === "active") {
        item.itemStatus = "cancelled";
        item.cancelledAt = new Date();
        item.cancelReason = reason || "Order cancelled by user";
      }
    });

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

    const order = await Order.findOne({ orderId, userId: req.user._id });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
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

    const item = order.orderedItems.find(
      (i) =>
        i.productId.toString() === productId &&
        (!color || i.color === color) &&
        i.itemStatus === "active",
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Active product not found in this order",
      });
    }

    await Product.updateOne(
      { _id: item.productId, "variants.color": item.color },
      { $inc: { "variants.$.quantity": item.quantity } },
    );

    const activeItems = order.orderedItems.filter(
      (i) => i.itemStatus === "active",
    );
    const totalActiveSubtotal = activeItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );

    const itemSubtotal = item.price * item.quantity;

    const itemRatio =
      totalActiveSubtotal > 0 ? itemSubtotal / totalActiveSubtotal : 0;

    const itemDiscount = Math.round((order.discount || 0) * itemRatio);

    const itemTax = Math.round(itemSubtotal * 0.18);

    const refundAmount = Math.max(itemSubtotal + itemTax - itemDiscount, 0);

    const remainingSubtotal = Math.max(totalActiveSubtotal - itemSubtotal, 0);
    const remainingTax = Math.round(remainingSubtotal * 0.18);
    const remainingDiscount = Math.max((order.discount || 0) - itemDiscount, 0);
    const remainingFinal = Math.max(
      remainingSubtotal + remainingTax - remainingDiscount,
      0,
    );

    order.totalPrice = remainingSubtotal;
    order.discount = remainingDiscount;
    order.finalAmount = remainingFinal;

    item.itemStatus = "cancelled";
    item.cancelledAt = new Date();
    item.cancelReason = reason || "Cancelled by user";

    if (order.paymentMethod !== "COD" && order.paymentStatus === "paid") {
      const user = await User.findById(order.userId);
      user.wallet = (user.wallet || 0) + refundAmount;
      user.walletTransactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund ₹${refundAmount.toLocaleString("en-IN")} for cancelled item in order ${order.orderId}`,
        date: new Date(),
      });
      await user.save();
    }

    const allCancelled = order.orderedItems.every(
      (i) => i.itemStatus === "cancelled",
    );
    if (allCancelled) {
      order.status = "cancelled";
      order.cancelReason = reason || "All items cancelled";
      if (order.paymentMethod !== "COD") {
        order.paymentStatus = "refunded";
      }
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

    if (order.status.toLowerCase() !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Only delivered orders can be returned",
      });
    }

    if (!req.body.reason || req.body.reason.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is mandatory" });
    }

    const deliveryDate = order.deliveredAt || order.updatedAt;
    const daysSinceDelivery = Math.floor(
      (new Date() - deliveryDate) / (1000 * 60 * 60 * 24),
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
    order.refundAmount = order.finalAmount;

    await order.save();

    res.json({
      success: true,
      message:
        "Return request submitted successfully. Refund will be processed after approval.",
    });
  } catch (error) {
    console.error("RETURN ORDER ERROR", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const returnProduct = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, color, reason } = req.body;

    if (!reason || reason.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Return reason is mandatory" });
    }

    const order = await Order.findOne({ orderId, userId: req.user._id });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.status.toLowerCase() !== "delivered") {
      return res.status(400).json({
        success: false,
        message: "Items can only be returned from delivered orders",
      });
    }

    const daysSinceDelivery = Math.floor(
      (new Date() - order.updatedAt) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceDelivery > 30) {
      return res.status(400).json({
        success: false,
        message: "Return period has expired (30 days limit)",
      });
    }

    const item = order.orderedItems.find(
      (i) =>
        i.productId.toString() === productId &&
        (!color || i.color === color) &&
        i.itemStatus === "active",
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Active item not found in this order",
      });
    }

    item.itemStatus = "return-requested";
    item.returnStatus = "requested";
    item.returnReason = reason;
    item.returnRequestedAt = new Date();

    order.status = "return-requested";

    await order.save();

    return res.json({
      success: true,
      message: "Return request submitted. We'll review it shortly.",
    });
  } catch (error) {
    console.error("RETURN PRODUCT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit return request.",
    });
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

    const activeItems = order.orderedItems.filter(
      (i) => i.itemStatus === "active",
    );
    const cancelledItems = order.orderedItems.filter(
      (i) => i.itemStatus === "cancelled",
    );
    const returnedItems = order.orderedItems.filter(
      (i) => i.itemStatus === "returned" || i.itemStatus === "return-requested",
    );

    const subtotal = activeItems.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const tax = Math.round(subtotal * 0.18);
    const grossAmount = subtotal + tax;
    let discount = order.discount || 0;
    if (discount > grossAmount) discount = grossAmount;
    const finalAmount = grossAmount - discount;

    const fmt = (n) => `Rs. ${Number(n).toLocaleString("en-IN")}`;

    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${order.orderId}.pdf`,
    );
    doc.pipe(res);

    const pageW = 595;
    const pageH = 842;
    const M = 50;
    const W = pageW - M * 2;

    const txt = (text, x, y, opts = {}) =>
      doc.text(String(text), x, y, { lineBreak: false, ...opts });

    const hRule = (y, color = "#e5e7eb") =>
      doc
        .save()
        .strokeColor(color)
        .lineWidth(0.5)
        .moveTo(M, y)
        .lineTo(pageW - M, y)
        .stroke()
        .restore();

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#111827");
    txt("EMERA", M, M);
    doc.font("Helvetica").fontSize(8).fillColor("#9ca3af");
    txt("Premium Fashion", M, M + 28);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111827");
    txt("INVOICE", pageW - M - 120, M, { width: 120, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
    txt(`#${order.orderId}`, pageW - M - 120, M + 22, {
      width: 120,
      align: "right",
    });
    txt(
      `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
      pageW - M - 120,
      M + 33,
      { width: 120, align: "right" },
    );
    txt(`Status: ${order.status.toUpperCase()}`, pageW - M - 120, M + 44, {
      width: 120,
      align: "right",
    });

    hRule(M + 58);

    // ── BILLING INFO ──────────────────────────────────────────────────────────
    let y = M + 68;
    const addr = order.shippingAddress || {};

    doc.font("Helvetica-Bold").fontSize(7).fillColor("#9ca3af");
    txt("BILLED TO", M, y);
    txt("PAYMENT", M + 300, y);

    doc.font("Helvetica").fontSize(9).fillColor("#111827");
    txt(addr.name || "-", M, y + 12);
    txt(addr.phone || "", M, y + 23);
    txt(addr.address || "", M, y + 34);
    txt(
      `${addr.city || ""}, ${addr.state || ""} - ${addr.pincode || ""}`,
      M,
      y + 45,
    );
    txt(addr.country || "India", M, y + 56);
    txt(order.paymentMethod, M + 300, y + 12);
    txt(`Status: ${order.paymentStatus.toUpperCase()}`, M + 300, y + 23);

    y += 70;
    hRule(y);

    // ── TABLE HEADER ──────────────────────────────────────────────────────────
    y += 10;
    doc.save().rect(M, y, W, 20).fill("#111827").restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#ffffff");
    txt("ITEM", M + 4, y + 6);
    txt("QTY", M + 230, y + 6, { width: 55, align: "center" });
    txt("PRICE", M + 295, y + 6, { width: 90, align: "right" });
    txt("TOTAL", M + 395, y + 6, { width: 100, align: "right" });
    y += 24;

    // ── ITEM ROW HELPER ───────────────────────────────────────────────────────
    const itemRow = (name, qty, price, totalTxt, bgColor, textColor) => {
      doc
        .save()
        .rect(M, y - 3, W, 18)
        .fill(bgColor)
        .restore();
      doc.font("Helvetica").fontSize(9).fillColor(textColor);
      txt(name, M + 4, y, { width: 220 });
      txt(qty, M + 230, y, { width: 55, align: "center" });
      txt(price, M + 295, y, { width: 90, align: "right" });
      txt(totalTxt, M + 395, y, { width: 100, align: "right" });
      y += 20;
    };

    if (activeItems.length > 0) {
      activeItems.forEach((item, idx) => {
        const name =
          (item.productId?.name || "Product") +
          (item.color ? ` (${item.color})` : "");
        itemRow(
          name,
          item.quantity,
          fmt(item.price),
          fmt(item.price * item.quantity),
          idx % 2 === 0 ? "#f9fafb" : "#ffffff",
          "#111827",
        );
      });
    } else {
      doc.font("Helvetica").fontSize(9).fillColor("#9ca3af");
      txt("No active items", M, y);
      y += 20;
    }

    if (cancelledItems.length > 0) {
      y += 6;
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#ef4444");
      txt("CANCELLED (not billed)", M, y);
      y += 14;
      cancelledItems.forEach((item) => {
        itemRow(
          item.productId?.name || "Product",
          item.quantity,
          fmt(item.price),
          "CANCELLED",
          "#fef2f2",
          "#9ca3af",
        );
      });
    }

    if (returnedItems.length > 0) {
      y += 6;
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#f97316");
      txt("RETURNED", M, y);
      y += 14;
      returnedItems.forEach((item) => {
        const tag =
          item.itemStatus === "return-requested"
            ? "RETURN REQUESTED"
            : "RETURNED";
        itemRow(
          item.productId?.name || "Product",
          item.quantity,
          fmt(item.price),
          tag,
          "#fff7ed",
          "#9ca3af",
        );
      });
    }

    y += 4;
    hRule(y);

    // ── TOTALS ────────────────────────────────────────────────────────────────
    const totX = M + 280;
    const labW = 110;
    const valW = W - 280;

    y += 12;
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    txt("Subtotal", totX, y, { width: labW });
    txt(fmt(subtotal), totX + labW, y, { width: valW - labW, align: "right" });

    y += 14;
    txt("Tax (18%)", totX, y, { width: labW });
    txt(fmt(tax), totX + labW, y, { width: valW - labW, align: "right" });

    if (discount > 0) {
      y += 14;
      doc.fillColor("#16a34a");
      txt("Discount", totX, y, { width: labW });
      txt(`-${fmt(discount)}`, totX + labW, y, {
        width: valW - labW,
        align: "right",
      });
    }

    y += 10;
    hRule(y);
    y += 10;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827");
    txt("TOTAL AMOUNT", totX, y, { width: labW });
    txt(fmt(finalAmount), totX + labW, y, {
      width: valW - labW,
      align: "right",
    });

    // ── QR + FOOTER ───────────────────────────────────────────────────────────
    // switchToPage(0) forces back to page 1 before drawing footer
    doc.switchToPage(0);

    const footerY = pageH - 65;
    hRule(footerY);

    const qrData = `EMERA-${order.orderId}-${finalAmount}`;
    const qrImage = await QRCode.toDataURL(qrData, { width: 80 });
    const qrBuffer = Buffer.from(qrImage.split(",")[1], "base64");
    doc.image(qrBuffer, M, footerY + 8, { width: 48 });

    doc.font("Helvetica").fontSize(7).fillColor("#9ca3af");
    txt("Thank you for shopping with EMERA.", M + 58, footerY + 14, {
      width: W - 58,
      align: "center",
    });
    txt("support@emera.com", M + 58, footerY + 26, {
      width: W - 58,
      align: "center",
    });

    doc.flushPages();
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
  returnProduct,
  downloadInvoice,
};
