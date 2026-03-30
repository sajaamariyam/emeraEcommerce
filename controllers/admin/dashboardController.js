const Order   = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User    = require("../../models/userSchema");
const PDFDocument = require("pdfkit");


const loadDashboard = async (req, res) => {
  try {
    const admin = await User.findById(req.session.admin);

    const totalOrders = await Order.countDocuments();
    const totalUsers  = await User.countDocuments({ isAdmin: false });

    const salesAgg = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled"] }, paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$finalAmount" } } },
    ]);
    const totalSales = salesAgg[0]?.total || 0;

    const pendingReturns = await Order.countDocuments({
      $or: [
        { status: "return-requested" },
        { "orderedItems.itemStatus": "return-requested" },
      ],
    });

    // Low stock: products where total variant qty <= 5
    const allProducts = await Product.find({ isListed: true, isBlocked: false });
    const lowStockProducts = allProducts
      .map((p) => ({ ...p.toObject(), totalStock: p.variants.reduce((s, v) => s + v.quantity, 0) }))
      .filter((p) => p.totalStock <= 5)
      .sort((a, b) => a.totalStock - b.totalStock)
      .slice(0, 5);

    const recentOrders = await Order.find()
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(10);

    const chartData = await getChartData("monthly");

    res.render("admin/adminDashboard", {
      admin,
      activePage: "dashboard",
      totalOrders,
      totalUsers,
      totalSales,
      pendingReturns,
      lowStockProducts,
      recentOrders,
      chartData: JSON.stringify(chartData),
    });
  } catch (error) {
    console.error("LOAD DASHBOARD ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};


async function getChartData(filter) {
  const now = new Date();
  let groupStage, labelFn, matchFilter;

  switch (filter) {
    case "yearly": {
      const startYear = now.getFullYear() - 5;
      matchFilter = { createdAt: { $gte: new Date(`${startYear}-01-01`) } };
      groupStage  = { _id: { $year: "$createdAt" }, revenue: { $sum: "$finalAmount" }, orders: { $sum: 1 } };
      labelFn     = (d) => String(d._id);
      break;
    }
    case "weekly": {
      const ago = new Date(now); ago.setDate(now.getDate() - 83);
      matchFilter = { createdAt: { $gte: ago } };
      groupStage  = { _id: { year: { $isoWeekYear: "$createdAt" }, week: { $isoWeek: "$createdAt" } }, revenue: { $sum: "$finalAmount" }, orders: { $sum: 1 } };
      labelFn     = (d) => `W${d._id.week} ${d._id.year}`;
      break;
    }
    case "daily": {
      const ago = new Date(now); ago.setDate(now.getDate() - 29);
      matchFilter = { createdAt: { $gte: ago } };
      groupStage  = { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } }, revenue: { $sum: "$finalAmount" }, orders: { $sum: 1 } };
      labelFn     = (d) => `${String(d._id.day).padStart(2,"0")}/${String(d._id.month).padStart(2,"0")}`;
      break;
    }
    default: { // monthly
      matchFilter = { createdAt: { $gte: new Date(`${now.getFullYear()}-01-01`), $lte: new Date(`${now.getFullYear()}-12-31`) } };
      groupStage  = { _id: { $month: "$createdAt" }, revenue: { $sum: "$finalAmount" }, orders: { $sum: 1 } };
      const M     = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      labelFn     = (d) => M[d._id - 1];
    }
  }

  const results = await Order.aggregate([
    { $match: { status: { $nin: ["cancelled"] }, ...matchFilter } },
    { $group: groupStage },
    { $sort: { _id: 1 } },
  ]);

  return {
    labels:  results.map(labelFn),
    revenue: results.map((d) => d.revenue),
    orders:  results.map((d) => d.orders),
  };
}


const getDashboardChartData = async (req, res) => {
  try {
    const data = await getChartData(req.query.filter || "monthly");
    return res.json({ success: true, data });
  } catch (error) {
    console.error("CHART DATA ERROR:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch chart data" });
  }
};


