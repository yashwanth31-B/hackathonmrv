import dotenv from 'dotenv';
import app from './app.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log('====================================================');
  console.log('   CIVICFIX - Autonomous Civic Operations Backend    ');
  console.log('====================================================');
  console.log(`🚀 Server listening on port: ${PORT}`);
  console.log(`📡 Local endpoint:           http://localhost:${PORT}`);
  console.log(`🩺 Health check:             http://localhost:${PORT}/health`);
  console.log(`📊 Dashboard API:            http://localhost:${PORT}/api/dashboard/stats`);
  console.log(`🌍 Environment:              ${process.env.NODE_ENV || 'development'}`);
  console.log('====================================================');
});

// Graceful Shutdown
const handleShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down CivicFix server gracefully...`);
  server.close(() => {
    console.log('💤 HTTP server closed. Process terminating.');
    process.exit(0);
  });

  // Force close after 10s if stuck
  setTimeout(() => {
    console.error('⚠️  Forceful shutdown initiated after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Uncaught Exception & Rejection Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception thrown:', error);
  process.exit(1);
});

export default server;
