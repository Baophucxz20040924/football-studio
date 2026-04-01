const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require(process.env.USE_MONGODB === 'true' ? './db-mongo' : './db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'food-manager-secret';
const LOG_RETENTION_DAYS = 10;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const REPORT_UTC_OFFSET_MINUTES = Number(process.env.REPORT_UTC_OFFSET_MINUTES || 420);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
  };
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '12h',
  });
}

async function getState() {
  const state = await db.readState();
  const removedCount = pruneOldActivityLogs(state);
  if (removedCount > 0) {
    await saveState(state);
  }
  return state;
}

async function saveState(state) {
  await db.writeState(state);
}

function findUserById(state, id) {
  return state.users.find((user) => user.id === id) || null;
}

function findProductById(state, id) {
  return state.products.find((product) => product.id === id) || null;
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function toBusinessDateKey(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const adjusted = new Date(timestamp + REPORT_UTC_OFFSET_MINUTES * 60 * 1000);
  const year = adjusted.getUTCFullYear();
  const month = String(adjusted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayBusinessDateKey() {
  return toBusinessDateKey(db.now());
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN').format(Number(amount || 0));
}

function getRevenueEntries(state) {
  return state.activity_logs
    .filter((item) => item.action_type === 'PRODUCT_DEDUCT')
    .map((item) => {
      const user = findUserById(state, item.user_id);
      const revenue = Number(item.metadata?.revenue || 0);
      const unitPrice = Number(item.metadata?.unit_price || 0);
      const quantity = Number(item.amount || 0);
      const dateKey = toBusinessDateKey(item.created_at);

      return {
        id: item.id,
        user_id: item.user_id,
        username: user ? user.username : 'unknown',
        role: user ? user.role : 'unknown',
        product_name: item.metadata?.product_name || null,
        product_unit: item.metadata?.product_unit || null,
        quantity,
        unit_price: unitPrice,
        revenue,
        note: item.note,
        created_at: item.created_at,
        date_key: dateKey,
      };
    })
    .filter((item) => item.date_key && item.quantity > 0);
}

function buildRevenueReport(state, currentUser) {
  const entries = getRevenueEntries(state).sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    return rightTime - leftTime;
  });
  const today = getTodayBusinessDateKey();

  if (currentUser.role !== 'admin') {
    const todayEntries = entries.filter((item) => item.user_id === currentUser.id && item.date_key === today);
    const todayRevenue = todayEntries.reduce((sum, item) => sum + item.revenue, 0);

    return {
      scope: 'self',
      today,
      todayRevenue,
      entries: todayEntries,
    };
  }

  const daysMap = new Map();
  let totalRevenue = 0;

  for (const entry of entries) {
    totalRevenue += entry.revenue;
    if (!daysMap.has(entry.date_key)) {
      daysMap.set(entry.date_key, {
        date_key: entry.date_key,
        total_revenue: 0,
        total_quantity: 0,
        users_map: new Map(),
      });
    }

    const dayBucket = daysMap.get(entry.date_key);
    dayBucket.total_revenue += entry.revenue;
    dayBucket.total_quantity += entry.quantity;

    if (!dayBucket.users_map.has(entry.user_id)) {
      dayBucket.users_map.set(entry.user_id, {
        user_id: entry.user_id,
        username: entry.username,
        role: entry.role,
        total_revenue: 0,
        total_quantity: 0,
        entries: [],
      });
    }

    const userBucket = dayBucket.users_map.get(entry.user_id);
    userBucket.total_revenue += entry.revenue;
    userBucket.total_quantity += entry.quantity;
    userBucket.entries.push(entry);
  }

  const days = [...daysMap.values()].map((day) => ({
    date_key: day.date_key,
    total_revenue: day.total_revenue,
    total_quantity: day.total_quantity,
    users: [...day.users_map.values()].sort((left, right) => right.total_revenue - left.total_revenue),
  }));

  days.sort((left, right) => right.date_key.localeCompare(left.date_key));

  const todaySummary = days.find((item) => item.date_key === today) || {
    date_key: today,
    total_revenue: 0,
    total_quantity: 0,
    users: [],
  };

  return {
    scope: 'admin',
    retention_days: LOG_RETENTION_DAYS,
    today,
    totalRevenue,
    totalDays: days.length,
    todayRevenue: todaySummary.total_revenue,
    days,
  };
}

function pruneOldActivityLogs(state) {
  if (!Array.isArray(state.activity_logs) || state.activity_logs.length === 0) {
    return 0;
  }

  const cutoff = Date.now() - LOG_RETENTION_MS;
  const previousLength = state.activity_logs.length;
  state.activity_logs = state.activity_logs.filter((item) => {
    const timestamp = Date.parse(item.created_at);
    if (Number.isNaN(timestamp)) {
      return true;
    }
    return timestamp >= cutoff;
  });

  return previousLength - state.activity_logs.length;
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

async function logActivity({ userId, actionType, productId = null, amount = null, note = null, metadata = null }) {
  const state = await getState();
  state.activity_logs.push({
    id: db.nextId(state, 'logs'),
    user_id: userId,
    action_type: actionType,
    product_id: productId,
    amount,
    note,
    metadata,
    created_at: db.now(),
  });
  await saveState(state);
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  const state = await getState();
  const user = state.users.find((item) => item.username === username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Không có tên đăng nhập hoặc mật khẩu không đúng' });
  }

  await logActivity({
    userId: user.id, 
    actionType: 'LOGIN',
    metadata: { username: user.username, role: user.role },
  });

  return res.json({
    token: createToken(user),
    user: sanitizeUser(user),
  });
});

app.get('/api/me', authenticate, async (req, res) => {
  const state = await getState();
  const user = findUserById(state, req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/products', authenticate, async (req, res) => {
  const state = await getState();
  const products = [...state.products].sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  return res.json({ products });
});

app.post('/api/products', authenticate, requireAdmin, async (req, res) => {
  const { name, unit, quantity, unit_price: unitPrice } = req.body || {};
  if (!name || !unit || quantity === undefined || unitPrice === undefined) {
    return res.status(400).json({ message: 'Name, unit, quantity and unit price are required' });
  }

  const parsedQuantity = parseNonNegativeInteger(quantity);
  const parsedUnitPrice = parseNonNegativeInteger(unitPrice);
  if (parsedQuantity === null) {
    return res.status(400).json({ message: 'Quantity must be a non-negative integer' });
  }
  if (parsedUnitPrice === null) {
    return res.status(400).json({ message: 'Unit price must be a non-negative integer' });
  }

  const state = await getState();
  const product = {
    id: db.nextId(state, 'products'),
    name: name.trim(),
    unit: unit.trim(),
    quantity: parsedQuantity,
    unit_price: parsedUnitPrice,
    created_at: db.now(),
    updated_at: db.now(),
  };
  state.products.push(product);
  await saveState(state);
  await logActivity({
    userId: req.user.id,
    actionType: 'PRODUCT_CREATE',
    productId: product.id,
    amount: parsedQuantity,
    note: `Created product ${product.name}`,
  });

  return res.status(201).json({ product });
});

app.put('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, unit, quantity, unit_price: unitPrice } = req.body || {};
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }
  if (!name || !unit || quantity === undefined || unitPrice === undefined) {
    return res.status(400).json({ message: 'Name, unit, quantity and unit price are required' });
  }

  const parsedQuantity = parseNonNegativeInteger(quantity);
  const parsedUnitPrice = parseNonNegativeInteger(unitPrice);
  if (parsedQuantity === null) {
    return res.status(400).json({ message: 'Quantity must be a non-negative integer' });
  }
  if (parsedUnitPrice === null) {
    return res.status(400).json({ message: 'Unit price must be a non-negative integer' });
  }

  const state = await getState();
  const existing = findProductById(state, productId);
  if (!existing) {
    return res.status(404).json({ message: 'Product not found' });
  }

  const before = {
    name: existing.name,
    unit: existing.unit,
    quantity: existing.quantity,
    unit_price: Number(existing.unit_price || 0),
  };
  existing.name = name.trim();
  existing.unit = unit.trim();
  existing.quantity = parsedQuantity;
  existing.unit_price = parsedUnitPrice;
  existing.updated_at = db.now();
  await saveState(state);

  const product = findProductById(state, productId);
  await logActivity({
    userId: req.user.id,
    actionType: 'PRODUCT_UPDATE',
    productId,
    amount: parsedQuantity,
    note: `Updated product ${product.name}`,
    metadata: {
      before,
      after: {
        name: product.name,
        unit: product.unit,
        quantity: product.quantity,
        unit_price: Number(product.unit_price || 0),
      },
    },
  });

  return res.json({ product });
});

