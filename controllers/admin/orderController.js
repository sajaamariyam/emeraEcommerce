const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");

const STATUS_RANK = {
  pending: 0,
  processing: 1,
  shipped: 2,
  "out-for-delivery": 3,
  delivered: 4,
  cancelled: 5,
  "return-requested": 6,
  returned: 7,
};

function isRollback(current, next) {
  if (current === "cancelled" || current === "returned") return true;
  const curRank = STATUS_RANK[current] ?? -1;
  const nextRank = STATUS_RANK[next] ?? -1;
  if (next === "cancelled" && curRank < STATUS_RANK["delivered"]) return false;
  if (next === "return-requested" && current === "delivered") return false;
  if (next === "returned" && current === "return-requested") return false;
  return nextRank < curRank;
}

function computeRefundAmount(order, returnItems) {
  const activeItems = order.orderedItems.filter(
    (i) =>
      i.itemStatus === "active" ||
      returnItems.some((r) => r._id?.toString() === i._id?.toString()),
  );

  const totalSubtotal = activeItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0,
  );
  const returnSubtotal = returnItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0,
  );

  if (totalSubtotal === 0) return 0;

  const ratio = returnSubtotal / totalSubtotal;

  const discount = order.discount || 0;
  const discountedSub = Math.max(totalSubtotal - discount, 0);
  const tax = Math.round(discountedSub * 0.18);
  const gross = discountedSub + tax;

  return Math.round(gross * ratio);
}

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

      const searchConditions = [{ orderId: { $regex: search, $options: "i" } }];
      if (users.length > 0) {
        searchConditions.push({ userId: { $in: users.map((u) => u._id) } });
      }
      query.$and = [{ $or: searchConditions }];
    }

    if (status !== "all") {
      if (query.$and) {
        query.$and.push({ status });
      } else {
        query.status = status;
      }
    }

    let sortQuery = {};
    switch (sortBy) {
      case "date-asc":
        sortQuery.createdAt = 1;
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

    const [
      pendingOrders,
      shippedOrders,
      outForDelivery,
      deliveredOrders,
      cancelledOrders,
      returnRequestedOrders,
      returnedOrders,
    ] = await Promise.all([
      Order.countDocuments({ status: "pending" }),
      Order.countDocuments({ status: "shipped" }),
      Order.countDocuments({ status: "out-for-delivery" }),
      Order.countDocuments({ status: "delivered" }),
      Order.countDocuments({ status: "cancelled" }),
      Order.countDocuments({ status: "return-requested" }),
      Order.countDocuments({ status: "returned" }),
    ]);

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
    const order = await Order.findById(req.params.id)
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
      return res
        .status(400)
        .json({ success: false, message: "Missing orderId or status" });
    }

    const ALLOWED_STATUSES = [
      "pending",
      "processing",
      "shipped",
      "out-for-delivery",
      "delivered",
      "cancelled",
      "return-requested",
      "returned",
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

    if (isRollback(order.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from "${order.status}" to "${status}"`,
      });
    }

    if (status === "cancelled" && order.status !== "cancelled") {
      for (const item of order.orderedItems) {
        if (item.itemStatus === "active" && item.productId?._id) {
          await Product.updateOne(
            { _id: item.productId._id, "variants.color": item.color },
            { $inc: { "variants.$.quantity": item.quantity } },
          );
        }
      }
      if (
        order.paymentMethod !== "COD" &&
        order.paymentStatus !== "refunded" &&
        order.paymentStatus === "paid"
      ) {
        const user = await User.findById(order.userId);
        user.wallet = (user.wallet || 0) + order.finalAmount;
        user.walletTransactions.push({
          type: "credit",
          amount: order.finalAmount,
          description: `Refund for cancelled order ${order.orderId}`,
          date: new Date(),
        });
        await user.save();
        order.paymentStatus = "refunded";
      }
      order.orderedItems.forEach((item) => {
        if (item.itemStatus === "active") item.itemStatus = "cancelled";
      });
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

    if (order.status !== "return-requested") {
      return res.status(400).json({
        success: false,
        message: "Order is not in return-requested state",
      });
    }

    const returnItems = order.orderedItems.filter(
      (item) => item.itemStatus === "return-requested",
    );

    const itemsToReturn =
      returnItems.length > 0
        ? returnItems
        : order.orderedItems.filter((item) => item.itemStatus === "active");

    for (const item of itemsToReturn) {
      await Product.updateOne(
        { _id: item.productId, "variants.color": item.color },
        { $inc: { "variants.$.quantity": item.quantity } },
      );
    }

    if (order.paymentMethod !== "COD" && order.paymentStatus === "paid") {
      const refundAmount = computeRefundAmount(order, itemsToReturn);
      const user = await User.findById(order.userId);
      user.wallet = (user.wallet || 0) + refundAmount;
      user.walletTransactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for returned order ${order.orderId}`,
        date: new Date(),
      });
      await user.save();
      order.paymentStatus = "refunded";
    }

    itemsToReturn.forEach((item) => {
      item.itemStatus = "returned";
      item.returnStatus = "approved";
      item.returnedAt = new Date();
    });

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

    if (order.status !== "return-requested") {
      return res.status(400).json({
        success: false,
        message: "Order is not in return-requested state",
      });
    }

    order.orderedItems.forEach((item) => {
      if (item.itemStatus === "return-requested") {
        item.itemStatus = "active";
        item.returnStatus = "rejected";
      }
    });

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
