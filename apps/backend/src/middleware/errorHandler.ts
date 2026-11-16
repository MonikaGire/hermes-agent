import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.message : err,
    stack: err instanceof Error ? err.stack : undefined,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation error',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Prisma unique constraint
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  ) {
    res.status(409).json({ success: false, message: 'Resource already exists' });
    return;
  }

  res.status(500).json({
    success: false,
    message: process.env['NODE_ENV'] === 'production'
      ? 'Internal server error'
      : (err instanceof Error ? err.message : 'Unknown error'),
  });
}
