const errorHandler = (err, req, res, next) => {
  console.error("ERROR:", err.stack);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  const isAjax =
    req.xhr ||
    req.headers.accept?.includes("application/json") ||
    req.headers["content-type"]?.includes("application/json");

  if (isAjax) {
    return res.status(statusCode).json({ success: false, message });
  }

  res.status(statusCode).render("error", {
    statusCode,
    message,
    showAnnouncement: false,
  });
};

module.exports = errorHandler;