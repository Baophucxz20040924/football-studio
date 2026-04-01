const token = localStorage.getItem('token') || '';

const elements = {
  heroCopy: document.getElementById('revenue-hero-copy'),
  status: document.getElementById('revenue-status'),
  summaryCards: document.getElementById('revenue-summary-cards'),
  userSection: document.getElementById('user-revenue-section'),
  userDate: document.getElementById('user-revenue-date'),
  userList: document.getElementById('user-revenue-list'),
  adminSection: document.getElementById('admin-revenue-section'),
  adminDays: document.getElementById('admin-revenue-days'),
};

function normalizeText(value) {
  return String(value ?? '').normalize('NFC');
}

function setStatus(message, type = '') {
  elements.status.textContent = normalizeText(message || '');
  elements.status.className = type ? `status ${type}` : 'status';
}

function formatCurrency(value) {
  return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} VND`;
}

function formatDateTime(value) {
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

function renderSummaryCards(cards) {
  elements.summaryCards.innerHTML = cards
    .map((card) => `
      <article class="metric-card">
        <p>${normalizeText(card.label)}</p>
        <strong>${normalizeText(card.value)}</strong>
      </article>
    `)
    .join('');
}

function renderUserReport(report) {
  elements.userSection.classList.remove('hidden');
  elements.adminSection.classList.add('hidden');
  elements.userDate.textContent = normalizeText(`Ngày doanh thu: ${report.today}`);
  elements.heroCopy.textContent = normalizeText('Bạn chỉ thấy doanh thu của chính mình trong ngày hiện tại.');

  renderSummaryCards([
    { label: `Doanh thu ngày ${report.today}`, value: formatCurrency(report.todayRevenue || 0) },
    { label: 'Số giao dịch hôm nay', value: String((report.entries || []).length) },
  ]);

  if (!report.entries || report.entries.length === 0) {
    elements.userList.innerHTML = '<article class="log-item">Hôm nay chưa có doanh thu nào từ tài khoản của bạn.</article>';
    return;
  }

  elements.userList.innerHTML = report.entries
    .map((entry) => `
      <article class="log-item log-item-rich">
        <div class="log-top-row">
          <strong>${normalizeText(entry.product_name || 'Sản phẩm')}</strong>
          <span>${formatDateTime(entry.created_at)}</span>
        </div>
        <p><b>Số lượng:</b> ${entry.quantity} ${normalizeText(entry.product_unit || '')}</p>
        <p><b>Đơn giá:</b> ${formatCurrency(entry.unit_price || 0)}</p>
        <p><b>Doanh thu:</b> ${formatCurrency(entry.revenue || 0)}</p>
        <p><b>Ghi chú:</b> ${normalizeText(entry.note || '-')}</p>
      </article>
    `)
    .join('');
}

function renderAdminReport(report) {
  elements.adminSection.classList.remove('hidden');
  elements.userSection.classList.add('hidden');
  elements.heroCopy.textContent = normalizeText('Admin thấy tổng doanh thu, doanh thu từng ngày và từng user trong phạm vi 10 ngày lưu log.');

  renderSummaryCards([
    { label: `Tổng doanh thu ${report.retention_days} ngày`, value: formatCurrency(report.totalRevenue || 0) },
    { label: `Doanh thu ngày ${report.today}`, value: formatCurrency(report.todayRevenue || 0) },
    { label: 'Số ngày có doanh thu', value: String(report.totalDays || 0) },
  ]);

  if (!report.days || report.days.length === 0) {
    elements.adminDays.innerHTML = '<article class="log-item">Chưa có doanh thu nào trong 10 ngày gần nhất.</article>';
    return;
  }

  elements.adminDays.innerHTML = report.days
    .map((day) => {
      const userRows = day.users
        .map((user) => `
          <tr>
            <td>${normalizeText(user.username)}</td>
            <td>${user.total_quantity}</td>
            <td>${formatCurrency(user.total_revenue)}</td>
          </tr>
        `)
        .join('');

      return `
        <section class="revenue-day-card">
          <div class="section-title">
            <div>
              <h3>${normalizeText(day.date_key)}</h3>
              <p>${day.users.length} tài khoản có phát sinh</p>
            </div>
            <strong>${formatCurrency(day.total_revenue)}</strong>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tài khoản</th>
                  <th>Số lượng bán</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>${userRows}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join('');
}

async function bootstrap() {
  if (!token) {
    window.location.href = '/';
    return;
  }

  setStatus('Đang tải doanh thu...');

  try {
    const report = await apiFetch('/api/revenue-report');
    if (report.scope === 'admin') {
      renderAdminReport(report);
    } else {
      renderUserReport(report);
    }
    setStatus('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

bootstrap();
