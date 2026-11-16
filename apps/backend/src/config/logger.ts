import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = process.env['LOG_DIR'] ?? './logs';
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const formats = winston.format;

const consoleFormat = formats.combine(
  formats.colorize(),
  formats.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  formats.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }),
);

const fileFormat = formats.combine(
  formats.timestamp(),
  formats.errors({ stack: true }),
  formats.json(),
);

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env['NODE_ENV'] === 'test',
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});
