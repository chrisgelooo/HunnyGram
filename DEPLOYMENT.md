# HunnyGram Deployment Guide

This guide will walk you through deploying HunnyGram to free hosting services:

- Frontend: Vercel (React app)
- Backend: Render (Node.js/Express)
- Database: MongoDB Atlas (already set up)
- Media Storage: Cloudinary (free tier)

## Prerequisites

1. Create accounts on these platforms (all offer free tiers):
   - [Vercel](https://vercel.com/signup)
   - [Render](https://render.com/register)
   - [Cloudinary](https://cloudinary.com/users/register/free) (for image/video hosting)
   - [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) (you mentioned you already have an account)
   - [GitHub](https://github.com/join) (for code hosting)

2. Install these tools:
   - [Git](https://git-scm.com/downloads)
   - [Node.js](https://nodejs.org/) (v14+ recommended)
   - [npm](https://www.npmjs.com/get-npm) (included with Node.js)

## Step 1: Prepare Your Repository

1. Create a GitHub repository for your project if you haven't already.

2. Push your current code to the repository:
   ```bash
   # Initialize Git repository (if not already initialized)
   git init
   
   # Add all files
   git add .
   
   # Commit changes
   git commit -m "Initial commit"
   
   # Add your GitHub repository as remote
   git remote add origin https://github.com/yourusername/hunnygram.git
   
   # Push to GitHub
   git push -u origin main
   ```

## Step 2: Set Up MongoDB Atlas

Since you already have a MongoDB account, follow these steps:

1. Create a new project in MongoDB Atlas (if you haven't already).

2. Build a new cluster (Free tier is sufficient for small projects).

3. Create a database user with read/write permissions:
   - Go to Security > Database Access > Add New Database User
   - Create a username and password (save these securely; you'll need them later)
   - Assign read/write permissions to the user

4. Set up network access:
   - Go to Security > Network Access > Add IP Address
   - Click "Allow Access from Anywhere" or add specific IP addresses

5. Get your connection string:
   - Go to Clusters > Connect > Connect your application
   - Copy the connection string (it will look like: `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`)
   - Replace `<password>` with your actual database user password

## Step 3: Set Up Cloudinary

1. After registering on Cloudinary, go to your dashboard.

2. Note the following credentials (you'll need them for environment variables):
   - Cloud name
   - API Key
   - API Secret

## Step 4: Deploy Backend to Render

1. Log in to [Render](https://render.com/).

2. Click "New" and select "Web Service".

3. Connect your GitHub repository.

4. Configure the service:
   - Name: `hunnygram-backend`
   - Region: Choose the closest to you/your users
   - Branch: `main` (or your default branch)
   - Root Directory: `server` (since your backend is in the server folder)
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Plan: Free

5. Add environment variables (under "Environment" tab):
   ```
   NODE_ENV=production
   PORT=5000
   MONGO_URI=<your-mongodb-connection-string>
   JWT_SECRET=<generate-a-secure-random-string>
   CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
   CLOUDINARY_API_KEY=<your-cloudinary-api-key>
   CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
   CLIENT_URL=<your-frontend-url-on-vercel> (you'll get this after deploying the frontend)
   ```

   Note: For JWT_SECRET, generate a secure random string. You can use a service like [https://passwordsgenerator.net/](https://passwordsgenerator.net/) or run this command:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

6. Click "Create Web Service".   

7. Once deployed, note the URL of your backend service (e.g., `https://hunnygram-backend.onrender.com`).

## Step 5: Deploy Frontend to Vercel

1. First, update the frontend environment variables. Create a `.env` file in the `client` directory:

   ```
   # client/.env
   REACT_APP_API_URL=https://hunnygram-backend.onrender.com/api
   REACT_APP_SOCKET_URL=https://hunnygram-backend.onrender.com
   ```

2. Log in to [Vercel](https://vercel.com).

3. Click "New Project".

4. Import your GitHub repository.

5. Configure the project:
   - Framework Preset: Create React App
   - Root Directory: `client` (since your frontend is in the client folder)
   - Build Command: `npm run build`
   - Output Directory: `build`

6. Add environment variables:
   ```
   REACT_APP_API_URL=https://hunnygram-backend.onrender.com/api
   REACT_APP_SOCKET_URL=https://hunnygram-backend.onrender.com
   ```

7. Click "Deploy".

8. Once deployed, Vercel will give you a URL (e.g., `https://hunnygram.vercel.app`).

9. Go back to your Render backend configuration and update the `CLIENT_URL` environment variable with this URL.

## Step 6: Connect Your Custom Domain (Optional)

If you have a domain from Namecheap:

### Add Domain to Vercel:

1. Go to your Vercel project.
2. Navigate to "Settings" > "Domains".
3. Add your domain (e.g., `hunnygram.com`).
4. Follow the instructions to configure DNS settings.

### Configure Namecheap DNS:

1. Log in to Namecheap.
2. Go to "Domain List" and select your domain.
3. Click "Manage" > "Advanced DNS".
4. Add the DNS records as specified by Vercel:
   - Type: `A`, Host: `@`, Value: Vercel's IP address, TTL: Automatic
   - Type: `CNAME`, Host: `www`, Value: Your Vercel project URL, TTL: Automatic

## Step 7: Test Your Deployment

1. Open your frontend URL in a browser.
2. Create accounts and test messaging, image uploads, video uploads, and deletion features.
3. Verify that everything works as expected.

## Troubleshooting

- **Frontend can't connect to backend**: Check CORS settings and environment variables.
- **Images/videos not uploading**: Verify Cloudinary credentials.
- **Connection issues**: Check network settings in MongoDB Atlas.
- **Socket.io disconnections**: Ensure Render service doesn't sleep (you may need to upgrade to avoid this).

## Maintaining Your App

- **Updating**: Push changes to GitHub, and both Vercel and Render will redeploy automatically.
- **Monitoring**: Both platforms offer basic monitoring for free accounts.
- **Scaling**: Free tiers are limited. Consider paid plans if your app gains significant usage.

---

Congratulations on deploying your HunnyGram app! 💌
