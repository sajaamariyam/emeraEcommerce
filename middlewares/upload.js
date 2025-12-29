const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const categoryStorage = new CloudinaryStorage({
  cloudinary: cloudinary, 
  params: {
    folder: "emera/categories",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const uploadCategory = multer({ storage: categoryStorage });

const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary, 
  params: {
    folder: "emera/products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const uploadProduct = multer({ storage: productStorage });

module.exports = {
  uploadCategory,
  uploadProduct,
};
