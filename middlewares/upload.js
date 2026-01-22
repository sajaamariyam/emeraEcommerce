const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");


const categoryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "emera/categories",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const uploadCategory = multer({ storage: categoryStorage });


const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "emera/products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const uploadProduct = multer({ storage: productStorage });

const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "emera/profiles",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const uploadProfile = multer({ storage: profileStorage });


module.exports = {
  uploadCategory,
  uploadProduct,
  uploadProfile
};
