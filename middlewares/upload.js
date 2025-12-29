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

module.exports = { uploadCategory };
