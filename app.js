require("dotenv").config();
const express = require("express");
const path = require("path");
const { MongoStore } = require("connect-mongo");
const session = require("express-session");
const flash = require("connect-flash");
const cartCount = require("./middlewares/cartCount");
const wishlistCount = require("./middlewares/wishlistCount");
const userHeader = require("./middlewares/userHeader");
const nocache = require("nocache");
const passport = require("./config/passport");
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const paymentRouter = require("./routes/paymentRouter");
const User = require("./models/userSchema");

db();
const app = express();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 72 * 60 * 60,
      autoRemove: "native",
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 72 * 60 * 60 * 1000,
    },
  }),
);

app.use(async (req, res, next) => {
  try {
    if (req.session.user) {
      const user = await User.findById(req.session.user);

      if (!user || user.isBlocked) {
        req.session.destroy(() => {
          res.clearCookie("connect.sid");
        });
        res.locals.user = null;

        const isAjax =
          req.xhr ||
          req.headers.accept?.includes("application/json") ||
          req.headers["content-type"]?.includes("application/json");

        if (isAjax) {
          return res.status(403).json({
            success: false,
            message: "Your account has been blocked. Please contact support.",
            blocked: true,
          });
        }
        return res.redirect("/login?blocked=true");
      }

      res.locals.user = user;
    } else {
      res.locals.user = null;
    }
  } catch (error) {
    res.locals.user = null;
  }
  next();
});

app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});

app.use(cartCount);
app.use(wishlistCount);
app.use(userHeader);

app.use(nocache());

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json());

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/admin", adminRouter);
app.use("/", userRouter);
app.use("/", paymentRouter);

app.listen(process.env.PORT, () => {
  console.log("server running http://localhost:3000/");
  console.log("http://localhost:3000/admin/adminLogin");
});

module.exports = app;
