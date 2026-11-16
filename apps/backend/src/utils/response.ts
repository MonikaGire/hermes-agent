import type { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  messageOrOptions: string | { message?: string; statusCode?: number; meta?: SuccessResponse<T>['meta'] } = {},
): void {
  const options = typeof messageOrOptions === 'string' ? { message: messageOrOptions } : messageOrOptions;
  const { message, statusCode = 200, meta } = options;
  res.status(statusCode).json({
    success: true,
    ...(message && { message }),
    data,
    ...(meta && { meta }),
  });
}

export function sendCreated<T>(res: Response, data: T, message?: string): void {
  sendSuccess(res, data, { statusCode: 201, message });
}

export function paginate(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
