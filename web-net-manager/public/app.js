const state = {
  token: localStorage.getItem('token') || '',
  user: null,
  products: [],
  users: [],
  revenueReport: null,
};

const elements = {
  authPanel: document.getElementById('auth-panel'),
  dashboardPanel: document.getElementById('dashboard-panel'),
  loginForm: document.getElementById('login-form'),
  authStatus: document.getElementById('auth-status'),
  dashboardStatus: document.getElementById('dashboard-status'),
  welcomeTitle: document.getElementById('welcome-title'),
  roleSummary: document.getElementById('role-summary'),
  activityPageLinkWrap: document.getElementById('activity-page-link-wrap'),
  revenuePageLinkWrap: document.getElementById('revenue-page-link-wrap'),
  logoutButton: document.getElementById('logout-button'),
  adminSections: document.getElementById('admin-sections'),
  adminUsersSection: document.getElementById('admin-users-section'),
  productForm: document.getElementById('product-form'),
  userForm: document.getElementById('user-form'),
  resetProductForm: document.getElementById('reset-product-form'),
  productsTableBody: document.getElementById('products-table-body'),
  usersTableBody: document.getElementById('users-table-body'),
  deductForm: document.getElementById('deduct-form'),
  deductProduct: document.getElementById('deduct-product'),
  deductPriceHint: document.getElementById('deduct-price-hint'),
  productCount: document.getElementById('product-count'),
  actionsHead: document.getElementById('actions-head'),
  dashboardMetrics: document.getElementById('dashboard-metrics'),
  metricPrimaryLabel: document.getElementById('metric-primary-label'),
  metricPrimaryValue: document.getElementById('metric-primary-value'),
  metricSecondaryLabel: document.getElementById('metric-secondary-label'),
  metricSecondaryValue: document.getElementById('metric-secondary-value'),
  editUserModal: document.getElementById('edit-user-modal'),
  editUserForm: document.getElementById('edit-user-form'),
  editUserLabel: document.getElementById('edit-user-label'),
  editUserStatus: document.getElementById('edit-user-status'),
  closeEditUserModal: document.getElementById('close-edit-user-modal'),
};

function normalizeText(value) {
  return String(value ?? '').normalize('NFC');
}

function normalizeNodeTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    currentNode.textContent = normalizeText(currentNode.textContent);
    currentNode = walker.nextNode();
  }
}

function setStatus(target, message, type = '') {
  target.textContent = normalizeText(message || '');
  target.className = type ? `status ${type}` : 'status';
}

async function apiFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN');
}

