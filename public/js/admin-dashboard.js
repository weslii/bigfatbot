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
      if (btn.dataset.tab === 'orders-tab') {
        fetchAndRenderOrders(1);
        fetchAndRenderAnalytics(); // Refresh analytics when viewing orders
      }
    });
  });
  // Initial load
  fetchAndRenderBusinesses(1);
  fetchAndRenderAnalytics(); // Load analytics on page load

  // Header search for businesses
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      const searchTerm = this.value.trim();
      businessesFilter.search = searchTerm;
      // Debounce search
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'businesses-tab') {
          fetchAndRenderBusinesses(1);
        }
      }, 300);
    });
  }
  
  // Tabs filter/export buttons
  const filterBtn = document.querySelector('.tabs-actions .action-btn:first-child');
  const exportBtn = document.querySelector('.tabs-actions .action-btn:last-child');
  
  if (filterBtn) {
    filterBtn.addEventListener('click', function() {
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab) showFilterModal(activeTab.dataset.tab);
    });
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab && activeTab.dataset.tab === 'businesses-tab') {
        // Export businesses - show format options
        const format = prompt('Choose export format (csv, json, pdf):', 'csv');
        if (format && ['csv', 'json', 'pdf'].includes(format.toLowerCase())) {
          window.open(`/admin/api/export/businesses?format=${format.toLowerCase()}`, '_blank');
        }
      } else if (activeTab && activeTab.dataset.tab === 'orders-tab') {
        // Export orders - show format options
        const format = prompt('Choose export format (csv, json, pdf):', 'csv');
        if (format && ['csv', 'json', 'pdf'].includes(format.toLowerCase())) {
          window.open(`/admin/api/export/orders?format=${format.toLowerCase()}`, '_blank');
        }
      }
    });
  }

  // --- Real Analytics Fetch ---
  fetchAndRenderAnalytics();
});

// --- AJAX Pagination for Businesses and Orders Tabs ---
let businessesFilter = { search: '', status: '' };
let ordersFilter = { status: '', business: '', search: '', date_from: '', date_to: '' };

async function fetchAndRenderBusinesses(page = 1, pageSize = 10) {
  const tableBody = document.querySelector('#businesses-tab .data-table tbody');
  const pagination = document.getElementById('businesses-pagination');
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  try {
    const params = new URLSearchParams({
      page,
      pageSize,
      search: businessesFilter.search || '',
      status: businessesFilter.status || ''
    });
    const res = await fetch(`/admin/api/businesses?${params}`);
    const data = await res.json();
    if (!data.businesses || data.businesses.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5">No businesses found.</td></tr>';
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
        <td><span class="status-badge ${biz.is_active ? 'active' : 'inactive'}">${biz.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>${typeof biz.order_count !== 'undefined' ? biz.order_count : '-'}</td>
        <td>
          <div class="dropdown">
            <button class="action-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="dropdown-content">
              <a href="/admin/businesses/${biz.business_id}">View Details</a>
              <a href="/admin/businesses/${biz.business_id}/edit">Edit</a>
              <hr>
              <a href="#" class="toggle-status" data-business-id="${biz.business_id}" data-current-status="${biz.is_active}">
                ${biz.is_active ? 'Deactivate' : 'Activate'} Business
              </a>
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
        html += `<button ${i === page ? 'class=\"active\"' : ''} data-page="${i}">${i}</button>`;
      }
      html += `<button ${page === totalPages ? 'disabled' : ''} data-page="${page+1}">Next</button>`;
      pagination.innerHTML = html;
      pagination.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', e => {
          fetchAndRenderBusinesses(parseInt(btn.getAttribute('data-page')), pageSize);
        });
      });
    }
    // Re-attach dropdown logic and toggle handlers
    attachDropdownLogic();
    attachToggleHandlers();
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="5">Failed to load businesses.</td></tr>';
    if (pagination) pagination.innerHTML = '';
  }
}

