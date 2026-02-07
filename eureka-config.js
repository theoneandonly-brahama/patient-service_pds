const Eureka = require('eureka-js-client').Eureka;

// Get configuration from environment variables
const SERVICE_PORT = process.env.PORT || 3001;
const EUREKA_HOST = process.env.EUREKA_HOST || 'localhost';
const EUREKA_PORT = process.env.EUREKA_PORT || 8761;

const K8S_SERVICE_NAME = 'patient-service-svc';

// Configuration for Eureka client registration
// This tells Eureka who we are and where to find us
const eurekaConfig = {
  instance: {
    // IMPORTANT: Use uppercase for app name to match Spring Cloud conventions
    // Your gateway route uses "PATIENT-SERVICE" in uppercase
    app: 'PATIENT-SERVICE',
    hostName: K8S_SERVICE_NAME,
    ipAddr: K8S_SERVICE_NAME,
    // The port your service will listen on
    port: {
      '$': SERVICE_PORT,
      '@enabled': true,
    },
    vipAddress: 'patient-service',
    // Health check endpoint that Eureka will ping
    statusPageUrl: `http://${K8S_SERVICE_NAME}:${SERVICE_PORT}/actuator/info`,
    healthCheckUrl: `http://${K8S_SERVICE_NAME}:${SERVICE_PORT}/actuator/health`,
    // This is the URL other services will use to reach us
    homePageUrl: `http://${K8S_SERVICE_NAME}:${SERVICE_PORT}/`,
    dataCenterInfo: {
      '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
      name: 'MyOwn',
    },
    // Metadata can store additional info about your service
    metadata: {
      'management.port': SERVICE_PORT.toString(),
    },
  },
  eureka: {
    // Address of your Eureka server
    host: EUREKA_HOST,
    port: EUREKA_PORT,
    servicePath: '/eureka/apps/',
    // How often to send heartbeat to Eureka (30 seconds)
    renewalIntervalInSecs: 30,
    // How long Eureka should wait before removing this instance if no heartbeat
    durationInSecs: 90,
    // How often to fetch the registry from Eureka
    registryFetchInterval: 30000,
  },
};

// Create and export the Eureka client
const client = new Eureka(eurekaConfig);

module.exports = client;