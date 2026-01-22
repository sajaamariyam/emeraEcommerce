const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")



const pageNotFound = async(req, res) => {

    try{

        res.render("user/page-404");

    }catch(error){

        res.redirect("/pageNotFound");
    }
};


const loadSignup = async(req, res) => {

    try{

        return res.render("user/signup");

    }catch(error){
        console.log("Home page not loading", error);
        res.status(500).send("Server Error");
    }
}



const loadHomepage = async (req, res) => {

    console.log("SESSION USER AFTER LOGIN:", req.session.user);

  try {
    let userData = null;

    if (req.session.user) {
      userData = await User.findById(req.session.user);
    }

    const products = await Product.find({
    isListed: true,
    isBlocked: false,
    "variants.quantity": { $gt: 0 }
    })
    .select("name salePrice productImage")
    .limit(8);


    const categories = await Category.find({
      isListed: true
    });

    res.render("user/home", {
      user: userData,
      products,
      categories,
      showAnnouncement: true
    });

  } catch (error) {
    console.log("Home page error:", error);
    res.status(500).send("Server error");
  }
};






function generateOtp(){
    return Math.floor(100000 + Math.random() * 900000).toString();
}


async function sendVerificationEmail(email, otp){
    try{

        const transporter = nodemailer.createTransport({

            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your account",
            text: `Your otp is ${otp}`,
            html: `<b>Your OTP: ${otp}</b>`,

        })

        return info.accepted.length > 0;


    }catch(error){

        console.error("Error sending email", error);
        return false;

    }
}

const signup = async(req, res)=> {
    try{

        req.session.userOtp = null;
        req.session.userData = null;


        const { name, email, phone, password, cPassword} = req.body;

        if(password !== cPassword){
            return res.render("user/signup", {message: "Password do not match"})
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("user/signup", {message: "User with this email already exists"})
        }

        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email, otp);

        if(!emailSent){
            return res.json("email-error")
        }

        req.session.userOtp = otp;
        req.session.userData = {name, phone, email, password};

        res.render("user/verify-otp", { otpMode: "signup", userEmail: email });
        console.log("OTP sent", otp)

    }catch(error){

        console.error("signup error", error);
        res.redirect("/pageNotFound")

    }
}

const securePassword = async (password) => {
    try{

        const passwordHash = await bcrypt.hash(password, 10)

        return passwordHash;

    }catch(error){

    }
}

const verifyOtp = async(req, res) => {
    try{

        const {otp} = req.body;


        if(otp === req.session.userOtp){
            const user = req.session.userData;

            const existingUser = await User.findOne({ email: user.email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User already registered. Please login."
            });
        }

            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash
            })

            await saveUserData.save();

            req.session.userOtp = null;
            req.session.userData = null;

            req.session.user = saveUserData._id;
            return res.redirect("/");
        }else{
            res.status(400).json({success: false, message: "Invalid OTP, Please try again"})
        }

    }catch(error){

        console.error("Error Verifying OTP", error);

        res.status(500).json({success: false, message: "An error occured"})

    }
}


const loadOtp = async (req, res) => {
    try {
        if (!req.session.userData && !req.session.forgotEmail) {
            return res.redirect("/signup");
        }

        res.render("user/verify-otp");
    } catch (error) {
        console.log("Load OTP error:", error);
        res.redirect("/pageNotFound");
    }
};



const resendOtp = async (req, res) => {
    try {
        const {email} = req.session.userData;

        if(!email){
            return res.status(400).json({success: false, message: "Email not found in session"})
        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);
        if(emailSent){
            console.log("Resend OTP:", otp);
            res.status(200).json({success:true, message: "OTP Resend successfully"})
        }else{
            res.status(500).json({success:false, message: "Failed to resend OTP, Please try again"})
        }   
    } catch (error) {
        
        console.error("Error resending OTP", error);
        res.status(500).json({success:false, message: "Internal Server Error. Please try again"})
    }
}

const loadLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect("/");
        }
        res.render("user/login");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: false, email: email });

    if (!findUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (findUser.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "User is blocked by Admin"
      });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    req.session.user = findUser._id;

    req.session.save( () => {
        return res.redirect("/");
    })

  } catch (error) {
    console.error("Login error", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again later"
    });
  }
};

const logout = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log("Session destruction error", err.message);
                return res.redirect("/pageNotFound");
            }

            res.clearCookie("connect.sid");
            res.redirect("/login");
        });
    } catch (error) {
        console.log("Logout error", error);
        res.redirect("/pageNotFound");
    }
};

const loadForgotPassword = async (req, res) => {
    try {
        res.render("user/forgot-password", { message: null });
    } catch (error) {
        console.log("Forgot password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const sendForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("user/forgot-password", { message: "No user found with this email" });
        }

        if (user.googleId) {
            return res.render("user/forgot-password", {
                message: "This account is linked with Google. Please login using Google."
            });
        }
       
        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("user/forgot-password", { message: "Failed to send OTP. Try again" });
        }


       req.session.forgotEmail = email;
        req.session.forgotOtp = otp;

        console.log("Forgot Password OTP:", otp);

       res.render("user/verify-otp", {
            otpMode: "forgot",
            userEmail: email
});

    } catch (error) {
        console.log("Forgot password OTP error:", error);
        res.redirect("/pageNotFound");
    }
};


const verifyForgotOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!req.session.forgotOtp || !req.session.forgotEmail) {
            return res.json({ success: false, message: "Session expired. Please restart the process." });
        }

        if (otp !== req.session.forgotOtp) {
            return res.json({ success: false, message: "Invalid OTP. Please try again." });
        }

        return res.redirect("/reset-password");


    } catch (error) {
        console.log("verifyForgotOtp error:", error);
        res.json({ success: false, message: "Server error" });
    }
};


const resendForgotPasswordOtp = async (req, res) => {
    try {
        const email = req.session.forgotEmail;

        if (!email) {
            return res.json({ success: false, message: "Session expired. Start again." });
        }

        const otp = generateOtp();
        req.session.forgotOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);

        if (!emailSent) {
            return res.json({ success: false, message: "Failed to resend OTP." });
        }

        console.log("Resent Forgot Password OTP:", otp);

        return res.json({ success: true });

    } catch (error) {
        console.log("resendForgotPasswordOtp error:", error);
        res.json({ success: false });
    }
};

const loadResetPassword = async (req, res) => {
    try {

        if (!req.session.forgotEmail) {
            return res.redirect("/forgot-password");
        }

        res.render("user/reset-password", { message: null });

    } catch (error) {
        console.log("Reset password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;

        if (!req.session.forgotEmail) {
            return res.redirect("/forgot-password");
        }

        if (newPassword !== confirmPassword) {
            return res.render("user/reset-password", { message: "Passwords do not match" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await User.updateOne(
            { email: req.session.forgotEmail },
            { $set: { password: hashedPassword } }
        );

        req.session.forgotEmail = null;
        req.session.forgotOtp = null;

        res.redirect("/login");

    } catch (error) {
        console.log("Reset password error:", error);
        res.render("user/reset-password", { message: "Something went wrong. Try again." });
    }
};


const loadProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        const search = req.query.search || "";
        const category = req.query.category || "";
        const sort = req.query.sort || "newest";
        const maxPrice = parseInt(req.query.maxPrice) || 1000000;

        let query = {
        isBlocked: false,
        isListed: true,
        "variants.quantity": { $gt: 0 },
        salePrice: { $lte: maxPrice }
        };

        let categoryName = null;

         if (search) {
            query.name = { $regex: search, $options: "i" };
        }

        if (category) {
            const cat = await Category.findById(category);
            categoryName = cat ? cat.name : null;
        }


       let sortOption = { createdAt: -1 }; 

        switch (sort) {
            case "price-asc":
                sortOption = { salePrice: 1 };
                break;

            case "price-desc":
                sortOption = { salePrice: -1 };
                break;

            case "name-asc":
                sortOption = { name: 1 };
                break;

            case "name-desc":
                sortOption = { name: -1 };
                break;

            case "newest":
            default:
                sortOption = { createdAt: -1 };
        }


        const products = await Product.find(query)
            .populate("category")
            .sort(sortOption)
            .skip(skip)
            .limit(limit);

        const totalProducts = await Product.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({ isListed: true });

        res.render("user/products", {
            products,
            categories,
            currentPage: page,
            totalPages,
            search,
            sort,
            category,
            categoryName,
            maxPrice,
            showAnnouncement: false
        });

    } catch (error) {
        console.log(error);
        res.status(500).render("pageNotFound");
    }
};


const loadProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findOne({
      _id: productId,
      isBlocked: false,
      isListed: true
    }).populate("category");

    if (!product) {
      return res.redirect("/products");
    }

    const relatedProducts = await Product.find({
    category: product.category._id, 
    _id: { $ne: product._id },
    isBlocked: false,
    isListed: true,
    "variants.quantity": { $gt: 0 }
    })
    .limit(4);



    let userData = null;
    if (req.session.user) {
      userData = await User.findById(req.session.user);
    }

    res.render("user/productDetails", {
      product,
      relatedProducts,
      user: userData,
      showAnnouncement: false        
    });

  } catch (error) {
    console.log(error);
    res.redirect("/products");
  }
};

