const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";
    const status = req.query.status || "all";
    const sortBy = req.query.sortBy || "date-desc";

    let query = {};

    if (search) {
      const users = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      query.$or = [{ orderId: { $regex: search, $options: "i" } }];

      if (users.length > 0) {
        query.$or.push({ userId: { $in: users.map((u) => u._id) } });
      }
    }

    if (status != "all") {
      query.status = status;
    }

    let sortQuery = {};
    switch (sortBy) {
      case "date-asc":
        sortQuery.createdAt = 1;
        break;
      case "date-desc":
        sortQuery.createdAt = -1;
        break;
      case "amount-desc":
        sortQuery.finalAmount = -1;
        break;
      case "amount-asc":
        sortQuery.finalAmount = 1;
        break;
      default:
        sortQuery.createdAt = -1;
    }

    const totalOrders = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate("userId")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const pendingOrders = await Order.countDocuments({ status: "pending" });
    const shippedOrders = await Order.countDocuments({ status: "shipped" });
    const outForDelivery = await Order.countDocuments({
      status: "out-for-delivery",
    });
    const deliveredOrders = await Order.countDocuments({ status: "delivered" });
    const cancelledOrders = await Order.countDocuments({ status: "cancelled" });
    const returnRequestedOrders = await Order.countDocuments({
      status: "return-requested",
    });
    const returnedOrders = await Order.countDocuments({ status: "returned" });

    res.render("admin/orders", {
      admin: res.locals.admin,
      orders,
      totalOrders,
      pendingOrders,
      shippedOrders,
      outForDelivery,
      deliveredOrders,
      cancelledOrders,
      returnRequestedOrders,
      returnedOrders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      search,
      status,
      sortBy,
    });
  } catch (error) {
    console.error("LOAD ADMIN ORDERS ERROR: ", error);
    res.redirect("/admin/pageerror");
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate("userId")
      .populate("orderedItems.productId")
      .lean();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    res.json(order);
  } catch (error) {
    console.error("GET ORDER DETAILS ERROR:", error);
    res.status(500).json({ message: "Failed to load order details" });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        message: "Missing orderId or status",
      });
    }

    const ALLOWED_STATUSES = [
      "pending",
      "processing",
      "shipped",
      "out-for-delivery",
      "delivered",
      "cancelled",
    ];

    if (!ALLOWED_STATUSES.includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const order = await Order.findById(orderId).populate(
      "orderedItems.productId",
    );

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (status === "cancelled" && order.status !== "cancelled") {
      for (const item of order.orderedItems) {
        if (item.productId && item.productId._id) {
          await Product.updateOne(
            { _id: item.productId._id, "variants.color": item.color },
            { $inc: { "variants.$.quantity": item.quantity } },
          );
        }
      }

      if (order.paymentMethod !== "COD" && order.paymentStatus !== "refunded") {
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

    if (status === "delivered") {
      order.paymentStatus = "paid";
    }

    order.status = status;
    await order.save();

    return res.json({
      success: true,
      message: "Order status updated successfully",
    });
  } catch (error) {
    console.error("UPDATE ORDER STATUS ERROR", error);
    res.status(500).json({ success: false });
  }
};

const approveReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.returnStatus !== "requested") {
      return res
        .status(400)
        .json({ success: false, message: "Return not pending" });
    }

    for (const item of order.orderedItems) {
      await Product.updateOne(
        { _id: item.productId, "variants.color": item.color },
        { $inc: { "variants.$.quantity": item.quantity } },
      );
    }

    if (order.paymentMethod !== "COD" && order.paymentStatus !== "refunded") {
      const user = await User.findById(order.userId);
      user.wallet += order.finalAmount;
      user.walletTransactions.push({
        type: "credit",
        amount: order.finalAmount,
        description: `Refund for returned order ${order.orderId}`,
        date: new Date(),
      });
      await user.save();
      order.paymentStatus = "refunded";
    }

    order.status = "returned";
    order.returnStatus = "approved";
    order.returnProcessedAt = new Date();

    await order.save();

    res.json({
      success: true,
      message: "Return approved and refund processed",
    });
  } catch (error) {
    console.error("APPROVE RETURN ERROR:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    if (order.returnStatus !== "requested") {
      return res
        .status(400)
        .json({ success: false, message: "Return not pending" });
    }

    order.status = "delivered";
    order.returnStatus = "rejected";

    await order.save();

    res.json({ success: true, message: "Return request rejected" });
  } catch (error) {
    console.error("REJECT RETURN ERROR:", error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

module.exports = {
  loadOrders,
  getOrderDetails,
  updateOrderStatus,
  approveReturn,
  rejectReturn,
};
