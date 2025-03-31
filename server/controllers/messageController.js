const Message = require('../models/Message');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Get conversation messages between current user and partner
 */
exports.getMessages = async (req, res) => {
  try {
    const user = req.user;
    console.log('Fetching messages for user:', user._id);
    
    // Make sure user has a partner
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    let messages = [];
    let totalMessages = 0;
    
    // Check if we're using in-memory storage
    if (global.mockMessages) {
      console.log('Using in-memory messages');
      
      // Filter messages between the two users
      messages = global.mockMessages.filter(m => 
        (m.sender.toString() === user._id.toString() && m.receiver.toString() === user.partnerUserId.toString()) || 
        (m.sender.toString() === user.partnerUserId.toString() && m.receiver.toString() === user._id.toString())
      );
      
      totalMessages = messages.length;
      
      // Sort by creation date (descending)
      messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Apply pagination
      messages = messages.slice(skip, skip + limit);
      
      // Mark unread messages as seen
      global.mockMessages.forEach(m => {
        if (m.sender.toString() === user.partnerUserId.toString() && 
            m.receiver.toString() === user._id.toString() && 
            !m.seen) {
          m.seen = true;
          m.seenAt = new Date();
        }
      });
      
      console.log(`Found ${messages.length} messages in memory`);
    } else {
      // Use MongoDB
      console.log('Using MongoDB for messages');
      
      // Query messages between the two users
      messages = await Message.find({
        $or: [
          { sender: user._id, receiver: user.partnerUserId },
          { sender: user.partnerUserId, receiver: user._id }
        ]
      })
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username displayName profilePicture')
      .populate('receiver', 'username displayName profilePicture');
      
      // Count total messages for pagination
      totalMessages = await Message.countDocuments({
        $or: [
          { sender: user._id, receiver: user.partnerUserId },
          { sender: user.partnerUserId, receiver: user._id }
        ]
      });
      
      // Mark unread messages as seen
      await Message.updateMany(
        { 
          sender: user.partnerUserId, 
          receiver: user._id,
          seen: false
        },
        { 
          seen: true,
          seenAt: new Date()
        }
      );
    }
    
    res.status(200).json({
      success: true,
      data: {
        messages: messages.reverse(), // Return in chronological order
        pagination: {
          page,
          limit,
          totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
          hasMore: skip + messages.length < totalMessages
        }
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving messages',
      error: error.message
    });
  }
};

/**
 * Delete a message (mark as deleted for the user)
 */
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.user._id;
    const { deleteForPartner } = req.query; // Check if deleting for partner too

    let message;
    let updateResult;

    // Check if using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for deleting message');
      message = global.mockMessages.find(m => m._id.toString() === messageId);

      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      // Check ownership (only sender can delete for everyone)
      if (message.sender.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
      }

      // Mark as deleted for the user
      if (!message.deletedFor) message.deletedFor = [];
      if (!message.deletedFor.includes(userId.toString())) {
        message.deletedFor.push(userId.toString());
      }

      // If deleteForPartner is true and user is the sender
      if (deleteForPartner === 'true' && message.sender.toString() === userId.toString()) {
        const partnerId = message.receiver.toString();
        if (!message.deletedFor.includes(partnerId)) {
          message.deletedFor.push(partnerId);
        }
        // Mark the message content as deleted if deleted for both
        if (message.deletedFor.length >= 2) {
           message.isDeleted = true;
           message.content = 'This message was deleted';
           message.imageUrl = null; // Remove image URL if deleted
           message.videoUrl = null; // Remove video URL if deleted
        }
      }
      
      // Update in memory array (assuming save method updates the array)
      await message.save(); 
      updateResult = message; // Return the updated message

    } else {
      // Use MongoDB
      console.log('Using MongoDB for deleting message');
      message = await Message.findById(messageId);

      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      // Check ownership
      if (message.sender.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
      }

      // Add user to deletedFor array if not already present
      const updateQuery = { $addToSet: { deletedFor: userId } };
      let finalUpdate = { ...updateQuery };

      // If deleteForPartner is true, update for both users
      if (deleteForPartner === 'true') {
        finalUpdate.$addToSet.deletedFor = [userId, message.receiver];
        finalUpdate.$set = { 
          isDeleted: true, 
          content: 'This message was deleted',
          imageUrl: null, // Clear image URL
          videoUrl: null  // Clear video URL
        };
      }

      updateResult = await Message.findByIdAndUpdate(messageId, finalUpdate, { new: true })
                                  .populate('sender', 'username displayName profilePicture')
                                  .populate('receiver', 'username displayName profilePicture');
    }

    // Emit socket event to notify clients about the deletion/modification
    const io = req.app.get('socketio');
    const userSockets = req.app.get('userSockets');
    const senderSocket = userSockets.get(message.sender.toString());
    const receiverSocket = userSockets.get(message.receiver.toString());

    const eventData = { messageId: message._id, updatedMessage: updateResult };

    if (senderSocket) {
      senderSocket.emit('message-deleted', eventData);
    }
    if (receiverSocket) {
      receiverSocket.emit('message-deleted', eventData);
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
      data: { message: updateResult }
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting message',
      error: error.message
    });
  }
};

