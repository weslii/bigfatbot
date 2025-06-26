// Fetch businesses and users for dropdowns
async function fetchDropdowns() {
  try {
    const [businessesRes, usersRes] = await Promise.all([
      fetch('/admin/api/businesses'),
      fetch('/admin/api/users')
    ]);
    const businesses = (await businessesRes.json()).businesses || [];
    const users = (await usersRes.json()).users || [];
    const businessSelect = document.getElementById('business');
    const userSelect = document.getElementById('user');
    businesses.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.business_id;
      opt.textContent = b.business_name;
      businessSelect.appendChild(opt);
    });
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.full_name + (u.email ? ` (${u.email})` : '');
      userSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to fetch dropdowns', err);
  }
}

// Fetch and render summary stats
async function fetchAndRenderStats() {
  const form = document.getElementById('report-filter-form');
  const summaryCards = document.getElementById('summary-cards');
  const formData = new FormData(form);
  let [startDate, endDate] = (formData.get('date-range') || '').split(' to ');
  const businessId = formData.get('business');
  const userId = formData.get('user');
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (businessId) params.append('businessId', businessId);
  if (userId) params.append('userId', userId);
  try {
    const res = await fetch('/admin/api/reports?' + params.toString());
    const { success, stats } = await res.json();
    if (!success) throw new Error('Failed to fetch stats');
    renderSummaryCards(stats);
    renderTotalOrdersHandledCard(stats);
    window.currentReportStats = stats;
    renderAllCharts(stats);
  } catch (err) {
    summaryCards.innerHTML = '<div style="color: var(--danger);">Failed to load report stats.</div>';
    console.error('Failed to fetch stats', err);
  }
}

function renderSummaryCards(stats) {
  const summaryCards = document.getElementById('summary-cards');
  summaryCards.innerHTML = `
    <div style="display: flex; flex-wrap: wrap; gap: 0.7rem; width: 100%;">
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Total Businesses</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.totalBusinesses}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Active Businesses</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.activeBusinesses}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">New Businesses</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.newBusinesses}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Total Users</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.totalUsers}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">New Users</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.newUsers}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Total Orders</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.totalOrders}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">New Orders</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.newOrders}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Parsing Success Rate</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.parsingSuccessRate.toFixed(2)}%</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Parsing Attempts</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.parsingAttempts}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Parsing Successes</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.parsingSuccesses}</div>
      </div>
      <div class="summary-card" style="flex: 1 1 180px; min-width: 140px; padding: 0.7rem 1rem; font-size: 0.97rem;">
        <div class="summary-title" style="font-size: 0.97rem;">Parsing Failures</div>
        <div class="summary-value" style="font-size: 1.25rem; font-weight: 700;">${stats.parsingFailures}</div>
      </div>
    </div>
  `;
}

function renderTotalOrdersHandledCard(stats) {
  const card = document.getElementById('total-orders-handled-card');
  card.innerHTML = `
    <div class="summary-card" style="min-width: 200px; padding: 1.5rem 2rem; font-size: 1.1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-lg); margin-bottom: 1rem;">
      <div class="summary-title" style="font-size: 1.1rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.5rem;">Total Orders Handled</div>
      <div class="summary-value" style="font-size: 2.5rem; font-weight: 800; color: var(--primary-color); line-height: 1;">${stats.totalOrdersAllTime}</div>
    </div>
  `;
}

// Export summary stats as CSV
function exportStatsAsCSV() {
  const stats = window.currentReportStats;
  if (!stats) return;
  const rows = [
    ['Metric', 'Value'],
    ['Total Businesses', stats.totalBusinesses],
    ['Active Businesses', stats.activeBusinesses],
    ['New Businesses', stats.newBusinesses],
    ['Total Users', stats.totalUsers],
    ['New Users', stats.newUsers],
    ['Total Orders', stats.totalOrders],
    ['New Orders', stats.newOrders],
    ['Parsing Success Rate', stats.parsingSuccessRate.toFixed(2) + '%'],
    ['Parsing Attempts', stats.parsingAttempts],
    ['Parsing Successes', stats.parsingSuccesses],
    ['Parsing Failures', stats.parsingFailures],
  ];
  const csv = rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'report-summary.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Simulate time-series data for parsing success rate (replace with real API if available)
function getParsingSuccessTimeSeries() {
  // Simulate 14 days of data
  const today = new Date();
  const data = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    data.push({
      date: d.toISOString().slice(0, 10),
      rate: 90 + Math.random() * 10 // Simulate 90-100% success
    });
  }
  return data;
}

async function getParsingSuccessTimeSeriesReal() {
  try {
    const res = await fetch('/admin/api/reports/parsing-time-series?days=14');
    const { success, data } = await res.json();
    if (!success) throw new Error('API error');
    return data;
  } catch (err) {
    console.error('Failed to fetch real parsing time-series', err);
    throw err;
  }
}

async function renderParsingSuccessChart() {
  const chartContainer = document.getElementById('parsing-success-chart');
  try {
    const ctx = chartContainer.getContext('2d');
    const timeSeries = await getParsingSuccessTimeSeriesReal();
    const labels = timeSeries.map(d => d.date);
    const data = timeSeries.map(d => d.rate);
    if (window.parsingChart) window.parsingChart.destroy();
    window.parsingChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Parsing Success Rate (%)',
          data,
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: 'rgba(54, 162, 235, 1)'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: { min: 0, max: 100, title: { display: true, text: '%' } },
          x: { title: { display: true, text: 'Date' } }
        }
      }
    });
  } catch (err) {
    if (window.parsingChart) window.parsingChart.destroy();
    chartContainer.parentElement.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 2rem 0;">Failed to load parsing success rate chart.</div>';
  }
}

