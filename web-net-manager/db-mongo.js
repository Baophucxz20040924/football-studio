const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/football-net?authSource=admin';
const DB_NAME = 'football-net';
const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  ACTIVITY_LOGS: 'activity_logs',
  COUNTERS: 'counters',
};

let client = null;
let database = null;

function now() {
  return new Date().toISOString();
}

function createInitialState() {
  return {
    counters: {
      users: 1,
      products: 0,
      logs: 0,
    },
    users: [],
    products: [],
    activity_logs: [],
  };
}

function normalizeProduct(product) {
  return {
    ...product,
    unit_price: Number(product?.unit_price || 0),
  };
}

function normalizeState(state) {
  const initialState = createInitialState();
  return {
    ...initialState,
    ...state,
    counters: {
      ...initialState.counters,
      ...(state?.counters || {}),
    },
    users: Array.isArray(state?.users) ? state.users : [],
    products: Array.isArray(state?.products) ? state.products.map(normalizeProduct) : [],
    activity_logs: Array.isArray(state?.activity_logs) ? state.activity_logs : [],
  };
}

function stripMongoId(document) {
  if (!document || typeof document !== 'object') {
    return document;
  }
  const { _id, ...rest } = document;
  return rest;
}

async function connect() {
  if (database) {
    return database;
  }

  client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  database = client.db(DB_NAME);

  await database.collection(COLLECTIONS.USERS).createIndex({ username: 1 }, { unique: true });

  return database;
}

async function readState() {
  const db = await connect();
  const [users, products, activityLogs, counterDocs] = await Promise.all([
    db.collection(COLLECTIONS.USERS).find().toArray(),
    db.collection(COLLECTIONS.PRODUCTS).find().toArray(),
    db.collection(COLLECTIONS.ACTIVITY_LOGS).find().toArray(),
    db.collection(COLLECTIONS.COUNTERS).find().toArray(),
  ]);

  const counters = {
    users: 1,
    products: 0,
    logs: 0,
  };

  for (const item of counterDocs) {
    counters[item._id] = Number(item.value || 0);
  }

  return normalizeState({
    counters,
    users: users.map(stripMongoId),
    products: products.map(stripMongoId),
    activity_logs: activityLogs.map(stripMongoId),
  });
}

async function writeState(state) {
  const db = await connect();
  const normalized = normalizeState(state);

  await Promise.all([
    db.collection(COLLECTIONS.USERS).deleteMany({}),
    db.collection(COLLECTIONS.PRODUCTS).deleteMany({}),
    db.collection(COLLECTIONS.ACTIVITY_LOGS).deleteMany({}),
  ]);

  if (normalized.users.length > 0) {
    await db.collection(COLLECTIONS.USERS).insertMany(normalized.users);
  }

  if (normalized.products.length > 0) {
    await db.collection(COLLECTIONS.PRODUCTS).insertMany(normalized.products);
  }

  if (normalized.activity_logs.length > 0) {
    await db.collection(COLLECTIONS.ACTIVITY_LOGS).insertMany(normalized.activity_logs);
  }

  await db.collection(COLLECTIONS.COUNTERS).bulkWrite([
    {
      updateOne: {
        filter: { _id: 'users' },
        update: { $set: { value: Number(normalized.counters.users || 0) } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: 'products' },
        update: { $set: { value: Number(normalized.counters.products || 0) } },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: 'logs' },
        update: { $set: { value: Number(normalized.counters.logs || 0) } },
        upsert: true,
      },
    },
  ]);
}

function nextId(state, key) {
  if (!state.counters || typeof state.counters !== 'object') {
    state.counters = {};
  }
  state.counters[key] = Number(state.counters[key] || 0) + 1;
  return state.counters[key];
}

module.exports = {
  now,
  readState,
  writeState,
  nextId,
  normalizeState,
};