const loadProfile = async (req, res) => {


    try{

        const userData = await User.findById(req.session.user);

        if(!userData){
            return res.redirect("/login");
        }

        res.render("user/profile", {
            user: userData,
            showAnnouncement: false
        });


    }catch(error){

        console.log("PROFILE LOAD ERROR", error);
        res.status(500).json({ message: "Profile update failed" });


    }

};


const editProfile = async (req, res) => {

    try{

        const userId = req.session.user;


        console.log("UserID:", userId);
        console.log("Body:", req.body);
        console.log("File:", req.file);

        const {firstName, lastName, phone} = req.body;

        const updateData = {
            name: `${firstName} ${lastName}`.trim(),
            phone
        }

    
        if(req.file){
            updateData.profileImage = req.file.path;
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true });

        console.log("Updated User:", updatedUser);

        res.json({ success: true, user: updatedUser });

    } catch (error) {

        console.log("EDIT PROFILE ERROR:", error);

        res.status(500).json({ message: error.message });
    }
};

const requestEmailOtp = async (req, res) => {

    try{

        const {newEmail} = req.body;

        if(!newEmail){
            return res.status(400).json({message: "New email is required"});
        }

        const user = await User.findById(req.session.user);

        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        if(user.googleId){
            return res.status(403).json({
                message: "Email cannot be changed for Google accounts"
            });
        }

        const emailExists = await User.findOne({
            email: newEmail,
            _id: {$ne: user._id}
        });

        if(emailExists){
            return res.status(409).json({message: "This email is already in use"})
        }

        const otp = generateOtp();

        req.session.emailChangeOtp = otp;
        req.session.newEmail = newEmail;
        req.session.emailVerified = false;

        await sendVerificationEmail(newEmail, otp);

        res.json({success: true});

    }catch(error){

        console.log("Request email OTP error: ",error);
        res.status(500).json({message: "failed to send OTP"});

    }

};

const verifyEmailOtp = async (req, res) => {

    const {otp} = req.body;

    if(otp !== req.session.emailChangeOtp){
        return res.status(400).json({message: "Invalid OTP"});
    }

    req.session.emailVerified = true;
    res.json({success: true});

};

const updateProfileAfterOtp = async (req, res) => {
    



    if(!req.session.emailVerified){
        return res.status(403).json({message: "Email not verified"});
    }

    const newEmail = req.session.newEmail;

    if(!newEmail){
        return res.status(400).json({message: "No email found in session"});
    }

        console.log("Saving email:", newEmail);

    const emailExists = await User.findOne({
        email: newEmail,
        _id: {$ne: req.session.user}
    });

    if(emailExists){
        return res.status(409).json({
            message: "This email is already in use"
        });
    }

    const user = await User.findById(req.session.user);
    if(!user){
        return res.status(404).json({message: "User not found"});
    }

    user.email = newEmail;

    await user.save();

    req.session.user = user._id;

    req.session.emailVerified = false;
    req.session.emailChangeOtp = null;
    req.session.newEmail = null;

    res.json({success: true});

};

