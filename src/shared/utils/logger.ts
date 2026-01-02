/**
 * Centralized logging utility for the Multi-Agent Architecture Design System
 */

import winston from 'winston';

const logLevel = process.env['LOG_LEVEL'] || 'info';
const nodeEnv = process.env['NODE_ENV'] || 'development';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: {
    service: 'multi-agent-architecture-system',
    environment: nodeEnv,
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for production
    ...(nodeEnv === 'production' ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    ] : [])
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(nodeEnv === 'production' ? [
      new winston.transports.File({ filename: 'logs/exceptions.log' })
    ] : [])
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(nodeEnv === 'production' ? [
      new winston.transports.File({ filename: 'logs/rejections.log' })
    ] : [])
  ]
});

// Create logs directory if it doesn't exist (for production)
if (nodeEnv === 'production') {
  import('fs').then(fs => {
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
  });
}