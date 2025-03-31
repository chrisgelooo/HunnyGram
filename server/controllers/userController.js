const User = require('../models/User');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Update user profile information
 */
exports.updateProfile = async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    const user = req.user;

    console.log('Update profile request:', { displayName, bio });

    // Update fields if provided
    if (displayName) user.displayName = displayName;
    if (bio !== undefined) user.bio = bio;

    // For in-memory storage, user.save is already a function in our mock implementation
    if (user.save) {
      await user.save();
    } else {
      // This shouldn't happen as our auth middleware attaches a user with save method
      console.error('No save method found on user object');
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

/**
 * Upload and update profile picture
 */
exports.updateProfilePicture = async (req, res) => {
  try {
    // Check if file exists in request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const user = req.user;
    let profilePicture = 'https://res.cloudinary.com/demo/image/upload/v1580125392/default-profile_hdtqso.png';

    try {
      // Try to upload to Cloudinary if configured
      if (process.env.CLOUDINARY_CLOUD_NAME && 
          process.env.CLOUDINARY_API_KEY && 
          process.env.CLOUDINARY_API_SECRET) {
        
        console.log('Uploading profile picture to Cloudinary');
        // Upload image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'hunnygram_profile_pictures',
          width: 500,
          crop: 'limit'
        });

        // Delete old profile picture from Cloudinary if it's not the default
        if (user.profilePicture && !user.profilePicture.includes('default-profile')) {
          try {
            const publicId = user.profilePicture.split('/').pop().split('.')[0];
            await cloudinary.uploader.destroy(publicId);
          } catch (deleteErr) {
            console.warn('Could not delete old profile picture:', deleteErr.message);
          }
        }

        profilePicture = result.secure_url;
      } else {
        console.log('Cloudinary not configured, using placeholder image');
      }
    } catch (uploadError) {
      console.error('Profile picture upload error:', uploadError);
      console.log('Using placeholder image instead');
    }

    // Update user profile picture URL
    user.profilePicture = profilePicture;
    await user.save();
    
    console.log('Profile picture updated:', profilePicture);

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        user,
        profilePicture
      }
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile picture',
      error: error.message
    });
  }
};

/**
 * Get partner's information
 */
exports.getPartner = async (req, res) => {
  try {
    const user = req.user;
    console.log('Getting partner info for user:', user._id);
    
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    let partner = null;
    
    // Check if we're using in-memory storage
    if (global.mockUsers) {
      console.log('Using in-memory storage for partner lookup');
      partner = global.mockUsers.find(u => u._id.toString() === user.partnerUserId.toString());
    } else {
      // Use MongoDB
      console.log('Using MongoDB for partner lookup');
      partner = await User.findById(user.partnerUserId).select('-password');
    }
    
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: 'Partner not found'
      });
    }
    
    // Remove password from response if using in-memory
    if (partner.password) {
      const partnerObj = { ...partner };
      delete partnerObj.password;
      partner = partnerObj;
    }
    
    res.status(200).json({
      success: true,
      data: { partner }
    });
  } catch (error) {
    console.error('Get partner error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving partner information',
      error: error.message
    });
  }
};

/**
 * Get user's online status
 */
exports.getStatus = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('Getting online status for user:', userId);
    
    let user = null;
    
    // Check if we're using in-memory storage
    if (global.mockUsers) {
      console.log('Using in-memory storage for user status');
      user = global.mockUsers.find(u => u._id.toString() === userId.toString());
    } else {
      // Use MongoDB
      console.log('Using MongoDB for user status');
      user = await User.findById(userId).select('lastActive');
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Consider a user online if they were active within the last 5 minutes
    const isOnline = new Date() - new Date(user.lastActive) < 5 * 60 * 1000;
    
    res.status(200).json({
      success: true,
      data: {
        isOnline,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user status',
      error: error.message
    });
  }
};
