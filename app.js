const express = require("express");
const path = require("path");
const dotenv = require('dotenv').config()
const session = require("express-session");
const nocache = require("nocache");
const passport = require("./config/passport");
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
db()
const app = express();

app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:false,
    cookie:{
        secure: false,
        httpOnly:true,
        maxAge: 72*60*60*1000
    }

}))
app.use(nocache())

app.use(express.urlencoded({extended: true}));


app.use(passport.initialize());
app.use(passport.session());


app.set("view engine", "ejs")
app.set("views", [path.join(__dirname, "views/user"), 
    path.join(__dirname, "views/admin")])
app.use(express.static(path.join(__dirname, "public")))

app.use(express.json());

app.use("/admin", adminRouter);
app.use("/", userRouter);


app.listen(process.env.PORT, () => {
    console.log("server running http://localhost:3000/")
})


module.exports = app