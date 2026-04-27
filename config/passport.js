const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3000/auth/google/callback",
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(null, false, { message: "no_email" });
        }

        let user = await User.findOne({ email });

        if (user) {
          if (user.isBlocked) {
            return done(null, false, { message: "blocked" });
          }

          if (!user.googleId) {
            user.googleId = profile.id;
            user.profileImage =
              user.profileImage || profile.photos?.[0]?.value || "";
            await user.save();
          }

          return done(null, user);
        }

        const newUser = new User({
          name: profile.displayName,
          email,
          googleId: profile.id,
          profileImage: profile.photos?.[0]?.value || "",
          isAdmin: false,
          isBlocked: false,
        });

        await newUser.save();
        return done(null, newUser);
      } catch (error) {
        console.error("Google Auth Error:", error);
        return done(error, null);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);

    if (!user || user.isBlocked) {
      return done(null, false);
    }

    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
