import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import complaintRoutes from './routes/complaintRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// ===========================================================================
// Core Middlewares
// ===========================================================================

// CORS – enable cross-origin requests for dashboard & mobile clients
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// Body Parsers with 10MB limit for base64 image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger for development / audit tracing
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// ===========================================================================
// Welcome & Health Check Endpoints
// ===========================================================================
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'CivicFix API',
    description: 'Autonomous Civic Operations Agent Backend',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      },
      complaints: {
        submit: 'POST /api/complaints',
        list: 'GET /api/complaints',
        detail: 'GET /api/complaints/:id'
      },
      agents: {
        cluster: 'POST /api/complaints/:id/cluster',
        plan: 'POST /api/complaints/:id/plan',
        verify: 'POST /api/complaints/:id/verify',
        approvePlan: 'POST /api/plans/:planId/approve'
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats'
      }
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'CivicFix Backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ===========================================================================
// API Route Mounts
// ===========================================================================
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Additional mount for /api/plans/:planId/approve and /api/complaints/:id/...
app.use('/api', agentRoutes);

// ===========================================================================
// 404 Route Handler
// ===========================================================================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} not found on CivicFix server.`
  });
});

// ===========================================================================
// Global Error Handler Middleware
// ===========================================================================
app.use(errorHandler);

export default app;