app.delete('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }

  const state = await getState();
  const existing = findProductById(state, productId);
  if (!existing) {
    return res.status(404).json({ message: 'Product not found' });
  }

  state.products = state.products.filter((product) => product.id !== productId);
  await saveState(state);
  await logActivity({
    userId: req.user.id,
    actionType: 'PRODUCT_DELETE',
    productId,
    amount: existing.quantity,
    note: `Deleted product ${existing.name}`,
  });

  return res.json({ success: true });
});

app.post('/api/products/:id/deduct', authenticate, async (req, res) => {
  const productId = Number(req.params.id);
  const { amount, note } = req.body || {};
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ message: 'Invalid product id' });
  }

  const parsedAmount = Number(amount);
  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Deduction amount must be a positive integer' });
  }
  if (!note || !String(note).trim()) {
    return res.status(400).json({ message: 'A note is required when deducting stock' });
  }

  const state = await getState();
  const product = findProductById(state, productId);
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }
  if (product.quantity < parsedAmount) {
    return res.status(400).json({ message: 'Insufficient stock' });
  }

  const previousQuantity = product.quantity;
  const revenue = parsedAmount * Number(product.unit_price || 0);
  product.quantity -= parsedAmount;
  product.updated_at = db.now();
  await saveState(state);

  const updatedProduct = findProductById(state, productId);
  await logActivity({
    userId: req.user.id,
    actionType: 'PRODUCT_DEDUCT',
    productId,
    amount: parsedAmount,
    note: String(note).trim(),
    metadata: {
      previousQuantity,
      currentQuantity: updatedProduct.quantity,
      unit_price: Number(product.unit_price || 0),
      revenue,
      product_name: product.name,
      product_unit: product.unit,
    },
  });

  return res.json({ product: updatedProduct, revenue });
});

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  const state = await getState();
  const users = [...state.users]
    .sort((left, right) => right.id - left.id)
    .map((user) => sanitizeUser(user));
  return res.json({ users });
});

