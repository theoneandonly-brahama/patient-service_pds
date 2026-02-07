const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const promBundle = require('express-prom-bundle');

// Import configurations
const eurekaClient = require('./eureka-config');
const { keycloak, sessionConfig } = require('./keycloak-config');
const { testConnection, syncDatabase } = require('./config/database');
const logger = require('./logger');

// Import routes
const patientRoutes = require('./routes/patient-routes');
const internalRoutes = require('./routes/internal-routes');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// CORS
app.use(cors({
  origin: process.env.GATEWAY_URL || 'http://localhost:8762',
  credentials: true
}));

// Body parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session management for Keycloak
app.use(session(sessionConfig));

// Initialize Keycloak middleware
app.use(keycloak.middleware());

// Prometheus metrics
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { service: 'patient-service' },
  promClient: {
    collectDefaultMetrics: {
      timeout: 1000
    }
  }
});
app.use(metricsMiddleware);

// Request logging with user context
app.use((req, res, next) => {
  // Try to get user from Keycloak token
  const kauth = req.kauth;
  let userId = 'anonymous';
  let userName = 'anonymous';
  let roles = 'none';
  
  if (kauth && kauth.grant && kauth.grant.access_token) {
    const token = kauth.grant.access_token;
    userId = token.content.sub || 'unknown';
    userName = token.content.preferred_username || 'unknown';
    
    if (token.content.realm_access && token.content.realm_access.roles) {
      roles = token.content.realm_access.roles.join(',');
    }
  }
  
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userId,
    userName,
    roles
  });
  
  next();
});

// ============================================================================
// HEALTH CHECK ENDPOINTS
// ============================================================================

app.get('/actuator/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'patient-service',
    timestamp: new Date().toISOString()
  });
});

app.get('/actuator/info', (req, res) => {
  res.status(200).json({
    app: {
      name: 'patient-service',
      description: 'Patient CRUD microservice with PostgreSQL and role-based access',
      version: '2.0.0'
    }
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Internal routes - no authentication required (service-to-service calls)
app.use('/internal', internalRoutes);

// Patient routes - protected by Keycloak
// keycloak.protect() validates the JWT token
app.use('/patients', keycloak.protect(), patientRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }
    
    // Sync database
    await syncDatabase();
    
    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Patient service started on port ${PORT}`);
      
      // Register with Eureka
      eurekaClient.start((error) => {
        if (error) {
          logger.error('Eureka registration failed:', error);
        } else {
          logger.info('Successfully registered with Eureka');
        }
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down patient service...');
  eurekaClient.stop(() => {
    logger.info('Deregistered from Eureka');
    process.exit(0);
  });
});

startServer();

module.exports = app;