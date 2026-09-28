export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422 | 500,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (msg: string, details?: unknown): ApiError => new ApiError(400, msg, details);
export const notFound = (msg: string): ApiError => new ApiError(404, msg);
export const conflict = (msg: string): ApiError => new ApiError(409, msg);
export const unprocessable = (msg: string, details?: unknown): ApiError => new ApiError(422, msg, details);
