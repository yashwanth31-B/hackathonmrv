import dotenv from 'dotenv';
import app from './app.js';

// Load environment variables
dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

// ---------------------------------------------------------------------------
// startServer – tries PORT, then PORT+1, PORT+2, ... up to maxRetries
// ---------------------------------------------------------------------------
function startServer(port, maxRetries = 5) {
  const server = app.listen(port, () => {
    console.log('====================================================');
    console.log('   CIVICFIX - Autonomous Civic Operations Backend    ');
    console.log('====================================================');
    console.log(`🚀 Server listening on port: ${port}`);
    console.log(`📡 Local endpoint:           http://localhost:${port}`);
    console.log(`🩺 Health check:             http://localhost:${port}/health`);
    console.log(`📊 Dashboard API:            http://localhost:${port}/api/dashboard/stats`);
    console.log(`🌍 Environment:              ${process.env.NODE_ENV || 'development'}`);
    console.log('====================================================');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      const triesLeft = maxRetries - (port - PORT);
      if (triesLeft > 0) {
        console.warn(`⚠️  Port ${port} is in use. Trying port ${nextPort}...`);
        server.close();
        startServer(nextPort, maxRetries);
      } else {
        console.error(
          `❌  Could not find a free port after trying ${maxRetries} ports (${PORT}–${port}). ` +
          `Set a different PORT in your .env file.`
        );
        process.exit(1);
      }
    } else {
      console.error('💥 Server error:', err);
      process.exit(1);
    }
  });

  // Graceful Shutdown
  const handleShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down CivicFix server gracefully...`);
    server.close(() => {
      console.log('💤 HTTP server closed. Process terminating.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('⚠️  Forceful shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  return server;
}

// Uncaught Exception & Rejection Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception thrown:', error);
  process.exit(1);
});

export default startServer(PORT);