/**
 * Send a text message
 */
exports.sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const user = req.user;
    
    console.log('Sending message:', { content, sender: user._id });
    
    // Make sure user has a partner
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    // Validate input
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }
    
    let message;
    
    // Check if we're using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for message');
      
      // Create new message with mock constructor
      message = new global.Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'text',
        content
      });
      
      // Add message to in-memory store
      await message.save();
      console.log('Message saved to memory:', message);
    } else {
      // Use MongoDB
      console.log('Using MongoDB for message');
      
      // Create new message
      message = new Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'text',
        content
      });
      
      await message.save();
      
      // Populate sender and receiver information
      await message.populate('sender', 'username displayName profilePicture');
      await message.populate('receiver', 'username displayName profilePicture');
    }
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: { message }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

/**
 * Send an image message
 */
exports.sendImageMessage = async (req, res) => {
  try {
    const user = req.user;
    
    // Make sure user has a partner
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    // Check if file exists in request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    
    let imageUrl = '';
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000'; // Get backend URL from env or default

    // Use Cloudinary in production or if configured, otherwise use local URL
    if (isProduction || (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET)) {
      
      // Ensure Cloudinary is configured if attempting upload
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('Cloudinary environment variables are missing!');
        // Handle error appropriately, maybe return an error response or use a default placeholder
        return res.status(500).json({ success: false, message: 'Image upload configuration error.' });
      }
        
      try {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'hunnygram_chat_images',
          width: 1024,
          crop: 'limit'
        });
        const cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
          folder: 'hunnygram_chat_images',
          width: 1024, // Limit width for optimization
          crop: 'limit'
        });
        imageUrl = cloudinaryResult.secure_url;
        console.log('Image uploaded to Cloudinary:', imageUrl);
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Fallback or error response if Cloudinary fails
        return res.status(500).json({ success: false, message: 'Failed to upload image to Cloudinary.' });
      }
    } else {
      // Use local URL for development if Cloudinary is not used
      imageUrl = `${backendUrl}/uploads/${req.file.filename}`;
      console.log('Using local image URL:', imageUrl);
    }
    
    let message;
    
    // Check if we're using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for image message');
      
      // Create new message with mock constructor
      message = new global.Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'image',
        content: 'Image shared',
        imageUrl
      });
      
      // Add message to in-memory store
      await message.save();
    } else {
      // Use MongoDB
      console.log('Using MongoDB for image message');
      
      // Create new message
      message = new Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'image',
        content: 'Image shared',
        imageUrl
      });
      
      await message.save();
      
      // Populate sender and receiver information
      await message.populate('sender', 'username displayName profilePicture');
      await message.populate('receiver', 'username displayName profilePicture');
    }

    // Emit the message via socket AFTER saving and populating
    const io = req.app.get('socketio'); // Get io instance from app
    const userSockets = req.app.get('userSockets'); // Get userSockets map from app
    
    const senderSocket = userSockets.get(user._id.toString());
    const receiverSocket = user.partnerUserId ? userSockets.get(user.partnerUserId.toString()) : null;

    if (senderSocket) {
      senderSocket.emit('message-sent', { message }); // Confirm to sender
    }
    if (receiverSocket) {
      // Mark as delivered
      message.delivered = true;
      message.deliveredAt = new Date();
      if (message.save) await message.save(); // Save delivered status if using DB
      
      receiverSocket.emit('new-message', { message }); // Send to receiver
      
      // Notify sender of delivery
      if (senderSocket) {
        senderSocket.emit('message-delivered', { messageId: message._id, deliveredAt: message.deliveredAt });
      }
    }
    
    // Send HTTP response
    res.status(201).json({
      success: true,
      message: 'Image sent successfully',
      data: { message } // Send populated message back
    });
  } catch (error) {
    console.error('Send image message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending image message',
      error: error.message
    });
  }
};

/**
 * Send a video message
 */
