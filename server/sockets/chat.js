const User = require('../models/User');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');

module.exports = (io) => {
  // Map to store user socket connections
  const userSockets = new Map();
  
// Middleware to authenticate socket connections
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    let user = null;
    
    // Check if we're using in-memory storage
    if (global.mockUsers) {
      console.log('Socket auth: Using in-memory storage to find user', decoded.id);
      user = global.mockUsers.find(u => u._id === decoded.id);
    } else {
      // Use MongoDB
      console.log('Socket auth: Using MongoDB to find user', decoded.id);
      user = await User.findById(decoded.id);
    }
    
    if (!user) {
      console.log('Socket auth: User not found with ID', decoded.id);
      return next(new Error('Authentication error: User not found'));
    }
    
    console.log('Socket authenticated for user:', user.username);
    
    // Attach user to socket
    socket.user = user;
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication error'));
  }
});
  
  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    
    console.log(`User connected: ${socket.user.username} (${userId})`);
    
    // Store user's socket connection
    userSockets.set(userId, socket);
    
    // Update user as online
    try {
      // Update last active time
      socket.user.lastActive = new Date();
      
      // Save changes - check if we're using in-memory storage
      if (socket.user.save) {
        socket.user.save()
          .then(() => {
            // Notify partner that user is online
            if (socket.user.partnerUserId) {
              const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
              if (partnerSocket) {
                partnerSocket.emit('partner-status', { isOnline: true });
              }
            }
          })
          .catch(err => console.error('Error updating user status:', err));
      } else {
        // Fall back to MongoDB update if in-memory save not available
        User.findByIdAndUpdate(userId, { lastActive: new Date() })
          .then(() => {
            // Notify partner that user is online
            if (socket.user.partnerUserId) {
              const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
              if (partnerSocket) {
                partnerSocket.emit('partner-status', { isOnline: true });
              }
            }
          })
          .catch(err => console.error('Error updating user status:', err));
      }
    } catch (err) {
      console.error('Error updating user online status:', err);
    }
    
    // Handle new message
    socket.on('send-message', async (messageData) => {
      try {
        // Check if message is valid
        if (!messageData.content) {
          return socket.emit('message-error', { error: 'Message content is required' });
        }
        
        let message;
        // Check if we're using in-memory storage
        if (global.mockMessages !== undefined) {
          console.log('Socket send message: Using in-memory storage');
          
          // Create new message with in-memory constructor
          message = new global.Message({
            sender: userId,
            receiver: socket.user.partnerUserId,
            messageType: 'text',
            content: messageData.content
          });
          
          // Mock populate functionality
          message.sender = socket.user;
          
          if (socket.user.partnerUserId) {
            // Find partner from in-memory storage
            const partner = global.mockUsers.find(u => u._id.toString() === socket.user.partnerUserId.toString());
            if (partner) {
              message.receiver = partner;
            }
          }
          
          await message.save();
        } else {
          console.log('Socket send message: Using MongoDB');
          
        // Create new message in database
          message = new Message({
            sender: userId,
            receiver: socket.user.partnerUserId,
            messageType: 'text',
            content: messageData.content,
            delivered: false,
            deliveredAt: null
          });
          
          await message.save();
          
          // Populate sender and receiver information
          await message.populate('sender', 'username displayName profilePicture');
          await message.populate('receiver', 'username displayName profilePicture');
        }
        
        console.log('Message saved:', message);
        
        // Send message to sender
        socket.emit('message-sent', { message });
        
        // Send message to receiver if online
        if (socket.user.partnerUserId) {
          const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
          if (partnerSocket) {
            // Mark as delivered since partner is online to receive it
            message.delivered = true;
            message.deliveredAt = new Date();
            
            // Save the updated message
            if (message.save) {
              await message.save();
              console.log('Message marked as delivered:', message._id);
            } else {
              // If save method not available, update directly in array
              const messageIndex = global.mockMessages.findIndex(m => m._id.toString() === message._id.toString());
              if (messageIndex !== -1) {
                global.mockMessages[messageIndex] = message;
                console.log('Message updated as delivered in memory array');
              }
            }
            
            // Notify receiver about new message
            partnerSocket.emit('new-message', { message });
            
            // Notify sender that message was delivered
            socket.emit('message-delivered', { messageId: message._id, deliveredAt: message.deliveredAt });
          }
        }
      } catch (error) {
        console.error('Socket send message error:', error);
        socket.emit('message-error', { error: 'Error sending message' });
      }
    });
    
    // Handle typing status
    socket.on('typing-start', () => {
      if (socket.user.partnerUserId) {
        const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
        if (partnerSocket) {
          partnerSocket.emit('partner-typing', { isTyping: true });
        }
      }
    });
    
    socket.on('typing-stop', () => {
      if (socket.user.partnerUserId) {
        const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
        if (partnerSocket) {
          partnerSocket.emit('partner-typing', { isTyping: false });
        }
      }
    });
    
    // Handle message deletion
    socket.on('delete-message', async (data) => {
      try {
        if (!data.messageId) {
          return socket.emit('message-error', { error: 'Message ID is required' });
        }
        
        const userId = socket.user._id.toString();
        let message;
        let updatedMessage;
        
        // Check if we're using in-memory storage
        if (global.mockMessages !== undefined) {
          console.log('Socket delete message: Using in-memory storage for message:', data.messageId);
          message = global.mockMessages.find(m => m._id.toString() === data.messageId);
          
          if (!message) {
            return socket.emit('message-error', { error: 'Message not found' });
          }
          
          // Check ownership (only sender can delete for everyone)
          if (message.sender.toString() !== userId) {
            return socket.emit('message-error', { error: 'You can only delete your own messages' });
          }
          
          // Mark as deleted for the user
          if (!message.deletedFor) message.deletedFor = [];
          if (!message.deletedFor.includes(userId)) {
            message.deletedFor.push(userId);
          }
          
          // If deleteForPartner is true and user is the sender
          if (data.deleteForPartner === true && message.sender.toString() === userId) {
            const partnerId = message.receiver.toString();
            if (!message.deletedFor.includes(partnerId)) {
              message.deletedFor.push(partnerId);
            }
            
            // Mark as completely deleted if deleted for both
            if (message.deletedFor.length >= 2) {
              message.isDeleted = true;
              message.content = 'This message was deleted';
              if (message.messageType === 'image') {
                message.imageUrl = null; // Remove image URL if deleted
              }
            }
          }
          
          // Save changes
          if (message.save) {
            await message.save();
          }
          
          updatedMessage = message;
        } else {
          // Use MongoDB
          console.log('Socket delete message: Using MongoDB for message:', data.messageId);
          
          const Message = require('../models/Message');
          message = await Message.findById(data.messageId);
          
          if (!message) {
            return socket.emit('message-error', { error: 'Message not found' });
          }
          
          // Check ownership (only sender can delete for everyone)
          if (message.sender.toString() !== userId) {
            return socket.emit('message-error', { error: 'You can only delete your own messages' });
          }
          
          // Construct update object
          const update = { $addToSet: { deletedFor: userId } };
          
          // If deleteForPartner is true, update for both users
          if (data.deleteForPartner === true) {
            const partnerId = message.receiver.toString();
            update.$addToSet.deletedFor = [userId, partnerId];
            
            update.$set = {
              isDeleted: true,
              content: 'This message was deleted'
            };
            
            if (message.messageType === 'image') {
              update.$set.imageUrl = null;
            }
          }
          
          // Update the message
          updatedMessage = await Message.findByIdAndUpdate(
            data.messageId,
            update,
            { new: true }
          ).populate('sender', 'username displayName profilePicture')
            .populate('receiver', 'username displayName profilePicture');
        }
        
        // Notify both users about the deletion
        const senderId = message.sender.toString();
        const receiverId = message.receiver.toString();
        
        const senderSocket = userSockets.get(senderId);
        const receiverSocket = userSockets.get(receiverId);
        
        const eventData = { messageId: data.messageId, updatedMessage };
        
        if (senderSocket) {
          senderSocket.emit('message-deleted', eventData);
        }
        
        if (receiverSocket && data.deleteForPartner) {
          receiverSocket.emit('message-deleted', eventData);
        }
        
      } catch (error) {
        console.error('Socket delete message error:', error);
        socket.emit('message-error', { error: 'Error deleting message' });
      }
    });
    
    // Handle message seen status
    socket.on('mark-seen', async (data) => {
      try {
        if (!data.messageId) {
          return socket.emit('seen-error', { error: 'Message ID is required' });
        }
        
        let message;
        let receiverId;
        
        // Check if we're using in-memory storage
        if (global.mockMessages !== undefined) {
          console.log('Socket mark seen: Using in-memory storage for message:', data.messageId);
          message = global.mockMessages.find(m => m._id.toString() === data.messageId);
          
          if (message) {
            // In memory storage, check if receiver is an object or ID
            receiverId = typeof message.receiver === 'object' ? 
              message.receiver._id.toString() : message.receiver.toString();
              
            console.log('Message receiver ID:', receiverId);
            console.log('Current user ID:', userId);
          }
        } else {
          console.log('Socket mark seen: Using MongoDB');
          message = await Message.findById(data.messageId);
          
          if (message) {
            receiverId = message.receiver.toString();
          }
        }
        
        // Check if message exists
        if (!message) {
          console.log('Message not found with ID:', data.messageId);
          return socket.emit('seen-error', { error: 'Message not found' });
        }
        
        // Skip ownership validation in development mode
        if (process.env.NODE_ENV === 'development') {
          console.log('Skipping authorization check in development mode');
        } else {
          // Check if the message is sent to the current user
          if (receiverId !== userId) {
            console.log('Authorization failed: Receiver ID does not match current user');
            return socket.emit('seen-error', { error: 'Not authorized to mark this message as seen' });
          }
        }
        
        // Update message
        message.seen = true;
        message.seenAt = new Date();
        console.log('Marking message as seen:', message._id);
        
        if (message.save) {
          await message.save();
          console.log('Message saved with seen status');
        } else {
          // If save method not available, update directly in array
          const messageIndex = global.mockMessages.findIndex(m => m._id.toString() === message._id.toString());
          if (messageIndex !== -1) {
            global.mockMessages[messageIndex] = message;
            console.log('Message updated in memory array');
          }
        }
        
        // Notify sender that message has been seen
        const senderId = typeof message.sender === 'object' ? 
          message.sender._id.toString() : message.sender.toString();
          
        const senderSocket = userSockets.get(senderId);
        if (senderSocket) {
          console.log('Notifying sender about seen message');
          senderSocket.emit('message-seen', { messageId: message._id, seenAt: message.seenAt });
        }
        
      } catch (error) {
        console.error('Socket mark seen error:', error);
        socket.emit('seen-error', { error: 'Error marking message as seen' });
      }
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username} (${userId})`);
      
      // Remove user from active connections
      userSockets.delete(userId);
      
      try {
        // Update user's last active time
        socket.user.lastActive = new Date();
        
        // Check if we're using in-memory storage
        if (socket.user.save) {
          socket.user.save()
            .then(() => {
              // Notify partner that user is offline
              if (socket.user.partnerUserId) {
                const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
                if (partnerSocket) {
                  partnerSocket.emit('partner-status', { isOnline: false });
                }
              }
            })
            .catch(err => console.error('Error updating user last active:', err));
        } else {
          // Fall back to MongoDB if in-memory save not available
          User.findByIdAndUpdate(userId, { lastActive: new Date() })
            .then(() => {
              // Notify partner that user is offline
              if (socket.user.partnerUserId) {
                const partnerSocket = userSockets.get(socket.user.partnerUserId.toString());
                if (partnerSocket) {
                  partnerSocket.emit('partner-status', { isOnline: false });
                }
              }
            })
            .catch(err => console.error('Error updating user last active:', err));
        }
      } catch (err) {
        console.error('Error handling disconnect:', err);
      }
    });
  });
  
  return io;
};
