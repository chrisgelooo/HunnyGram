    # HunnyGram 💌

A private chat app built for couples to share special moments.

## Features

- **Private Messaging**: Just for the two of you
- **Media Sharing**: Send images and videos
- **Typing Indicators**: See when your partner is typing
- **Read Receipts**: Know when your messages have been seen
- **Message Deletion**: Delete messages for yourself or both
- **Mobile Responsive**: Use on any device
- **Dark Mode**: Chat comfortably day or night
- **Custom Profiles**: Set profile pictures and bios

## Tech Stack

- **Frontend**: React with TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: MongoDB
- **Real-time**: Socket.IO
- **Media Storage**: Cloudinary

## Structure

- `/client` - React frontend application
- `/server` - Node.js backend API and socket server
- `DEPLOYMENT.md` - Guide for deploying to Vercel and Render

## Getting Started

### Prerequisites

- Node.js and npm
- MongoDB (local or Atlas)
- Cloudinary account (optional, for production)

### Installation

1. Clone the repository

```bash
git clone https://github.com/yourusername/hunnygram.git
cd hunnygram
```

2. Install backend dependencies

```bash
cd server
npm install
```

3. Set up environment variables
Create a `.env` file in the server directory with:

```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

4. Install frontend dependencies

```bash
cd ../client
npm install
```

5. Run the application

```bash
# Start backend (from server directory)
npm run start

# In another terminal, start frontend (from client directory)
npm run start
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying this app to Vercel and Render.

---

Made with 💖 for your special someone.
