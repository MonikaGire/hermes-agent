import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { authRouter } from './routes/auth.routes.js';
import { prospectRouter } from './routes/prospect.routes.js';
import { companyRouter } from './routes/company.routes.js';
import { contactRouter } from './routes/contact.routes.js';
import { researchRouter } from './routes/research.routes.js';
import { emailRouter } from './routes/email.routes.js';
import { approvalRouter } from './routes/approval.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { telegramRouter } from './routes/telegram.routes.js';
import { whatsappRouter } from './routes/whatsapp.routes.js';
import { discoveryRouter } from './routes/discovery.routes.js';
import { waitlistRouter } from './routes/waitlist.routes.js';
import { conversationRouter } from './routes/conversation.routes.js';
import { aeoResearchRouter } from './routes/aeo-research.routes.js';
import { integrationRouter } from './routes/integration.routes.js';

export function createApp(): Express {
  const app = express();

  // Security
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env['APP_URL'] ?? ''],
      },
    },
  }));

  // CORS
  app.use(cors({
    origin: [
      process.env['APP_URL'] ?? 'http://localhost:3000',
      process.env['APP_URL_LAN'] ?? '',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Compression
  app.use(compression());

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP logging
  app.use(morgan('combined', {
    stream: { write: (msg: string) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/api/health',
  }));

  // Global rate limiting
  app.use('/api', rateLimit({
    windowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 900000),
    max: Number(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? 100),
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' },
  }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/prospects', prospectRouter);
  app.use('/api/companies', companyRouter);
  app.use('/api/contacts', contactRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/approvals', approvalRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/telegram', telegramRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/waitlist', waitlistRouter);
  app.use('/api/conversations', conversationRouter);
  app.use('/api/aeo-research', aeoResearchRouter);
  app.use('/api/integrations', integrationRouter);

  // Error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
