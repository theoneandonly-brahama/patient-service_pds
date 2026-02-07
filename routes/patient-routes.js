const express = require('express');
const router = express.Router();
const logger = require('../logger');
const Patient = require('../models/Patient');
require('dotenv').config();
// Helper to extract user info from Keycloak token

const axios = require('axios');

async function getKeycloakUserByEmail(email) {
  // 1. Get admin token
  console.log("KEYCLOAK_URL:", process.env.KEYCLOAK_AUTH_SERVER_URL);
console.log("KEYCLOAK_REALM:", process.env.KEYCLOAK_REALM);

  const tokenResponse = await axios.post(
    `${process.env.KEYCLOAK_AUTH_SERVER_URL}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      client_id: 'admin-cli',
      username: process.env.KEYCLOAK_ADMIN_USERNAME,
      password: process.env.KEYCLOAK_ADMIN_PASSWORD,
      grant_type: 'password'
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  const adminToken = tokenResponse.data.access_token;

  // 2. Search users by email
  console.log(email)
  const usersResponse = await axios.get(
    `${process.env.KEYCLOAK_AUTH_SERVER_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
      params: { email }
    }
  );

  return usersResponse.data.length ? usersResponse.data[0] : null;
}




const getUserFromToken = (req) => {
  const token = req.kauth.grant.access_token;
  return {
    id: token.content.sub,
    username: token.content.preferred_username,
    email: token.content.email,
    roles: token.content.realm_access?.roles || []
  };
};

// Helper to check if user has a specific role
const hasRole = (user, role) => {
  return user.roles.includes(role);
};

// Middleware to require doctor role
const requireDoctor = (req, res, next) => {
  const user = getUserFromToken(req);
  if (!hasRole(user, 'doctor')) {
    logger.warn(`Access denied for user ${user.username} - doctor role required`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This operation requires doctor privileges'
    });
  }
  next();
};

// Middleware to require patient role
const requirePatient = (req, res, next) => {
  const user = getUserFromToken(req);
  if (!hasRole(user, 'patient')) {
    logger.warn(`Access denied for user ${user.username} - patient role required`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'This endpoint is only accessible to patients'
    });
  }
  next();
};

// ============================================================================
// PATIENT-ONLY ENDPOINT - Get own patient data
// ============================================================================

/**
 * GET /api/patients/me
 * 
 * Patients can only access their own data
 * This endpoint returns patient information linked to the authenticated user
 */
router.get('/me', requirePatient, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    
    // Find patient record linked to this Keycloak user
    const patient = await Patient.findOne({
      where: { userId: user.id }
    });
    
    if (!patient) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No patient record found for your account. Please contact your healthcare provider.'
      });
    }
    
    logger.info(`Patient ${user.username} accessed their own data`, {
      patientId: patient.id,
      userId: user.id
    });
    
    res.json({
      message: 'Patient data retrieved successfully',
      data: patient
    });
    
  } catch (error) {
    logger.error('Error retrieving patient data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve patient data'
    });
  }
});

// ============================================================================
// DOCTOR-ONLY ENDPOINTS
// ============================================================================

/**
 * POST /api/patients
 * Create a new patient (Doctor only)
 */
router.post('/', requireDoctor, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      email,
      phone,
      address
    } = req.body;

    // Validation
    if (!firstName || !lastName || !dateOfBirth || !email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'firstName, lastName, dateOfBirth, and email are required'
      });
    }

    // Attempt to find Keycloak user by email
    let userId = null;
    try { 
      console.log("#### TRYING TO FETCH USER FROM KEYCLOAK ####")
      const keycloakUser = await getKeycloakUserByEmail(email); // see next step
      if (keycloakUser) {
        console.log("#### KEYCLOAK USER FOUND, APPENDING USERID ####")
        userId = keycloakUser.id;
      }
    } catch (err) {
      logger.warn(`Could not fetch Keycloak user for email ${email}: ${err.message}`);
    }
    console.log('#### USER ID : '+userId+'  ####')
    // Create patient
    const patient = await Patient.create({
      userId, // either found from Keycloak or null
      firstName,
      lastName,
      dateOfBirth,
      gender,
      email,
      phone,
      address,
      createdBy: user.username
    });

    logger.info(`Patient created by doctor ${user.username}`, {
      patientId: patient.id,
      doctorId: user.id,
      userId
    });

    res.status(201).json({
      message: 'Patient created successfully',
      data: patient
    });

  } catch (error) {
    logger.error('Error creating patient:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors.map(e => e.message).join(', ')
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A patient with this userId already exists'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create patient'
    });
  }
});


