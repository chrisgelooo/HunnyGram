const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for media uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Different file filters for different media types
const imageFileFilter = (req, file, cb) => {
  // Accept only image files
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

const videoFileFilter = (req, file, cb) => {
  // Accept only video files
  if (!file.originalname.match(/\.(mp4|webm|ogg|mov)$/)) {
    return cb(new Error('Only video files are allowed!'), false);
  }
  cb(null, true);
};

// Create different uploaders for different media types
const imageUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB size limit for images
  },
  fileFilter: imageFileFilter
});

const videoUpload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB size limit for videos
  },
  fileFilter: videoFileFilter
});

// All routes require authentication
router.use(auth);

// Message routes
router.get('/', messageController.getMessages);
router.post('/', messageController.sendMessage);
router.post('/image', imageUpload.single('image'), messageController.sendImageMessage);
router.post('/video', videoUpload.single('video'), messageController.sendVideoMessage);
router.put('/:messageId/seen', messageController.markAsSeen);
router.get('/unread/count', messageController.getUnreadCount);
router.delete('/:messageId', messageController.deleteMessage); // Add delete route

module.exports = router;
