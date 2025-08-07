// src/services/MessageService.js
const moment = require('moment');
const logger = require('../utils/logger');

class MessageService {
  static formatOrderConfirmation(order) {
    try {
      let message = `✅ *Order Received*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      
      // Add matched items if available
      if (order.matched_items) {
        try {
          let matchedItems;
          // Handle both string and object formats
          if (typeof order.matched_items === 'string') {
            matchedItems = JSON.parse(order.matched_items);
            logger.debug('Parsed matched_items from JSON string in formatOrderConfirmation:', {
              originalType: typeof order.matched_items,
              parsedType: typeof matchedItems,
              isArray: Array.isArray(matchedItems),
              length: matchedItems?.length,
              firstItem: matchedItems?.[0]
            });
          } else if (Array.isArray(order.matched_items)) {
            matchedItems = order.matched_items;
            logger.debug('matched_items is already an array in formatOrderConfirmation:', {
              length: matchedItems.length,
              firstItem: matchedItems[0]
            });
          } else {
            logger.warn('matched_items is neither string nor array:', typeof order.matched_items);
            message += `*Items:* ${order.items}\n`;
            return message;
          }
          
          if (matchedItems && matchedItems.length > 0) {
            logger.debug('Processing matched items in formatOrderConfirmation:', {
              matchedItemsCount: matchedItems.length,
              firstItem: matchedItems[0],
              firstItemKeys: Object.keys(matchedItems[0] || {}),
              matchedItemKeys: Object.keys(matchedItems[0]?.matchedItem || {})
            });
            message += `*Matched Items:*\n`;
            matchedItems.forEach((item, index) => {
              logger.debug('Processing matched item in formatOrderConfirmation:', {
                item,
                itemKeys: Object.keys(item || {}),
                matchedItem: item.matchedItem,
                matchedItemKeys: Object.keys(item.matchedItem || {}),
                hasName: !!item.matchedItem?.name,
                name: item.matchedItem?.name,
                originalItem: item.originalItem,
                quantity: item.quantity
              });
              
              // Only show matched item name - if there's no matched item, the clarification process should handle it
              const itemName = item.matchedItem?.name || 'Unknown Item';
              
              // Debug: Log when we get "Unknown Item"
              if (itemName === 'Unknown Item') {
                logger.warn('Unknown Item detected - matchedItem structure issue:', {
                  hasMatchedItem: !!item.matchedItem,
                  matchedItemType: typeof item.matchedItem,
                  matchedItemKeys: item.matchedItem ? Object.keys(item.matchedItem) : 'N/A',
                  matchedItemName: item.matchedItem?.name,
                  originalItem: item.originalItem,
                  fullItem: item
                });
              }
              
              message += `• ${itemName} (${item.quantity}x)\n`;
            });
          } else {
            message += `*Items:* ${order.items}\n`;
          }
        } catch (parseError) {
          logger.error('Error parsing matched items:', parseError);
          message += `*Items:* ${order.items}\n`;
        }
      } else {
        message += `*Items:* ${order.items}\n`;
      }
      
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      } else if (order.delivery_date_raw) {
        message += `*Delivery Date:* ${order.delivery_date_raw}\n`;
      }
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}\n`;
      }
      message += `\n💡 *To mark as delivered:* Reply "done" to this message or type "done #${order.order_id}"`;
      message += `\n💡 *To cancel order:* Reply "cancel" to this message or type "cancel #${order.order_id}"`;
      return message;
    } catch (error) {
      logger.error('Error formatting order confirmation:', error);
      return 'Error formatting order confirmation';
    }
  }

  static formatSalesConfirmation(order) {
    try {
      let message = `🛍️ *New Order Received*\n\n`;
      message += `*Order ID:* ${order.order_id}\n`;
      message += `*Customer:* ${order.customer_name}\n`;
      message += `*Phone:* ${order.customer_phone}\n`;
      message += `*Address:* ${order.address}\n`;
      
      // Add matched items if available
      if (order.matched_items) {
        try {
          let matchedItems;
          // Handle both string and object formats
          if (typeof order.matched_items === 'string') {
            matchedItems = JSON.parse(order.matched_items);
          } else if (Array.isArray(order.matched_items)) {
            matchedItems = order.matched_items;
          } else {
            logger.warn('matched_items is neither string nor array:', typeof order.matched_items);
            message += `*Items:* ${order.items}\n`;
            return message;
          }
          
          if (matchedItems && matchedItems.length > 0) {
            message += `*Matched Items:*\n`;
            matchedItems.forEach((item, index) => {
              logger.debug('Processing matched item in formatSalesConfirmation:', {
                item,
                itemKeys: Object.keys(item || {}),
                matchedItem: item.matchedItem,
                matchedItemKeys: Object.keys(item.matchedItem || {}),
                hasName: !!item.matchedItem?.name,
                name: item.matchedItem?.name,
                originalItem: item.originalItem,
                quantity: item.quantity
              });
              
              // Only show matched item name - if there's no matched item, the clarification process should handle it
              const itemName = item.matchedItem?.name || 'Unknown Item';
              
              // Debug: Log when we get "Unknown Item"
              if (itemName === 'Unknown Item') {
                logger.warn('Unknown Item detected - matchedItem structure issue:', {
                  hasMatchedItem: !!item.matchedItem,
                  matchedItemType: typeof item.matchedItem,
                  matchedItemKeys: item.matchedItem ? Object.keys(item.matchedItem) : 'N/A',
                  matchedItemName: item.matchedItem?.name,
                  originalItem: item.originalItem,
                  fullItem: item
                });
              }
              
              message += `• ${itemName} (${item.quantity}x)\n`;
            });
          } else {
            message += `*Items:* ${order.items}\n`;
          }
        } catch (parseError) {
          logger.error('Error parsing matched items:', parseError);
          message += `*Items:* ${order.items}\n`;
        }
      } else {
        message += `*Items:* ${order.items}\n`;
      }
      
      if (order.delivery_date) {
        message += `*Delivery Date:* ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
      } else if (order.delivery_date_raw) {
        message += `*Delivery Date:* ${order.delivery_date_raw}\n`;
      }
      if (order.notes) {
        message += `\n*Notes:* ${order.notes}\n`;
      }
      message += `\n💡 *To cancel order:* Reply "cancel" to this message or type "cancel #${order.order_id}"`;
      return message;
    } catch (error) {
      logger.error('Error formatting sales confirmation:', error);
      return 'Error formatting sales confirmation';
    }
  }

  static formatPendingOrders(orders) {
    try {
      // Dashboard encouragement message
      const dashboardUrl = process.env.NODE_ENV === 'production' ? 'novi.com.ng/dashboard' : 'localhost:3000/dashboard';
      
      if (!orders || orders.length === 0) {
        return `🟢 *No Pending Orders!*

There are currently no pending orders. 🎉

💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} to manage orders, track delivery status, and view real-time analytics!`;
      }

      const totalOrders = orders.length;
      const maxDisplayOrders = 10; // Reduced from 20 to 10
      const displayOrders = orders.slice(0, maxDisplayOrders);
      const remainingOrders = totalOrders - maxDisplayOrders;

      let message = `💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} to manage orders, track delivery status, and view real-time analytics!\n\n`;
      message += `📋 *Pending Orders Summary*\n\n`;
      message += `📊 *Total Pending Orders:* ${totalOrders}\n\n`;
      
      // Get user-friendly display URL (without protocol)
      const getDisplayUrl = () => {
        if (process.env.RAILWAY_PUBLIC_DOMAIN) {
          return `${process.env.RAILWAY_PUBLIC_DOMAIN}/dashboard`;
        } else if (process.env.BASE_URL) {
          const baseUrl = process.env.BASE_URL.replace(/^https?:\/\//, '');
          return `${baseUrl}/dashboard`;
        } else if (process.env.NODE_ENV === 'production') {
          return 'novi.com.ng/dashboard';
        } else {
          return `localhost:${process.env.PORT || 3000}/dashboard`;
        }
      };

      if (remainingOrders > 0) {
        message += `📝 *Showing first ${maxDisplayOrders} orders*\n\n`;
        message += `📱 Visit your dashboard to view all ${totalOrders} orders\n\n`;
      }

      displayOrders.forEach((order, index) => {
        message += `*${index + 1}. ${order.order_id}*\n`;
        message += `👤 ${order.customer_name} | 📞 ${order.customer_phone}\n`;
        message += `📍 ${order.address}\n`;
        
        // Add matched items if available
        if (order.matched_items) {
          try {
            let matchedItems;
            // Handle both string and object formats
            if (typeof order.matched_items === 'string') {
              matchedItems = JSON.parse(order.matched_items);
            } else if (Array.isArray(order.matched_items)) {
              matchedItems = order.matched_items;
            } else {
              logger.warn('matched_items is neither string nor array:', typeof order.matched_items);
              message += `*Items:* ${order.items}\n`;
            }
            
            if (matchedItems && matchedItems.length > 0) {
              message += `📦 `;
              const itemNames = matchedItems.map(item => {
                const itemName = item.matchedItem?.name || 'Unknown Item';
                return `${itemName} (${item.quantity}x)`;
              }).join(', ');
              message += `${itemNames}\n`;
            } else {
              message += `📦 ${order.items}\n`;
            }
          } catch (parseError) {
            logger.error('Error parsing matched items:', parseError);
            message += `📦 ${order.items}\n`;
          }
        } else {
          message += `📦 ${order.items}\n`;
        }
        
        if (order.delivery_date) {
          message += `📅 ${moment(order.delivery_date).format('DD/MM/YYYY')}\n`;
        }
        
        if (order.notes) {
          message += `📝 ${order.notes}\n`;
        }
        
        message += '\n';
      });

      if (remainingOrders > 0) {
        message += `📊 *Summary*\n`;
        message += `• Showing: ${displayOrders.length} orders\n`;
        message += `• Remaining: ${remainingOrders} orders\n`;
        message += `• Total: ${totalOrders} pending orders\n\n`;
        message += `📱 Visit your dashboard at "${getDisplayUrl()}" to view all ${totalOrders} orders`;
      }

      return message;
    } catch (error) {
      logger.error('Error formatting pending orders:', error);
      return 'Error formatting pending orders';
    }
  }

  static formatDailyReport(report) {
    try {
      const dashboardUrl = process.env.NODE_ENV === 'production' ? 'novi.com.ng/dashboard' : 'localhost:3000/dashboard';
      let message = `💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} for detailed charts, revenue tracking, and comprehensive daily insights!\n\n`;
      message += `📊 *Daily Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting daily report:', error);
      return 'Error formatting daily report';
    }
  }

  static formatWeeklyReport(report) {
    try {
      const dashboardUrl = process.env.NODE_ENV === 'production' ? 'novi.com.ng/dashboard' : 'localhost:3000/dashboard';
      let message = `💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} for weekly trends, performance metrics, and business insights!\n\n`;
      message += `📊 *Weekly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting weekly report:', error);
      return 'Error formatting weekly report';
    }
  }

  static formatMonthlyReport(report) {
    try {
      const dashboardUrl = process.env.NODE_ENV === 'production' ? 'novi.com.ng/dashboard' : 'localhost:3000/dashboard';
      let message = `💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} for monthly analytics, growth tracking, and business intelligence!\n\n`;
      message += `📊 *Monthly Report*\n\n`;
      message += `*Total Orders:* ${report.total_orders}\n`;
      message += `*Delivered:* ${report.delivered_orders}\n`;
      message += `*Cancelled:* ${report.cancelled_orders}\n`;
      message += `*Pending Deliveries:* ${report.scheduled_deliveries}\n`;
      return message;
    } catch (error) {
      logger.error('Error formatting monthly report:', error);
      return 'Error formatting monthly report';
    }
  }

  static formatHelpMessage() {
    const dashboardUrl = process.env.NODE_ENV === 'production' ? 'novi.com.ng/dashboard' : 'localhost:3000/dashboard';
    return `💡 *Pro Tip:* Visit your dashboard at ${dashboardUrl} for advanced order management, analytics, and business tools!\n\n` +
           `*Available Commands:*\n\n` +
           `*Order Management:*\n` +
           `• /pending - View pending orders\n` +
           `• done #<order_id> - Mark order as delivered\n` +
           `• cancel #<order_id> - Cancel an order\n` +
           `• Reply "done" to an order message - Mark as delivered\n` +
           `• Reply "cancel" to an order message - Cancel order\n\n` +
           `*Reports:*\n` +
           `• /daily - View today's report\n` +
           `• /weekly - View weekly report\n` +
           `• /monthly - View monthly report\n\n` +
           `*Help:*\n` +
           `• /help - Show this help message`;
  }
}

module.exports = MessageService;