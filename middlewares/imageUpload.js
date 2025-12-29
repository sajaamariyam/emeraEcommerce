const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// temp storage
const upload = multer({ storage: multer.memoryStorage() });

const processImages = async (files, folder) => {
  const processedImages = [];

  for (const file of files) {
    const filename = `${Date.now()}-${file.originalname.replace(/\s+/g, "")}`;
    const outputPath = path.join("uploads", folder, filename);

    await sharp(file.buffer)
      .resize(800, 1000)
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    processedImages.push({
      url: `/uploads/${folder}/${filename}`,
      public_id: filename
    });
  }

  return processedImages;
};

module.exports = { upload, processImages };
