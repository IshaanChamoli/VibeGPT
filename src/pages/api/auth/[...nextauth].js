import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        console.log("Attempting to store user:", {
          id: profile.sub,
          name: user.name,
          email: user.email
        });

        // Use profile.sub as the user ID (this is the Google user ID)
        await setDoc(doc(db, "users", profile.sub), {
          name: user.name,
          email: user.email,
          image: user.image,
          lastSignIn: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          provider: account.provider,
          googleId: profile.sub // Store the Google ID explicitly
        }, { merge: true });
        
        console.log("Successfully stored user in Firebase");
        return true;
      } catch (error) {
        console.error("Error storing user in Firebase:", error);
        // Log more details about the error
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        return true;
      }
    },
    async session({ session, token }) {
      // Ensure the ID is properly passed to the session
      session.user.id = token.sub;
      return session;
    },
    async jwt({ token, account, profile }) {
      // Pass the provider's user ID to the token
      if (account) {
        token.sub = profile.sub;
      }
      return token;
    }
  },
  debug: true, // Enable debug messages
}); 