async function fetchAndRenderOrders(page = 1, pageSize = 5) {
  const tableBody = document.querySelector('#orders-tab .data-table tbody');
  const pagination = document.getElementById('orders-pagination');
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  try {
    const params = new URLSearchParams({
      page,
      pageSize,
      status: ordersFilter.status || '',
      business: ordersFilter.business || '',
      search: ordersFilter.search || '',
      date_from: ordersFilter.date_from || '',
      date_to: ordersFilter.date_to || ''
    });
    const res = await fetch(`/admin/api/orders?${params}`);
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
        <td><span class="status-badge ${order.status}">${order.status || ''}</span></td>
        <td>${order.created_at ? new Date(order.created_at).toLocaleString() : ''}</td>
        <td>
          <div class="dropdown">
            <button class="action-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="dropdown-content">
              <a href="#" class="view-order-details" data-order-id="${order.id}">View Details</a>
              <a href="/admin/orders/${order.id}/edit">Edit</a>
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
        html += `<button ${i === page ? 'class=\"active\"' : ''} data-page="${i}">${i}</button>`;
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
    console.error('Error fetching orders:', err);
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

function attachToggleHandlers() {
  document.querySelectorAll('.toggle-status').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      const businessId = this.getAttribute('data-business-id');
      const currentStatus = this.getAttribute('data-current-status') === 'true';
      try {
        const res = await fetch(`/admin/api/businesses/${businessId}/toggle`, {
          method: 'POST'
        });
        if (res.ok) {
          // Refresh the current page to show updated status
          const activeTab = document.querySelector('.tab-btn.active');
          if (activeTab && activeTab.dataset.tab === 'businesses-tab') {
            // Get current page from pagination or default to 1
            const currentPageBtn = document.querySelector('#businesses-pagination button.active');
            const currentPage = currentPageBtn ? parseInt(currentPageBtn.getAttribute('data-page')) : 1;
            fetchAndRenderBusinesses(currentPage);
          }
        } else {
          alert('Failed to toggle business status');
        }
      } catch (err) {
        alert('Error toggling business status');
      }
    });
  });
}

// Modal logic
function showFilterModal(tab) {
  document.getElementById('filter-modal').style.display = 'flex';
  document.getElementById('filter-modal-businesses').style.display = tab === 'businesses-tab' ? 'block' : 'none';
  document.getElementById('filter-modal-orders').style.display = tab === 'orders-tab' ? 'block' : 'none';
}
function closeFilterModal() {
  document.getElementById('filter-modal').style.display = 'none';
}
document.getElementById('close-filter-modal').onclick = closeFilterModal;
document.getElementById('filter-modal').onclick = function(e) {
  if (e.target === this) closeFilterModal();
};

// Businesses filter form
const businessesFilterForm = document.getElementById('businesses-filter-modal-form');
if (businessesFilterForm) {
  businessesFilterForm.onsubmit = function(e) {
    e.preventDefault();
    const status = this.status.value;
    businessesFilter.status = status;
    closeFilterModal();
    fetchAndRenderBusinesses(1);
  };
}
// Orders filter form
const ordersFilterForm = document.getElementById('orders-filter-modal-form');
if (ordersFilterForm) {
  ordersFilterForm.onsubmit = function(e) {
    e.preventDefault();
    ordersFilter.status = this.status.value;
    ordersFilter.business = this.business.value;
    ordersFilter.date_from = this.date_from.value;
    ordersFilter.date_to = this.date_to.value;
    closeFilterModal();
    fetchAndRenderOrders(1);
  };
}

