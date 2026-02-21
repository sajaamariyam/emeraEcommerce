const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");

const loadDashboard = async (req, res) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/adminLogin");
    }

    const admin = await User.findById(req.session.admin);

    const totalOrders = await Order.countDocuments();
    

    const totalUsers = await User.countDocuments({ isAdmin: false });
    

    const salesData = await Order.aggregate([
      { $match: { status: "delivered" } },
      { $group: { _id: null, totalSales: { $sum: "$finalAmount" } } }
    ]);
    const totalSales = salesData.length > 0 ? salesData[0].totalSales : 0;
    

    const pendingReturns = await Order.countDocuments({ 
      status: "return-requested",
      returnStatus: "requested" 
    });


    const currentYear = new Date().getFullYear();
    const monthlySales = await Order.aggregate([
      {
        $match: {
          status: "delivered",
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lte: new Date(`${currentYear}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          sales: { $sum: "$finalAmount" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);


    const salesByMonth = Array(12).fill(0);
    monthlySales.forEach(item => {
      salesByMonth[item._id - 1] = item.sales;
    });

    const lowStockProducts = await Product.aggregate([
      { $match: { isBlocked: false, isListed: true } },
      { $unwind: "$variants" },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          productImage: { $first: "$productImage" },
          totalStock: { $sum: "$variants.quantity" }
        }
      },
      { $match: { totalStock: { $lte: 10, $gt: 0 } } },
      { $sort: { totalStock: 1 } },
      { $limit: 4 }
    ]);

    const recentOrders = await Order.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.render("admin/adminDashboard", {
      admin,
      activePage: "dashboard",
      totalOrders,
      totalUsers,
      totalSales,
      pendingReturns,
      salesByMonth,
      lowStockProducts,
      recentOrders
    });
  } catch (error) {
    console.log("Dashboard error:", error);
    res.redirect("/admin/pageerror");
  }
};

module.exports = {
  loadDashboard
};