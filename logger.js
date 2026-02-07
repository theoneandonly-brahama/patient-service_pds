const winston = require('winston');

// Winston is a logging library that gives you flexible, structured logging
// Structured logging means logs are in a format (JSON) that's easy to parse and search

// Define log format
// This creates a consistent structure for all your logs
const logFormat = winston.format.combine(
  // Add timestamp to every log entry
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  // Add error stack traces when logging errors
  winston.format.errors({ stack: true }),
  // Format as JSON - this is what Loki expects
  winston.format.json(),
  // Add service name to every log (helpful when aggregating logs from multiple services)
  winston.format((info) => {
    info.service = 'patient-service';
    return info;
  })()
);

// Create the logger instance
const logger = winston.createLogger({
  // Log level determines what gets logged
  // 'info' means: log info, warn, and error (but not debug)
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  
  // Transports determine where logs go
  transports: [
    // Console output - you'll see these in your terminal
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File output - these will be picked up by your log shipper
    // In production, these files are typically read by Promtail (Loki's agent)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ],
  
  // Don't exit on uncaught errors
  exitOnError: false
});

// In development, also log to console in a more readable format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
        let msg = `${timestamp} [${service}] ${level}: ${message}`;
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
      })
    )
  }));
}

module.exports = logger;