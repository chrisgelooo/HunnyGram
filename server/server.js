require('dotenv').config();

// Ensure we're in development mode when running locally
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  console.log('Setting NODE_ENV to development mode');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// In this simplified version, we'll use a pure in-memory approach without MongoDB
// This is just for development and testing

const setupMemoryStorage = () => {
  console.log('Setting up pure in-memory storage for development...');
  console.log('Note: All data will be lost when the server restarts.');
  
  // Simple in-memory storage
  global.mockUsers = [];
  global.mockMessages = [];
  
  return false; // Indicates we're not using real MongoDB
};

// Mock MongoDB connection function
const connectDB = async () => {
  try {
    // For production, try to connect to MongoDB Atlas
    if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI.includes('<your_username>')) {
      try {
        // Normal MongoDB Atlas connection
        await mongoose.connect(process.env.MONGO_URI, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000
        });
        console.log('Connected to MongoDB Atlas');
        return true;
      } catch (err) {
        console.error('MongoDB connection error:', err);
        if (process.env.NODE_ENV === 'production') {
          throw new Error('Cannot run in production without MongoDB connection');
        }
      }
    }
    
    // For development, use the in-memory approach
    return setupMemoryStorage();
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
};

// Connect to database or handle mock data
(async () => {
  const connected = await connectDB();
  
  // If we couldn't connect to MongoDB or set up in-memory MongoDB, 
  // provide mock functions for development testing
  if (!connected) {
    console.log('Setting up local memory mock data...');
    
    // Simple in-memory storage (will be lost on server restart)
    global.mockUsers = [];
    global.mockMessages = [];
    
    // Mock the User model
    mongoose.models.User = {
      findOne: async (query) => {
        console.log('Mock User.findOne called with:', query);
        if (query.username) {
          return global.mockUsers.find(u => u.username === query.username);
        }
        return global.mockUsers[0];
      },
      findById: async (id) => {
        console.log('Mock User.findById called with:', id);
        return global.mockUsers.find(u => u._id.toString() === id.toString());
      },
      countDocuments: async () => {
        console.log('Mock User.countDocuments called');
        return global.mockUsers.length;
      }
    };
    
    // Add constructor to create new users
    const mockObjectId = () => Math.random().toString(36).substring(2, 15);
    
    mongoose.models.User.prototype = {};
    global.User = function(data) {
      this._id = mockObjectId();
      this.username = data.username;
      this.displayName = data.displayName;
      this.password = data.password; // In a real app, this would be hashed
      this.profilePicture = data.profilePicture || 'https://res.cloudinary.com/demo/image/upload/v1580125392/default-profile_hdtqso.png';
      this.bio = data.bio || '';
      this.partnerUserId = data.partnerUserId || null;
      this.createdAt = new Date();
      this.lastActive = new Date();
      
      this.comparePassword = async function(candidatePassword) {
        return this.password === candidatePassword;
      };
      
      this.save = async function() {
        const existingUserIndex = global.mockUsers.findIndex(u => u._id === this._id);
        if (existingUserIndex >= 0) {
          global.mockUsers[existingUserIndex] = this;
        } else {
          global.mockUsers.push(this);
        }
        return this;
      };
      
      this.toJSON = function() {
        const obj = { ...this };
        delete obj.password;
        return obj;
      };
      
      this.toObject = function() {
        return { ...this };
      };
    };
    
    mongoose.models.User.create = async function(data) {
      const user = new global.User(data);
      await user.save();
      return user;
    };
    
    // Similar mock for Message model
    mongoose.models.Message = {
      find: async (query) => {
        console.log('Mock Message.find called with:', query);
        if (query.$or) {
          return {
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  populate: () => ({
                    populate: () => global.mockMessages.filter(m => {
                      return query.$or.some(condition => {
                        return (m.sender === condition.sender && m.receiver === condition.receiver) ||
                               (m.sender === condition.receiver && m.receiver === condition.sender);
                      });
                    })
                  })
                })
              })
            })
          };
        }
        return {
          sort: () => ({
            skip: () => ({
              limit: () => ({
                populate: () => ({
                  populate: () => []
                })
              })
            })
          })
        };
      },
      findById: async (id) => {
        console.log('Mock Message.findById called with:', id);
        return global.mockMessages.find(m => m._id.toString() === id.toString());
      },
      countDocuments: async () => {
        console.log('Mock Message.countDocuments called');
        return global.mockMessages.length;
      },
      updateMany: async (query, update) => {
        console.log('Mock Message.updateMany called');
        return { nModified: 0 };
      }
    };
    
    global.Message = function(data) {
      this._id = mockObjectId();
      this.sender = data.sender;
      this.receiver = data.receiver;
      this.messageType = data.messageType || 'text';
      this.content = data.content;
      this.imageUrl = data.imageUrl || null;
      this.seen = data.seen || false;
      this.seenAt = data.seenAt || null;
      this.createdAt = new Date();
      
      this.save = async function() {
        const existingMsgIndex = global.mockMessages.findIndex(m => m._id === this._id);
        if (existingMsgIndex >= 0) {
          global.mockMessages[existingMsgIndex] = this;
        } else {
          global.mockMessages.push(this);
        }
        return this;
      };
      
      this.populate = async function() {
        return this;
      };
    };
    
    mongoose.models.Message.create = async function(data) {
      const message = new global.Message(data);
      await message.save();
      return message;
    };
  }
})();

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

// Socket.IO implementation
const { io: socketInstance, userSockets } = require('./sockets/chat')(io); // Get io and userSockets map

// Make io and userSockets available to routes via req.app
app.set('socketio', socketInstance);
app.set('userSockets', userSockets);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Server error',
    error: process.env.NODE_ENV === 'production' ? {} : err
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
