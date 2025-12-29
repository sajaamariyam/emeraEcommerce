const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { upload, processImages } = require("../../middlewares/imageUpload");


const pageerror = async (req, res) => {
    res.render("pageerror");
}



const loadLogin = (req, res) => {

    if(req.session.admin){

        return res.redirect("/admin/adminDashboard");

    }
    res.render("admin/adminLogin", {message: null})
}

const login = async (req, res) => {
    try {
        
        const { email, password } = req.body;

        console.log(req.body);

        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.render("admin/adminLogin", { message: "Admin not found" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);

        if (!passwordMatch) {
            return res.render("admin/adminLogin", { message: "Invalid password" });
        }

        req.session.admin = admin._id;

        return res.redirect("/admin/adminDashboard");

    } catch (error) {
        
        console.log("Login error",error);
        return res.redirect("/admin/pageerror");

    }
}

const loadDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/adminLogin");
        }

        const admin = await User.findById(req.session.admin);


        res.render("admin/adminDashboard", {admin, activePage: "dashboard"});
    } catch (error) {
        console.log("Dashboard error:", error);
        res.redirect("/admin/pageerror");
    }
};

const loadUsers = async (req, res) => {
    try {
        const search = req.query.search?.trim();
        const status = req.query.status || "all";

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;


        let filter = { isAdmin: false };

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        if(status === "active"){
            filter.isBlocked = false;
        }else if(status === "blocked"){
            filter.isBlocked = true;
        }


        const users = await User.find(filter)
            .sort({createdOn: -1})
            .skip(skip)
            .limit(limit);

        
        const totalFilteredUsers = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalFilteredUsers / limit);


        const totalUsers = await User.countDocuments({ isAdmin: false });
        const blockedUsers = await User.countDocuments({ isAdmin: false, isBlocked: true });
        const activeUsers = totalUsers - blockedUsers;

        const admin = await User.findById(req.session.admin);


        res.render("admin/users", {
            admin,
            users,
            totalUsers,
            activeUsers,
            blockedUsers,
            currentPage: page,
            totalPages,
            search: search || "",
            status,
            activePage: "users"
        });

    } catch (error) {
        console.log("Load users error:", error);
        res.redirect("/admin/pageerror");
    }
};




const blockUser = async (req, res) => {
    try {
        const userId = req.params.id;

        await User.findByIdAndUpdate(userId, { isBlocked: true });

        res.redirect("/admin/users");
    } catch (error) {
        console.log("Block user error:", error);
        res.redirect("/admin/pageerror");
    }
};

const unblockUser = async (req, res) => {
    try {
        const userId = req.params.id;

        await User.findByIdAndUpdate(userId, { isBlocked: false });

        res.redirect("/admin/users");
    } catch (error) {
        console.log("Unblock user error:", error);
        res.redirect("/admin/pageerror");
    }
};

const loadCategories = async (req, res) => {

    try {
       
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const search = req.query.search || "";
        const status = req.query.status || "all";

        let filter = {};

        if(search){
            filter.name = {$regex: search, $options: "i"};
        }

    if(status === "listed"){
        filter.isListed = true;
    }else if(status === "unlisted"){
        filter.isListed = false;
    }

    const totalCategories = await Category.countDocuments(filter);

    const categories = await Category.find(filter)
    .sort({createdAt: -1})
    .skip(skip)
    .limit(limit);

    const totalPages = Math.ceil(totalCategories / limit);

    const admin = await User.findById(req.session.admin);


    res.render("admin/categories", {
        admin,
        categories,
        currentPage: page,
        totalPages,
        search,
        status,
        activePage: "categories"
    });
        
    } catch (error) {
        
        console.log("Load categories error :", error);
        res.redirect("/admin/pageerror");
        
    }

}


const addCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !req.file) {
      return res.status(400).json({ message: "Name and image required" });
    }

    const newCategory = new Category({
      name: name.trim(),
      image: {
        url: req.file.path,
        public_id: req.file.filename
      }
    });

    await newCategory.save();

    res.status(201).json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Add category error:", error);
    res.status(500).json({ message: "Failed to add category" });
  }
};




