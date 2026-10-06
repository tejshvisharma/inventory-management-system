const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode ?? 500;
  const msg = err.message ?? "Something went wrong, please try again";
  const errors = err.errors || [];

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json({
    statusCode,
    message: msg,
    errors,
    success: false,
  });
};
export default errorHandler;