exports.sendVideoMessage = async (req, res) => {
  try {
    const user = req.user;
    
    // Make sure user has a partner
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    // Check if file exists in request
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }
    
    let videoUrl = '';
    const isProduction = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000'; // Get backend URL from env or default

    // Use Cloudinary in production or if configured, otherwise use local URL
    if (isProduction || (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET)) {
      
      // Ensure Cloudinary is configured if attempting upload
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.error('Cloudinary environment variables are missing!');
        return res.status(500).json({ success: false, message: 'Video upload configuration error.' });
      }
        
      try {
        // Upload video to Cloudinary
        const cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
          resource_type: 'video',
          folder: 'hunnygram_chat_videos',
          eager: [
            { width: 640, height: 480, crop: "pad" }
          ]
        });
        
        videoUrl = cloudinaryResult.secure_url;
        console.log('Video uploaded to Cloudinary:', videoUrl);
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Fallback or error response if Cloudinary fails
        return res.status(500).json({ success: false, message: 'Failed to upload video to Cloudinary.' });
      }
    } else {
      // Use local URL for development if Cloudinary is not used
      videoUrl = `${backendUrl}/uploads/${req.file.filename}`;
      console.log('Using local video URL:', videoUrl);
    }
    
    let message;
    
    // Check if we're using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for video message');
      
      // Create new message with mock constructor
      message = new global.Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'video',
        content: 'Video shared',
        videoUrl
      });
      
      // Add message to in-memory store
      await message.save();
    } else {
      // Use MongoDB
      console.log('Using MongoDB for video message');
      
      // Create new message
      message = new Message({
        sender: user._id,
        receiver: user.partnerUserId,
        messageType: 'video',
        content: 'Video shared',
        videoUrl
      });
      
      await message.save();
      
      // Populate sender and receiver information
      await message.populate('sender', 'username displayName profilePicture');
      await message.populate('receiver', 'username displayName profilePicture');
    }

    // Emit the message via socket AFTER saving and populating
    const io = req.app.get('socketio'); // Get io instance from app
    const userSockets = req.app.get('userSockets'); // Get userSockets map from app
    
    const senderSocket = userSockets.get(user._id.toString());
    const receiverSocket = user.partnerUserId ? userSockets.get(user.partnerUserId.toString()) : null;

    if (senderSocket) {
      senderSocket.emit('message-sent', { message }); // Confirm to sender
    }
    if (receiverSocket) {
      // Mark as delivered
      message.delivered = true;
      message.deliveredAt = new Date();
      if (message.save) await message.save(); // Save delivered status if using DB
      
      receiverSocket.emit('new-message', { message }); // Send to receiver
      
      // Notify sender of delivery
      if (senderSocket) {
        senderSocket.emit('message-delivered', { messageId: message._id, deliveredAt: message.deliveredAt });
      }
    }
    
    // Send HTTP response
    res.status(201).json({
      success: true,
      message: 'Video sent successfully',
      data: { message } // Send populated message back
    });
  } catch (error) {
    console.error('Send video message error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending video message',
      error: error.message
    });
  }
};

/**
 * Mark message as seen
 */
exports.markAsSeen = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const user = req.user;
    
    let message;
    
    // Check if we're using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for marking message seen');
      
      // Find message in in-memory store
      message = global.mockMessages.find(m => m._id.toString() === messageId);
      
      // Check if message exists
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }
      
      // Check if the message is sent to the current user
      if (message.receiver.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to mark this message as seen'
        });
      }
      
      // Update message
      message.seen = true;
      message.seenAt = new Date();
    } else {
      // Use MongoDB
      console.log('Using MongoDB for marking message seen');
      
      message = await Message.findById(messageId);
      
      // Check if message exists
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found'
        });
      }
      
      // Check if the message is sent to the current user
      if (message.receiver.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to mark this message as seen'
        });
      }
      
      // Update message
      message.seen = true;
      message.seenAt = new Date();
      await message.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Message marked as seen',
      data: { message }
    });
  } catch (error) {
    console.error('Mark message as seen error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as seen',
      error: error.message
    });
  }
};

/**
 * Get unread message count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const user = req.user;
    
    // Make sure user has a partner
    if (!user.partnerUserId) {
      return res.status(404).json({
        success: false,
        message: 'No partner found'
      });
    }
    
    let count = 0;
    
    // Check if we're using in-memory storage
    if (global.mockMessages !== undefined) {
      console.log('Using in-memory storage for unread count');
      
      // Count unread messages in in-memory store
      count = global.mockMessages.filter(m => 
        m.sender.toString() === user.partnerUserId.toString() && 
        m.receiver.toString() === user._id.toString() && 
        !m.seen
      ).length;
    } else {
      // Use MongoDB
      console.log('Using MongoDB for unread count');
      
      // Count unread messages
      count = await Message.countDocuments({
        sender: user.partnerUserId,
        receiver: user._id,
        seen: false
      });
    }
    
    res.status(200).json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving unread message count',
      error: error.message
    });
  }
};
