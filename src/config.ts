// src/config.ts
import { logger } from './logger.js';

function getEnvVariable(name: string): string {
    const value = process.env[name];
    if (!value) {
        logger.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

export const config = {
    remoteServerUrl: getEnvVariable('SERVER_URL'),
    apiKey: getEnvVariable('MCPDOCHUB_API_KEY'),
    // Optional: Define client info passed during initialization
    clientInfo: {
        name: 'mcp-doc-hub',
        version: '1.0.2', 
    }
};

try {
    // Validate URL format
    new URL(config.remoteServerUrl);
} catch (e) {
    logger.error(`Invalid SERVER_URL: ${config.remoteServerUrl}`, e);
    process.exit(1);
}

logger.info(`Relay configured for server: ${config.remoteServerUrl}`);
// Avoid logging the API key itself
logger.debug('API Key is configured (length > 0).');