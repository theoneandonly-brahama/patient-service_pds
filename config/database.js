const { Sequelize } = require('sequelize');
const logger = require('../logger');


// Database configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || 'healthcare_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    return false;
  }
};

// Sync database (create tables if they don't exist)
const syncDatabase = async () => {
  try {
    await sequelize.sync({}); // Use alter in development, migrations in production
    logger.info('Database synchronized');
  } catch (error) {
    logger.error('Error synchronizing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase
};