const session = require('express-session');
const Keycloak = require('keycloak-connect');

// Session storage for Keycloak
const memoryStore = new session.MemoryStore();

// Keycloak configuration for bearer-only authentication
// This service ONLY validates tokens (doesn't handle login - that's in the gateway)
const keycloakConfig = {
  realm: process.env.KEYCLOAK_REALM || 'healthcare',
  'auth-server-url': process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080',
  'ssl-required': 'external',
  resource: process.env.KEYCLOAK_CLIENT_ID || 'patient-service',
  'public-client': true,
  'confidential-port': 0,
  'bearer-only': true                 // Only validate bearer tokens
};

// Initialize Keycloak
const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig);

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'default-secret-change-me',
  resave: false,
  saveUninitialized: true,
  store: memoryStore
};

module.exports = {
  keycloak,
  sessionConfig
};