// --- Real Analytics Fetch ---
async function fetchAndRenderAnalytics() {
  try {
    console.log('Fetching analytics data...');
    const res = await fetch('/admin/api/analytics');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    console.log('Analytics data received:', data);
    
    // Update KPI cards with real data
    const businessesCard = document.querySelector('.stat-card.businesses .stat-value');
    const ordersCard = document.querySelector('.stat-card.orders .stat-value');
    const revenueCard = document.querySelector('.stat-card.revenue .stat-value');
    const uptimeCard = document.querySelector('.stat-card.uptime .stat-value');
    
    if (businessesCard) {
      businessesCard.textContent = data.totalBusinesses || 0;
      console.log('Updated businesses card:', data.totalBusinesses);
    }
    
    if (ordersCard) {
      ordersCard.textContent = data.totalOrders || 0;
      console.log('Updated orders card:', data.totalOrders);
    }
    
    if (revenueCard) {
      revenueCard.textContent = `$${data.totalRevenue || '0.00'}`;
      console.log('Updated revenue card:', data.totalRevenue);
    }
    
    if (uptimeCard && data.botUptime) {
      uptimeCard.textContent = `${parseFloat(data.botUptime).toFixed(1)}%`;
      uptimeCard.title = `Uptime since last start: ${data.botUptimeHours} hours`;
      console.log('Updated uptime card:', data.botUptime);
    }
    
    // Update change percentages if available
    const businessChange = document.querySelector('.stat-card.businesses .stat-change');
    const orderChange = document.querySelector('.stat-card.orders .stat-change');
    
    if (businessChange && typeof data.businessChange !== 'undefined') {
      const changeText = (data.businessChange > 0 ? '+' : '') + data.businessChange.toFixed(1) + '% from last month';
      businessChange.textContent = changeText;
      businessChange.className = `stat-change ${data.businessChange >= 0 ? 'positive' : 'negative'}`;
    }
    
    if (orderChange && typeof data.orderChange !== 'undefined') {
      const changeText = (data.orderChange > 0 ? '+' : '') + data.orderChange.toFixed(1) + '% from last month';
      orderChange.textContent = changeText;
      orderChange.className = `stat-change ${data.orderChange >= 0 ? 'positive' : 'negative'}`;
    }
    
    console.log('Analytics update completed successfully');
  } catch (err) {
    console.error('Error fetching analytics:', err);
    // Keep existing values if fetch fails
  }
}

// --- WhatsApp Bot Restart Functionality ---
document.addEventListener('DOMContentLoaded', function() {
  // Handle restart button clicks
  const restartButtons = document.querySelectorAll('.secondary-btn');
  restartButtons.forEach(button => {
    if (button.textContent.includes('Restart')) {
      button.addEventListener('click', handleRestartClick);
    }
    if (button.textContent.includes('Show QR')) {
      button.addEventListener('click', handleShowQrClick);
    }
  });
});

// QR Code Modal Variables
let qrPollingInterval = null;
let qrModalOpen = false;

