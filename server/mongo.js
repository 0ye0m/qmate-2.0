/**
 * MongoDB connection singleton for the Q-Mate 2.0 data API.
 * Connection string comes from MONGODB_URI in qmate-2.0/.env (gitignored).
 */
import { MongoClient } from 'mongodb';

let client = null;
let dbHandle = null;

export function mongoConfigured() {
  return Boolean(process.env.MONGODB_URI);
}

export async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set — add it to qmate-2.0/.env (see .env.example)');
  }
  const dbName = process.env.MONGODB_DB || 'qmate';
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      appName: 'qmate-2.0',
    });
    await client.connect();
  }
  if (!dbHandle) {
    dbHandle = client.db(dbName);
  }
  return dbHandle;
}

export function getDb() {
  if (!dbHandle) throw new Error('MongoDB not connected yet');
  return dbHandle;
}

export async function mongoPing() {
  const db = getDb();
  await db.command({ ping: 1 });
  return true;
}
