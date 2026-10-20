// ==========================================
// FILE: backend/src/utils/ApiError.ts
// PURPOSE: Custom error object.
// ==========================================
export class ApiError extends Error {
  public readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(m = "Bad request") { return new ApiError(400, m); }
  static unauthorized(m = "Unauthorized") { return new ApiError(401, m); }
  static forbidden(m = "Forbidden") { return new ApiError(403, m); }
  static notFound(m = "Not found") { return new ApiError(404, m); }
  static conflict(m = "Conflict") { return new ApiError(409, m); }
  static internal(m = "Internal error") { return new ApiError(500, m); }
}
// ==========================================
// END OF FILE: backend/src/utils/ApiError.ts
// LOCATION: backend/src/utils/ApiError.ts
// LAST UPDATED: October 19, 2026
// ==========================================