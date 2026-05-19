const Order = require("../../models/orderSchema");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

const LIMIT = 10;

const getDateRange = (query) => {
  const { filter, from, to } = query;
  const today = new Date();
  let startDate;
  let endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  if (filter === "daily") {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "weekly") {
    startDate = new Date();
    startDate.setDate(today.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    // FIX: endDate was missing reset for weekly
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "monthly") {
    startDate = new Date();
    startDate.setMonth(today.getMonth() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "custom" && from && to) {
    startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // default: last 30 days
    startDate = new Date();
    startDate.setDate(today.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
};

const loadSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * LIMIT;

    const matchStage = {
      status: "delivered",
      createdAt: { $gte: startDate, $lte: endDate },
    };

    const report = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: "$finalAmount" },
          totalDiscount: { $sum: "$discount" },
        },
      },
    ]);

    const totalOrders = report[0]?.totalOrders || 0;
    const totalPages = Math.ceil(totalOrders / LIMIT) || 1;

    const orders = await Order.find(matchStage)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(LIMIT)
      .lean();

    const summary = report[0] || {
      totalOrders: 0,
      totalSales: 0,
      totalDiscount: 0,
    };

    const activeFilter = req.query.filter || "";
    const from = req.query.from || "";
    const to = req.query.to || "";

    res.render("admin/salesReport", {
      summary,
      orders,
      filter: activeFilter,
      from,
      to,
      currentPage: page,
      totalPages,
      totalOrders,
      admin: res.locals.admin,
      activePage: "salesReport",
    });
  } catch (error) {
    console.error("SALES REPORT ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};

const downloadSalesPDF = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);

    const orders = await Order.find({
      status: "delivered",
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .lean();

    const summaryResult = await Order.aggregate([
      {
        $match: {
          status: "delivered",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: "$finalAmount" },
          totalDiscount: { $sum: "$discount" },
        },
      },
    ]);

    const stats = summaryResult[0] || {
      totalOrders: 0,
      totalSales: 0,
      totalDiscount: 0,
    };
    const rs = (amount) => `Rs. ${Number(amount).toLocaleString("en-IN")}`;

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales-report-${Date.now()}.pdf`,
    );
    doc.pipe(res);

    doc.fontSize(20).fillColor("#0f6b5a").text("EMERA", { align: "center" });
    doc
      .fontSize(13)
      .fillColor("#444")
      .text("Sales Report", { align: "center" });
    doc.moveDown(0.5);

    const filterLabel = req.query.filter
      ? req.query.filter.charAt(0).toUpperCase() + req.query.filter.slice(1)
      : "Last 30 Days";

    doc
      .fontSize(9)
      .fillColor("#888")
      .text(
        `Period: ${filterLabel}  |  Generated: ${new Date().toLocaleDateString("en-IN")}`,
        { align: "center" },
      );
    doc.moveDown();

    const summaryTop = doc.y;
    doc.rect(40, summaryTop, 515, 40).fill("#f0fdf9");
    doc.fontSize(10).fillColor("#0f6b5a");
    doc.text(`Total Orders: ${stats.totalOrders}`, 55, summaryTop + 13, {
      lineBreak: false,
    });
    doc.text(`Total Revenue: ${rs(stats.totalSales)}`, 190, summaryTop + 13, {
      lineBreak: false,
    });
    doc.text(
      `Total Discount: ${rs(stats.totalDiscount)}`,
      370,
      summaryTop + 13,
      { lineBreak: true },
    );
    doc.y = summaryTop + 52;

    const COL = {
      orderId: { x: 42, w: 120 },
      user: { x: 168, w: 90 },
      date: { x: 264, w: 70 },
      payment: { x: 340, w: 60 },
      discount: { x: 406, w: 65 },
      amount: { x: 477, w: 78 },
    };
    const ROW_H = 18;
    const HEAD_H = 20;

    const drawHeader = (y) => {
      doc.rect(40, y, 515, HEAD_H).fill("#0f6b5a");
      doc.fontSize(8).fillColor("#fff");
      doc.text("Order ID", COL.orderId.x, y + 5, {
        width: COL.orderId.w,
        lineBreak: false,
      });
      doc.text("Customer", COL.user.x, y + 5, {
        width: COL.user.w,
        lineBreak: false,
      });
      doc.text("Date", COL.date.x, y + 5, {
        width: COL.date.w,
        lineBreak: false,
      });
      doc.text("Payment", COL.payment.x, y + 5, {
        width: COL.payment.w,
        lineBreak: false,
      });
      doc.text("Discount", COL.discount.x, y + 5, {
        width: COL.discount.w,
        lineBreak: false,
      });
      doc.text("Amount", COL.amount.x, y + 5, {
        width: COL.amount.w,
        lineBreak: true,
      });
      doc.y = y + HEAD_H + 2;
    };

    drawHeader(doc.y);

    orders.forEach((order, i) => {
      if (doc.y + ROW_H > 800) {
        doc.addPage();
        drawHeader(doc.y);
      }
      const rowY = doc.y;
      if (i % 2 === 0) doc.rect(40, rowY, 515, ROW_H).fill("#f9fafb");
      doc.fontSize(8).fillColor("#333");
      doc.text(order.orderId, COL.orderId.x, rowY + 4, {
        width: COL.orderId.w,
        lineBreak: false,
        ellipsis: true,
      });
      doc.text(order.userId?.name || "N/A", COL.user.x, rowY + 4, {
        width: COL.user.w,
        lineBreak: false,
        ellipsis: true,
      });
      doc.text(
        new Date(order.createdAt).toLocaleDateString("en-IN"),
        COL.date.x,
        rowY + 4,
        { width: COL.date.w, lineBreak: false },
      );
      doc.text(
        (order.paymentMethod || "—").toUpperCase(),
        COL.payment.x,
        rowY + 4,
        { width: COL.payment.w, lineBreak: false },
      );
      doc.text(
        order.discount > 0 ? `-${rs(order.discount)}` : "—",
        COL.discount.x,
        rowY + 4,
        { width: COL.discount.w, lineBreak: false },
      );
      doc.text(rs(order.finalAmount), COL.amount.x, rowY + 4, {
        width: COL.amount.w,
        lineBreak: true,
      });
      doc.y = rowY + ROW_H;
    });

    doc.end();
  } catch (error) {
    console.error("PDF DOWNLOAD ERROR:", error);
    res.status(500).send("Failed to download PDF");
  }
};

const downloadSalesExcel = async (req, res) => {
  try {
    const { startDate, endDate } = getDateRange(req.query);

    const orders = await Order.find({
      status: "delivered",
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .lean();

    const summaryResult = await Order.aggregate([
      {
        $match: {
          status: "delivered",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSales: { $sum: "$finalAmount" },
          totalDiscount: { $sum: "$discount" },
        },
      },
    ]);
    const stats = summaryResult[0] || {
      totalOrders: 0,
      totalSales: 0,
      totalDiscount: 0,
    };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sales Report");

    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = "EMERA — Sales Report";
    sheet.getCell("A1").font = {
      bold: true,
      size: 14,
      color: { argb: "FF0F6B5A" },
    };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.getRow(1).height = 28;

    const filterLabel = req.query.filter
      ? req.query.filter.charAt(0).toUpperCase() + req.query.filter.slice(1)
      : "Last 30 Days";
    sheet.mergeCells("A2:F2");
    sheet.getCell("A2").value =
      `Period: ${filterLabel}  |  Generated: ${new Date().toLocaleDateString("en-IN")}`;
    sheet.getCell("A2").font = {
      italic: true,
      color: { argb: "FF888888" },
      size: 9,
    };
    sheet.getCell("A2").alignment = { horizontal: "center" };

    sheet.mergeCells("A3:F3");
    sheet.getCell("A3").value =
      `Total Orders: ${stats.totalOrders}   |   Revenue: ₹${stats.totalSales.toLocaleString("en-IN")}   |   Discount: ₹${stats.totalDiscount.toLocaleString("en-IN")}`;
    sheet.getCell("A3").font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 10,
    };
    sheet.getCell("A3").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F6B5A" },
    };
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.getRow(3).height = 22;

    sheet.addRow([]);

    sheet.columns = [
      { key: "orderId", width: 26 },
      { key: "customer", width: 20 },
      { key: "date", width: 16 },
      { key: "payment", width: 14 },
      { key: "discount", width: 16 },
      { key: "amount", width: 20 },
    ];

    const headerRow = sheet.addRow([
      "Order ID",
      "Customer",
      "Date",
      "Payment",
      "Discount (₹)",
      "Final Amount (₹)",
    ]);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F6B5A" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF0A5244" } },
      };
    });

    orders.forEach((order, i) => {
      const row = sheet.addRow({
        orderId: order.orderId,
        customer: order.userId?.name || "N/A",
        date: new Date(order.createdAt).toLocaleDateString("en-IN"),
        payment: (order.paymentMethod || "—").toUpperCase(),
        discount: order.discount || 0,
        amount: order.finalAmount,
      });
      row.height = 18;
      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0FDF9" },
          };
        });
      }
      row.getCell("discount").alignment = { horizontal: "right" };
      row.getCell("amount").alignment = { horizontal: "right" };
    });

    const totalsRow = sheet.addRow({
      orderId: "TOTAL",
      customer: "",
      date: "",
      payment: "",
      discount: stats.totalDiscount,
      amount: stats.totalSales,
    });
    totalsRow.height = 20;
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FF0F6B5A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE6FFF9" },
      };
      cell.border = { top: { style: "medium", color: { argb: "FF0F6B5A" } } };
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales-report-${Date.now()}.xlsx`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("EXCEL DOWNLOAD ERROR:", error);
    res.status(500).send("Failed to download Excel");
  }
};

module.exports = { loadSalesReport, downloadSalesPDF, downloadSalesExcel };
