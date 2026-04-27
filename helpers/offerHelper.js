const Offer = require("../models/offerSchema");

const getBestOffer = async (product) => {
  const now = new Date();

  const productOffer = await Offer.findOne({
    offerType: "product",
    productId: product._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  const categoryOffer = await Offer.findOne({
    offerType: "category",
    categoryId: product.category,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  let discount = 0;

  if (productOffer && categoryOffer) {
    discount = Math.max(
      productOffer.discountPercentage,
      categoryOffer.discountPercentage,
    );
  } else if (productOffer) {
    discount = productOffer.discountPercentage;
  } else if (categoryOffer) {
    discount = categoryOffer.discountPercentage;
  }

  const finalPrice = product.salePrice - (product.salePrice * discount) / 100;

  return { discount, finalPrice };
};

module.exports = getBestOffer;
