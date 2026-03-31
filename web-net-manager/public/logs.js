const token = localStorage.getItem('token') || '';

const elements = {
  search: document.getElementById('log-search'),
  refreshButton: document.getElementById('refresh-logs'),
  status: document.getElementById('logs-status'),
  count: document.getElementById('logs-count'),
  list: document.getElementById('logs-list'),
};

const state = {
  logs: [],
  filteredLogs: [],
};

function normalizeText(value) {
  return String(value ?? '').normalize('NFC');
}

function setStatus(message, type = '') {
  elements.status.textContent = normalizeText(message || '');
  elements.status.className = type ? `status ${type}` : 'status';
}

function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN');
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function renderLogs() {
  const list = state.filteredLogs;
  elements.count.textContent = `${list.length} lịch sử phù hợp`;

  if (list.length === 0) {
    elements.list.innerHTML = '<article class="log-item">Không có lịch sử phù hợp.</article>';
    return;
  }

  elements.list.innerHTML = list
    .map((log) => {
      const userLabel = `${normalizeText(log.username)} (${normalizeText(log.role)})`;
      const productLabel = log.product_name
        ? `Món hàng: ${normalizeText(log.product_name)}${log.product_unit ? ` (${normalizeText(log.product_unit)})` : ''}`
        : 'Món hàng: Không gắn sản phẩm';
      const amountLabel = log.amount ? `Số lượng: ${log.amount}` : 'Số lượng: -';
      const noteLabel = log.note ? `Ghi chú: ${normalizeText(log.note)}` : 'Ghi chú: -';

      return `
        <article class="log-item log-item-rich">
          <div class="log-top-row">
            <strong>${normalizeText(log.action_type)}</strong>
            <span>${formatDate(log.created_at)}</span>
          </div>
          <p><b>Người thao tác:</b> ${userLabel}</p>
          <p><b>${productLabel}</b></p>
          <p>${amountLabel}</p>
          <p>${noteLabel}</p>
        </article>
      `;
    })
    .join('');
}

function applyFilter() {
  const keyword = normalizeText(elements.search.value).toLowerCase().trim();
  if (!keyword) {
    state.filteredLogs = [...state.logs];
    renderLogs();
    return;
  }

  state.filteredLogs = state.logs.filter((log) => {
    const userName = normalizeText(log.username).toLowerCase();
    const productName = normalizeText(log.product_name).toLowerCase();
    return userName.includes(keyword) || productName.includes(keyword);
  });

  renderLogs();
}

async function loadLogs() {
  if (!token) {
    window.location.href = '/';
    return;
  }

  setStatus('Đang tải lịch sử...');

  try {
    const me = await apiFetch('/api/me');
    if (me.user.role !== 'admin') {
      setStatus('Bạn không có quyền xem lịch sử hoạt động.', 'error');
      elements.list.innerHTML = '';
      return;
    }

    const logsResponse = await apiFetch('/api/activity-logs');
    state.logs = logsResponse.logs || [];
    state.filteredLogs = [...state.logs];
    renderLogs();
    setStatus('Đã tải lịch sử thành công.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    if (error.message.toLowerCase().includes('unauthorized') || error.message.toLowerCase().includes('token')) {
      localStorage.removeItem('token');
      window.location.href = '/';
    }
  }
}

elements.search.addEventListener('input', applyFilter);
elements.refreshButton.addEventListener('click', loadLogs);

loadLogs();
