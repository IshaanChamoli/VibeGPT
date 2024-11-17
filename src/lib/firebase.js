import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc, getDoc, setDoc, addDoc, runTransaction } from 'firebase/firestore';

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

export async function calculateAverageEmbedding(embeddings, timestamps) {
  if (!embeddings || embeddings.length === 0) return null;
  
  const { recencyImportance } = await getPlatformStats();
  
  const sortedPairs = embeddings.map((embedding, index) => ({
    embedding,
    timestamp: timestamps[index]
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  const embeddingLength = sortedPairs[0].embedding.length;
  const weightedSum = new Array(embeddingLength).fill(0);
  let totalWeight = 0;
  
  sortedPairs.forEach(({ embedding }, index) => {
    const weight = Math.exp(-recencyImportance * index * 0.2);
    totalWeight += weight;
    
    embedding.forEach((value, dim) => {
      weightedSum[dim] += value * weight;
    });
  });
  
  return weightedSum.map(sum => sum / totalWeight);
}

export function normalizeEmbedding(embedding) {
  if (!embedding) return null;
  
  const squareSum = embedding.reduce((sum, val) => sum + val * val, 0);
  const norm = Math.sqrt(squareSum);
  
  if (norm === 0) return null;
  
  return embedding.map(val => val / norm);
}

export async function updateUserMainEmbedding(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;
    
    const userData = userDoc.data();
    const embeddingsRef = collection(db, "users", userId, "embeddings");
    const embeddingsSnapshot = await getDocs(embeddingsRef);
    
    if (embeddingsSnapshot.empty) {
      console.warn("No embeddings found");
      return userData.mainEmbedding;
    }
    
    const embeddings = [];
    const timestamps = [];
    embeddingsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      embeddings.push(data.embedding);
      timestamps.push(data.timestamp);
    });
    
    const averageEmbedding = await calculateAverageEmbedding(embeddings, timestamps);
    
    if (!averageEmbedding) {
      console.warn("Failed to calculate new embedding");
      return userData.mainEmbedding;
    }
    
    const normalizedEmbedding = normalizeEmbedding(averageEmbedding);
    
    await updateDoc(userRef, {
      mainEmbedding: averageEmbedding,
      normalizedEmbedding: normalizedEmbedding,
      lastEmbeddingUpdate: new Date().toISOString()
    });
    
    return averageEmbedding;
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

async function initializePlatformStats() {
  try {
    const statsRef = doc(db, "stats", "platform_stats");
    const statsDoc = await getDoc(statsRef);
    
    if (!statsDoc.exists()) {
      await setDoc(statsRef, {
        totalUsers: 0,
        recencyImportance: 1,
        lastUpdated: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Error initializing platform stats:", error);
  }
}

async function incrementTotalUsers() {
  try {
    const statsRef = doc(db, "stats", "platform_stats");
    
    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      const currentStats = statsDoc.exists() ? statsDoc.data() : { totalUsers: 0 };
      const newTotalUsers = (currentStats.totalUsers || 0) + 1;
      
      const newRecencyImportance = Math.exp(-0.05 * Math.pow(Math.log10(newTotalUsers), 3.3));
      
      transaction.set(statsRef, {
        totalUsers: newTotalUsers,
        recencyImportance: newRecencyImportance,
        lastUpdated: new Date().toISOString()
      });
    });
  } catch (error) {
    console.error("Error incrementing total users:", error);
  }
}

async function getPlatformStats() {
  try {
    const statsRef = doc(db, "stats", "platform_stats");
    const statsDoc = await getDoc(statsRef);
    
    if (statsDoc.exists()) {
      return statsDoc.data();
    }
    
    return {
      totalUsers: 0,
      recencyImportance: 1,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error getting platform stats:", error);
    return {
      totalUsers: 0,
      recencyImportance: 1,
      lastUpdated: new Date().toISOString()
    };
  }
}

export {
  initializePlatformStats,
  incrementTotalUsers,
  getPlatformStats
};






/* USED FOR DYNAMIC WEIGHTED AVERAGE based on platform size
TASK: Implement a dynamic weighted average system for user embeddings that automatically adjusts based on platform size.

1. PLATFORM STATS TRACKING
- Create a 'stats' collection in Firebase with document ID 'platform_stats'
- Track:
  * totalUsers (number)
  * recencyImportance (number)
  * lastUpdated (timestamp)
- Initialize with:
  * totalUsers: 0
  * recencyImportance: 1 (maximum importance for new platform)

2. RECENCY IMPORTANCE CALCULATION
- Formula: recencyImportance = 1 / (1 + Math.log10(totalUserCount + 1))
- This gives us:
  * 10 users → ~0.95
  * 100 users → ~0.60
  * 1000 users → ~0.15
  * 10000 users → ~0.02

3. WEIGHT CALCULATION FOR EMBEDDINGS
- Sort embeddings by timestamp (newest first)
- For each embedding at index i:
  weight = 1 / (1 + (index * recencyImportance * 1.35))
- This gives approximately:
  * Newest embedding: 1.000 (100%)
  * Second embedding: 0.750 (75%) [with max recencyImportance]
  * Subsequent embeddings decay more gradually
- As platform grows, weights become more equal

4. REQUIRED FUNCTIONS
a) initializePlatformStats()
   - Check if stats document exists
   - If not, create with initial values

b) incrementTotalUsers()
   - Increment totalUsers
   - Recalculate and update recencyImportance
   - Update lastUpdated

c) getPlatformStats()
   - Retrieve current stats
   - Return default values if not found

d) calculateAverageEmbedding(embeddings, timestamps)
   - Get recencyImportance from platform stats
   - Sort embeddings by timestamp
   - Apply weight formula
   - Return weighted average

e) updateUserMainEmbedding(userId)
   - Get user's embeddings with timestamps
   - Calculate weighted average
   - Update user's mainEmbedding and normalizedEmbedding

5. INTEGRATION POINTS
- Call incrementTotalUsers() when new user signs up
- Call initializePlatformStats() at app startup
- Ensure all embedding storage includes timestamps

6. DATA STRUCTURE
embeddings collection document:
{
  embedding: number[],
  timestamp: string (ISO date),
  analysisId: string,
  analysisPath: string
}

stats document:
{
  totalUsers: number,
  recencyImportance: number,
  lastUpdated: string (ISO date)
}

Please implement these functions in src/lib/firebase.js while maintaining existing functionality for normalizedEmbedding and other features.
*/