const getAddresses = async (req, res) => {

    try{

        const user = await User.findById(req.session.user).lean();

        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        res.json(user.addresses || []);

    }catch(error){
        console.log("GET ADDRESSES ERROR", error);
        res.status(500).json({message: "failed to load addresses"});
    }

};

const addAddress = async (req, res) =>{

    try{

        const user = await User.findById(req.session.user);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        const{
            fullName,
            phone,
            street,
            city,
            state,
            zipCode,
            country,
            isDefault
        } = req.body;

        if(!fullName || !phone || !street || !city || !state || !zipCode || !country){
            return res.status(400).json({message : "All fields are required"});
        }

        if(isDefault){
            user.addresses.forEach(a => {
                a.isDefault = false
            });
        }

        const newAddress = {
            fullName,
            phone,
            street,
            city,
            state,
            zipCode,
            country,
            isDefault: user.addresses.length === 0 ? true : !!isDefault        };

        user.addresses.push(newAddress);
        await user.save();

        res.json({success: true})

    }catch(error){

        console.log("ADD ADDRESS ERROR", error);
        res.status(500).json({message: "Failed to add address"});

    }

};

const setDefaultAddress = async (req, res) => {

    try{

        const user = await User.findById(req.session.user);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        user.addresses.forEach(address => {
            address.isDefault = address._id.toString() === req.params.id;
        });

        await user.save();
        res.json({success: true});

    }catch(error){

        console.error("SET DEFAULT ADDRESS ERROR:", error);
        res.status(500).json({message: "Failed to update default address"});

    }

};

const updateAddress = async (req, res) => {

    try{

        const user = await User.findById(req.session.user);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        const address = user.addresses.id(req.params.id);

        if(!address){
            return res.status(404).json({message: "Address not found"});
        }

        const {
            fullName,
            phone,
            street,
            city,
            state,
            zipCode,
            country
        } = req.body;

        address.fullName = fullName;
        address.phone = phone;
        address.street = street;
        address.city = city;
        address.state = state;
        address.zipCode = zipCode;
        address.country = country;

        await user.save();

        res.json({success: true});

    }catch(error){

        console.error("UPDATE ADDRESS ERROR:", error);
        res.status(500).json({message: "Failed to update address"});

    }

}

const deleteAddress = async (req, res) => {
    
    try{

        const user = await User.findById(req.session.user);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        if(!Array.isArray(user.addresses)){
            user.addresses = [];
        }

        user.addresses = user.addresses.filter(
            address => address._id.toString() !== req.params.id
        );

        if(user.addresses.length > 0 && !user.addresses.some(a => a.isDefault)){
            user.addresses[0].isDefault = true;
        }

        await user.save();

        res.json({success: true});

    }catch(error){

        console.error("DELETE ADDRESS ERROR:", error);
        res.status(500).json({message: "Failed to delete address"});

    }

};


const changePassword = async (req, res) => {

    try{

        const userId = req.session.user;

        const {currentPassword, newPassword} = req.body;

        const user = await User.findById(userId);
        if(!user){
            return res.status(404).json({message: "User not found"});
        }

        if(user.googleId){
            return res.status(403).json({message: "Password can't be changed for Google accounts"});
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if(!isMatch){
            return res.status(400).json({message: "Current password is incorrect"});
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({success: true});

    }catch(error){

        console.error("CHANGE PASSW0RD ERROR", error);
        res.status(500).json({message: "Something went wrong"});

    }

};


module.exports ={
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    loadOtp,
    securePassword,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadForgotPassword,
    sendForgotPassword,
    verifyForgotOtp,
    resendForgotPasswordOtp,
    loadResetPassword,
    resetPassword,
    loadProducts,
    loadProductDetails,
    loadProfile,
    editProfile,
    requestEmailOtp,
    verifyEmailOtp,
    updateProfileAfterOtp,
    getAddresses,
    addAddress,
    setDefaultAddress,
    updateAddress,
    deleteAddress,
    changePassword
}