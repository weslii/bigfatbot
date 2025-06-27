// Orders Charts and Analytics
class OrdersCharts {
  constructor(data) {
    this.data = data;
    this.charts = {};
  }

  initialize() {
    this.initializeStatusChart();
    this.initializeBusinessChart();
    this.initializeTrendChart();
  }

  initializeStatusChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    const statusData = this.getStatusData();
    this.charts.status = new Chart(ctx.getContext('2d'), {
      type: 'pie',
      data: {
        labels: statusData.labels,
        datasets: [{
          data: statusData.values,
          backgroundColor: ['#ffc107', '#17a2b8', '#28a745', '#dc3545'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  initializeBusinessChart() {
    const ctx = document.getElementById('businessChart');
    if (!ctx) return;

    const businessData = this.getBusinessData();
    this.charts.business = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: businessData.labels,
        datasets: [{
          data: businessData.values,
          backgroundColor: ['#007bff', '#6f42c1', '#e83e8c', '#fd7e14', '#20c997'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  initializeTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    const trendData = this.getTrendData();
    this.charts.trend = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: trendData.labels,
        datasets: [{
          label: 'Orders',
          data: trendData.values,
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  getStatusData() {
    const statusCount = {};
    
    this.data.orders.forEach(order => {
      statusCount[order.status] = (statusCount[order.status] || 0) + 1;
    });
    
    return {
      labels: Object.keys(statusCount).map(status => status.charAt(0).toUpperCase() + status.slice(1)),
      values: Object.values(statusCount)
    };
  }

  getBusinessData() {
    const businessCount = {};
    
    this.data.orders.forEach(order => {
      businessCount[order.business_name] = (businessCount[order.business_name] || 0) + 1;
    });
    
    return {
      labels: Object.keys(businessCount),
      values: Object.values(businessCount)
    };
  }

  getTrendData() {
    const last7Days = [];
    const today = new Date();
    
    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }
    
    // Count orders per day
    const dayCount = {};
    last7Days.forEach(day => {
      dayCount[day] = 0;
    });
    
    this.data.orders.forEach(order => {
      const orderDate = new Date(order.created_at).toISOString().split('T')[0];
      if (dayCount.hasOwnProperty(orderDate)) {
        dayCount[orderDate]++;
      }
    });
    
    return {
      labels: last7Days.map(day => new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      values: Object.values(dayCount)
    };
  }
}

// Real-time updates
class RealTimeUpdates {
  constructor(userId) {
    this.userId = userId;
    this.lastOrderCount = 0;
    this.interval = null;
  }

  start() {
    this.interval = setInterval(() => this.checkForNewOrders(), 30000);
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkForNewOrders();
      }
    });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  async checkForNewOrders() {
    try {
      const currentFilters = this.getCurrentFilters();
      const queryParams = new URLSearchParams({
        ...currentFilters,
        userId: this.userId,
        count_only: 'true'
      });
      
      const response = await fetch(`/api/orders/count?${queryParams}`);
      const data = await response.json();
      
      if (data.count > this.lastOrderCount) {
        const newOrders = data.count - this.lastOrderCount;
        this.showNotification(`You have ${newOrders} new order${newOrders > 1 ? 's' : ''}!`, 'success');
        this.lastOrderCount = data.count;
        
        // Refresh the page after a short delay to show new orders
        setTimeout(() => {
          location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error('Error checking for new orders:', error);
    }
  }

  getCurrentFilters() {
    const filters = {};
    
    const businessFilter = document.getElementById('business');
    if (businessFilter && businessFilter.value) {
      filters.business_id = businessFilter.value;
    }
    
    const statusFilter = document.getElementById('status');
    if (statusFilter && statusFilter.value) {
      filters.status = statusFilter.value;
    }
    
    const searchFilter = document.getElementById('search');
    if (searchFilter && searchFilter.value) {
      filters.search = searchFilter.value;
    }
    
    return filters;
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize charts if data is available
  if (window.chartData) {
    window.ordersCharts = new OrdersCharts(window.chartData);
    window.ordersCharts.initialize();
  }

  // AJAX filter logic
  const filtersForm = document.getElementById('filtersForm');
  if (filtersForm) {
    filtersForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(filtersForm);
      const params = new URLSearchParams(formData);
      // Optionally add pageSize and page if present in URL
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('pageSize')) params.set('pageSize', urlParams.get('pageSize'));
      if (urlParams.get('page')) params.set('page', urlParams.get('page'));
      
      try {
        // Fetch filtered data as JSON
        const res = await fetch(window.location.pathname + '?' + params.toString(), { 
          headers: { 'X-Requested-With': 'XMLHttpRequest' } 
        });
        if (!res.ok) throw new Error('Failed to fetch filtered orders');
        const data = await res.json();
        
        // Update orders table
        updateOrdersTable(data.orders, data.totalOrders);
        
        // Update pagination
        updatePagination(data.page, data.totalPages, data.totalOrders, data.pageSize, params);
        
        // Update charts
        if (window.ordersCharts) {
          window.ordersCharts.data = data.chartData;
          window.ordersCharts.initialize();
        }
        
        // Update URL without page reload
        const newUrl = window.location.pathname + '?' + params.toString();
        window.history.pushState({}, '', newUrl);
        
      } catch (error) {
        console.error('Filter error:', error);
        alert('Failed to apply filters. Please try again.');
      }
    });
  }

  // Helper function to update orders table
  function updateOrdersTable(orders, totalOrders) {
    const tbody = document.querySelector('.data-table tbody');
    const ordersCount = document.querySelector('.card-title');
    
    if (!tbody) return;
    
    // Update orders count
    if (ordersCount) {
      ordersCount.innerHTML = `<i class="fas fa-box"></i> Orders (${totalOrders})`;
    }
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    if (orders && orders.length > 0) {
      orders.forEach(order => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${order.order_id}</strong></td>
          <td><span class="business-badge">${order.business_name}</span></td>
          <td>${order.customer_name}</td>
          <td><span class="status-badge ${order.status}">${order.status}</span></td>
          <td>${new Date(order.created_at).toLocaleDateString()}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-sm btn-outline" onclick="viewOrder('${order.id}')">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-outline" onclick="editOrder('${order.id}')">
                <i class="fas fa-edit"></i>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
    } else {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="6" class="no-orders">
          <i class="fas fa-box-open"></i>
          <p>No orders found matching your criteria.</p>
        </td>
      `;
      tbody.appendChild(row);
    }
  }

  // Helper function to update pagination
  function updatePagination(currentPage, totalPages, totalOrders, pageSize, params) {
    const paginationContainer = document.querySelector('.pagination');
    if (!paginationContainer || totalPages <= 1) {
      if (paginationContainer) paginationContainer.remove();
      return;
    }
    
    const startItem = (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalOrders);
    
    let paginationHTML = `
      <div class="pagination-info">
        Showing ${startItem} to ${endItem} of ${totalOrders} orders
      </div>
      <nav class="pagination-nav">
    `;
    
    // Previous button
    paginationHTML += `
      <button class="pagination-btn ${currentPage <= 1 ? 'disabled' : ''}" 
              ${currentPage <= 1 ? 'disabled' : ''} 
              onclick="changePage(${currentPage - 1})">
        <i class="fas fa-chevron-left"></i>
      </button>
    `;
    
    // Page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    if (startPage > 1) {
      paginationHTML += `<button class="pagination-btn" onclick="changePage(1)">1</button>`;
      if (startPage > 2) paginationHTML += `<span class="pagination-btn disabled">...</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <button class="pagination-btn ${i === currentPage ? 'active' : ''}" 
                onclick="changePage(${i})">${i}</button>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) paginationHTML += `<span class="pagination-btn disabled">...</span>`;
      paginationHTML += `<button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    paginationHTML += `
      <button class="pagination-btn ${currentPage >= totalPages ? 'disabled' : ''}" 
              ${currentPage >= totalPages ? 'disabled' : ''} 
              onclick="changePage(${currentPage + 1})">
        <i class="fas fa-chevron-right"></i>
      </button>
    </nav>`;
    
    paginationContainer.innerHTML = paginationHTML;
  }

  // Global function for pagination
  window.changePage = async function(page) {
    const formData = new FormData(document.getElementById('filtersForm'));
    const params = new URLSearchParams(formData);
    params.set('page', page);
    
    // Add pageSize if present
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pageSize')) params.set('pageSize', urlParams.get('pageSize'));
    
    try {
      const res = await fetch(window.location.pathname + '?' + params.toString(), { 
        headers: { 'X-Requested-With': 'XMLHttpRequest' } 
      });
      if (!res.ok) throw new Error('Failed to fetch page');
      const data = await res.json();
      
      updateOrdersTable(data.orders, data.totalOrders);
      updatePagination(data.page, data.totalPages, data.totalOrders, data.pageSize, params);
      
      if (window.ordersCharts) {
        window.ordersCharts.data = data.chartData;
        window.ordersCharts.initialize();
      }
      
      const newUrl = window.location.pathname + '?' + params.toString();
      window.history.pushState({}, '', newUrl);
      
    } catch (error) {
      console.error('Page change error:', error);
      alert('Failed to load page. Please try again.');
    }
  };

  // Initialize real-time updates
  if (window.chartData && window.chartData.userId) {
    const realTime = new RealTimeUpdates(window.chartData.userId);
    realTime.start();
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      realTime.stop();
    });
  }
}); 