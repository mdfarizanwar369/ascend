# Google Sign-In Deployment Checklist

Google Sign-In remains controlled by `NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED`.
Do not enable it until every item below is complete.

## Railway Frontend Variables

Set these on the frontend service:

```text
NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED=true
NEXT_PUBLIC_AUTH_DEBUG=false
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=www.getascend.fit
```

Keep the normal Firebase web app values unchanged:

```text
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ascend-b2850
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
```

## Firebase Console

Go to **Firebase Console > Ascend > Authentication > Settings > Authorized domains**.

Confirm these domains are listed:

```text
www.getascend.fit
getascend.fit
ascend-b2850.firebaseapp.com
localhost
```

Go to **Authentication > Sign-in method > Google**.

Confirm:

- Google provider is enabled.
- The support email is correct.
- The project is `ascend-b2850`.

## Google Cloud Console

Go to **Google Cloud Console > APIs & Services > Credentials**.

Open the OAuth 2.0 Web Client used by Firebase Authentication.

Under **Authorized redirect URIs**, confirm these are present:

```text
https://www.getascend.fit/__/auth/handler
https://ascend-b2850.firebaseapp.com/__/auth/handler
```

For local testing, also include:

```text
http://localhost:3000/__/auth/handler
```

## Frontend Auth Helper Proxy

The Next.js app proxies Firebase auth helper routes:

```text
https://www.getascend.fit/__/auth/*
```

to:

```text
https://ascend-b2850.firebaseapp.com/__/auth/*
```

After deployment, verify these URLs do not return 404:

```text
https://www.getascend.fit/__/auth/handler
https://www.getascend.fit/__/auth/iframe
```

## Expected Auth Behaviour

- Desktop browsers use Firebase `signInWithPopup()`.
- iPhone Safari, iPad Safari, Android, and installed PWAs use Firebase `signInWithRedirect()`.
- No Ascend code redirects users to any third-party website before Firebase starts authentication.
- Expected external auth domains are limited to Google Identity, `accounts.google.com`, Firebase auth helper domains, and `www.getascend.fit`.

## Manual Verification

Test in this order:

1. Desktop Chrome signup with Google.
2. Desktop Chrome existing-account login with Google.
3. Android Chrome signup with Google.
4. iPhone Safari signup with Google.
5. Installed PWA signup with Google.
6. Logout and login again using email/password.
7. Trainer signup remains email-only and unchanged.
8. Owner/admin login remains unchanged.

If anything unexpected happens, immediately set:

```text
NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED=false
```

and redeploy the frontend.