const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isListed } = req.body;

    const updateData = {
      name,
      isListed: isListed === "true"
    };

    if (req.file) {
      updateData.image = {
        url: req.file.path,
        public_id: req.file.filename
      };
    }

    await Category.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({ message: "Category updated" });
  } catch (error) {
    console.error("Edit category error:", error);
    res.status(500).json({ message: "Failed to update category" });
  }
};



const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    await Category.findByIdAndUpdate(
      id,
      { $set: { isListed: !category.isListed } },
      { runValidators: false }
    );

    res.status(200).json({ message: "Category status updated" });
  } catch (error) {
    console.error("Toggle status error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    await Category.findByIdAndUpdate(
      id,
      { $set: { isListed: false } },
      { runValidators: false }
    );

    res.status(200).json({ message: "Category soft deleted" });
  } catch (error) {
    console.error("Soft delete category error:", error);
    res.status(500).json({ message: "Soft delete failed" });
  }
};





const loadProducts = async (req, res) => {
  try {
    
    const admin = await User.findById(req.session.admin);

    
    const {
      search = "",
      category = "",
      status = "all",
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
      filter.isBlocked = false;
    } else if (status === "unlisted") {
      filter.isBlocked = true;
    }

    
    let products = await Product.find(filter)
      .populate("category")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    
    products = products.filter(p => p.category);

    
    const totalProducts = await Product.countDocuments();
    const listedProducts = await Product.countDocuments({ isBlocked: false });
    const unlistedProducts = await Product.countDocuments({ isBlocked: true });
    const outOfStockCount = await Product.countDocuments({ quantity: 0 });

    
    const totalFiltered = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalFiltered / limit);

   
    const categories = await Category.find({ isListed: true });

    
    res.render("admin/products", {
      admin,
      products,
      categories,

      
      totalProducts,
      listedProducts,
      unlistedProducts,
      outOfStockCount,

      
      currentPage: Number(page),
      totalPages,
      search,
      category,
      status,

      activePage: "products"
    });

  } catch (error) {
    console.log("Load products error:", error);
    res.redirect("/admin/pageerror");
  }
};



const loadAddProducts = async (req, res) => {

    try {
        
        const categories = await Category.find({isListed: true}).sort({name: 1});

        res.render("admin/addProducts", {categories, activePage: "products", message: null});


    } catch (error) {
        
        console.log("load product form error: ", error);
        res.redirect("/admin/pageerror");

    }

}
const addProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      regularPrice,
      salePrice,
      quantity,
      brand,
      color
    } = req.body;

    const images = await processImages(req.files, "products");

    if (images.length < 3) {
      return res.status(400).json({ message: "Minimum 3 images required" });
    }

product.productImage = images;

    if (!req.files || req.files.length < 3) {
      return res.status(400).json({
        success: false,
        message: "Minimum 3 images required"
      });
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
      color,
      regularPrice,
      salePrice,
      quantity,
      productImage: productImages,
      isListed: true
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: "Product added successfully"
    });

  } catch (error) {
    console.log("Add product error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add product"
    });
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
      quantity
    } = req.body;

    const updateData = {
      name,
      description,
      category,
      regularPrice,
      salePrice,
      quantity
    };

    if (req.files && req.files.length > 0) {
      updateData.productImage = req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      }));
    }

    await Product.findByIdAndUpdate(productId, updateData);
    res.redirect("/admin/products");

  } catch (error) {
    console.log("Edit product error:", error);
    res.status(500).send("Failed to update product");
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
  await Product.findByIdAndUpdate(req.params.id, {
    isBlocked: true
  });
  res.redirect("/admin/products");
};


const logout = (req, res) => {
    req.session.destroy( () => {
        res.redirect("/admin/adminLogin");
    })
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    loadUsers,
    blockUser,
    unblockUser,
    loadCategories,
    addCategory,
    editCategory,
    toggleCategoryStatus,
    deleteCategory,
    loadProducts,
    loadAddProducts,
    addProduct,
    editProduct,
    blockProduct,
    unblockProduct,
    deleteProduct,
    logout
}