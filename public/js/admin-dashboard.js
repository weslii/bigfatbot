// Tab switching logic
window.addEventListener('DOMContentLoaded', function() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tabContents.forEach(tab => tab.classList.remove('active'));
      const tabId = btn.dataset.tab;
      const tabToShow = document.getElementById(tabId);
      if (tabToShow) tabToShow.classList.add('active');
    });
  });
  // Show the first tab by default
  if (tabContents.length) tabContents[0].classList.add('active');

  // 3-dot action menu logic
  const actionMenuBtns = document.querySelectorAll('.action-menu-btn');
  actionMenuBtns.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Close all other dropdowns
      document.querySelectorAll('.dropdown.active').forEach(dropdown => {
        if (dropdown !== this.parentElement) {
          dropdown.classList.remove('active');
        }
      });
      // Toggle current dropdown
      this.parentElement.classList.toggle('active');
    });
  });
  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active');
    });
  });

  // Theme toggle logic
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    // Set initial theme from localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggle.querySelector('i').className = 'fas fa-sun';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      themeToggle.querySelector('i').className = 'fas fa-moon';
    }
    themeToggle.addEventListener('click', function() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
      themeToggle.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
      localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });
  }

  // Notification button logic
  const notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) {
    notificationBtn.addEventListener('click', function() {
      alert('Notifications feature coming soon!');
    });
  }

  // Profile dropdown logic
  const profileDropdown = document.getElementById('profileDropdown');
  const profileMenu = document.getElementById('profileMenu');
  if (profileDropdown && profileMenu) {
    profileDropdown.addEventListener('click', function(e) {
      e.stopPropagation();
      profileMenu.parentElement.classList.toggle('active');
    });
    document.addEventListener('click', function() {
      profileMenu.parentElement.classList.remove('active');
    });
  }

  // Fetch businesses and orders on tab switch
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (btn.dataset.tab === 'businesses-tab') fetchAndRenderBusinesses(1);
      if (btn.dataset.tab === 'orders-tab') fetchAndRenderOrders(1);
    });
  });
  // Initial load
  fetchAndRenderBusinesses(1);
});

// --- AJAX Pagination for Businesses and Orders Tabs ---
async function fetchAndRenderBusinesses(page = 1, pageSize = 10) {
  const tableBody = document.querySelector('#businesses-tab .data-table tbody');
  const pagination = document.getElementById('businesses-pagination');
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
  try {
    const res = await fetch(`/admin/api/businesses?page=${page}&pageSize=${pageSize}`);
    const data = await res.json();
    if (!data.businesses || data.businesses.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7">No businesses found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }
    tableBody.innerHTML = data.businesses.map(biz => `
      <tr>
        <td>
          <div class="business-info">
            <div class="business-avatar">${biz.business_name ? biz.business_name[0] : '?'}</div>
            <div class="business-details">
              <div class="business-name">${biz.business_name || ''}</div>
              <div class="business-id">${biz.business_id || ''}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="owner-info">
            <div class="owner-name">${biz.owner_name || ''}</div>
            <div class="owner-email">${biz.owner_email || ''}</div>
          </div>
        </td>
        <td><span class="status-badge active">Active</span></td>
        <td>-</td>
        <td class="revenue">-</td>
        <td>-</td>
        <td>
          <div class="dropdown">
            <button class="action-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="dropdown-content">
              <a href="/admin/businesses/${biz.business_id}">View Details</a>
              <a href="/admin/businesses/${biz.business_id}/edit">Edit</a>
              <hr>
              <a href="#" class="danger">Suspend Business</a>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
    // Render pagination
    if (pagination) {
      const totalPages = Math.ceil(data.total / pageSize);
      let html = '';
      html += `<button ${page === 1 ? 'disabled' : ''} data-page="${page-1}">Prev</button>`;
      for (let i = 1; i <= totalPages; i++) {
        html += `<button ${i === page ? 'class="active"' : ''} data-page="${i}">${i}</button>`;
      }
      html += `<button ${page === totalPages ? 'disabled' : ''} data-page="${page+1}">Next</button>`;
      pagination.innerHTML = html;
      pagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', e => {
          fetchAndRenderBusinesses(parseInt(btn.getAttribute('data-page')), pageSize);
        });
      });
    }
    // Re-attach dropdown logic
    attachDropdownLogic();
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="7">Failed to load businesses.</td></tr>';
    if (pagination) pagination.innerHTML = '';
  }
}

async function fetchAndRenderOrders(page = 1, pageSize = 10) {
  const tableBody = document.querySelector('#orders-tab .data-table tbody');
  const pagination = document.getElementById('orders-pagination');
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  try {
    const res = await fetch(`/admin/api/orders?page=${page}&pageSize=${pageSize}`);
    const data = await res.json();
    if (!data.orders || data.orders.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }
    tableBody.innerHTML = data.orders.map(order => `
      <tr>
        <td>${order.order_id}</td>
        <td>${order.business_name || ''}</td>
        <td>${order.customer_name || ''}</td>
        <td>${order.status || ''}</td>
        <td>${order.created_at ? new Date(order.created_at).toLocaleString() : ''}</td>
        <td>
          <div class="dropdown">
            <button class="action-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="dropdown-content">
              <a href="/admin/orders/${order.order_id}">View Details</a>
              <a href="/admin/orders/${order.order_id}/edit">Edit</a>
              <hr>
              <a href="#" class="danger">Delete Order</a>
            </div>
          </div>
        </td>
      </tr>
    `).join('');
    // Render pagination
    if (pagination) {
      const totalPages = Math.ceil(data.total / pageSize);
      let html = '';
      html += `<button ${page === 1 ? 'disabled' : ''} data-page="${page-1}">Prev</button>`;
      for (let i = 1; i <= totalPages; i++) {
        html += `<button ${i === page ? 'class="active"' : ''} data-page="${i}">${i}</button>`;
      }
      html += `<button ${page === totalPages ? 'disabled' : ''} data-page="${page+1}">Next</button>`;
      pagination.innerHTML = html;
      pagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', e => {
          fetchAndRenderOrders(parseInt(btn.getAttribute('data-page')), pageSize);
        });
      });
    }
    // Re-attach dropdown logic
    attachDropdownLogic();
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="6">Failed to load orders.</td></tr>';
    if (pagination) pagination.innerHTML = '';
  }
}

function attachDropdownLogic() {
  // Re-attach 3-dot dropdown logic after table update
  const actionMenuBtns = document.querySelectorAll('.action-menu-btn');
  actionMenuBtns.forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();
      document.querySelectorAll('.dropdown.active').forEach(dropdown => {
        if (dropdown !== this.parentElement) {
          dropdown.classList.remove('active');
        }
      });
      this.parentElement.classList.toggle('active');
    };
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active');
    });
  }, { once: true });
} 