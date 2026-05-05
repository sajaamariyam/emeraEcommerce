const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const User = require("../../models/userSchema");

const loadProducts = async (req, res) => {
  try {
    const admin = await User.findById(req.session.admin);

    const {
      search = "",
      category = "",
      status = "all",
      stockLevel = "all",
      sortBy = "newest",
      page = 1,
    } = req.query;

    const limit = 5;
    const skip = (page - 1) * limit;

    let filter = {};
    if (search) filter.name = { $regex: search, $options: "i" };
    if (category) filter.category = category;

    if (status === "listed") {
      filter.isListed = true;
      filter.isBlocked = false;
    }
    if (status === "unlisted") {
      filter.isBlocked = true;
    }

    let sortQuery = {};

    let sortInJS = false;

    switch (sortBy) {
      case "name-asc":
        sortQuery.name = 1;
        break;
      case "name-desc":
        sortQuery.name = -1;
        break;
      case "stock-asc":
      case "stock-desc":
        sortInJS = true;
        sortQuery.createdAt = -1;
        break;
      default:
        sortQuery.createdAt = -1;
    }

    let products = await Product.find(filter)
      .populate("category")
      .sort(sortQuery)
      .lean();

    products = products.map((p) => ({
      ...p,
      totalStock:
        p.variants?.reduce((sum, v) => sum + (v.quantity || 0), 0) || 0,
    }));

    if (stockLevel !== "all") {
      products = products.filter((p) => {
        if (stockLevel === "in-stock") return p.totalStock >= 5;
        if (stockLevel === "low") return p.totalStock > 0 && p.totalStock < 5;
        if (stockLevel === "out") return p.totalStock === 0;
        return true;
      });
    }

    if (sortInJS) {
      products.sort((a, b) =>
        sortBy === "stock-asc"
          ? a.totalStock - b.totalStock
          : b.totalStock - a.totalStock,
      );
    }

    const totalFiltered = products.length;
    const totalPages = Math.ceil(totalFiltered / limit) || 1;
    const paginatedProducts = products.slice(skip, skip + limit);

    const totalProducts = await Product.countDocuments();
    const listedProducts = await Product.countDocuments({
      isListed: true,
      isBlocked: false,
    });
    const unlistedProducts = await Product.countDocuments({ isBlocked: true });

    const outOfStockCount = await Product.countDocuments({
      isListed: true,
      isBlocked: false,
      variants: { $not: { $elemMatch: { quantity: { $gt: 0 } } } },
    });

    const allProducts = await Product.find({
      isListed: true,
      isBlocked: false,
    }).lean();
    const lowStockCount = allProducts.filter((p) => {
      const total =
        p.variants?.reduce((sum, v) => sum + (v.quantity || 0), 0) || 0;
      return total > 0 && total < 5;
    }).length;

    const categories = await Category.find({ isListed: true });

    res.render("admin/products", {
      admin,
      products: paginatedProducts,
      categories,
      totalProducts,
      listedProducts,
      unlistedProducts,
      outOfStockCount,
      lowStockCount,
      currentPage: Number(page),
      totalPages,
      search,
      category,
      status,
      stockLevel,
      sortBy,
      activePage: "products",
    });
  } catch (error) {
    console.log("Load products error:", error);
    res.redirect("/admin/pageerror");
  }
};

const addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      regularPrice,
      salePrice,
      brand,
      variants,
    } = req.body;

    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Product name must be at least 3 characters",
      });
    }
    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Product name must be under 100 characters",
      });
    }
    if (!/[a-zA-Z]/.test(trimmedName)) {
      return res.status(400).json({
        success: false,
        message: "Product name must contain at least one letter",
      });
    }
    if (!category)
      return res
        .status(400)
        .json({ success: false, message: "Category is required" });
    if (!brand?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Brand is required" });
    if (!description?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Description is required" });

    const regPrice = Number(regularPrice);
    const salePrc = Number(salePrice);

    if (!regPrice || regPrice <= 0)
      return res.status(400).json({
        success: false,
        message: "Regular price must be greater than 0",
      });
    if (!salePrc || salePrc <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Sale price must be greater than 0" });
    if (salePrc > regPrice)
      return res.status(400).json({
        success: false,
        message: "Sale price cannot be greater than regular price",
      });

    if (!req.files || req.files.length < 3)
      return res
        .status(400)
        .json({ success: false, message: "Minimum 3 images required" });

    const parsedVariants = JSON.parse(variants || "[]");
    if (!parsedVariants.length)
      return res
        .status(400)
        .json({ success: false, message: "At least one variant required" });

    for (const v of parsedVariants) {
      if (!v.color?.trim())
        return res.status(400).json({
          success: false,
          message: "Each variant must have a color name",
        });
      if (v.quantity < 0)
        return res.status(400).json({
          success: false,
          message: "Variant quantity cannot be negative",
        });
    }

    let specifications = {};
    if (req.body.specifications) {
      try {
        specifications = JSON.parse(req.body.specifications);
      } catch (e) {
        console.log("Specifications parse error:", e);
      }
    }

    const productImages = req.files.map((file) => ({
      url: file.path,
      public_id: file.filename,
    }));

    const product = new Product({
      name: name.trim(),
      description: description.trim(),
      category,
      brand: brand.trim(),
      regularPrice: regPrice,
      salePrice: salePrc,
      variants: parsedVariants,
      productImage: productImages,
      specifications,
      isListed: true,
      isBlocked: false,
    });

    await product.save();
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Add product error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const editProduct = async (req, res) => {
  try {
    const {
      productId,
      name,
      description,
      category,
      regularPrice,
      salePrice,
      brand,
      variants,
      removedImages,
    } = req.body;

    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName.length < 3) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Product name must be at least 3 characters",
        });
    }
    if (trimmedName.length > 100) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Product name must be under 100 characters",
        });
    }
    if (!/[a-zA-Z]/.test(trimmedName)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Product name must contain at least one letter",
        });
    }
    if (!category)
      return res
        .status(400)
        .json({ success: false, message: "Category is required" });
    if (!brand?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Brand is required" });
    if (!description?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Description is required" });

    const regPrice = Number(regularPrice);
    const salePrc = Number(salePrice);

    if (!regPrice || regPrice <= 0)
      return res.status(400).json({
        success: false,
        message: "Regular price must be greater than 0",
      });
    if (!salePrc || salePrc <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Sale price must be greater than 0" });
    if (salePrc > regPrice)
      return res.status(400).json({
        success: false,
        message: "Sale price cannot be greater than regular price",
      });

    const parsedVariants = JSON.parse(variants || "[]");
    if (!parsedVariants.length)
      return res
        .status(400)
        .json({ success: false, message: "At least one variant is required" });

    for (const v of parsedVariants) {
      if (!v.color?.trim())
        return res.status(400).json({
          success: false,
          message: "Each variant must have a color name",
        });
      if (v.quantity < 0)
        return res.status(400).json({
          success: false,
          message: "Variant quantity cannot be negative",
        });
    }

    const product = await Product.findById(productId);
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });

    if (removedImages) {
      const removeIndexes = JSON.parse(removedImages);
      product.productImage = product.productImage.filter(
        (_, index) => !removeIndexes.includes(index),
      );
    }

    const newImageCount = req.files?.length || 0;
    const remainingImageCount = product.productImage.length;
    if (remainingImageCount + newImageCount < 3) {
      return res.status(400).json({
        success: false,
        message: "Product must have at least 3 images",
      });
    }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
      }));
      product.productImage.push(...newImages);
    }

    product.name = name.trim();
    product.description = description.trim();
    product.category = category;
    product.brand = brand.trim();
    product.regularPrice = regPrice;
    product.salePrice = salePrc;
    product.variants = parsedVariants;

    if (req.body.specifications) {
      try {
        product.specifications = JSON.parse(req.body.specifications);
      } catch (e) {
        console.log("Specifications parse error:", e);
      }
    }

    await product.save();
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Edit product error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateStock = async (req, res) => {
  try {
    const { productId, action, color, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product)
      return res.json({ success: false, message: "Product not found" });

    if (action === "set") {
      const variant = product.variants.find((v) => v.color === color);
      if (!variant)
        return res.json({ success: false, message: "Variant not found" });
      variant.quantity = Math.max(0, Number(quantity));
    }

    if (action === "add" || action === "remove") {
      product.variants.forEach((v) => {
        v.quantity =
          action === "add"
            ? v.quantity + Number(quantity)
            : Math.max(0, v.quantity - Number(quantity));
      });
    }

    await product.save();
    res.json({ success: true });
  } catch (error) {
    console.error("UPDATE STOCK ERROR:", error);
    res.json({ success: false });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product)
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    res.json(product);
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ success: false });
  }
};

const blockProduct = async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { isBlocked: true });
  res.redirect("/admin/products");
};

const unblockProduct = async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { isBlocked: false });
  res.redirect("/admin/products");
};

const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(req.params.id, { isBlocked: true });
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("DELETE PRODUCT ERROR:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete product" });
  }
};

module.exports = {
  loadProducts,
  addProduct,
  editProduct,
  updateStock,
  getProduct,
  blockProduct,
  unblockProduct,
  deleteProduct,
};
