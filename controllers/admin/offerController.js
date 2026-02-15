const Offer = require("../../models/offerSchema");
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const loadOffers = async (req, res) => {
  try {
    const offers = await Offer.find()
      .populate("productId")
      .populate("categoryId")
      .sort({ createdAt: -1 });

    const products = await Product.find({ isListed: true });
    const categories = await Category.find({ isListed: true });

    res.render("admin/offers", {
      offers,
      products,
      categories,
    });
  } catch (error) {
    console.log(error);
    res.redirect("/adminDashboard");
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

    if (offerType === "product" && !productId) {
      return res.status(400).json({ message: "Product is required" });
    }

    if (offerType === "category" && !categoryId) {
      return res.status(400).json({ message: "Category is required" });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

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

    res.redirect("/admin/offers");
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

const toggleOfferStatus = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    offer.isActive = !offer.isActive;
    await offer.save();

    res.redirect("/admin/offers");
  } catch (error) {
    console.log(error);
    res.redirect("/admin/offers");
  }
};

const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.redirect("/admin/offers");
  } catch (error) {
    console.log(error);
    res.redirect("/admin/offers");
  }
};

module.exports = {
  loadOffers,
  createOffer,
  toggleOfferStatus,
  deleteOffer,
};