function formatCurrency(value) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} VND`;
}

function getProductStatus(quantity) {
  if (quantity <= 0) {
    return { text: 'Hết hàng', class: 'status-out' };
  }
  if (quantity < 10) {
    return { text: 'Gần hết hàng', class: 'status-low' };
  }
  return { text: 'Còn hàng', class: 'status-available' };
}

function updateDeductPriceHint() {
  const productId = Number(elements.deductProduct.value);
  const product = state.products.find((item) => item.id === productId);
  if (!product) {
    elements.deductPriceHint.textContent = '';
    return;
  }

  elements.deductPriceHint.textContent = normalizeText(
    `Đơn giá hiện tại: ${formatCurrency(product.unit_price || 0)} / ${product.unit}`
  );
}

function renderRevenueSummary() {
  const report = state.revenueReport;
  const hasUser = Boolean(state.user);
  elements.dashboardMetrics.classList.toggle('hidden', !hasUser || !report);

  if (!hasUser || !report) {
    return;
  }

  if (state.user.role === 'admin') {
    elements.metricPrimaryLabel.textContent = 'Tổng doanh thu 10 ngày';
    elements.metricPrimaryValue.textContent = formatCurrency(report.totalRevenue || 0);
    elements.metricSecondaryLabel.textContent = `Doanh thu ngày ${report.today}`;
    elements.metricSecondaryValue.textContent = formatCurrency(report.todayRevenue || 0);
    return;
  }

  elements.metricPrimaryLabel.textContent = `Doanh thu của bạn ngày ${report.today}`;
  elements.metricPrimaryValue.textContent = formatCurrency(report.todayRevenue || 0);
  elements.metricSecondaryLabel.textContent = 'Số lượt bán hôm nay';
  elements.metricSecondaryValue.textContent = String((report.entries || []).length);
}

function renderProducts() {
  elements.productsTableBody.innerHTML = '';
  elements.productCount.textContent = normalizeText(`${state.products.length} sản phẩm`);
  const isAdmin = state.user?.role === 'admin';
  elements.actionsHead.textContent = normalizeText(isAdmin ? 'Thao tác' : '');

  for (const product of state.products) {
    const row = document.createElement('tr');
    const productName = normalizeText(product.name);
    const productUnit = normalizeText(product.unit);
    const statusInfo = getProductStatus(product.quantity);
    const actionsHtml = isAdmin
      ? `<div class="actions">
          <button data-edit-id="${product.id}" class="secondary">Sửa</button>
          <button data-delete-id="${product.id}" class="danger">Xóa</button>
        </div>`
      : '';

    row.innerHTML = `
      <td>${productName}</td>
      <td>${productUnit}</td>
      <td>${formatCurrency(product.unit_price || 0)}</td>
      <td>${product.quantity}</td>
      <td><span class="status-badge ${statusInfo.class}">${normalizeText(statusInfo.text)}</span></td>
      <td>${formatDate(product.updated_at)}</td>
      <td>${actionsHtml}</td>
    `;
    elements.productsTableBody.appendChild(row);
  }

  elements.deductProduct.innerHTML = state.products
    .map((product) => `<option value="${product.id}">${normalizeText(product.name)} (${product.quantity} ${normalizeText(product.unit)})</option>`)
    .join('');
  updateDeductPriceHint();
}

function renderUsers() {
  elements.usersTableBody.innerHTML = state.users
    .map((user) => `
      <tr>
        <td>${user.id}</td>
        <td>${normalizeText(user.username)}</td>
        <td>${user.role}</td>
        <td>${formatDate(user.created_at)}</td>
        <td><button class="secondary" data-edit-user-id="${user.id}" data-edit-user-name="${normalizeText(user.username)}" data-edit-user-role="${user.role}">Sửa</button></td>
      </tr>
    `)
    .join('');
}

function fillProductForm(product) {
  elements.productForm.productId.value = product.id;
  elements.productForm.name.value = normalizeText(product.name);
  elements.productForm.unit.value = normalizeText(product.unit);
  elements.productForm.quantity.value = product.quantity;
  elements.productForm.unit_price.value = Number(product.unit_price || 0);
}

function resetProductForm() {
  elements.productForm.reset();
  elements.productForm.productId.value = '';
}

function setAuthenticatedView() {
  const isAdmin = state.user?.role === 'admin';
  elements.authPanel.classList.toggle('hidden', !!state.user);
  elements.dashboardPanel.classList.toggle('hidden', !state.user);
  elements.adminSections.classList.toggle('hidden', !isAdmin);
  elements.adminUsersSection.classList.toggle('hidden', !isAdmin);
  elements.activityPageLinkWrap.classList.toggle('hidden', !isAdmin);
  elements.revenuePageLinkWrap.classList.toggle('hidden', !state.user);

  if (state.user) {
    elements.welcomeTitle.textContent = normalizeText(`Xin chào ${state.user.username}`);
    elements.roleSummary.textContent = normalizeText(isAdmin
      ? 'Bạn đang ở vai trò admin: quản lý sản phẩm, tài khoản, doanh thu và xem lịch sử hoạt động.'
      : 'Bạn đang ở vai trò user: xem tồn kho, trừ số lượng sản phẩm và chỉ xem doanh thu của chính bạn trong ngày.');
  }
}

async function loadDashboardData() {
  const [productResponse, revenueReport] = await Promise.all([
    apiFetch('/api/products'),
    apiFetch('/api/revenue-report'),
  ]);
  state.products = productResponse.products;
  state.revenueReport = revenueReport;
  renderProducts();
  renderRevenueSummary();

  if (state.user.role === 'admin') {
    const usersResponse = await apiFetch('/api/users');
    state.users = usersResponse.users;
    renderUsers();
  }
}

async function bootstrap() {
  if (!state.token) {
    setAuthenticatedView();
    return;
  }

  try {
    const me = await apiFetch('/api/me');
    state.user = me.user;
    setAuthenticatedView();
    await loadDashboardData();
  } catch (_error) {
    localStorage.removeItem('token');
    state.token = '';
    state.user = null;
    state.revenueReport = null;
    setAuthenticatedView();
    renderRevenueSummary();
  }
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.authStatus, 'Đang đăng nhập...');

  const formData = new FormData(elements.loginForm);
  try {
    const data = await apiFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
      }),
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    elements.loginForm.reset();
    setAuthenticatedView();
    await loadDashboardData();
    setStatus(elements.authStatus, 'Đăng nhập thành công', 'success');
    setStatus(elements.dashboardStatus, '');
  } catch (error) {
    setStatus(elements.authStatus, error.message, 'error');
  }
});

elements.logoutButton.addEventListener('click', () => {
  localStorage.removeItem('token');
  state.token = '';
  state.user = null;
  state.products = [];
  state.users = [];
  state.revenueReport = null;
  setAuthenticatedView();
  renderRevenueSummary();
  elements.productsTableBody.innerHTML = '';
  elements.usersTableBody.innerHTML = '';
  setStatus(elements.dashboardStatus, 'Đã đăng xuất', 'success');
});

elements.productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.productForm);
  const productId = formData.get('productId');

  try {
    const payload = {
      name: formData.get('name'),
      unit: formData.get('unit'),
      quantity: Number(formData.get('quantity')),
      unit_price: Number(formData.get('unit_price')),
    };

    if (productId) {
      await apiFetch(`/api/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus(elements.dashboardStatus, 'Cập nhật sản phẩm thành công', 'success');
    } else {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setStatus(elements.dashboardStatus, 'Thêm sản phẩm thành công', 'success');
    }

    resetProductForm();
    await loadDashboardData();
  } catch (error) {
    setStatus(elements.dashboardStatus, error.message, 'error');
  }
});

