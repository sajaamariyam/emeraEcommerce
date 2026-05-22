const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const crypto = require("crypto");
const User = require("../models/userSchema");

const generateReferralCode = () =>
  "REF" + Math.random().toString(36).substring(2, 8).toUpperCase();

const generateReferralToken = () => crypto.randomBytes(16).toString("hex");

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

          let shouldSave = false;

          if (!user.googleId) {
            user.googleId = profile.id;
            user.profileImage =
              user.profileImage || profile.photos?.[0]?.value || "";
            shouldSave = true;
          }

          if (!user.referralCode) {
            user.referralCode = generateReferralCode();
            shouldSave = true;
          }

          if (!user.referralToken) {
            user.referralToken = generateReferralToken();
            shouldSave = true;
          }

          if (user.redeemed === undefined) {
            user.redeemed = false;
            shouldSave = true;
          }

          if (shouldSave) {
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
          referralCode: generateReferralCode(),
          referralToken: generateReferralToken(),
          redeemed: false,
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
