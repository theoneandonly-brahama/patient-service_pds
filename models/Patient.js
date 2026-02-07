const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Patient Model
 * 
 * Represents patient records in the database
 * Links to Keycloak users via the userId field
 */
const Patient = sequelize.define('Patient', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // Link to Keycloak user
  userId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    comment: 'Keycloak user ID (sub claim from JWT)'
  },
  
  // Personal Information
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other'),
    allowNull: true
  },
  
  // Contact Information
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Audit fields
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Username of the doctor who created this record'
  },
  
  updatedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Username of the doctor who last updated this record'
  }
}, {
  tableName: 'patients',
  timestamps: true, // Adds createdAt and updatedAt automatically
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['email']
    },
    {
      fields: ['lastName', 'firstName']
    }
  ]
});

module.exports = Patient;