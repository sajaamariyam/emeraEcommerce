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
      sortBy = "name-asc",
      page = 1
    } = req.query;

    const limit = 5;
    const skip = (page - 1) * limit;


    let filter = {};

    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    if (category) {
      filter.category = category;
    }

    if (status === "listed") {
      filter.isListed = true;
      filter.isBlocked = false;
    }

    if (status === "unlisted") {
      filter.isBlocked = true;
    }

    let sortQuery = {};
    switch(sortBy){
        case "name-desc":
            sortQuery.name = -1;
            break;
        case "stock-asc":
            sortQuery.createdAt = 1;
            break;
        case "stock-desc":
            sortQuery.createdAt = -1;
            break;
        default:
            sortQuery.name = 1;
    }


    let products = await Product.find(filter)
      .populate("category")
      .sort(sortQuery)
      .lean();

    if(stockLevel !== "all"){
        products = products.filter(product => {
            const totalStock = product.variants?.reduce(
                (sum, v) => sum + (v.quantity || 0),
                0
            ) || 0;

            if(stockLevel === "in-stock"){
                return totalStock >= 5;
            }

            if(stockLevel === "low"){
                return totalStock > 0 && totalStock < 5;
            }

            if(stockLevel === "out"){
                return totalStock === 0;
            }

            return true;
        });
    }

    const totalFiltered = products.length;
    const paginatedProducts = products.slice(skip, skip + limit);
    const totalPages = Math.ceil(totalFiltered / limit);


    const totalProducts = await Product.countDocuments();

    const listedProducts = await Product.countDocuments({
      isListed: true,
      isBlocked: false,
    });

    const unlistedProducts = await Product.countDocuments({
      isBlocked: true
    });


    const outOfStockCount = await Product.countDocuments({
      isListed: true,
      isBlocked: false,
      variants: {
        $not: {
          $elemMatch: {quantity: {$gt: 0}}
        }
      }
    });

    const allProducts = await Product.find({isListed: true, isBlocked: false}).lean();
    const lowStockCount = allProducts.filter(product => {
      const totalStock = product.variants?.reduce(
          (sum, v) => sum + (v.quantity || 0),
          0
      ) || 0;
      return totalStock > 0 && totalStock < 5;
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
      activePage: "products"
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
      variants
    } = req.body;

    if (!req.files || req.files.length < 3) {
      return res.status(400).json({ success: false, message: "Minimum 3 images required" });
    }

    const parsedVariants = JSON.parse(variants || "[]");

    if (!parsedVariants.length) {
      return res.status(400).json({success: false, message: "At least one variant required" });
    }

    const productImages = req.files.map(file => ({
      url: file.path,
      public_id: file.filename
    }));


    const product = new Product({
      name,
      description,
      category,
      brand,
      regularPrice,
      salePrice,
      variants: parsedVariants,
      productImage: productImages,
      isListed: true,
      isBlocked: false
    });

    await product.save();

    res.status(201).json({ success: true });

  } catch (error) {
    console.error("Add product error:", error);
    res.status(500).json({ success: false });
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
      variants
    } = req.body;


    const parsedVariants = JSON.parse(variants || "[]");

    if (!parsedVariants.length) {
      return res.status(400).json({ success: false, message: "At least one variant is required" });
    }

    const updateData = {
      name,
      description,
      category,
      brand,
      regularPrice,
      salePrice,
      variants: parsedVariants,
    };


    if (req.files && req.files.length > 0) {
      updateData.productImage = req.files.map(file => ({
        url: file.path,
        public_id: file.filename  
      }));
    }

    await Product.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true });

  } catch (error) {
    console.error("Edit product error:", error);
    res.status(500).json({ success: false });
  }
};

const updateStock = async (req, res) => {
    try{

        const {productId, action, color, quantity} = req.body;

        const product = await Product.findById(productId);

        if(!product){
            return res.json({success: false});
        }

        if(action === "set"){
            const variant = product.variants.find( v => v.color === color);
            
            if(!variant){
                return res.json({success: false});
            }
            variant.quantity = Math.max(0, Number(quantity));
        }

        if(action === "add" || action === "remove"){
            product.variants.forEach(v => {
                v.quantity = 
                action === "add"
                ? v.quantity + Number(quantity)
                :Math.max(0, v.quantity - Number(quantity));
            });
        }

        await product.save();
        res.json({success: true});

    }catch(error){
        console.error("UPDATE STOCK ERROR:", error);
        res.json({success: false});
    }
}

const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
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
  await Product.findByIdAndUpdate(req.params.id, {isBlocked: true});
  res.redirect("/admin/products");
};

module.exports = {
    loadProducts,
    addProduct,
    editProduct,
    updateStock,
    getProduct, 
    blockProduct,
    unblockProduct,
    deleteProduct
};