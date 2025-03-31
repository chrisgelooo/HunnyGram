const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video'],
    default: 'text'
  },
  content: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  videoUrl: {
    type: String,
    default: null
  },
  delivered: {
    type: Boolean,
    default: false
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  seen: {
    type: Boolean,
    default: false
  },
  seenAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    // default: Date.now // Removed default, timestamps: true handles createdAt
  },
  isDeleted: { // Flag to indicate if the message content should be hidden
    type: Boolean,
    default: false
  },
  // Tracks who the message is deleted for. If both sender and receiver are in the array,
  // it's effectively deleted for everyone in the conversation.
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Add index for efficient querying of conversation messages
MessageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