// Handle Show QR button click
async function handleShowQrClick(event) {
  event.preventDefault();
  
  // Add confirmation dialog
  if (!confirm('Are you sure you want to generate a new QR code? This will restart the WhatsApp bot and require authentication.')) {
    return;
  }
  
  const button = event.currentTarget;
  const originalText = button.innerHTML;
  
  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    // Get admin user ID from the page
    const adminId = getAdminId();
    
    // First, restart the bot to trigger QR code generation
    const restartResponse = await fetch('/api/whatsapp/restart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: adminId
      })
    });
    
    const restartResult = await restartResponse.json();
    
    if (restartResult.success) {
      // Show success message
      showNotification('WhatsApp bot restarted successfully! Generating QR code...', 'success');
      
      // Open QR modal and start polling
      openQrModal();
    } else {
      showNotification('Error: ' + (restartResult.error || 'Failed to restart WhatsApp bot'), 'error');
    }
  } catch (error) {
    console.error('Show QR error:', error);
    showNotification('Error: Failed to generate QR code', 'error');
  } finally {
    // Restore button state
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

// Open QR Modal
function openQrModal() {
  const modal = document.getElementById('qr-modal');
  modal.style.display = 'flex';
  qrModalOpen = true;
  
  // Show loading state
  document.getElementById('qr-loading').style.display = 'flex';
  document.getElementById('qr-content').style.display = 'none';
  document.getElementById('qr-error').style.display = 'none';
  document.getElementById('qr-status-text').textContent = 'Generating QR code...';
  
  // Start polling for QR code
  startQrPolling();
}

// Close QR Modal
function closeQrModal() {
  // Add confirmation if QR code is being displayed
  const qrContent = document.getElementById('qr-content');
  if (qrContent && qrContent.style.display !== 'none') {
    if (!confirm('Are you sure you want to close the QR code? You may need to generate a new one if authentication is still required.')) {
      return;
    }
  }
  
  const modal = document.getElementById('qr-modal');
  modal.style.display = 'none';
  qrModalOpen = false;
  
  // Stop polling
  stopQrPolling();
}

// Start polling for QR code updates
function startQrPolling() {
  // Poll every 2 seconds
  qrPollingInterval = setInterval(async () => {
    if (!qrModalOpen) return;
    
    try {
      const response = await fetch('/api/whatsapp/qr');
      
      if (response.status === 403) {
        // Superadmin access required
        showNotification('Error: Superadmin access required to view QR code', 'error');
        closeQrModal();
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch QR code');
      }
      
      const qrStatus = await response.json();
      
      if (qrStatus.authenticated) {
        // Bot is authenticated, close modal
        showNotification('WhatsApp bot authenticated successfully!', 'success');
        closeQrModal();
        return;
      }
      
      if (qrStatus.qr) {
        // Show QR code
        document.getElementById('qr-loading').style.display = 'none';
        document.getElementById('qr-content').style.display = 'flex';
        document.getElementById('qr-error').style.display = 'none';
        
        const qrImage = document.getElementById('qr-image');
        qrImage.src = qrStatus.qr;
        document.getElementById('qr-status-text').textContent = 'QR code ready - scan with WhatsApp';
      } else {
        // Still waiting for QR code
        document.getElementById('qr-status-text').textContent = 'Waiting for QR code...';
      }
    } catch (error) {
      console.error('QR polling error:', error);
      document.getElementById('qr-loading').style.display = 'none';
      document.getElementById('qr-content').style.display = 'none';
      document.getElementById('qr-error').style.display = 'flex';
      document.getElementById('qr-status-text').textContent = 'Error loading QR code';
    }
  }, 2000);
}

// Stop polling
function stopQrPolling() {
  if (qrPollingInterval) {
    clearInterval(qrPollingInterval);
    qrPollingInterval = null;
  }
}

// Retry QR code generation
async function retryQrCode() {
  try {
    // Show loading state
    document.getElementById('qr-loading').style.display = 'flex';
    document.getElementById('qr-content').style.display = 'none';
    document.getElementById('qr-error').style.display = 'none';
    document.getElementById('qr-status-text').textContent = 'Retrying...';
    
    // Restart polling
    startQrPolling();
  } catch (error) {
    console.error('Retry QR error:', error);
    showNotification('Error: Failed to retry QR code generation', 'error');
  }
}

// Close QR modal when clicking outside or on close button
document.addEventListener('DOMContentLoaded', function() {
  const qrModal = document.getElementById('qr-modal');
  const closeQrModalBtn = document.getElementById('close-qr-modal');
  
  if (qrModal) {
    qrModal.addEventListener('click', function(e) {
      if (e.target === qrModal) {
        closeQrModal();
      }
    });
  }
  
  if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener('click', closeQrModal);
  }
});

