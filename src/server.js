import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import operatorRoutes from './routes/operatorRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// -----------------------------------------------------------------------------
// 1. GLOBAL MIDDLEWARE
// -----------------------------------------------------------------------------

// Cross-Origin Resource Sharing (CORS)
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// JSON and URL-encoded body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiting (100 requests per 15 minutes by default)
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again later.',
    },
  },
});
app.use('/api', limiter);

// -----------------------------------------------------------------------------
// 2. HEALTH CHECK & STATUS ENDPOINT
// -----------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CivicFix API Service is running',
    version: '1.0.0',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'CivicFix Autonomous Operations Backend',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
});
// -----------------------------------------------------------------------------
// 3. API ROUTE MOUNTS
// -----------------------------------------------------------------------------
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/operator', operatorRoutes);
app.use('/api/v1/verification', verificationRoutes);

// -----------------------------------------------------------------------------
// 4. ERROR HANDLING & 404
// -----------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// -----------------------------------------------------------------------------
// 5. SERVER INITIALIZATION & LIFECYCLE
// -----------------------------------------------------------------------------
let server = null;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`🚀 [CivicFix Backend] Server running on http://localhost:${PORT}`);
    console.log(`🌐 [Environment] ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n🛑 [CivicFix Backend] Received ${signal}. Shutting down gracefully...`);
    if (server) {
      server.close(() => {
        console.log('✅ [CivicFix Backend] HTTP server closed.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
