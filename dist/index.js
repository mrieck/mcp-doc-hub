#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();
import { runRelay } from './relay.js';
import { logger } from './logger.js';
// Ensure unhandled errors are logged
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
    // Optionally exit, or let the application try to continue
    // process.exit(1);
});
// Start the relay process
runRelay().catch((error) => {
    logger.error('Relay failed to run:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map