const Cart = require("../models/cartSchema");
const User = require("../models/userSchema");

const userHeader = async(req, res, next)=> {
    try {
        let user = null;
        let cartCount = 0;

        if (req.session.user) {
        user = await User.findById(req.session.user);

        const cart = await Cart.findOne({userId: req.session.user});
        if (cart) {
            cartCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
        }
        }

        res.locals.user = user;
        res.locals.cartCount = cartCount;

        next();
    } catch (err) {
        console.log("Header middleware error", err);
        next();
    }
};

module.exports = userHeader;