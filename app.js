require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");
const nocache = require("nocache");
const passport = require("./config/passport");
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const paymentRouter = require("./routes/paymentRouter");
const cartCount = require("./middlewares/cartCount");
const wishlistCount = require("./middlewares/wishlistCount");
const userHeader = require("./middlewares/userHeader");
const errorHandler = require("./middlewares/errorMiddleware");
const User = require("./models/userSchema"); 

const app = express();

const startServer = async () => {
await db();

//PARSERS
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json());

//STATIC FILES
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

//VIEW ENGINE
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(nocache());

//ADMIN SESSION
const adminSession = session({
  name: "admin.sid",
  secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "adminSessions",
    ttl: 8 * 60 * 60,
    autoRemove: "native",
  }),
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
  },
});

//USER SESSION
const userSession = session({
  name: "user.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: "userSessions",
    ttl: 72 * 60 * 60,
    autoRemove: "native",
  }),
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 72 * 60 * 60 * 1000,
  },
});

app.use("/admin", adminSession);
app.use("/", userSession);

//PASSPORT
app.use(passport.initialize());
app.use(passport.session());

//FLASH
app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});

//USER LOCALS MIDDLEWARE
app.use(async (req, res, next) => {
  try {
    const userId = req.session.user || req.user?._id;

    if (userId) {
      const user = await User.findById(userId);

      if (!user || user.isBlocked) {
        req.session.user = null;
        await new Promise((r) => req.session.save(r));
        res.clearCookie("user.sid");
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
    console.error("User locals middleware error:", error);
    res.locals.user = null;
  }
  next();
});

//CART & WISHLIST COUNT
app.use(cartCount);
app.use(wishlistCount);
app.use(userHeader);

//ROUTES
app.use("/admin", adminRouter);
app.use("/", userRouter);
app.use("/", paymentRouter);

//ERROR HANDLER
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
module.exports = app;