elements.resetProductForm.addEventListener('click', resetProductForm);

elements.deductProduct.addEventListener('change', updateDeductPriceHint);

elements.userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.userForm);

  try {
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password'),
        role: formData.get('role'),
      }),
    });
    elements.userForm.reset();
    await loadDashboardData();
    setStatus(elements.dashboardStatus, 'Tạo tài khoản thành công', 'success');
  } catch (error) {
    setStatus(elements.dashboardStatus, error.message, 'error');
  }
});

elements.productsTableBody.addEventListener('click', async (event) => {
  const editId = event.target.getAttribute('data-edit-id');
  const deleteId = event.target.getAttribute('data-delete-id');

  if (editId) {
    const product = state.products.find((item) => item.id === Number(editId));
    if (product) {
      fillProductForm(product);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (deleteId) {
    const confirmed = window.confirm('Xóa sản phẩm này?');
    if (!confirmed) {
      return;
    }

    try {
      await apiFetch(`/api/products/${deleteId}`, { method: 'DELETE' });
      await loadDashboardData();
      setStatus(elements.dashboardStatus, 'Xóa sản phẩm thành công', 'success');
    } catch (error) {
      setStatus(elements.dashboardStatus, error.message, 'error');
    }
  }
});

elements.deductForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.deductForm);

  try {
    const data = await apiFetch(`/api/products/${formData.get('productId')}/deduct`, {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(formData.get('amount')),
        payment_method: formData.get('payment_method'),
        note: formData.get('note'),
      }),
    });
    elements.deductForm.reset();
    await loadDashboardData();
    setStatus(elements.dashboardStatus, `Trừ sản phẩm thành công, cộng doanh thu ${formatCurrency(data.revenue || 0)}`, 'success');
  } catch (error) {
    setStatus(elements.dashboardStatus, error.message, 'error');
  }
});

elements.usersTableBody.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-edit-user-id]');
  if (!btn) return;
  const userId = btn.getAttribute('data-edit-user-id');
  const userName = btn.getAttribute('data-edit-user-name');
  const userRole = btn.getAttribute('data-edit-user-role');
  elements.editUserForm.userId.value = userId;
  elements.editUserForm.password.value = '';
  elements.editUserForm.role.value = userRole;
  elements.editUserLabel.textContent = normalizeText(`Tài khoản: ${userName}`);
  setStatus(elements.editUserStatus, '');
  elements.editUserModal.classList.remove('hidden');
});

elements.closeEditUserModal.addEventListener('click', () => {
  elements.editUserModal.classList.add('hidden');
});

elements.editUserModal.addEventListener('click', (event) => {
  if (event.target === elements.editUserModal) {
    elements.editUserModal.classList.add('hidden');
  }
});

elements.editUserForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.editUserForm);
  const userId = formData.get('userId');
  const password = formData.get('password');
  const role = formData.get('role');
  const payload = {};
  if (password) payload.password = password;
  payload.role = role;
  try {
    await apiFetch(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    elements.editUserModal.classList.add('hidden');
    await loadDashboardData();
    setStatus(elements.dashboardStatus, 'Cập nhật tài khoản thành công', 'success');
  } catch (error) {
    setStatus(elements.editUserStatus, error.message, 'error');
  }
});

bootstrap();
normalizeNodeTree(document.body);
