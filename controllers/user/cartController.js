const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");

const loadCart = async (req, res) => {

    try{

        console.log("USER: ", req.user);

        const userId = req.user._id;

        let cart = await Cart.findOne({userId}).populate("items.productId");

        if(!cart || cart.items.length === 0){
            return res.render("user/cart", {
                user: req.user,
                cartItems: [],
                subtotal: 0,
                tax:0,
                total: 0
            });
        }

        let subtotal = 0;

        let cartItems = [];

        for(let item of cart.items){
            if(!item.productId || item.productId.isBlocked){
                continue
            }

            let itemTotal = item.productId.price * item.quantity;
            subtotal += itemTotal;

            cartItems.push({
                product: item.productId,
                quantity: item.quantity,
                price: item.price,
                totalPrice: itemTotal
            });
        }


        const tax = Math.round(subtotal * 0.18);
        const total = subtotal + tax;

        res.render("user/cart", {
            user: req.user,
            cartItems,
            subtotal,
            tax,
            total,
            showAnnouncement: false
        });

    }catch(error){
        console.error("LOAD CART ERROR:", error);
        res.redirect("/pageNotFound");
    }

};

const addToCart = async (req, res) => {

    try{

        const userId = req.session.user;
        const {productId} = req.body;

        if(!userId){
            return res.status(401).json({message: "Login required"});
        }

        const product = await Product.findById(productId);

        if(!product || product.isBlocked || !product.isListed){
            return res.status(400).json({message: "Product unavailable"});
        }

        if(product.stock <= 0){
            return res.status(400).json({message: "Out of stock"});
        }

        let cart = await Cart.findOne({userId});

        if(!cart){
            cart = new Cart({
                userId,
                items: [{productId, quantity: 1, price: product.salePrice}]
            });
        }else{
            
        const existingItem = cart.items.find(
            item => item.productId.toString() === productId
        );            

        const maxAllowed = Math.min(product.quantity, 5);

        if (existingItem) {
            if(existingItem.quantity >= maxAllowed){
                return res.status(400).json({
                    message: `only ${maxAllowed} item(s) available`
                });
            }

            existingItem.quantity += 1;
        } else {
            cart.items.push({ productId, quantity: 1, price: product.salePrice });
        }
    }

    await cart.save();


    const cartCount = cart.items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );

    res.json({
      success: true,
      cartCount
    });

    }catch(error){
        console.log("ADD TO CART ERROR", error);
        res.status(500).json({success: false});
    }

};


const incrementQty = async (req, res) => {

    try{

        const userId = req.user._id;
        const {productId} = req.params;

        const cart = await Cart.findOne({userId}).populate("items.productId");

        if(!cart){
            return res.json({success: false});
        }

        for(let item of cart.items){

            if(item.productId._id.toString() === productId){

                if(item.productId.isBlocked || !item.productId.isListed){
                    return res.status(400).json({message: "Product unavailable"});
                }

                if(item.quantity === 5){
                    return res.status(400).json({message: "Max limit reached"});
                }

                if(item.quantity + 1 > item.productId.stock){
                    return res.status(400).json({message: "Out of stock"});
                }

                item.quantity += 1;
                break;
            }
        }

        await cart.save();
        res.json({success: true});

    }catch(error){
        res.status(500).json({success: false});
    }

};


const decrementQty = async (req, res) => {
    
    try{

        const userId = req.user._id;
        const {productId} = req.params;

        const cart = await Cart.findOne({userId});
        if(!cart){
            return res.json({success: true});
        }

        for(let i=0; i<cart.items.length; i++){
            if(cart.items[i].productId.toString() === productId){

                if(cart.items[i].quantity === 1){
                    cart.items.splice(i, 1);
                }else{
                    cart.items[i].quantity -= 1;
                }

                break;
            }
        }
        
        await cart.save();
        res.json({success: true});

    }catch(error){
        res.status(500).json({success: false});
    }

};


const removeItem = async (req, res) => {

    try{

        const userId = req.user._id;
        const {productId} = req.params;

        await Cart.updateOne(
            {userId},
            {$pull: {items: {productId}}}
        );

        res.json({success: true});

    }catch(error){
        res.status(500).json({success: false})
    }

};



module.exports = {
    loadCart,
    addToCart,
    incrementQty,
    decrementQty,
    removeItem

};