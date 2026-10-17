export class AppError extends Error {
  constructor(code, message, status = 500, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorResponse(error) {
  const safeError =
    error instanceof AppError
      ? error
      : new AppError(
          "INTERNAL_ERROR",
          "The request could not be completed.",
          500,
        );

  return {
    status: safeError.status,
    body: {
      error: {
        code: safeError.code,
        message: safeError.message,
        ...(safeError.details === undefined
          ? {}
          : { details: safeError.details }),
      },
    },
  };
}
