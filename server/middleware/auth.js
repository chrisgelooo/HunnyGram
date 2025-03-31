const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and attaches user to request
 */
const auth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user = null;
    
    // First try to find user in memory
    if (global.mockUsers) {
      console.log('Looking for user in memory storage, id:', decoded.id);
      user = global.mockUsers.find(u => u._id.toString() === decoded.id.toString());
      
      if (user) {
        // Update last active timestamp
        user.lastActive = new Date();
        
        // Attach user to request
        req.user = user;
        return next();
      }
    }
    
    // If not found in memory, try database
    if (!user) {
      console.log('Falling back to database to find user');
      user = await User.findById(decoded.id);
      
      if (user) {
        // Update last active timestamp
        user.lastActive = new Date();
        await user.save();
        
        // Attach user to request
        req.user = user;
        return next();
      }
    }
    
    if (!user) {
      console.log('User not found with id:', decoded.id);
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found'
      });
    }
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

module.exports = auth;
