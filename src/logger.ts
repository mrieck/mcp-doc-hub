// src/logger.ts
import { inspect } from 'util';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // Default to 'info'

const levels: { [key: string]: number } = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const currentLevel = levels[LOG_LEVEL.toLowerCase()] ?? levels.info;

function formatMessage(level: string, message: string, context?: unknown): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (context !== undefined) {
        formattedMessage += `\nContext: ${inspect(context, { depth: null, colors: true })}`; // colors: true for stderr
    }
    return formattedMessage;
}

export const logger = {
    debug: (message: string, context?: unknown) => {
        if (currentLevel <= levels.debug) {
            // Change to console.error to direct to stderr
            console.error(formatMessage('debug', message, context));
        }
    },
    info: (message: string, context?: unknown) => {
        if (currentLevel <= levels.info) {
            // Change to console.error to direct to stderr
            console.error(formatMessage('info', message, context));
        }
    },
    warn: (message: string, context?: unknown) => {
        if (currentLevel <= levels.warn) {
            console.warn(formatMessage('warn', message, context)); // console.warn already goes to stderr
        }
    },
    error: (message: string, context?: unknown) => {
        if (currentLevel <= levels.error) {
            console.error(formatMessage('error', message, context)); // console.error already goes to stderr
        }
    },
};