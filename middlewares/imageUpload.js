const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("../config/cloudinary");

const upload = multer({ storage: multer.memoryStorage() });

const processImages = async (files) => {
  const images = [];

  for (const file of files) {
    const buffer = await sharp(file.buffer)
      .resize(800, 1000, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: "emera/products" },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        }
      ).end(buffer);
    });

    images.push({
      url: result.secure_url,
      public_id: result.public_id,
    });
  }

  return images;
};

module.exports = { upload, processImages };
