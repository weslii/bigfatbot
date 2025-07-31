// Collection Management JavaScript

class CollectionManager {
  constructor() {
    this.collectionId = window.location.pathname.split('/').pop();
    this.availableProducts = [];
    this.availableOthers = [];
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadAvailableItems();
    this.setupInlineEditing();
  }

  bindEvents() {
    // Add item buttons
    document.getElementById('addItemBtn')?.addEventListener('click', () => this.openModal());
    document.getElementById('addFirstItemBtn')?.addEventListener('click', () => this.openModal());

    // Modal events
    document.getElementById('closeModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('cancelBtn')?.addEventListener('click', () => this.closeModal());
    document.getElementById('addItemForm')?.addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Tab switching
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
        this.switchTab(e.target.dataset.tab);
      }
    });

    // Clickable collection item cards
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.collection-item-card.clickable');
      if (card && !e.target.closest('.remove-btn')) {
        this.handleCardClick(card);
      }
      
      // Remove item buttons
      if (e.target.closest('.remove-btn')) {
        const btn = e.target.closest('.remove-btn');
        e.stopPropagation(); // Prevent card click
        this.removeItem(btn.dataset.collectionItemId);
      }
    });

    // Modal backdrop click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.closeModal();
      }
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        this.cancelEditing();
      }
    });
  }

  setupInlineEditing() {
    const editableElements = document.querySelectorAll('[data-editable="true"]');
    
    editableElements.forEach(element => {
      element.addEventListener('click', (e) => this.startEditing(e.target));
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.finishEditing(e.target);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancelEditing();
        }
      });
      element.addEventListener('blur', (e) => this.finishEditing(e.target));
    });
  }

  startEditing(element) {
    if (element.classList.contains('editing')) return;
    
    const originalText = element.textContent;
    const isPrice = element.id === 'collectionPrice';
    
    // Create input element
    const input = document.createElement('input');
    input.type = isPrice ? 'number' : 'text';
    input.step = isPrice ? '0.01' : undefined;
    input.min = isPrice ? '0' : undefined;
    input.value = isPrice ? originalText.replace('$', '') : originalText;
    input.className = 'edit-input';
    input.style.cssText = `
      background: transparent;
      border: none;
      outline: none;
      font-size: inherit;
      font-weight: inherit;
      color: inherit;
      width: 100%;
      padding: 0;
      margin: 0;
    `;
    
    // Store original content
    element.dataset.originalText = originalText;
    element.classList.add('editing');
    element.textContent = '';
    element.appendChild(input);
    input.focus();
    input.select();
  }

  finishEditing(element) {
    if (!element.classList.contains('editing')) return;
    
    const input = element.querySelector('input');
    const newValue = input.value.trim();
    const originalText = element.dataset.originalText;
    const isPrice = element.id === 'collectionPrice';
    
    if (newValue && newValue !== originalText) {
      this.updateCollectionField(element.id, newValue, isPrice);
    } else {
      element.textContent = originalText;
    }
    
    element.classList.remove('editing');
    delete element.dataset.originalText;
  }

  cancelEditing() {
    const editingElement = document.querySelector('[data-editable="true"].editing');
    if (editingElement) {
      editingElement.textContent = editingElement.dataset.originalText;
      editingElement.classList.remove('editing');
      delete editingElement.dataset.originalText;
    }
  }

  async updateCollectionField(fieldId, value, isPrice = false) {
    try {
      const fieldMap = {
        'collectionName': 'name',
        'collectionDescription': 'description',
        'collectionPrice': 'price'
      };
      
      const field = fieldMap[fieldId];
      if (!field) return;
      
      const response = await fetch(`/inventory/collections/${this.collectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          [field]: isPrice ? parseFloat(value) : value
        })
      });

      if (response.ok) {
        const element = document.getElementById(fieldId);
        if (isPrice) {
          element.textContent = `$${parseFloat(value).toFixed(2)}`;
        } else {
          element.textContent = value;
        }
        this.showNotification('Collection updated successfully', 'success');
      } else {
        throw new Error('Failed to update collection');
      }
    } catch (error) {
      console.error('Update error:', error);
      this.showNotification('Failed to update collection', 'error');
      // Revert to original text
      const element = document.getElementById(fieldId);
      element.textContent = element.dataset.originalText;
    }
  }

  handleCardClick(card) {
    const itemId = card.dataset.id;
    const itemType = card.dataset.type;
    
    // Show item details or navigate to item management
    this.showItemDetails(card, itemId, itemType);
  }

  showItemDetails(card, itemId, itemType) {
    const itemName = card.querySelector('.item-name').textContent;
    const itemPriceElement = card.querySelector('.item-price');
    const itemTypeText = card.querySelector('.item-type').textContent;
    
    // Extract price information
    let originalPrice = null;
    let overridePrice = null;
    let displayPrice = itemPriceElement.textContent.trim();
    
    const originalPriceElement = itemPriceElement.querySelector('.original-price');
    const overridePriceElement = itemPriceElement.querySelector('.override-price');
    
    if (originalPriceElement && overridePriceElement) {
      originalPrice = originalPriceElement.textContent.trim();
      overridePrice = overridePriceElement.textContent.trim();
      displayPrice = `${originalPrice} → ${overridePrice}`;
    }
    
    // Create and show item details modal
    this.showItemDetailsModal({
      id: itemId,
      name: itemName,
      price: displayPrice,
      originalPrice: originalPrice,
      overridePrice: overridePrice,
      type: itemTypeText,
      itemType: itemType
    });
  }

  showItemDetailsModal(item) {
    // Remove existing modal if any
    const existingModal = document.getElementById('itemDetailsModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML
    const modalHTML = `
      <div class="modal" id="itemDetailsModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Item Details</h2>
            <button class="close-btn" id="closeItemDetailsModal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="modal-body">
            <div class="item-details-content">
              <div class="detail-section">
                <h3>${item.name}</h3>
                                 <div class="detail-grid">
                   <div class="detail-item">
                     <span class="detail-label">Type:</span>
                     <span class="detail-value">${item.type}</span>
                   </div>
                   <div class="detail-item">
                     <span class="detail-label">Price:</span>
                     <span class="detail-value">${item.price}</span>
                   </div>
                   ${item.overridePrice ? `
                   <div class="detail-item price-override-info">
                     <span class="detail-label">Collection Price:</span>
                     <span class="detail-value override-price">${item.overridePrice}</span>
                   </div>
                   ` : ''}
                   <div class="detail-item">
                     <span class="detail-label">Item ID:</span>
                     <span class="detail-value">${item.id}</span>
                   </div>
                 </div>
              </div>
              
                             <div class="detail-section">
                 <h4>Collection Information</h4>
                 <p>This item is part of the current collection. ${item.overridePrice ? 'The item price has been overridden by the collection price.' : ''}</p>
                <div class="action-buttons">
                  <button class="btn btn-secondary" id="editItemBtn">
                    <i class="fas fa-edit"></i> Edit Item
                  </button>
                  <button class="btn btn-danger" id="removeFromCollectionBtn">
                    <i class="fas fa-trash"></i> Remove from Collection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Show modal
    const modal = document.getElementById('itemDetailsModal');
    modal.classList.add('show');

    // Add event listeners
    document.getElementById('closeItemDetailsModal').addEventListener('click', () => {
      modal.remove();
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Edit item button
    document.getElementById('editItemBtn').addEventListener('click', () => {
      this.editItem(item.id, item.itemType);
      modal.remove();
    });

    // Remove from collection button
    document.getElementById('removeFromCollectionBtn').addEventListener('click', () => {
      this.removeItem(item.id);
      modal.remove();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        modal.remove();
      }
    });
  }

  async editItem(itemId, itemType) {
    try {
      // Fetch item details
      const endpoint = itemType === 'product' ? 'products' : 'others';
      const response = await fetch(`/inventory/${endpoint}/${itemId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch item details');
      
      const item = await response.json();
      
      // Show the item details modal for editing
      this.showItemDetailsModalForEditing(item, itemId, itemType);
      
    } catch (error) {
      console.error('Error fetching item details:', error);
      this.showNotification('Failed to load item details', 'error');
    }
  }

  showItemDetailsModalForEditing(item, itemId, itemType) {
    // Remove existing modal if any
    const existingModal = document.getElementById('itemDetailsModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML with editable form
    const modalHTML = `
      <div class="modal" id="itemDetailsModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit ${item.name}</h2>
            <button class="close-btn" id="closeItemDetailsModal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="modal-body">
            <form id="itemDetailsForm" class="item-form">
              <div class="form-group">
                <label for="detailsItemType">Item Type</label>
                <select id="detailsItemType" name="type" required>
                  <option value="product" ${itemType === 'product' ? 'selected' : ''}>Product</option>
                  <option value="other" ${itemType === 'other' ? 'selected' : ''}>Fee/Charge</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="detailsItemName">Name</label>
                <input type="text" id="detailsItemName" name="name" value="${item.name || ''}" required>
              </div>
              
              <div class="form-group">
                <label for="detailsItemDescription">Description (Optional)</label>
                <textarea id="detailsItemDescription" name="description" rows="3">${item.description || ''}</textarea>
              </div>
              
              <div class="form-group">
                <label for="detailsItemPrice">Price</label>
                <input type="number" id="detailsItemPrice" name="price" step="0.01" min="0" value="${item.price || ''}" required>
              </div>
              
              <div class="form-group product-only ${itemType === 'product' ? 'show' : ''}">
                <label for="detailsItemStock">Stock Count</label>
                <input type="number" id="detailsItemStock" name="stock_count" min="0" value="${item.stock_count || 0}">
              </div>
              
              <div class="form-group">
                <label for="detailsItemImage">Image URL (Optional)</label>
                <input type="url" id="detailsItemImage" name="image_url" value="${item.image_url || ''}" placeholder="https://example.com/image.jpg">
              </div>
              
              <div class="form-actions">
                <button type="button" class="btn btn-danger" id="deleteItemBtn">
                  <i class="fas fa-trash"></i> Delete Item
                </button>
                <div class="form-actions-right">
                  <button type="button" class="btn btn-secondary" id="cancelDetailsBtn">Cancel</button>
                  <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Show modal
    const modal = document.getElementById('itemDetailsModal');
    modal.classList.add('show');

    // Add event listeners
    document.getElementById('closeItemDetailsModal').addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('cancelDetailsBtn').addEventListener('click', () => {
      modal.remove();
    });

    // Handle form submission
    document.getElementById('itemDetailsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const itemData = {
        name: formData.get('name'),
        description: formData.get('description'),
        stock_count: formData.get('type') === 'product' ? parseInt(formData.get('stock_count')) : 0,
        image_url: formData.get('image_url') || null
      };
      
      // Only include price if not readonly
      const priceInput = document.getElementById('detailsItemPrice');
      if (!priceInput.readOnly) {
        itemData.price = parseFloat(formData.get('price'));
      }
      
      try {
        const endpoint = itemType === 'product' ? 'products' : 'others';
        const response = await fetch(`/inventory/${endpoint}/${itemId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(itemData)
        });
        
        if (!response.ok) throw new Error('Failed to update item');
        
        this.showNotification('Item updated successfully', 'success');
        modal.remove();
        
        // Refresh the page to show updated data
        window.location.reload();
        
      } catch (error) {
        console.error('Error updating item:', error);
        this.showNotification('Failed to update item', 'error');
      }
    });

    // Handle delete
    document.getElementById('deleteItemBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        this.removeItem(itemId);
        modal.remove();
      }
    });

    // Handle type change
    document.getElementById('detailsItemType').addEventListener('change', (e) => {
      const itemType = e.target.value;
      const stockField = document.querySelector('#itemDetailsModal .product-only');
      
      if (itemType === 'product') {
        stockField.classList.add('show');
      } else {
        stockField.classList.remove('show');
      }
    });

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        modal.remove();
      }
    });
  }

  async loadAvailableItems() {
    try {
      // Get collection type from the hidden input
      const itemTypeInput = document.getElementById('itemType');
      const collectionType = itemTypeInput ? itemTypeInput.value : 'product';
      
      if (collectionType === 'product') {
        const response = await fetch('/inventory/products', {
          credentials: 'include'
        });
        if (response.ok) {
          this.availableProducts = await response.json();
        }
      } else if (collectionType === 'other') {
        const response = await fetch('/inventory/others', {
          credentials: 'include'
        });
        if (response.ok) {
          this.availableOthers = await response.json();
        }
      }
    } catch (error) {
      console.error('Error loading available items:', error);
    }
  }

  openModal() {
    const modal = document.getElementById('addItemModal');
    const form = document.getElementById('addItemForm');
    
    // Store the hidden type input value before reset
    const itemTypeInput = document.getElementById('itemType');
    const collectionType = itemTypeInput ? itemTypeInput.value : 'product';
    
    form.reset();
    
    // Restore the hidden type input value
    if (itemTypeInput) {
      itemTypeInput.value = collectionType;
    }
    
    this.populateItemSelect();
    
    // Reset to existing tab and hide collection price notice
    this.switchTab('existing');
    
    // Hide collection price notice by default
    const priceNotice = document.querySelector('.collection-price-notice');
    if (priceNotice) {
      priceNotice.style.display = 'none';
    }
    
    console.log('Modal opened with collection type:', collectionType);
    
    modal.classList.add('show');
    document.getElementById('itemSelect').focus();
  }

  closeModal() {
    const modal = document.getElementById('addItemModal');
    modal.classList.remove('show');
  }

    switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Show/hide collection price notice
    const priceNotice = document.querySelector('.collection-price-notice');
    if (priceNotice) {
      priceNotice.style.display = tabName === 'new' ? 'flex' : 'none';
    }
    
    // Update form validation
    if (tabName === 'existing') {
      document.getElementById('itemSelect').required = true;
      document.getElementById('newItemName').required = false;
      document.getElementById('newItemPrice').required = false;
    } else {
      document.getElementById('itemSelect').required = false;
      document.getElementById('newItemName').required = true;
      document.getElementById('newItemPrice').required = true;
      
      // Ensure the price is set to collection price when switching to new tab
      const priceInput = document.getElementById('newItemPrice');
      if (priceInput) {
        const collectionPriceElement = document.getElementById('collectionPrice');
        if (collectionPriceElement) {
          const collectionPrice = collectionPriceElement.textContent.replace('$', '');
          priceInput.value = collectionPrice;
        }
      }
    }
  }

  populateItemSelect() {
    const itemSelect = document.getElementById('itemSelect');
    const itemTypeInput = document.getElementById('itemType');
    const collectionType = itemTypeInput ? itemTypeInput.value : 'product';
    
    // Clear current options
    itemSelect.innerHTML = '<option value="">Choose an item</option>';
    
    if (collectionType === 'product') {
      this.availableProducts.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} - $${parseFloat(product.price).toFixed(2)}`;
        itemSelect.appendChild(option);
      });
    } else if (collectionType === 'other') {
      this.availableOthers.forEach(other => {
        const option = document.createElement('option');
        option.value = other.id;
        option.textContent = `${other.name} - $${parseFloat(other.price).toFixed(2)}`;
        itemSelect.appendChild(option);
      });
    }
  }

  async handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const type = formData.get('type');
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    
    console.log('Form submission debug:', {
      type,
      activeTab,
      itemId: formData.get('itemId'),
      newItemName: formData.get('newItemName'),
      newItemPrice: formData.get('newItemPrice')
    });
    
    if (activeTab === 'existing') {
      // Add existing item to collection
      const itemId = formData.get('itemId');
      
      if (!type || !itemId) {
        this.showNotification('Please select an item', 'error');
        return;
      }

      try {
        const requestBody = {
          product_id: type === 'product' ? itemId : null,
          other_id: type === 'other' ? itemId : null
        };
        
        console.log('Request body:', requestBody);
        
        const response = await fetch(`/inventory/collections/${this.collectionId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(requestBody)
        });

        if (response.ok) {
          this.showNotification('Item added to collection successfully', 'success');
          this.closeModal();
          // Reload page to show updated collection
          setTimeout(() => window.location.reload(), 1000);
        } else {
          const error = await response.json();
          throw new Error(error.error || 'Failed to add item to collection');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        this.showNotification(error.message, 'error');
      }
    } else {
             // Create new item and add to collection
       // Always use collection price for new items
       const collectionPriceElement = document.getElementById('collectionPrice');
       const collectionPrice = collectionPriceElement ? parseFloat(collectionPriceElement.textContent.replace('$', '')) : 0;
       
       const newItemData = {
         name: formData.get('newItemName'),
         description: formData.get('newItemDescription') || '',
         price: collectionPrice,
         image_url: formData.get('newItemImage') || null
       };
      
      if (type === 'product') {
        newItemData.stock_count = parseInt(formData.get('newItemStock')) || 0;
      }
      
      if (!newItemData.name || !newItemData.price) {
        this.showNotification('Please fill in all required fields', 'error');
        return;
      }

      try {
        // First create the new item
        const createResponse = await fetch(`/inventory/${type === 'product' ? 'products' : 'others'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(newItemData)
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to create new item');
        }

        const newItem = await createResponse.json();
        
        // Then add it to the collection
        const addRequestBody = {
          product_id: type === 'product' ? newItem.id : null,
          other_id: type === 'other' ? newItem.id : null
        };
        
        console.log('Add to collection request body:', addRequestBody);
        
        const addResponse = await fetch(`/inventory/collections/${this.collectionId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(addRequestBody)
        });

        if (addResponse.ok) {
          this.showNotification('New item created and added to collection successfully', 'success');
          this.closeModal();
          // Reload page to show updated collection
          setTimeout(() => window.location.reload(), 1000);
        } else {
          throw new Error('Failed to add new item to collection');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        this.showNotification(error.message, 'error');
      }
    }
  }

  async removeItem(itemId) {
    if (!confirm('Are you sure you want to remove this item from the collection?')) {
      return;
    }

    try {
      const response = await fetch(`/inventory/collections/${this.collectionId}/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        this.showNotification('Item removed from collection successfully', 'success');
        // Reload page to show updated collection
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error('Failed to remove item from collection');
      }
    } catch (error) {
      console.error('Remove error:', error);
      this.showNotification('Failed to remove item from collection', 'error');
    }
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
  new CollectionManager();
}); 