function getAdminId() {
  // Try to get admin ID from various sources
  // You may need to adjust this based on how you pass admin data to the template
  
  // Method 1: From data attribute
  const adminElement = document.querySelector('[data-admin-id]');
  if (adminElement) {
    return adminElement.getAttribute('data-admin-id');
  }
  
  // Method 2: From global variable (if set in template)
  if (typeof window.adminId !== 'undefined') {
    return window.adminId;
  }
  
  // Method 3: From URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const adminId = urlParams.get('adminId');
  if (adminId) {
    return adminId;
  }
  
  // Fallback: You might need to implement a way to get the current admin ID
  // For now, return a default or throw an error
  throw new Error('Admin ID not found. Please implement getAdminId() function.');
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    </div>
    <button class="notification-close">&times;</button>
  `;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
    color: white;
    padding: 15px 20px;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 400px;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add animation styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  
  // Add to page
  document.body.appendChild(notification);
  
  // Handle close button
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.addEventListener('click', () => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  });
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }
  }, 5000);
}

async function handleRestartClick(event) {
  event.preventDefault();
  
  const button = event.currentTarget;
  const platform = button.dataset.platform || 'whatsapp';
  const platformName = platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
  
  // Add confirmation dialog
  if (!confirm(`Are you sure you want to restart the ${platformName} bot? This will temporarily disconnect the bot.`)) {
    return;
  }
  
  const originalText = button.innerHTML;
  
  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
    
    // Get admin user ID from the page (you may need to adjust this based on your setup)
    const adminId = getAdminId(); // You'll need to implement this function
    
    const response = await fetch(`/api/${platform}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: adminId,
        platform: platform
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (result.authenticated === false && result.message && /authenticat|qr/i.test(result.message)) {
        // Bot needs authentication
        showNotification(result.message + ' Use the "Show QR" button to authenticate.', 'warning');
        // Highlight the QR button to draw attention (only for WhatsApp)
        if (platform === 'whatsapp') {
          const qrButton = document.querySelector('.secondary-btn:has(i.fa-qrcode)');
          if (qrButton) {
            qrButton.style.animation = 'pulse 2s infinite';
            setTimeout(() => {
              qrButton.style.animation = '';
            }, 4000);
          }
        }
      } else {
        // Bot is authenticated or generic success
        showNotification(result.message, 'success');
        // Refresh bot status after a short delay
        setTimeout(() => {
          refreshBotStatus(platform);
        }, 3000);
      }
    } else {
      showNotification(`Error: ${result.message || `Failed to restart ${platformName} bot`}`, 'error');
    }
  } catch (error) {
    console.error('Restart error:', error);
    showNotification(`Error: Failed to restart ${platformName} bot`, 'error');
  } finally {
    // Restore button state
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

async function refreshBotStatus(platform = 'whatsapp') {
  try {
    const response = await fetch(`/api/${platform}/bot-info`);
    const result = await response.json();
    
    if (result.success) {
      // Update bot status display if available
      const statusElement = document.querySelector(`#${platform}Status`);
      if (statusElement) {
        const statusText = result.number || 'Unknown';
        const statusClass = result.status === 'connected' ? 'alert-success' : 'alert-warning';
        statusElement.innerHTML = `
          <i class="fas fa-check-circle"></i> 
          ${platform.charAt(0).toUpperCase() + platform.slice(1)} Bot is running (${statusText})
        `;
        statusElement.className = `alert ${statusClass}`;
      }
    }
  } catch (error) {
    console.error(`Failed to refresh ${platform} bot status:`, error);
  }
} 

// Order Details Modal Functions
function showOrderDetailsModal(orderId) {
  const modal = document.getElementById('order-details-modal');
  const modalBody = document.getElementById('order-details-body');
  
  if (!modal || !modalBody) {
    console.error('Order details modal elements not found');
    return;
  }
  
  // Show loading state
  modalBody.innerHTML = '<div class="loading">Loading order details...</div>';
  modal.style.display = 'flex';
  
  // Fetch order details
  fetchOrderDetails(orderId);
}

function closeOrderDetailsModal() {
  const modal = document.getElementById('order-details-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Bot restart function for both platforms
async function restartBot(platform) {
  const platformName = platform === 'whatsapp' ? 'WhatsApp' : platform === 'telegram' ? 'Telegram' : 'All Platforms';
  
  // Add confirmation dialog
  if (!confirm(`Are you sure you want to restart the ${platformName} bot? This will temporarily disconnect the bot.`)) {
    return;
  }
  
  try {
    // Show loading state
    const buttons = document.querySelectorAll(`[onclick*="restartBot('${platform}')"]`);
    buttons.forEach(button => {
      const originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
      
      // Restore button after a delay
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = originalText;
      }, 5000);
    });
    
    // Get admin user ID from the page
    const adminId = getAdminId();
    
    const response = await fetch(`/api/bot/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: adminId,
        platform: platform
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (result.authenticated === false && result.message && /authenticat|qr/i.test(result.message)) {
        // Bot needs authentication
        showNotification(result.message + ' Use the "Show QR" button to authenticate.', 'warning');
        // Highlight the QR button to draw attention (only for WhatsApp)
        if (platform === 'whatsapp') {
          const qrButton = document.querySelector('.secondary-btn:has(i.fa-qrcode)');
          if (qrButton) {
            qrButton.style.animation = 'pulse 2s infinite';
            setTimeout(() => {
              qrButton.style.animation = '';
            }, 4000);
          }
        }
      } else {
        // Bot is authenticated or generic success
        showNotification(result.message, 'success');
        // Refresh bot status after a short delay
        setTimeout(() => {
          if (platform === 'all') {
            refreshBotStatus('whatsapp');
            refreshBotStatus('telegram');
          } else {
            refreshBotStatus(platform);
          }
        }, 3000);
      }
    } else {
      showNotification(`Error: ${result.message || `Failed to restart ${platformName} bot`}`, 'error');
    }
  } catch (error) {
    console.error('Restart error:', error);
    showNotification(`Error: Failed to restart ${platformName} bot`, 'error');
  }
}

// QR code function for WhatsApp
async function showQRCode(platform) {
  if (platform !== 'whatsapp') {
    showNotification('QR codes are only available for WhatsApp', 'info');
    return;
  }
  
  try {
    const response = await fetch('/api/bot/qr?platform=whatsapp');
    const result = await response.json();
    
    if (result.success && result.qr) {
      // Show QR code in modal
      const modal = document.getElementById('qr-modal');
      const qrImage = document.getElementById('qr-image');
      if (modal && qrImage) {
        qrImage.src = result.qr;
        modal.style.display = 'flex';
      }
    } else {
      showNotification('QR code not available. Bot may already be authenticated.', 'info');
    }
  } catch (error) {
    console.error('QR code error:', error);
    showNotification('Error: Failed to get QR code', 'error');
  }
}

async function fetchOrderDetails(orderId) {
  const modalBody = document.getElementById('order-details-body');
  
  try {
    const response = await fetch(`/admin/api/orders/${orderId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const order = await response.json();
    
    // Format the order details
    const orderDetails = `
      <div class="order-details">
        <div class="detail-row">
          <div class="detail-label">Order ID:</div>
          <div class="detail-value">${order.order_id || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Business:</div>
          <div class="detail-value">${order.business_name || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Customer:</div>
          <div class="detail-value">${order.customer_name || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Phone:</div>
          <div class="detail-value">${order.customer_phone || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status:</div>
          <div class="detail-value">
            <span class="status-badge ${order.status}">${order.status || 'N/A'}</span>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Items:</div>
          <div class="detail-value">${order.items || 'No items listed'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Address:</div>
          <div class="detail-value">${order.address || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Delivery Date:</div>
          <div class="detail-value">${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Delivery Person:</div>
          <div class="detail-value">${order.delivery_person || 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Created:</div>
          <div class="detail-value">${order.created_at ? new Date(order.created_at).toLocaleString() : 'N/A'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Updated:</div>
          <div class="detail-value">${order.updated_at ? new Date(order.updated_at).toLocaleString() : 'N/A'}</div>
        </div>
        ${order.notes ? `
        <div class="detail-row">
          <div class="detail-label">Notes:</div>
          <div class="detail-value">${order.notes}</div>
        </div>
        ` : ''}
      </div>
    `;
    
    modalBody.innerHTML = orderDetails;
    
  } catch (error) {
    console.error('Error fetching order details:', error);
    modalBody.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        Failed to load order details. Please try again.
      </div>
    `;
  }
}

// Attach order details modal event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Close modal when clicking outside or on close button
  const orderDetailsModal = document.getElementById('order-details-modal');
  const closeOrderDetailsBtn = document.getElementById('close-order-details-modal');
  
  if (orderDetailsModal) {
    orderDetailsModal.addEventListener('click', function(e) {
      if (e.target === orderDetailsModal) {
        closeOrderDetailsModal();
      }
    });
  }
  
  if (closeOrderDetailsBtn) {
    closeOrderDetailsBtn.addEventListener('click', closeOrderDetailsModal);
  }
  
  // Attach click handlers for view order details links
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('view-order-details')) {
      e.preventDefault();
      const orderId = e.target.getAttribute('data-order-id');
      if (orderId) {
        showOrderDetailsModal(orderId);
      }
    }
  });
}); 