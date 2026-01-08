const User = require("../models/userSchema");


const userAuth = async (req,res, next) => {
  
  try{

    if(!req.session.user){
      return res.redirect("/login");
    }

    const user = await User.findById(req.session.user);

    if(!user || user.isBlocked){
      req.session.destroy( () => {
        res.clearCookie("connect.sid");
        return res.redirect("/login");
      });
      return;
    }

    req.user = user;
    next();

  }catch(error){

    console.log("Error in userAuth middleware: ", error);
    res.redirect("/login");

  }

}



const adminAuth = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect("/admin/adminLogin");
    }

    const admin = await User.findById(req.session.admin);

    if (!admin || !admin.isAdmin) {
      req.session.destroy();
      return res.redirect("/admin/adminLogin");
    }

    res.locals.admin = admin;

    next();
  } catch (error) {
    console.log("Admin auth error:", error);
    res.redirect("/admin/adminLogin");
  }
};




module.exports = {
    userAuth,
    adminAuth,
}