const getBestSellingProducts = async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled"] } } },
      { $unwind: "$orderedItems" },
      { $match: { "orderedItems.itemStatus": "active" } },
      { $group: { _id: "$orderedItems.productId", totalSold: { $sum: "$orderedItems.quantity" }, totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $project: { name: "$product.name", brand: "$product.brand", salePrice: "$product.salePrice", totalSold: 1, totalRevenue: 1 } },
    ]);

    if (req.query.json) return res.json({ success: true, data });

    const admin = await User.findById(req.session.admin);
    res.render("admin/bestSellingProducts", { admin, activePage: "dashboard", products: data });
  } catch (error) {
    console.error("BEST SELLING PRODUCTS ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};


const getBestSellingCategories = async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled"] } } },
      { $unwind: "$orderedItems" },
      { $match: { "orderedItems.itemStatus": "active" } },
      { $lookup: { from: "products", localField: "orderedItems.productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.category", totalSold: { $sum: "$orderedItems.quantity" }, totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      { $project: { name: "$category.name", totalSold: 1, totalRevenue: 1 } },
    ]);

    if (req.query.json) return res.json({ success: true, data });

    const admin = await User.findById(req.session.admin);
    res.render("admin/bestSellingCategories", { admin, activePage: "dashboard", categories: data });
  } catch (error) {
    console.error("BEST SELLING CATEGORIES ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};


const getBestSellingBrands = async (req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: { $nin: ["cancelled"] } } },
      { $unwind: "$orderedItems" },
      { $match: { "orderedItems.itemStatus": "active" } },
      { $lookup: { from: "products", localField: "orderedItems.productId", foreignField: "_id", as: "product" } },
      { $unwind: "$product" },
      { $group: { _id: "$product.brand", totalSold: { $sum: "$orderedItems.quantity" }, totalRevenue: { $sum: { $multiply: ["$orderedItems.price", "$orderedItems.quantity"] } } } },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
      { $project: { name: "$_id", totalSold: 1, totalRevenue: 1 } },
    ]);

    if (req.query.json) return res.json({ success: true, data });

    const admin = await User.findById(req.session.admin);
    res.render("admin/bestSellingBrands", { admin, activePage: "dashboard", brands: data });
  } catch (error) {
    console.error("BEST SELLING BRANDS ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};


const generateLedger = async (req, res) => {
  try {
    const { from, to, format = "pdf", page = 1, limit = 20 } = req.query;

    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const endDate   = to   ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date();

    const orders = await Order.find({
      createdAt:     { $gte: startDate, $lte: endDate },
      paymentStatus: { $in: ["paid", "refunded"] },
    })
      .populate("userId", "name email")
      .sort({ createdAt: 1 });

    const entries = [];
    let runningBalance = 0;

    for (const order of orders) {
      const isRefund  = order.paymentStatus === "refunded";
      const amount    = order.finalAmount || 0;
      const credit    = isRefund ? 0 : amount;
      const debit     = isRefund ? amount : 0;
      runningBalance += credit - debit;
      entries.push({
        date: order.createdAt, orderId: order.orderId,
        customer: order.userId?.name || "—", email: order.userId?.email || "—",
        paymentMethod: order.paymentMethod, credit, debit, balance: runningBalance,
        status: order.status, paymentStatus: order.paymentStatus,
      });
    }

    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    const totalDebit  = entries.reduce((s, e) => s + e.debit, 0);
    const netBalance  = totalCredit - totalDebit;

    // ── JSON (for in-page preview) ───────────────────────────
    if (format === "json") {
      const skip      = (Number(page) - 1) * Number(limit);
      const paginated = entries.slice(skip, skip + Number(limit));
      return res.json({
        success: true,
        from: startDate, to: endDate,
        summary: { totalCredit, totalDebit, netBalance, totalEntries: entries.length },
        entries: paginated,
        totalPages:  Math.ceil(entries.length / Number(limit)),
        currentPage: Number(page),
      });
    }

    // ── PDF ──────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition",
      `attachment; filename=ledger-${startDate.toISOString().slice(0,10)}-to-${endDate.toISOString().slice(0,10)}.pdf`
    );
    doc.pipe(res);

    const pageW = 595, M = 40, W = pageW - M * 2;
    const fmt   = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const fmtD  = (d) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const hRule = (y) => doc.save().strokeColor("#e5e7eb").lineWidth(0.5).moveTo(M, y).lineTo(pageW - M, y).stroke().restore();

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111827").text("EMERA — Ledger Book", M, M, { width: W });
    doc.font("Helvetica").fontSize(9).fillColor("#6b7280")
       .text(`Period: ${fmtD(startDate)} – ${fmtD(endDate)}   |   Generated: ${fmtD(new Date())}`, M, M + 24, { width: W });
    hRule(M + 42);

    let y = M + 52;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827").text("SUMMARY", M, y); y += 14;
    [["Total Revenue (Credits)", fmt(totalCredit), "#16a34a"],
     ["Total Refunds (Debits)",  fmt(totalDebit),  "#dc2626"],
     ["Net Balance",             fmt(netBalance),  "#1d4ed8"],
     ["Total Transactions",      entries.length,   "#111827"]
    ].forEach(([label, value, color]) => {
      doc.font("Helvetica").fontSize(9).fillColor("#374151").text(label, M + 8, y, { width: 200 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(color).text(String(value), M + 220, y, { width: 150 });
      y += 14;
    });

    y += 6; hRule(y); y += 10;

    const cols = { date: M, orderId: M+65, customer: M+150, method: M+245, credit: M+300, debit: M+370, balance: M+438 };
    doc.save().rect(M, y, W, 18).fill("#111827").restore();
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
    ["Date","Order ID","Customer","Method","Credit","Debit","Balance"].forEach((h, i) => {
      const x = [cols.date, cols.orderId, cols.customer, cols.method, cols.credit, cols.debit, cols.balance][i];
      const w = [60,80,90,50,65,65,75][i];
      const align = i >= 4 ? "right" : "left";
      doc.text(h, x, y + 5, { width: w, lineBreak: false, align });
    });
    y += 22;

    entries.forEach((e, idx) => {
      if (y > 790) { doc.addPage(); y = M; }
      doc.save().rect(M, y - 2, W, 16).fill(idx % 2 === 0 ? "#f9fafb" : "#ffffff").restore();
      doc.font("Helvetica").fontSize(7).fillColor("#374151");
      doc.text(fmtD(e.date),    cols.date,     y, { width: 60, lineBreak: false });
      doc.text(e.orderId,       cols.orderId,  y, { width: 80, lineBreak: false });
      doc.text(e.customer,      cols.customer, y, { width: 90, lineBreak: false });
      doc.text(e.paymentMethod, cols.method,   y, { width: 50, lineBreak: false });
      doc.fillColor("#16a34a").text(e.credit > 0 ? fmt(e.credit) : "—", cols.credit,  y, { width: 65, align: "right", lineBreak: false });
      doc.fillColor("#dc2626").text(e.debit  > 0 ? fmt(e.debit)  : "—", cols.debit,   y, { width: 65, align: "right", lineBreak: false });
      doc.fillColor(e.balance >= 0 ? "#1d4ed8" : "#dc2626").text(fmt(e.balance), cols.balance, y, { width: 75, align: "right", lineBreak: false });
      y += 16;
    });

    hRule(y + 4); y += 10;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827").text(`Closing Balance: ${fmt(netBalance)}`, M, y, { width: W, align: "right" });
    doc.flushPages();
    doc.end();

  } catch (error) {
    console.error("GENERATE LEDGER ERROR:", error);
    res.status(500).send("Failed to generate ledger");
  }
};


module.exports = {
  loadDashboard,
  getDashboardChartData,
  getBestSellingProducts,
  getBestSellingCategories,
  getBestSellingBrands,
  generateLedger,
};