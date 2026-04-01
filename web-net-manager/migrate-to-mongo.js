#!/usr/bin/env node

/**
 * Migration script: data.json → MongoDB
 * Usage: node migrate-to-mongo.js
 * 
 * Environment variables:
 * - MONGODB_URI: MongoDB connection string (default: mongodb://admin:admin123@localhost:27017/football-net)
 * - DRY_RUN: Set to 'true' to preview without modifying (default: false)
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DRY_RUN = process.env.DRY_RUN === 'true';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/football-net';
const DB_NAME = 'football-net';
const DATA_FILE = path.join(__dirname, 'data.json');

const COLLECTIONS = {
  USERS: 'users',
  PRODUCTS: 'products',
  ACTIVITY_LOGS: 'activity_logs',
  COUNTERS: 'counters',
};

async function main() {
  console.log('🚀 Starting migration: data.json → MongoDB\n');
  
  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }

  // Read data.json
  console.log(`📖 Reading ${DATA_FILE}...`);
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`✗ File not found: ${DATA_FILE}`);
    process.exit(1);
  }

  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    console.error('✗ Failed to parse data.json:', error.message);
    process.exit(1);
  }

  const { counters, users, products, activity_logs: logs } = jsonData;
  console.log(`✓ Loaded: ${users?.length || 0} users, ${products?.length || 0} products, ${logs?.length || 0} logs\n`);

  // Connect to MongoDB
  let client;
  try {
    console.log('🔗 Connecting to MongoDB...');
    client = new MongoClient(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    console.log(`✓ Connected to ${MONGO_URI}\n`);
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    console.error('\n💡 Make sure MongoDB is running:');
    console.error('   docker-compose up -d  (if using Docker)');
    process.exit(1);
  }

  try {
    const db = client.db(DB_NAME);

    // Clear existing collections (optional, safely)
    console.log('🗑️  Clearing existing collections...');
    if (!DRY_RUN) {
      for (const collection of Object.values(COLLECTIONS)) {
        const result = await db.collection(collection).deleteMany({});
        if (result.deletedCount > 0) {
          console.log(`  - Deleted ${result.deletedCount} documents from ${collection}`);
        }
      }
    }

    // Migrate counters
    console.log('\n📊 Migrating counters...');
    if (!DRY_RUN) {
      const countersCollection = db.collection(COLLECTIONS.COUNTERS);
      for (const [key, value] of Object.entries(counters)) {
        await countersCollection.updateOne(
          { _id: key },
          { $set: { value } },
          { upsert: true }
        );
        console.log(`  ✓ ${key}: ${value}`);
      }
    } else {
      for (const [key, value] of Object.entries(counters)) {
        console.log(`  ✓ [DRY] ${key}: ${value}`);
      }
    }

    // Migrate users
    console.log('\n👥 Migrating users...');
    if (!DRY_RUN) {
      const usersCollection = db.collection(COLLECTIONS.USERS);
      const usersResult = await usersCollection.insertMany(users || []);
      console.log(`  ✓ Inserted ${usersResult.insertedCount} users`);
    } else {
      console.log(`  ✓ [DRY] Would insert ${users?.length || 0} users`);
      (users || []).slice(0, 3).forEach(u => {
        console.log(`     - ${u.username} (${u.role})`);
      });
      if ((users || []).length > 3) {
        console.log(`     - ... and ${(users || []).length - 3} more`);
      }
    }

    // Migrate products
    console.log('\n📦 Migrating products...');
    if (!DRY_RUN) {
      const productsCollection = db.collection(COLLECTIONS.PRODUCTS);
      const productsResult = await productsCollection.insertMany(products || []);
      console.log(`  ✓ Inserted ${productsResult.insertedCount} products`);
    } else {
      console.log(`  ✓ [DRY] Would insert ${products?.length || 0} products`);
      (products || []).slice(0, 3).forEach(p => {
        console.log(`     - ${p.name} (${p.quantity} ${p.unit})`);
      });
      if ((products || []).length > 3) {
        console.log(`     - ... and ${(products || []).length - 3} more`);
      }
    }

    // Migrate activity logs
    console.log('\n📝 Migrating activity logs...');
    if (!DRY_RUN) {
      const logsCollection = db.collection(COLLECTIONS.ACTIVITY_LOGS);
      const logsResult = await logsCollection.insertMany(logs || []);
      console.log(`  ✓ Inserted ${logsResult.insertedCount} logs`);
    } else {
      console.log(`  ✓ [DRY] Would insert ${logs?.length || 0} logs`);
      (logs || []).slice(0, 3).forEach(l => {
        console.log(`     - ${l.action_type} by user_id ${l.user_id}`);
      });
      if ((logs || []).length > 3) {
        console.log(`     - ... and ${(logs || []).length - 3} more`);
      }
    }

    // Verification
    if (!DRY_RUN) {
      console.log('\n✓ Verifying migration...');
      const stats = {
        users: (await db.collection(COLLECTIONS.USERS).countDocuments()),
        products: (await db.collection(COLLECTIONS.PRODUCTS).countDocuments()),
        logs: (await db.collection(COLLECTIONS.ACTIVITY_LOGS).countDocuments()),
      };
      
      console.log(`  - Users: ${stats.users} / ${(users || []).length}`);
      console.log(`  - Products: ${stats.products} / ${(products || []).length}`);
      console.log(`  - Logs: ${stats.logs} / ${(logs || []).length}`);

      if (stats.users === (users || []).length &&
          stats.products === (products || []).length &&
          stats.logs === (logs || []).length) {
        console.log(`  ✓ All data migrated successfully!\n`);
        console.log('✨ Next steps:');
        console.log('   1. Restart server: pm2 restart football-bot');
        console.log('   2. Update .env to use MongoDB (set USE_MONGODB=true)');
        console.log('   3. Backup data.json before deleting (cp data.json data.json.backup)');
        console.log('   4. View data in Mongo Express: http://server-ip:8081');
      } else {
        console.error('  ✗ Data count mismatch! Migration may have failed.');
        process.exit(1);
      }
    } else {
      console.log('\n📋 DRY RUN completed. No changes made.');
      console.log('   Run without DRY_RUN=true to actually migrate:');
      console.log('   node migrate-to-mongo.js');
    }

  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error('✗ Migration failed:', error);
  process.exit(1);
});
