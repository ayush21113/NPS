# How to Generate your NPS Android App (.apk)

To get a downloadable `.apk` file that you can send on WhatsApp and install on your phone, follow these exact steps.

### 1. The Pre-requisite (Very Important)
A mobile app on your phone cannot talk to `localhost` on your laptop. 
1. You **must** host your backend code online (e.g., on Render.com or Railway.app).
2. Once you have your live URL (e.g., `https://nps-onboarding.onrender.com`), update it in `frontend/app.js` inside the `OnboardingAPI` constructor.

---

### 2. The "No-Code" way to get your APK (Fastest)

1. **Push your code to GitHub**: Create a repository and upload all your files there.
2. Go to **[PWABuilder.com](https://www.pwabuilder.com/)**.
3. Paste your GitHub URL or your hosted website URL.
4. Click **"Build My App"**.
5. Select **Android** and download the `.zip` file.
6. Inside the zip, you will find a `.apk` file. 
7. Send this file to your WhatsApp!

---

### 3. The "Developer" way to get your APK (Standard)

If you have **Android Studio** installed on your laptop:

1. Open your terminal in the project root.
2. Run these commands:
   ```bash
   npm install
   npx cap add android
   npx cap sync
   npx cap open android
   ```
3. **Android Studio** will open.
4. Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. Once finished, a notification will pop up. Click **"locate"** to find your `.apk` file.
6. Drag and drop that file into WhatsApp Web on your laptop.

---

### Why this is better than a simple link:
- **Offline Access**: The app will stay on your phone even if you close the browser.
- **Splash Screen**: It shows the NPS logo when it starts.
- **Hardware Integration**: It can better handle the Camera for the AI Smart Scan.
