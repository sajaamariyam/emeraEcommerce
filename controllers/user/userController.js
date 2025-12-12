const User = require("../../models/userSchema")
const env = require("dotenv").config();
const nodemailer = require("nodemailer")
const bcrypt = require("bcrypt")



const pageNotFound = async(req, res) => {

    try{

        res.render("page-404");

    }catch(error){

        res.redirect("/pageNotFound");
    }
};


const loadSignup = async(req, res) => {

    try{

        return res.render("signup");

    }catch(error){
        console.log("Home page not loading", error);
        res.status(500).send("Server Error");
    }
}



const loadHomepage = async (req, res) => {
    try{
        const user = req.session.user;
        if(user){
            const userData = await User.findOne({_id: user._id});
            res.render("home", {user: userData});
        }else{
            return res.render("home", {user: null})
        }
        console.log("SESSION USER:", req.session.user);

    }catch(error){
        console.log("Home page not found");
        res.status(500).send("server error");
    }
}

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
            return res.render("signup", {message: "Password do not match"})
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("signup", {message: "User with this email already exists"})
        }

        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email, otp);

        if(!emailSent){
            return res.json("email-error")
        }

        req.session.userOtp = otp;
        req.session.userData = {name, phone, email, password};

        res.render("verify-otp", { otpMode: "signup", userEmail: email });
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

        console.log(otp);

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
            res.json({success: true, redirectUrl: "/"})
        }else{
            res.status(400).json({success: false, message: "Invalid OTP, Please try again"})
        }

    }catch(error){

        console.error("Error Verifying OTP", error);

        res.status(500).json({success: false, message: "An error occured"})

    }
}

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
        
        if(!req.session.user){
            return res.render("login");
        }else{
            res.redirect("/");
        }

    } catch (error) {
        res.redirect("/pageNotFound");
    }
}


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const findUser = await User.findOne({ isAdmin: 0, email: email });

    if (!findUser) {
      return res.status(401).json({
        success: false,
        message: "User not found"
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
        message: "Incorrect password"
      });
    }

    req.session.user = findUser;

    return res.json({
      success: true
    });

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
            return res.redirect("/login");
        });
    } catch (error) {
        console.log("Logout error", error);
        res.redirect("/pageNotFound");
    }
};

const loadForgotPassword = async (req, res) => {
    try {
        res.render("forgot-password", { message: null });
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
            return res.render("forgot-password", { message: "No user found with this email" });
        }

       
        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email, otp);
        if (!emailSent) {
            return res.render("forgot-password", { message: "Failed to send OTP. Try again" });
        }

       req.session.forgotEmail = email;
        req.session.forgotOtp = otp;

        console.log("Forgot Password OTP:", otp);

       res.render("verify-otp", {
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

        return res.json({ success: true, redirectUrl: "/reset-password" });

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

        res.render("reset-password", { message: null });

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
            return res.render("reset-password", { message: "Passwords do not match" });
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
        res.render("reset-password", { message: "Something went wrong. Try again." });
    }
};



module.exports ={
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
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



    
}