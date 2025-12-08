const User = require("../../models/userSchema")



const loadSignup = async(req, res) => {

    try{

        return res.render("signup");

    }catch(error){
        console.log("Home page not loading", error);
        res.status(500).send("Server Error");
    }
}


const pageNotFound = async(req, res) => {

    try{

        res.render("page-404");

    }catch(error){

        res.redirect("/pageNotFound");
    }
};


const loadHomepage = async(req, res) => {
    try{

        return res.render("home");

    }catch(error){
        console.log("Home page not found");
        res.status(500).send("server error");
    }
}

const signup = async(req, res) => {

    const {name, email, phone, password} = req.body;

    try{

        const newUser = new User({name, email, phone, password});
        console.log(newUser)

        await newUser.save();
        return res.redirect("/login");

    }catch(error){

        console.error("Error for save user", error);
        res.status(500).send("Internal Server error")

    }
}

module.exports ={
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
}