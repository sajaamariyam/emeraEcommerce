const Offer = require("../models/offerSchema");
const getBestOffer = async (product) => {
  const now = new Date();

  const basePrice =
    Number(product.salePrice) ||
    Number(product.price) ||
    Number(product.regularPrice) ||
    Number(product.basePrice) ||
    0;

  const categoryId = product.category?._id ?? product.category ?? null;

  const [productOffer, categoryOffer] = await Promise.all([
    Offer.findOne({
      offerType: "product",
      productId: product._id,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    }),
    categoryId
      ? Offer.findOne({
          offerType: "category",
          categoryId: categoryId,
          isActive: true,
          startDate: { $lte: now },
          endDate: { $gte: now },
        })
      : Promise.resolve(null),
  ]);

  let discount = 0;
  if (productOffer) discount = productOffer.discountPercentage;
  if (categoryOffer && categoryOffer.discountPercentage > discount) {
    discount = categoryOffer.discountPercentage;
  }

  const finalPrice =
    discount > 0
      ? Math.round(basePrice - (basePrice * discount) / 100)
      : basePrice;

  return { discount, finalPrice };
};

module.exports = getBestOffer;
