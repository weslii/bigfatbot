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
    const charts = new OrdersCharts(window.chartData);
    charts.initialize();
  }

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