# Push Notifications Setup

This project uses Firebase Cloud Messaging (FCM) for push notifications and Upstash Redis for storing device tokens.

## Environment Variables

The following variables must be set in your Vercel project:

### 1. Firebase Admin
- `FIREBASE_SERVICE_ACCOUNT`: The full JSON string of your Firebase Service Account key. You can generate this in the Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.

### 2. Upstash Redis
- `UPSTASH_REDIS_REST_URL`: Your Upstash Redis REST URL.
- `UPSTASH_REDIS_REST_TOKEN`: Your Upstash Redis REST Token.

### 3. Internal Security
- `INTERNAL_SECRET`: A long random string used to secure the `/api/notifications/check` endpoint.

## GitHub Actions Secrets

In your GitHub repository, add the following secrets:

- `API_URL`: Your deployed API base URL (e.g., `https://my-dashboard.vercel.app`).
- `INTERNAL_SECRET`: The same secret used in Vercel env.

## Android Setup

1. Ensure `google-services.json` is present in `android/app/`.
2. The `@capacitor/push-notifications` plugin is already configured to use FCM.
3. Build and run the app on an Android device to register for notifications.
