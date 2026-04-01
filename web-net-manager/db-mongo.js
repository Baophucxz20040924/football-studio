// MongoDB adapter module
// Usage: const db = require('./db-mongo')
// Requires MONGODB_URI env var or will connect to default localhost:27017

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/football-net';
const DB_NAME = 'football-net';
const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  ACTIVITY_LOGS: 'activity_logs',
  COUNTERS: 'counters',
};

let client = null;
let db = null;

async function connect() {
  if (db) return db;
  
  try {
    client = new MongoClient(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✓ Connected to MongoDB:', DB_NAME);
    
    // Create collections and indexes
    await initializeCollections();
    return db;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    throw error;
  }
}

async function initializeCollections() {
  try {
    // Create indexes for better performance
    const users = db.collection(COLLECTIONS.USERS);
    await users.createIndex({ username: 1 }, { unique: true });
    
    const counters = db.collection(COLLECTIONS.COUNTERS);
    await counters.updateOne(
      { _id: 'users' },
      { $setOnInsert: { value: 1 } },
      { upsert: true }
    );
    await counters.updateOne(
      { _id: 'products' },
      { $setOnInsert: { value: 0 } },
      { upsert: true }
    );
    await counters.updateOne(
      { _id: 'logs' },
      { $setOnInsert: { value: 0 } },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error initializing collections:', error.message);
  }
}

async function getNextId(counterName) {
  const counters = db.collection(COLLECTIONS.COUNTERS);
  const result = await counters.findOneAndUpdate(
    { _id: counterName },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  return result.value.value;
}

async function readState() {
  await connect();
  
  const [users, products, logs, counters] = await Promise.all([
    db.collection(COLLECTIONS.USERS).find().toArray(),
    db.collection(COLLECTIONS.PRODUCTS).find().toArray(),
    db.collection(COLLECTIONS.ACTIVITY_LOGS).find().toArray(),
    db.collection(COLLECTIONS.COUNTERS).find().toArray(),
  ]);

  const counterMap = {};
  counters.forEach(c => {
    counterMap[c._id] = c.value;
  });

  // Normalize ObjectId to numeric id for API compatibility
  return {
    counters: {
      users: counterMap.users || 1,
      products: counterMap.products || 0,
      logs: counterMap.logs || 0,
    },
    users: normalizeMongoUser(users),
    products: normalizeMongoProduct(products),
    activity_logs: normalizeMongoDocs(logs),
  };
}

function normalizeMongoUser(users) {
  return users.map(u => ({
    id: u.id || ObjectId(u._id).getTimestamp().getTime(),
    username: u.username,
    password_hash: u.password_hash,
    role: u.role || 'user',
    created_at: u.created_at || new Date().toISOString(),
  }));
}

function normalizeMongoProduct(products) {
  return products.map(p => ({
    id: p.id || ObjectId(p._id).getTimestamp().getTime(),
    name: p.name,
    unit: p.unit,
    quantity: p.quantity,
    unit_price: Number(p.unit_price || 0),
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  }));
}

function normalizeMongoDocs(docs) {
  return docs.map(d => ({
    id: d.id || ObjectId(d._id).getTimestamp().getTime(),
    user_id: d.user_id,
    action_type: d.action_type,
    product_id: d.product_id || null,
    amount: d.amount || null,
    note: d.note || null,
    metadata: d.metadata || {},
    created_at: d.created_at || new Date().toISOString(),
  }));
}

async function createUser(userObj) {
  await connect();
  const users = db.collection(COLLECTIONS.USERS);
  const id = await getNextId('users');
  
  const doc = {
    id,
    username: userObj.username,
    password_hash: userObj.password_hash,
    role: userObj.role || 'user',
    created_at: userObj.created_at || new Date().toISOString(),
  };
  
  await users.insertOne(doc);
  return doc;
}

async function createProduct(productObj) {
  await connect();
  const products = db.collection(COLLECTIONS.PRODUCTS);
  const id = await getNextId('products');
  
  const doc = {
    id,
    name: productObj.name,
    unit: productObj.unit,
    quantity: productObj.quantity,
    unit_price: Number(productObj.unit_price || 0),
    created_at: productObj.created_at || new Date().toISOString(),
    updated_at: productObj.updated_at || new Date().toISOString(),
  };
  
  await products.insertOne(doc);
  return doc;
}

async function updateProduct(id, updates) {
  await connect();
  const products = db.collection(COLLECTIONS.PRODUCTS);
  
  const doc = {
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  await products.updateOne({ id }, { $set: doc });
  return await products.findOne({ id });
}

async function deleteProduct(id) {
  await connect();
  const products = db.collection(COLLECTIONS.PRODUCTS);
  await products.deleteOne({ id });
}

async function deleteActivityLogsOlderThan(date) {
  await connect();
  const logs = db.collection(COLLECTIONS.ACTIVITY_LOGS);
  await logs.deleteMany({ created_at: { $lt: date.toISOString() } });
}

async function createActivityLog(logObj) {
  await connect();
  const logs = db.collection(COLLECTIONS.ACTIVITY_LOGS);
  const id = await getNextId('logs');
  
  const doc = {
    id,
    user_id: logObj.user_id,
    action_type: logObj.action_type,
    product_id: logObj.product_id || null,
    amount: logObj.amount || null,
    note: logObj.note || null,
    metadata: logObj.metadata || {},
    created_at: logObj.created_at || new Date().toISOString(),
  };
  
  await logs.insertOne(doc);
  return doc;
}

async function disconnect() {
  if (client) {
    await client.close();
    console.log('Disconnected from MongoDB');
    client = null;
    db = null;
  }
}

module.exports = {
  // Connection
  connect,
  disconnect,
  
  // Read/Write compatibility
  readState,
  
  // CRUD
  createUser,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteActivityLogsOlderThan,
  createActivityLog,
  
  // Utils
  now: () => new Date().toISOString(),
};
