const Offer = require("../../models/offerSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const LIMIT = 10;

const loadOffers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * LIMIT;

    const totalOffers = await Offer.countDocuments();
    const totalPages = Math.ceil(totalOffers / LIMIT);
    const activeOffers = await Offer.countDocuments({
      isActive: true,
      endDate: { $gte: new Date() },
    });
    const expiredOffers = await Offer.countDocuments({
      endDate: { $lt: new Date() },
    });

    const offers = await Offer.find()
      .populate("productId")
      .populate("categoryId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(LIMIT);

    const products = await Product.find({ isListed: true });
    const categories = await Category.find({ isListed: true });

    res.render("admin/offers", {
      offers,
      products,
      categories,
      totalOffers,
      activeOffers,
      expiredOffers,
      currentPage: page,
      totalPages,
      admin: res.locals.admin,
      activePage: "offers",
    });
  } catch (error) {
    console.error("LOAD OFFERS ERROR:", error);
    res.redirect("/admin/pageerror");
  }
};

const createOffer = async (req, res) => {
  try {
    const {
      offerType,
      productId,
      categoryId,
      discountPercentage,
      startDate,
      endDate,
    } = req.body;

    if (offerType === "product" && !productId)
      return res
        .status(400)
        .json({ success: false, message: "Product is required" });

    if (offerType === "category" && !categoryId)
      return res
        .status(400)
        .json({ success: false, message: "Category is required" });

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (start >= end)
      return res
        .status(400)
        .json({ success: false, message: "End date must be after start date" });

    const existingOffer = await Offer.findOne({
      offerType,
      productId: offerType === "product" ? productId : null,
      categoryId: offerType === "category" ? categoryId : null,
      isActive: true,
    });

    if (existingOffer)
      return res
        .status(400)
        .json({
          success: false,
          message: "An active offer already exists for this product/category",
        });

    const newOffer = new Offer({
      offerType,
      productId: offerType === "product" ? productId : null,
      categoryId: offerType === "category" ? categoryId : null,
      discountPercentage,
      startDate: start,
      endDate: end,
      isActive: true,
    });

    await newOffer.save();
    return res
      .status(201)
      .json({ success: true, message: "Offer created successfully" });
  } catch (error) {
    console.error("CREATE OFFER ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.redirect("/admin/offers");
    offer.isActive = !offer.isActive;
    await offer.save();
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("TOGGLE OFFER ERROR:", error);
    res.redirect("/admin/offers");
  }
};

const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.redirect("/admin/offers");
  } catch (error) {
    console.error("DELETE OFFER ERROR:", error);
    res.redirect("/admin/offers");
  }
};

module.exports = { loadOffers, createOffer, toggleOfferStatus, deleteOffer };