app.post('/api/users', authenticate, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) {
    return res.status(400).json({ message: 'Username, password and role are required' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Role must be admin or user' });
  }

  const state = await getState();
  const existing = state.users.find((user) => user.username === username.trim());
  if (existing) {
    return res.status(409).json({ message: 'Username already exists' });
  }

  const user = {
    id: db.nextId(state, 'users'),
    username: username.trim(),
    password_hash: bcrypt.hashSync(password, 10),
    role,
    created_at: db.now(),
  };
  state.users.push(user);
  await saveState(state);
  await logActivity({
    userId: req.user.id,
    actionType: 'USER_CREATE',
    note: `Created account ${user.username}`,
    metadata: sanitizeUser(user),
  });

  return res.status(201).json({ user: sanitizeUser(user) });
});

// Admin update user (password, role)
app.put('/api/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { password, role } = req.body || {};
  const state = await getState();
  const user = state.users.find((u) => String(u.id) === String(id));
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  let changed = false;
  if (role && ['admin', 'user'].includes(role) && user.role !== role) {
    user.role = role;
    changed = true;
  }
  if (password && password.length >= 4) {
    user.password_hash = bcrypt.hashSync(password, 10);
    changed = true;
  }
  if (!changed) {
    return res.status(400).json({ message: 'No valid changes (need password >= 4 ký tự hoặc role khác)' });
  }
  await saveState(state);
  await logActivity({
    userId: req.user.id,
    actionType: 'USER_UPDATE',
    note: `Updated account ${user.username}`,
    metadata: sanitizeUser(user),
  });
  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/revenue-report', authenticate, async (req, res) => {
  const state = await getState();
  const report = buildRevenueReport(state, req.user);
  return res.json(report);
});

app.get('/api/activity-logs', authenticate, requireAdmin, async (req, res) => {
  const state = await getState();
  const logs = [...state.activity_logs]
    .sort((left, right) => {
      const leftTime = Date.parse(left.created_at);
      const rightTime = Date.parse(right.created_at);
      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return right.id - left.id;
    })
    .map((item) => {
      const user = findUserById(state, item.user_id);
      const product = item.product_id ? findProductById(state, item.product_id) : null;
      return {
        id: item.id,
        action_type: item.action_type,
        amount: item.amount,
        note: item.note,
        created_at: item.created_at,
        metadata: item.metadata || null,
        username: user ? user.username : 'unknown',
        role: user ? user.role : 'unknown',
        product_name: product ? product.name : null,
        product_unit: product ? product.unit : null,
      };
    });

  return res.json({ logs });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Food manager app is running on http://localhost:${PORT}`);
});
