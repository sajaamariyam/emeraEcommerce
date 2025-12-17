const User = require("../models/userSchema");


const noCache = (req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );
  next();
};


const userAuth = (req,res, next) => {
    if(req.session.user){
        User.findById(req.session.user)
        .then(data => {
            if(data && !data.isBlocked){
                next();
            }else{
                res.redirect("/login");
            }
        })
        .catch(error => {
            console.log("Error in user Auth Middleware");
            res.status(500).send("Internal Server Error");
        })
    }else{
        res.redirect("/login")
    }
}

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/adminLogin");
        }

        const admin = await User.findById(req.session.admin);

        if (!admin || !admin.isAdmin || admin.isBlocked) {
            req.session.admin = null;
            return res.redirect("/admin/adminLogin");
        }
        next();

    } catch (error) {
        console.log("AdminAuth error:", error);
        return res.redirect("/admin/adminLogin");
    }
};





module.exports = {
    userAuth,
    adminAuth,
    noCache
}