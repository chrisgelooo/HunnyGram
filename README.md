# 💌 HunnyGram - A Private Couple Chat App

HunnyGram is a real-time private messaging web app built just for you and your special someone. It supports only two users, and includes profile customization, seen indicators, typing status, and image sharing.

## ✨ Features

### 🔐 Authentication
- Secure login & registration (2 users only)
- JWT authentication
- Change password

### 💬 Chat System
- Real-time messaging (Socket.IO)
- Typing indicator
- Seen/Read indicator
- Text & image messages
- Emoji support
- Auto scroll to latest message

### 🖼 Profile Page
- Upload profile picture
- Add profile description/love note
- Display name shown in chat

### 🌗 UI/UX
- Light & Dark mode toggle
- Mobile + desktop responsive
- Modern design using Tailwind CSS

## ⚙️ Tech Stack
- **Frontend**: React + Tailwind CSS + TypeScript
- **Backend**: Node.js + Express + Socket.IO
- **Database**: MongoDB Atlas (with in-memory fallback for development)
- **Hosting**: Vercel (frontend) + Render (backend)
- **Image Hosting**: Cloudinary (Free tier)

## 🚀 Getting Started

### Prerequisites
- Node.js & npm installed

### Installation
Install all dependencies with one command:
```bash
npm run install-all
```

This will install dependencies for the root project, server, and client.

### Running the App
Start both the frontend and backend in development mode:
```bash
npm run dev
```

This will launch:
- Frontend at http://localhost:3000
- Backend at http://localhost:5000

### Development Notes
- The application uses an in-memory MongoDB database in development mode
- Data will not persist between server restarts in development
- For production, update the MongoDB URI in the `.env` file with your MongoDB Atlas connection string
- The app is limited to 2 users only (one couple)

### Using the App
1. Register the first user (this will be you)
2. Register the second user (your partner)
3. The app will automatically link both accounts
4. Start chatting in real-time!

> **Note**: If you encounter a "No partner found" error, you may need to manually link your accounts.
> 
> **Manually Linking Accounts**:
> 1. Register both user accounts
> 2. Use the `/api/auth/link-partner` endpoint with a POST request:
>    ```json
>    {
>      "partnerUsername": "username_of_your_partner"
>    }
>    ```
> 3. Make sure to include your JWT authorization token in the request headers
> 4. After linking, both users will be able to chat with each other

## 📝 Environment Variables
For production, update the following in `server/.env`:
```
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secure_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
CLIENT_URL=http://localhost:3000 (or your production URL)
```

## 🌐 Deployment

### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set the root directory to `client`
3. Set the build command to `npm run build`
4. Add required environment variables

### Backend (Render)
1. Connect your GitHub repository to Render
2. Set the root directory to `server`
3. Set the build command to `npm install`
4. Set the start command to `npm start`
5. Add required environment variables

## 💕 Made with Love
HunnyGram is designed to be a private space for couples to connect and share special moments.
