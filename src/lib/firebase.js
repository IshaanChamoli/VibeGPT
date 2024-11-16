import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, getDoc, setDoc, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function calculateAverageEmbedding(embeddings) {
  if (!embeddings || embeddings.length === 0) return null;
  
  const embeddingLength = embeddings[0].length;
  const sumArray = new Array(embeddingLength).fill(0);
  
  embeddings.forEach(embedding => {
    embedding.forEach((value, index) => {
      sumArray[index] += value;
    });
  });
  
  return sumArray.map(sum => sum / embeddings.length);
}

export function normalizeEmbedding(embedding) {
  if (!embedding) return null;
  
  // Calculate the square root of the sum of squares (L2 norm)
  const squareSum = embedding.reduce((sum, val) => sum + val * val, 0);
  const norm = Math.sqrt(squareSum);
  
  // Avoid division by zero
  if (norm === 0) return null;
  
  // Normalize each component
  return embedding.map(val => val / norm);
}

export async function updateUserMainEmbedding(userId) {
  try {
    // First check if user already has a mainEmbedding
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;
    
    const userData = userDoc.data();
    // If mainEmbedding exists, ensure we have new embeddings before updating
    if (userData.mainEmbedding) {
      const embeddingsRef = collection(db, "users", userId, "embeddings");
      const embeddingsSnapshot = await getDocs(embeddingsRef);
      
      if (embeddingsSnapshot.empty) {
        console.warn("No embeddings found, preserving existing mainEmbedding");
        return userData.mainEmbedding;
      }
      
      const embeddings = embeddingsSnapshot.docs.map(doc => doc.data().embedding);
      const averageEmbedding = await calculateAverageEmbedding(embeddings);
      
      if (!averageEmbedding) {
        console.warn("Failed to calculate new embedding, preserving existing mainEmbedding");
        return userData.mainEmbedding;
      }
      
      // Calculate normalized embedding
      const normalizedEmbedding = normalizeEmbedding(averageEmbedding);
      
      await updateDoc(userRef, {
        mainEmbedding: averageEmbedding,
        normalizedEmbedding: normalizedEmbedding,
        lastEmbeddingUpdate: new Date().toISOString()
      });
      
      return averageEmbedding;
    } else {
      // For first-time initialization
      const embeddingsRef = collection(db, "users", userId, "embeddings");
      const embeddingsSnapshot = await getDocs(embeddingsRef);
      
      if (embeddingsSnapshot.empty) {
        console.log("No embeddings yet for new user");
        return null;
      }
      
      const embeddings = embeddingsSnapshot.docs.map(doc => doc.data().embedding);
      const averageEmbedding = await calculateAverageEmbedding(embeddings);
      
      // Calculate normalized embedding
      const normalizedEmbedding = normalizeEmbedding(averageEmbedding);
      
      await updateDoc(userRef, {
        mainEmbedding: averageEmbedding || null,
        normalizedEmbedding: normalizedEmbedding || null,
        lastEmbeddingUpdate: new Date().toISOString()
      });
      
      return averageEmbedding;
    }
  } catch (error) {
    console.error("Error updating main embedding:", error);
    throw error;
  }
}

export function calculateCosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return null;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) {
    return null;
  }

  return dotProduct / (norm1 * norm2);
}

async function checkAndInitializeUser(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Create new user without initial message
      await setDoc(userRef, {
        createdAt: new Date().toISOString(),
        lastEmbeddingUpdate: new Date().toISOString()
      });
      return;
    }

    const userData = userDoc.data();
    if (!userData.mainEmbedding) {
      await updateUserMainEmbedding(userId);
    }
  } catch (error) {
    console.error("Error checking/initializing user:", error);
  }
}
