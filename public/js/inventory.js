// Inventory Management JavaScript

class InventoryManager {
  constructor() {
    this.currentFilter = 'all';
    this.searchTerm = '';
    this.editingItem = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.setupSearch();
    this.setupFilters();
    this.highlightActiveKPI();
    this.handleAutoScroll();
  }

  bindEvents() {
    // Add item button
    document.getElementById('addItemBtn')?.addEventListener('click', () => this.openModal());
    document.getElementById('addFirstItemBtn')?.addEventListener('click', () => this.openModal());

    // Modal events
    document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeModal());
    document.getElementById('itemForm')?.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Delete modal events
    document.getElementById('closeDeleteModal')?.addEventListener('click', () => this.closeDeleteModal());
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => this.closeDeleteModal());
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete());

    // Item type change
    document.getElementById('itemType')?.addEventListener('change', (e) => this.handleItemTypeChange(e));

    // KPI card clicks
    document.addEventListener('click', (e) => {
      if (e.target.closest('.clickable-kpi')) {
        const kpiCard = e.target.closest('.clickable-kpi');
        this.handleKPIClick(kpiCard.dataset.filter);
      }
    });

    // KPI card keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const kpiCard = e.target.closest('.clickable-kpi');
        if (kpiCard) {
          e.preventDefault();
          this.handleKPIClick(kpiCard.dataset.filter);
        }
      }
    });

    // Card click functionality
    this.setupCardClicks();

    // Collection card clicks (only for collections)
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.inventory-card.clickable');
      if (card) {
        const itemId = card.dataset.id;
        const itemType = card.dataset.type;
        
        // Only navigate for collections
        if (itemType === 'collection') {
          console.log('Collection card clicked:', itemId);
          window.location.href = `/inventory/collection/${itemId}`;
        }
      }
    });

    // Modal backdrop click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeModal();
        this.closeDeleteModal();
        this.closeItemDetailsModal();
      }
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.closeDeleteModal();
        this.closeItemDetailsModal();
      }
    });
  }

  setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.searchTerm = e.target.value;
        this.performSearch();
      }, 300);
    });
  }

  setupFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Update URL with filter parameter
        const url = new URL(window.location);
        url.searchParams.set('filter', e.target.dataset.filter);
        url.searchParams.delete('search'); // Clear search when filtering
        window.location.href = url.toString();
      });
    });
  }

  async performSearch() {
    try {
      const params = new URLSearchParams();
      if (this.searchTerm) params.append('search', this.searchTerm);
      if (this.currentFilter !== 'all') params.append('filter', this.currentFilter);

      const response = await fetch(`/inventory?${params.toString()}`);
      if (response.ok) {
        window.location.href = `/inventory?${params.toString()}`;
      }
    } catch (error) {
      console.error('Search error:', error);
      this.showNotification('Search failed', 'error');
    }
  }

  applyFilters() {
    const cards = document.querySelectorAll('.inventory-card');
    cards.forEach(card => {
      const cardType = card.dataset.type;
      const shouldShow = this.currentFilter === 'all' || cardType === this.currentFilter;
      card.style.display = shouldShow ? 'block' : 'none';
    });
  }

  openModal(item = null) {
    const modal = document.getElementById('itemModal');
    const form = document.getElementById('itemForm');
    const title = document.getElementById('modalTitle');

    if (item) {
      // Edit mode
      this.editingItem = item;
      title.textContent = 'Edit Item';
      this.populateForm(item);
    } else {
      // Add mode
      this.editingItem = null;
      title.textContent = 'Add Item';
      form.reset();
      this.handleItemTypeChange({ target: { value: 'product' } });
    }

    modal.classList.add('show');
    document.getElementById('itemName').focus();
  }

  closeModal() {
    const modal = document.getElementById('itemModal');
    modal.classList.remove('show');
    this.editingItem = null;
  }

  populateForm(item) {
    document.getElementById('itemType').value = item.type;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemDescription').value = item.description || '';
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemImage').value = item.image_url || '';
    
    if (item.type === 'product') {
      document.getElementById('itemStock').value = item.stock_count || 0;
      document.querySelector('.product-only').style.display = 'block';
    } else {
      document.querySelector('.product-only').style.display = 'none';
    }
  }

  handleItemTypeChange(e) {
    const type = e.target.value;
    const stockField = document.querySelector('.product-only');
    const collectionTypeField = document.querySelector('.collection-only');
    
    // Hide all conditional fields first
    stockField.style.display = 'none';
    collectionTypeField.style.display = 'none';
    
    if (type === 'product') {
      stockField.style.display = 'block';
    } else if (type === 'collection') {
      collectionTypeField.style.display = 'block';
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      description: formData.get('description'),
      price: parseFloat(formData.get('price')),
      image_url: formData.get('image_url') || null
    };

    if (formData.get('type') === 'product') {
      data.stock_count = parseInt(formData.get('stock_count')) || 0;
    } else if (formData.get('type') === 'collection') {
      data.type = formData.get('collection_type');
    }

    try {
      let response;
      if (this.editingItem) {
        // Update existing item
        response = await fetch(`/inventory/${this.getEndpoint(this.editingItem.type)}/${this.editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        // Create new item
        response = await fetch(`/inventory/${this.getEndpoint(formData.get('type'))}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (response.ok) {
        this.showNotification(
          this.editingItem ? 'Item updated successfully' : 'Item created successfully',
          'success'
        );
        this.closeModal();
        // Reload page to show updated data
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save item');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      this.showNotification(error.message, 'error');
    }
  }

  getEndpoint(type) {
    switch (type) {
      case 'product': return 'products';
      case 'other': return 'others';
      case 'collection': return 'collections';
      default: return 'products';
    }
  }

  async editItem(id, type) {
    try {
      const response = await fetch(`/inventory/${this.getEndpoint(type)}/${id}`);
      if (response.ok) {
        const item = await response.json();
        item.type = type;
        this.openModal(item);
      } else {
        throw new Error('Failed to load item');
      }
    } catch (error) {
      console.error('Edit error:', error);
      this.showNotification('Failed to load item for editing', 'error');
    }
  }

  deleteItem(id, type) {
    this.itemToDelete = { id, type };
    const modal = document.getElementById('deleteModal');
    modal.classList.add('show');
  }

  closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.classList.remove('show');
    this.itemToDelete = null;
  }

  async confirmDelete() {
    if (!this.itemToDelete) return;

    try {
      const response = await fetch(`/inventory/${this.getEndpoint(this.itemToDelete.type)}/${this.itemToDelete.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        this.showNotification('Item deleted successfully', 'success');
        this.closeDeleteModal();
        // Reload page to show updated data
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error('Failed to delete item');
      }
    } catch (error) {
      console.error('Delete error:', error);
      this.showNotification('Failed to delete item', 'error');
    }
  }

  handleKPIClick(filter) {
    const url = new URL(window.location);
    const currentFilter = url.searchParams.get('filter');
    
    // If clicking the same filter that's already active, clear it
    if (currentFilter === filter) {
      url.searchParams.delete('filter');
      url.searchParams.delete('search'); // Clear search when clearing filter
    } else {
      // Set new filter and clear search
      url.searchParams.set('filter', filter);
      url.searchParams.delete('search');
    }
    
    // Add scroll target to URL
    url.searchParams.set('scroll', 'inventory');
    
    window.location.href = url.toString();
  }

  highlightActiveKPI() {
    const urlParams = new URLSearchParams(window.location.search);
    const currentFilter = urlParams.get('filter');
    
    // Remove active class from all KPI cards first
    document.querySelectorAll('.clickable-kpi').forEach(kpi => {
      kpi.classList.remove('kpi-active');
    });
    
    // Add active class to current filter if it exists
    if (currentFilter && currentFilter !== 'all') {
      const activeKPI = document.querySelector(`[data-filter="${currentFilter}"]`);
      if (activeKPI) {
        activeKPI.classList.add('kpi-active');
      }
    }
  }

  handleAutoScroll() {
    const urlParams = new URLSearchParams(window.location.search);
    const scrollTarget = urlParams.get('scroll');
    
    if (scrollTarget === 'inventory') {
      // Remove the scroll parameter from URL
      const url = new URL(window.location);
      url.searchParams.delete('scroll');
      window.history.replaceState({}, '', url.toString());
      
      // Find the inventory section and scroll to it
      const inventorySection = document.querySelector('.content-card');
      if (inventorySection) {
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => {
          inventorySection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          });
        }, 100);
      }
    }
  }

  setupCardClicks() {
    let longPressTimer = null;
    let currentItem = null;
    let isTouchDevice = false;
    let hasLongPressed = false;

    // Detect touch device
    document.addEventListener('touchstart', () => {
      isTouchDevice = true;
    }, { once: true });

    // Desktop: Click to show details modal (only on non-touch devices)
    document.addEventListener('click', (e) => {
      // Skip click events on touch devices to prevent double-triggering
      if (isTouchDevice) {
        return;
      }

      const card = e.target.closest('.inventory-card');
      if (card && !card.classList.contains('clickable')) {
        const itemId = card.dataset.id;
        const itemType = card.dataset.type;
        
        console.log('Card clicked (desktop):', { itemId, itemType });
        
        if (itemType !== 'collection') {
          currentItem = { id: itemId, type: itemType };
          console.log('Opening details modal for:', currentItem);
          this.showItemDetailsModal(itemId, itemType);
        }
      }
    });

    // Mobile: Long press to show details modal
    document.addEventListener('touchstart', (e) => {
      const card = e.target.closest('.inventory-card');
      if (card && !card.classList.contains('clickable')) {
        const itemId = card.dataset.id;
        const itemType = card.dataset.type;
        
        console.log('Touch start on card:', { itemId, itemType });
        
        if (itemType !== 'collection') {
          hasLongPressed = false;
          longPressTimer = setTimeout(() => {
            hasLongPressed = true;
            currentItem = { id: itemId, type: itemType };
            console.log('Long press detected, opening details modal for:', currentItem);
            this.showItemDetailsModal(itemId, itemType);
          }, 500); // 500ms long press
        }
      }
    });

    document.addEventListener('touchend', (e) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      
      // Prevent click event if long press was detected
      if (hasLongPressed) {
        e.preventDefault();
        hasLongPressed = false;
      }
    });

    document.addEventListener('touchmove', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    // Item details modal events
    document.getElementById('closeDetailsModal')?.addEventListener('click', () => this.closeItemDetailsModal());
    document.getElementById('cancelDetailsBtn')?.addEventListener('click', () => this.closeItemDetailsModal());
    document.getElementById('itemDetailsForm')?.addEventListener('submit', (e) => this.handleDetailsFormSubmit(e));
    document.getElementById('deleteItemBtn')?.addEventListener('click', () => this.handleDeleteFromDetails());
    document.getElementById('detailsItemType')?.addEventListener('change', (e) => this.handleDetailsItemTypeChange(e));
  }

  async showItemDetailsModal(itemId, itemType) {
    try {
      // Fetch item details - use the correct endpoint without /api/
      const endpoint = itemType === 'product' ? 'products' : 'others';
      const response = await fetch(`/inventory/${endpoint}/${itemId}`);
      if (!response.ok) throw new Error('Failed to fetch item details');
      
      const item = await response.json();
      
      // Show the modal first
      const modal = document.getElementById('itemDetailsModal');
      console.log('Modal element found:', modal);
      modal.classList.add('show');
      console.log('Modal show class added');
      
      // Populate the details form after modal is shown
      this.populateDetailsForm(item);
      
      // Ensure stock field is visible after a brief delay to allow DOM updates
      setTimeout(() => {
        if (item.type === 'product') {
          const stockField = document.querySelector('#itemDetailsModal .product-only');
          if (stockField) {
            stockField.classList.add('show');
            console.log('Stock field shown with timeout');
          }
        }
      }, 100);
      
      // Store current item for form submission
      this.currentEditingItem = { id: itemId, type: itemType };
      
    } catch (error) {
      console.error('Error fetching item details:', error);
      this.showNotification('Failed to load item details', 'error');
    }
  }

  populateDetailsForm(item) {
    console.log('Populating form for item:', item);
    
    // Determine the item type based on the current editing item
    const itemType = this.currentEditingItem ? this.currentEditingItem.type : 'product';
    console.log('Determined item type:', itemType);
    
    document.getElementById('detailsItemType').value = itemType;
    document.getElementById('detailsItemName').value = item.name || '';
    document.getElementById('detailsItemDescription').value = item.description || '';
    document.getElementById('detailsItemPrice').value = item.price || '';
    document.getElementById('detailsItemStock').value = item.stock_count || 0;
    document.getElementById('detailsItemImage').value = item.image_url || '';
    
    // Update modal title
    document.getElementById('detailsModalTitle').textContent = `Edit ${item.name}`;
    
    // Show/hide stock field based on type
    this.handleDetailsItemTypeChange({ target: { value: itemType } });
    
    // Force show stock field for products
    if (itemType === 'product') {
      console.log('Item is a product, showing stock field...');
      
      // Find the stock field container
      const stockField = document.querySelector('#itemDetailsModal .product-only');
      console.log('Stock field found:', stockField);
      
      if (stockField) {
        stockField.classList.add('show');
        console.log('Stock field shown for product');
      } else {
        console.log('Stock field not found');
      }
    } else {
      console.log('Item is not a product, hiding stock field...');
      const stockField = document.querySelector('#itemDetailsModal .product-only');
      if (stockField) {
        stockField.classList.remove('show');
        console.log('Stock field hidden for non-product');
      }
    }
    
    // Handle price override - make price readonly if overridden by collection
    const priceInput = document.getElementById('detailsItemPrice');
    if (item.price_override) {
      priceInput.readOnly = true;
      priceInput.title = `Price is set by collection: ${item.collection_name}`;
      
      // Add a notice about the price override
      this.addPriceOverrideNotice(item);
    } else {
      priceInput.readOnly = false;
      priceInput.title = '';
      this.removePriceOverrideNotice();
    }
  }

  addPriceOverrideNotice(item) {
    // Remove existing notice if any
    this.removePriceOverrideNotice();
    
    const priceField = document.getElementById('detailsItemPrice').closest('.form-group');
    const notice = document.createElement('div');
    notice.className = 'price-override-notice';
    notice.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>Price is set by collection: <strong>${item.collection_name}</strong></span>
    `;
    
    priceField.appendChild(notice);
  }

  removePriceOverrideNotice() {
    const existingNotice = document.querySelector('.price-override-notice');
    if (existingNotice) {
      existingNotice.remove();
    }
  }

  closeItemDetailsModal() {
    const modal = document.getElementById('itemDetailsModal');
    modal.classList.remove('show');
    this.currentEditingItem = null;
  }

  handleDetailsItemTypeChange(e) {
    const itemType = e.target.value;
    const stockField = document.querySelector('#itemDetailsModal .product-only');
    
    console.log('Item type changed to:', itemType);
    console.log('Stock field found:', stockField);
    
    if (itemType === 'product') {
      if (stockField) {
        stockField.classList.add('show');
        console.log('Stock field shown');
      } else {
        console.log('Stock field not found');
      }
    } else {
      if (stockField) {
        stockField.classList.remove('show');
        console.log('Stock field hidden');
      }
    }
  }

  async handleDetailsFormSubmit(e) {
    e.preventDefault();
    
    if (!this.currentEditingItem) return;
    
    const formData = new FormData(e.target);
    const priceInput = document.getElementById('detailsItemPrice');
    
    // If price is readonly due to collection override, don't include it in the update
    const itemData = {
      name: formData.get('name'),
      description: formData.get('description'),
      stock_count: formData.get('type') === 'product' ? parseInt(formData.get('stock_count')) : 0,
      image_url: formData.get('image_url') || null
    };
    
    // Only include price if it's not readonly (not overridden by collection)
    if (!priceInput.readOnly) {
      itemData.price = parseFloat(formData.get('price'));
    }
    
    try {
      // Use the correct endpoint without /api/
      const endpoint = this.currentEditingItem.type === 'product' ? 'products' : 'others';
      const response = await fetch(`/inventory/${endpoint}/${this.currentEditingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemData)
      });
      
      if (!response.ok) throw new Error('Failed to update item');
      
      this.showNotification('Item updated successfully', 'success');
      this.closeItemDetailsModal();
      
      // Refresh the page to show updated data
      window.location.reload();
      
    } catch (error) {
      console.error('Error updating item:', error);
      this.showNotification('Failed to update item', 'error');
    }
  }

  handleDeleteFromDetails() {
    if (!this.currentEditingItem) return;
    
    // Set the item to be deleted and show delete confirmation
    this.itemToDelete = this.currentEditingItem;
    this.closeItemDetailsModal();
    
    // Show delete confirmation modal
    const deleteModal = document.getElementById('deleteModal');
    deleteModal.classList.add('show');
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">×</button>
      </div>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 1rem;
      right: 1rem;
      background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
      color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
      border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
      border-radius: 0.5rem;
      padding: 1rem;
      z-index: 1001;
      max-width: 300px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease;
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .notification-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .notification-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: inherit;
        opacity: 0.7;
      }
      .notification-close:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    // Add close functionality
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove();
    });

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('InventoryManager initializing...');
  new InventoryManager();
  console.log('InventoryManager initialized');
}); 