// Export as PDF
function exportStatsAsPDF() {
  const stats = window.currentReportStats;
  if (!stats) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Report Summary', 14, 18);
  doc.setFontSize(12);
  const rows = [
    ['Metric', 'Value'],
    ['Total Businesses', stats.totalBusinesses],
    ['Active Businesses', stats.activeBusinesses],
    ['New Businesses', stats.newBusinesses],
    ['Total Users', stats.totalUsers],
    ['New Users', stats.newUsers],
    ['Total Orders', stats.totalOrders],
    ['New Orders', stats.newOrders],
    ['Parsing Success Rate', stats.parsingSuccessRate.toFixed(2) + '%'],
    ['Parsing Attempts', stats.parsingAttempts],
    ['Parsing Successes', stats.parsingSuccesses],
    ['Parsing Failures', stats.parsingFailures],
  ];
  let y = 30;
  rows.forEach(([k, v]) => {
    doc.text(`${k}: ${v}`, 14, y);
    y += 8;
  });
  doc.save('report-summary.pdf');
}

// Export as Excel
function exportStatsAsExcel() {
  const stats = window.currentReportStats;
  if (!stats) return;
  const ws_data = [
    ['Metric', 'Value'],
    ['Total Businesses', stats.totalBusinesses],
    ['Active Businesses', stats.activeBusinesses],
    ['New Businesses', stats.newBusinesses],
    ['Total Users', stats.totalUsers],
    ['New Users', stats.newUsers],
    ['Total Orders', stats.totalOrders],
    ['New Orders', stats.newOrders],
    ['Parsing Success Rate', stats.parsingSuccessRate.toFixed(2) + '%'],
    ['Parsing Attempts', stats.parsingAttempts],
    ['Parsing Successes', stats.parsingSuccesses],
    ['Parsing Failures', stats.parsingFailures],
  ];
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report Summary');
  XLSX.writeFile(wb, 'report-summary.xlsx');
}

// Flatpickr date range
flatpickr('#date-range', {
  mode: 'range',
  dateFormat: 'Y-m-d',
  maxDate: 'today',
  plugins: [new rangePlugin({ input: '#date-range' })]
});

let businessUserBarChart = null;
let ordersBarChart = null;
let parsingPieChart = null;
let parsingBarChart = null;

function renderBusinessUserBarChart(stats) {
  const ctx = document.getElementById('businessUserBarChart').getContext('2d');
  if (businessUserBarChart) businessUserBarChart.destroy();
  businessUserBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Businesses', 'Active Businesses', 'New Businesses', 'Total Users', 'New Users'],
      datasets: [{
        label: 'Count',
        data: [stats.totalBusinesses, stats.activeBusinesses, stats.newBusinesses, stats.totalUsers, stats.newUsers],
        backgroundColor: [
          'rgba(54, 162, 235, 0.7)',
          'rgba(75, 192, 192, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 99, 132, 0.7)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderOrdersBarChart(stats) {
  const ctx = document.getElementById('ordersBarChart').getContext('2d');
  if (ordersBarChart) ordersBarChart.destroy();
  ordersBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Orders', 'New Orders'],
      datasets: [{
        label: 'Count',
        data: [stats.totalOrders, stats.newOrders],
        backgroundColor: [
          'rgba(255, 159, 64, 0.7)',
          'rgba(54, 162, 235, 0.7)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderParsingPieChart(stats) {
  const ctx = document.getElementById('parsingPieChart').getContext('2d');
  if (parsingPieChart) parsingPieChart.destroy();
  parsingPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Successes', 'Failures'],
      datasets: [{
        data: [stats.parsingSuccesses, stats.parsingFailures],
        backgroundColor: [
          'rgba(75, 192, 192, 0.7)',
          'rgba(255, 99, 132, 0.7)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderParsingBarChart(stats) {
  const ctx = document.getElementById('parsingBarChart').getContext('2d');
  if (parsingBarChart) parsingBarChart.destroy();
  parsingBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Attempts', 'Successes', 'Failures'],
      datasets: [{
        label: 'Count',
        data: [stats.parsingAttempts, stats.parsingSuccesses, stats.parsingFailures],
        backgroundColor: [
          'rgba(54, 162, 235, 0.7)',
          'rgba(75, 192, 192, 0.7)',
          'rgba(255, 99, 132, 0.7)'
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// Update all charts when stats change
function renderAllCharts(stats) {
  renderBusinessUserBarChart(stats);
  renderOrdersBarChart(stats);
  renderParsingPieChart(stats);
  renderParsingBarChart(stats);
}

document.getElementById('report-filter-form').addEventListener('submit', function(e) {
  e.preventDefault();
  fetchAndRenderStats();
  renderParsingSuccessChart();
});
document.getElementById('export-btn').addEventListener('click', exportStatsAsCSV);
document.getElementById('export-pdf-btn').addEventListener('click', exportStatsAsPDF);
document.getElementById('export-excel-btn').addEventListener('click', exportStatsAsExcel);

// Initial load
fetchDropdowns().then(() => {
  fetchAndRenderStats();
  renderParsingSuccessChart();
}); 