// public/js/admin-orders.js
// Handles AJAX pagination and refresh for the admin orders table

document.addEventListener('DOMContentLoaded', function () {
  const tableBody = document.querySelector('.data-table tbody');
  const paginationContainer = document.getElementById('orders-pagination');
  const filterForm = document.querySelector('.filter-bar');
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.className = 'btn btn-secondary';
  refreshBtn.style.marginLeft = '1rem';
  filterForm.appendChild(refreshBtn);

  let currentPage = 1;
  let pageSize = 10;

  // Success message element
  const successMsg = document.createElement('div');
  successMsg.className = 'notification notification-success';
  successMsg.style.display = 'none';
  successMsg.style.position = 'fixed';
  successMsg.style.top = '30px';
  successMsg.style.left = '50%';
  successMsg.style.transform = 'translateX(-50%)';
  successMsg.style.zIndex = '9999';
  document.body.appendChild(successMsg);

  function showSuccess(msg) {
    successMsg.textContent = msg;
    successMsg.style.display = 'block';
    setTimeout(() => { successMsg.style.display = 'none'; }, 2000);
  }

  function fetchOrders(page = 1) {
    const params = new URLSearchParams(new FormData(filterForm));
    params.set('page', page);
    params.set('pageSize', pageSize);
    // Add date filters if present
    const dateFrom = filterForm.querySelector('[name="date_from"]').value;
    const dateTo = filterForm.querySelector('[name="date_to"]').value;
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    fetch(`/admin/api/orders?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        renderTable(data.orders);
        renderPagination(data.page, data.totalPages);
      });
  }

  function renderTable(orders) {
    tableBody.innerHTML = '';
    if (!orders || orders.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No orders found.</td></tr>';
      return;
    }
    orders.forEach(order => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight: 600; color: var(--text-primary);">${order.order_id}</td>
        <td style="color: var(--text-secondary);">${order.business_name}</td>
        <td style="color: var(--text-secondary);">${order.customer_name}</td>
        <td>${renderStatusBadge(order.status)}</td>
        <td style="color: var(--text-muted);">${new Date(order.created_at).toLocaleString()}</td>
        <td style="white-space: nowrap;">
          <div style="display: flex; align-items: center; gap: 0.3rem;">
            <button type="button" class="btn btn-icon btn-edit" title="View Details" style="width: 2rem; height: 2rem; font-size: 1rem;" data-order='${JSON.stringify(order)}'><i class="fas fa-eye"></i></button>
            <button type="button" class="btn btn-icon btn-edit" title="Edit" style="width: 2rem; height: 2rem; font-size: 1rem;" data-order='${JSON.stringify(order)}'><i class="fas fa-edit"></i></button>
            <button type="button" class="btn btn-icon btn-delete" title="Delete" style="width: 2rem; height: 2rem; font-size: 1rem;"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      // Attach view button event
      row.querySelector('.btn.btn-icon.btn-edit[title="View Details"]').onclick = function() {
        const order = JSON.parse(this.getAttribute('data-order'));
        showAjaxViewModal(order);
      };
      // Attach edit button event
      row.querySelector('.btn.btn-icon.btn-edit[title="Edit"]').onclick = function() {
        const order = JSON.parse(this.getAttribute('data-order'));
        showAjaxEditModal(order);
      };
      // Attach delete button event
      row.querySelector('.btn.btn-icon.btn-delete[title="Delete"]').onclick = async function() {
        if (confirm('Are you sure you want to delete this order?')) {
          try {
            const res = await fetch(`/admin/orders/${order.id}/delete`, { method: 'POST' });
            if (res.ok) {
              fetchOrders(currentPage);
              showSuccess('Order deleted successfully!');
            } else {
              alert('Failed to delete order.');
            }
          } catch (err) {
            alert('Error deleting order.');
          }
        }
      };
      tableBody.appendChild(row);
    });
  }

  function renderStatusBadge(status) {
    if (status === 'completed') return '<span class="status-badge active">Completed</span>';
    if (status === 'pending') return '<span class="status-badge warning">Pending</span>';
    if (status === 'cancelled') return '<span class="status-badge danger">Cancelled</span>';
    return `<span class="status-badge">${status}</span>`;
  }

  function renderPagination(page, totalPages) {
    paginationContainer.innerHTML = '';
    if (totalPages <= 1) return;
    // Prev button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    prevBtn.className = 'pagination-btn';
    prevBtn.disabled = page <= 1;
    prevBtn.onclick = () => {
      if (page > 1) {
        currentPage = page - 1;
        fetchOrders(currentPage);
      }
    };
    paginationContainer.appendChild(prevBtn);
    // Page number buttons
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.className = 'pagination-btn' + (i === page ? ' active' : '');
      btn.onclick = () => {
        currentPage = i;
        fetchOrders(currentPage);
      };
      paginationContainer.appendChild(btn);
    }
    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.className = 'pagination-btn';
    nextBtn.disabled = page >= totalPages;
    nextBtn.onclick = () => {
      if (page < totalPages) {
        currentPage = page + 1;
        fetchOrders(currentPage);
      }
    };
    paginationContainer.appendChild(nextBtn);
  }

  filterForm.addEventListener('submit', function (e) {
    e.preventDefault();
    currentPage = 1;
    fetchOrders(currentPage);
  });

  refreshBtn.addEventListener('click', function (e) {
    e.preventDefault();
    fetchOrders(currentPage);
  });

  // Initial fetch
  fetchOrders(currentPage);

  // AJAX View Modal logic
  window.showAjaxViewModal = function(order) {
    const modal = document.getElementById('ajaxViewOrderModal');
    const body = document.getElementById('ajaxViewOrderBody');
    body.innerHTML = `
      <div class="order-details">
        <div class="detail-row"><div class="detail-label">Order ID:</div><div class="detail-value">${order.order_id}</div></div>
        <div class="detail-row"><div class="detail-label">Business:</div><div class="detail-value">${order.business_name}</div></div>
        <div class="detail-row"><div class="detail-label">Customer:</div><div class="detail-value">${order.customer_name}</div></div>
        <div class="detail-row"><div class="detail-label">Phone:</div><div class="detail-value">${order.customer_phone || ''}</div></div>
        <div class="detail-row"><div class="detail-label">Status:</div><div class="detail-value"><span class="status-badge ${order.status}">${order.status}</span></div></div>
        <div class="detail-row"><div class="detail-label">Items:</div><div class="detail-value">${order.items || ''}</div></div>
        <div class="detail-row"><div class="detail-label">Address:</div><div class="detail-value">${order.address || ''}</div></div>
        <div class="detail-row"><div class="detail-label">Delivery Date:</div><div class="detail-value">${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'N/A'}</div></div>
        <div class="detail-row"><div class="detail-label">Delivery Person:</div><div class="detail-value">${order.delivery_person || 'N/A'}</div></div>
        <div class="detail-row"><div class="detail-label">Created:</div><div class="detail-value">${order.created_at ? new Date(order.created_at).toLocaleString() : ''}</div></div>
        <div class="detail-row"><div class="detail-label">Updated:</div><div class="detail-value">${order.updated_at ? new Date(order.updated_at).toLocaleString() : ''}</div></div>
        ${order.notes ? `<div class="detail-row"><div class="detail-label">Notes:</div><div class="detail-value">${order.notes}</div></div>` : ''}
      </div>
    `;
    modal.style.display = 'flex';
  };
  window.closeAjaxViewModal = function() {
    document.getElementById('ajaxViewOrderModal').style.display = 'none';
  };

  // AJAX Edit Modal logic
  window.showAjaxEditModal = function(order) {
    const modal = document.getElementById('ajaxEditOrderModal');
    const body = document.getElementById('ajaxEditOrderBody');
    body.innerHTML = `
      <form id="ajaxEditOrderForm">
        <div class="form-group">
          <label>Status</label>
          <select name="status" class="form-select">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Items</label>
          <textarea name="items" class="form-textarea" rows="4" placeholder="Enter order items...">${order.items || ''}</textarea>
          <small class="form-help">Enter the items as plain text</small>
        </div>
        <div class="form-group full-width">
          <label>Notes</label>
          <textarea name="notes" class="form-textarea" rows="3" placeholder="Add any additional notes...">${order.notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="primary-btn"><i class="fas fa-save"></i> Save Changes</button>
          <button type="button" class="secondary-btn" onclick="closeAjaxEditModal()"><i class="fas fa-times"></i> Cancel</button>
        </div>
      </form>
    `;
    modal.style.display = 'flex';
    // Attach submit handler
    document.getElementById('ajaxEditOrderForm').onsubmit = async function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      const payload = {};
      for (let [key, value] of formData.entries()) payload[key] = value;
      try {
        const res = await fetch(`/admin/orders/${order.id}/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          closeAjaxEditModal();
          showSuccess('Order updated successfully!');
          fetchOrders(currentPage); // Refresh table
        } else {
          alert('Failed to update order.');
        }
      } catch (err) {
        alert('Error updating order.');
      }
    };
  };
  window.closeAjaxEditModal = function() {
    document.getElementById('ajaxEditOrderModal').style.display = 'none';
  };
}); 