/**
 * GET /api/patients
 * Get all patients with optional search (Doctor only)
 */
router.get('/', requireDoctor, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const { search, limit = 100, offset = 0 } = req.query;
    
    let whereClause = {};
    
    // Search by name or email
    if (search) {
      const { Op } = require('sequelize');
      whereClause = {
        [Op.or]: [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ]
      };
    }
    
    const { count, rows: patients } = await Patient.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });
    
    logger.info(`Doctor ${user.username} retrieved ${patients.length} patients`, {
      total: count,
      returned: patients.length,
      doctorId: user.id
    });
    
    res.json({
      message: 'Patients retrieved successfully',
      count: count,
      data: patients
    });
    
  } catch (error) {
    logger.error('Error retrieving patients:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve patients'
    });
  }
});

/**
 * GET /api/patients/:id
 * Get specific patient by ID (Doctor only)
 */
router.get('/:id', requireDoctor, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const patient = await Patient.findByPk(req.params.id);
    
    if (!patient) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Patient with ID ${req.params.id} not found`
      });
    }
    
    logger.info(`Doctor ${user.username} accessed patient ${patient.id}`, {
      patientId: patient.id,
      doctorId: user.id
    });
    
    res.json({
      message: 'Patient retrieved successfully',
      data: patient
    });
    
  } catch (error) {
    logger.error('Error retrieving patient:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve patient'
    });
  }
});

/**
 * PUT /api/patients/:id
 * Update patient (Doctor only)
 */
router.put('/:id', requireDoctor, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const patient = await Patient.findByPk(req.params.id);
    
    if (!patient) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Patient with ID ${req.params.id} not found`
      });
    }
    
    // Update fields
    const { firstName, lastName, dateOfBirth, gender, email, phone, address } = req.body;
    
    await patient.update({
      firstName: firstName || patient.firstName,
      lastName: lastName || patient.lastName,
      dateOfBirth: dateOfBirth || patient.dateOfBirth,
      gender: gender || patient.gender,
      email: email || patient.email,
      phone: phone || patient.phone,
      address: address || patient.address,
      updatedBy: user.username
    });
    
    logger.info(`Doctor ${user.username} updated patient ${patient.id}`, {
      patientId: patient.id,
      doctorId: user.id
    });
    
    res.json({
      message: 'Patient updated successfully',
      data: patient
    });
    
  } catch (error) {
    logger.error('Error updating patient:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors.map(e => e.message).join(', ')
      });
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update patient'
    });
  }
});

/**
 * DELETE /api/patients/:id
 * Delete patient (Doctor only)
 */
router.delete('/:id', requireDoctor, async (req, res) => {
  try {
    const user = getUserFromToken(req);
    const patient = await Patient.findByPk(req.params.id);
    
    if (!patient) {
      return res.status(404).json({
        error: 'Not Found',
        message: `Patient with ID ${req.params.id} not found`
      });
    }
    
    const patientData = patient.toJSON();
    await patient.destroy();
    
    logger.info(`Doctor ${user.username} deleted patient ${patientData.id}`, {
      patientId: patientData.id,
      doctorId: user.id
    });
    
    res.json({
      message: 'Patient deleted successfully',
      data: patientData
    });
    
  } catch (error) {
    logger.error('Error deleting patient:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete patient'
    });
  }
});

module.exports = router;