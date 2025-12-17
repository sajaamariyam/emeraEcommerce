const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");



const pageerror = async (req, res) => {
    res.render("pageerror");
}



const loadLogin = (req, res) => {

    if(req.session.admin){

        return res.redirect("/admin/adminDashboard");

    }
    res.render("adminLogin", {message: null})
}

const login = async (req, res) => {
    try {
        
        const { email, password } = req.body;

        console.log(req.body);

        const admin = await User.findOne({ email, isAdmin: true });

        if (!admin) {
            return res.render("adminLogin", { message: "Admin not found" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);

        if (!passwordMatch) {
            return res.render("adminLogin", { message: "Invalid password" });
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

        res.render("adminDashboard", {activePage: "dashboard"});
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

        res.render("users", {
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
       
        const categories = await Category.find().sort({name: 1});

        res.render("categories", {categories, activePage: "categories"});
        
    } catch (error) {
        
        console.log("Load categories error :", error);
        res.redirect("/admin/pageerror");
        
    }

}

const addCategory = async (req, res) => {
    try {
        
        const {name, description, image} = req.body;

        const existingCategory = await Category.findOne({name: { $regex: new RegExp(`^${name}$`, "i")}});

        if(existingCategory){

            return res.status(409).json({ success: false, message: "Category name already exists."});

        }

        const newCategory = new Category({
            name: name.toUpperCase(),
            description,
            image,

        });

        await newCategory.save();

        res.status(201).json({success: true, message: "Category added successfully"});

    } catch (error) {
        

        console.log("Add category error", error);
        res.status(500).json({success: false, message: "Internal server error"});

    }
}


const editCategory = async (req, res) => {
    try {
        

        const categoryId = req.params.id;
        const {name, description, image} = req.body;

        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') }, 
            _id: { $ne: categoryId } 
        });

        if(existingCategory){
            return res.status(409).json({success: false, message: "Category name already exists."})
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            categoryId,
            { name: name.toUpperCase(), description, image },
            { new: true }
        );
        
        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: "Category not found." });
        }

        res.status(200).json({success: true, message: "Category updated successfully"});


    } catch (error) {
        
        console.log("Edit category error:", error);
        res.status(500).json({ success: false, message: "Internal server error during category update." });
    }
}

const toggleCategoryStatus = async (req, res) => {
    try {
        const categoryId = req.params.id;
        
        const category = await Category.findById(categoryId);
        
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found." });
        }
        
         category.isListed = !category.isListed;
        await category.save();
        
        res.status(200).json({ 
            success: true, 
            newStatus: category.isListed ? 'listed' : 'unlisted',
            message: `Category ${category.isListed ? 'listed' : 'unlisted'} successfully.`
        });

    } catch (error) {
        console.log("Toggle status error:", error);
        res.status(500).json({ success: false, message: "Internal server error during status toggle." });
    }
};



const loadProducts = async (req, res) => {

    try {
        
        const products = await Product.find().populate('category').sort({createdAt: -1});

        res.render("products", {products, activePage: "products"});


    } catch (error) {
        
        console.log("Load Products error: ", error);
        res.redirect("/admin/pageerror");

    }

}

const loadAddProducts = async (req, res) => {

    try {
        
        const categories = await Category.find({isListed: true}).sort({name: 1});

        res.render("addProducts", {categories, activePage: "products", message: null});


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
            price,
            stock,
            brand
        } = req.body;

        const images = req.files.map(file => file.path);

        if(!name || !category || !price || images.length === 0){
            return res.status(400).json({success: false, message: "Missing required fields: Name, Category, Price, and Image."});

        }

        const newProduct = new Product( {
            name,
            description,
            category,
            price: parseFloat(price),
            stock: parseInt(stock),
            brand,
            images
        });

        await newProduct.save();

        res.status(201).json({success: true, message: "Product added successfully"});



    } catch (error) {
        
        console.log("Add product error", error);
        res.status(500).json({success: false, message: "Failed to add product."});

    }

}

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
    loadProducts,
    loadAddProducts,
    addProduct,
    logout
}