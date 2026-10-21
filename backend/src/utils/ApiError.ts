// ==========================================
// FILE: backend/src/utils/ApiError.ts
// PURPOSE: Custom error object.
// ==========================================
export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    // Keeps `instanceof ApiError` working even if TypeScript compiles to an old target.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ApiError";
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(m = "Bad request") { return new ApiError(400, m); }
  static unauthorized(m = "Unauthorized") { return new ApiError(401, m); }
  static forbidden(m = "Forbidden") { return new ApiError(403, m); }
  static notFound(m = "Not found") { return new ApiError(404, m); }
  static conflict(m = "Conflict") { return new ApiError(409, m); }
  static unprocessable(m = "Unprocessable request") { return new ApiError(422, m); }
  static tooManyRequests(m = "Too many requests") { return new ApiError(429, m); }
  static internal(m = "Internal error") { return new ApiError(500, m); }
  static serviceUnavailable(m = "Service temporarily unavailable") { return new ApiError(503, m); }
}
// ==========================================
// END OF FILE: backend/src/utils/ApiError.ts
// ==========================================