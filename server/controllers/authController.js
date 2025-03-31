const User = require('../models/User');
const jwt = require('jsonwebtoken');

/**
 * Generate JWT token for user authentication
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d' // Token valid for 30 days
  });
};

/**
 * Register a new user
 * Limited to 2 users total in the system
 */
exports.register = async (req, res) => {
  try {
    console.log('Registration attempt:', req.body);
    const { username, password, displayName } = req.body;

    // Validate input
    if (!username || !password || !displayName) {
      console.log('Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Using direct in-memory storage
    if (global.mockUsers) {
      console.log('Using in-memory storage for registration');
      
      // Check if username already exists
      const existingUser = global.mockUsers.find(u => u.username === username);
      if (existingUser) {
        console.log('Username already exists:', username);
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }

      // Check total user count (limit to 2 users)
      if (global.mockUsers.length >= 2) {
        console.log('User limit reached (2 users)');
        return res.status(403).json({
          success: false,
          message: 'Only two users are allowed in HunnyGram'
        });
      }

      // Create new user with mockUser constructor
      const user = new global.User({
        username,
        password,
        displayName
      });
      
      // If this is the second user, link both users as partners
      if (global.mockUsers.length === 1) {
        const firstUser = global.mockUsers[0];
        console.log('Linking users as partners');
        
        // Update partner references
        user.partnerUserId = firstUser._id;
        firstUser.partnerUserId = user._id;
        
        // Save first user updates
        try {
          await firstUser.save();
        } catch (err) {
          console.warn('Could not update partner, but continuing');
        }
      } else {
        console.log('First user registered, no partner linked yet');
      }
      
      // Save the new user
      await user.save();
      console.log('User registered in memory:', user);
      
      // Generate token
      const token = generateToken(user._id);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user,
          token
        }
      });
    }
    
    // If we reach here, try to use the real MongoDB
    console.log('Falling back to MongoDB model for registration');
    
    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check total user count (limit to 2 users)
    const totalUsers = await User.countDocuments();
    if (totalUsers >= 2) {
      return res.status(403).json({
        success: false,
        message: 'Only two users are allowed in HunnyGram'
      });
    }

    // Create new user
    const user = new User({
      username,
      password,
      displayName
    });

    // If this is the second user, link both users as partners
    if (totalUsers === 1) {
      const firstUser = await User.findOne();
      user.partnerUserId = firstUser._id;
      
      // Update the first user with partner ID
      firstUser.partnerUserId = user._id;
      await firstUser.save();
    }

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
  }
};

/**
 * Login existing user
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', { username });

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide username and password'
      });
    }

    let user;

    // Try memory storage first
    if (global.mockUsers) {
      console.log('Using in-memory storage for login');
      user = global.mockUsers.find(u => u.username === username);
      
      if (user) {
        // Verify password (in mock mode, we're doing simple equality)
        const isMatch = user.password === password;
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'Invalid username or password'
          });
        }

        // Update last active status
        user.lastActive = new Date();

        // Generate token
        const token = generateToken(user._id);

        console.log('Login successful for user:', user.username);
        return res.status(200).json({
          success: true,
          message: 'Login successful',
          data: {
            user,
            token
          }
        });
      }
    }
    
    // Fall back to MongoDB if no user found in memory
    if (!user) {
      console.log('Falling back to MongoDB model for login');
      
      // Find user by username
      user = await User.findOne({ username });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password'
        });
      }

      // Verify password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password'
        });
      }

      // Update last active status
      user.lastActive = new Date();
      await user.save();

      // Generate token
      const token = generateToken(user._id);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user,
          token
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

/**
 * Change user password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    // Check if new password meets requirements
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: error.message
    });
  }
};

/**
 * Get current authenticated user
 */
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    console.log('Getting user info for', user.username);
    
    // Find partner information
    let partner = null;
    
    if (user.partnerUserId) {
      console.log('Partner ID found:', user.partnerUserId);
      
      // Check if we're using in-memory storage
      if (global.mockUsers) {
        console.log('Using in-memory storage for partner lookup');
        partner = global.mockUsers.find(u => u._id.toString() === user.partnerUserId.toString());
        
        if (partner) {
          // Remove password from response
          const partnerObj = { ...partner };
          delete partnerObj.password;
          partner = partnerObj;
        }
      } else {
        // Use MongoDB
        console.log('Using MongoDB for partner lookup');
        partner = await User.findById(user.partnerUserId).select('-password');
      }
      
      if (partner) {
        console.log('Partner found:', partner.username);
      } else {
        console.log('No partner found with ID:', user.partnerUserId);
      }
    } else {
      console.log('No partner ID set for user');
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        partner
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user information',
      error: error.message
    });
  }
};

/**
 * Link with partner
 * This manually creates a partner relationship between two users
 */
exports.linkPartner = async (req, res) => {
  try {
    const { partnerUsername } = req.body;
    const user = req.user;
    
    console.log('Attempting to link', user.username, 'with partner:', partnerUsername);
    
    if (!partnerUsername) {
      return res.status(400).json({
        success: false,
        message: 'Partner username is required'
      });
    }
    
    if (user.partnerUserId) {
      return res.status(400).json({
        success: false,
        message: 'You already have a partner linked to your account'
      });
    }
    
    let partner = null;
    
    // Find partner by username
    if (global.mockUsers) {
      console.log('Using in-memory storage to find partner');
      partner = global.mockUsers.find(u => u.username === partnerUsername);
    } else {
      console.log('Using MongoDB to find partner');
      partner = await User.findOne({ username: partnerUsername });
    }
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }
    
    // Make sure partner doesn't already have a different partner
    if (partner.partnerUserId && partner.partnerUserId.toString() !== user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'This user is already linked with another partner'
      });
    }
    
    console.log('Linking users', user._id, 'and', partner._id);
    
    // Update both users
    user.partnerUserId = partner._id;
    partner.partnerUserId = user._id;
    
    // Save changes
    await user.save();
    await partner.save();
    
    // Prepare partner info for response
    const partnerInfo = { ...partner };
    if (partnerInfo.password) {
      delete partnerInfo.password;
    }
    
    res.status(200).json({
      success: true,
      message: 'Partner linked successfully',
      data: {
        user,
        partner: partnerInfo
      }
    });
  } catch (error) {
    console.error('Link partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Error linking partner',
      error: error.message
    });
  }
};
