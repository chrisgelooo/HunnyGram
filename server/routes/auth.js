const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.post('/change-password', auth, authController.changePassword);
router.get('/me', auth, authController.getMe);
router.post('/link-partner', auth, authController.linkPartner);

module.exports = router;
