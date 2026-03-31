const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const configuredDataFile = process.env.DATA_FILE;
const dbPath = configuredDataFile
  ? path.resolve(configuredDataFile)
  : path.join(__dirname, 'data.json');

function now() {
  return new Date().toISOString();
}

function createInitialState() {
  const createdAt = now();
  return {
    counters: {
      users: 1,
      products: 0,
      logs: 0,
    },
    users: [
      {
        id: 1,
        username: 'admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        created_at: createdAt,
      },
    ],
    products: [],
    activity_logs: [],
  };
}

function ensureDbFile() {
  const dirPath = path.dirname(dbPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(createInitialState(), null, 2));
  }
}

function readState() {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

function nextId(state, key) {
  state.counters[key] += 1;
  return state.counters[key];
}

ensureDbFile();

module.exports = {
  now,
  readState,
  writeState,
  nextId,
};
