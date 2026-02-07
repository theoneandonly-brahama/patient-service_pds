const express = require('express');
const router = express.Router();
const logger = require('../logger');
const Patient = require('../models/Patient');

/**
 * INTERNAL ROUTES
 *
 * Meant for internal service calls only
 */

/**
 * POST /api/internal/link-user
 *
 * Links a patient record to a Keycloak user.
 * If no patient exists, create one.
 */
router.post('/link-user', async (req, res) => {
    console.log("link user endpoint hit");

    try {
        const { userId, email, firstName, lastName } = req.body;

        logger.info(`Link user request received`, { userId, email });

        if (!userId || !email) {
            logger.warn('Link user request missing required fields');
            return res.status(400).json({
                error: 'Bad Request',
                message: 'userId and email are required',
                linked: false
            });
        }

        // Look for existing patient by email, ignore userId
        let patient = await Patient.findOne({
            where: { email: email }
        });

        if (patient) {
            if (!patient.userId) {
                // Link existing patient
                await patient.update({ userId: userId });

                logger.info(`Linked existing patient record to Keycloak user`, {
                    patientId: patient.id,
                    userId,
                    email
                });

                return res.json({
                    message: 'Patient record linked successfully',
                    patientId: patient.id,
                    linked: true
                });
            } else {
                // Already linked
                logger.info(`Patient record already linked`, { patientId: patient.id, userId: patient.userId });
                return res.json({
                    message: 'Patient record already linked',
                    patientId: patient.id,
                    linked: true
                });
            }
        } else {
            // No patient record found, create one
            patient = await Patient.create({
                email,
                userId,
                firstName: firstName || null,
                lastName: lastName || null
            });

            logger.info(`Created new patient record while linking user`, { patientId: patient.id, userId, email });

            return res.json({
                message: 'Patient record created and linked successfully',
                patientId: patient.id,
                linked: true
            });
        }

    } catch (error) {
        logger.error('Error linking patient record:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to link patient record',
            linked: false
        });
    }
});

module.exports = router;
