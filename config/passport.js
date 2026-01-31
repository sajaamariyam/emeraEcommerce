const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/callback",
    },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        if (user) {
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
          email: email,
          googleId: profile.id,
          profileImage: profile.photos?.[0]?.value || "",
          isAdmin: false,
          isBlocked: false,
        });

        await newUser.save();
        return done(null, newUser);
      } catch (error) {
        console.error("Google Auth Error", error);
        return done(error, null);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((err) => {
      done(err, null);
    });
});

module.exports = passport;
