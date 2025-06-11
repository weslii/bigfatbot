// src/services/OrderParser.js
const logger = require('../utils/logger');
const moment = require('moment');

class OrderParser {
  static parseOrder(message, senderName) {
    try {
      const lines = message.split('\n').map(line => line.trim()).filter(line => line);
      
      // Try to parse labeled data first
      const labeledData = this.parseLabeledData(lines);
      
      // If we have all required fields, return the data
      if (this.isValidOrderData(labeledData)) {
        return {
          customer_name: labeledData.customer_name,
          customer_phone: labeledData.customer_phone,
          address: labeledData.address,
          items: labeledData.items,
          delivery_date: labeledData.delivery_date
        };
      }

      // If labeled parsing failed, try unlabeled parsing
      const unlabeledData = this.parseUnlabeledData(lines);
      
      // If we have all required fields, return the data
      if (this.isValidOrderData(unlabeledData)) {
        return {
          customer_name: unlabeledData.customer_name,
          customer_phone: unlabeledData.customer_phone,
          address: unlabeledData.address,
          items: unlabeledData.items,
          delivery_date: unlabeledData.delivery_date
        };
      }

      // If both parsing methods failed, try pattern matching
      const patternData = this.parseWithPatterns(lines);
      
      // If we have all required fields, return the data
      if (this.isValidOrderData(patternData)) {
        return {
          customer_name: patternData.customer_name,
          customer_phone: patternData.customer_phone,
          address: patternData.address,
          items: patternData.items,
          delivery_date: patternData.delivery_date
        };
      }

      logger.warn('Could not parse order data', { message, senderName });
      return null;
    } catch (error) {
      logger.error('Error parsing order:', error);
      return null;
    }
  }

  static parseLabeledData(lines) {
    const result = {};
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.startsWith('name:')) {
        result.customer_name = line.substring(5).trim();
      } else if (lowerLine.startsWith('phone:') || lowerLine.startsWith('number:')) {
        result.customer_phone = line.split(':')[1].trim();
      } else if (lowerLine.startsWith('address:')) {
        result.address = line.substring(8).trim();
      } else if (lowerLine.startsWith('items:') || lowerLine.startsWith('order:')) {
        result.items = line.split(':')[1].trim();
      } else if (lowerLine.startsWith('date:') || lowerLine.startsWith('delivery:')) {
        result.delivery_date = this.parseDate(line.split(':')[1].trim());
      }
    }
    
    return result;
  }

  static parseUnlabeledData(lines) {
    if (lines.length < 3) return {};

    const result = {};
    const phonePattern = /^\+?[\d\s-]{8,}$/;
    const datePattern = /^(tomorrow|today|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})$/i;

    // First line is usually the name
    result.customer_name = lines[0];

    // Find phone number
    for (let i = 1; i < lines.length; i++) {
      if (phonePattern.test(lines[i])) {
        result.customer_phone = lines[i];
        // Remove the phone line from consideration for address/items
        lines.splice(i, 1);
        break;
      }
    }

    // Last line might be a date
    if (datePattern.test(lines[lines.length - 1])) {
      result.delivery_date = this.parseDate(lines[lines.length - 1]);
      lines.pop();
    }

    // Remaining lines are address and items
    if (lines.length >= 3) {
      // Second line is usually the address
      result.address = lines[1];
      // Remaining lines are items
      result.items = lines.slice(2).join('\n');
    }

    return result;
  }

  static parseWithPatterns(lines) {
    const result = {};
    const phonePattern = /^\+?[\d\s-]{8,}$/;
    const datePattern = /^(tomorrow|today|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}-\d{1,2}-\d{4})$/i;
    const namePattern = /^[a-zA-Z\s]{2,}$/;
    const addressPattern = /(?:street|road|avenue|lane|close|way|estate|island|mainland|lekki|lagos)/i;

    let remainingLines = [...lines];

    // Find phone number first (most distinctive)
    for (let i = 0; i < remainingLines.length; i++) {
      if (phonePattern.test(remainingLines[i])) {
        result.customer_phone = remainingLines[i];
        remainingLines.splice(i, 1);
        break;
      }
    }

    // Check last line for date
    if (remainingLines.length > 0 && datePattern.test(remainingLines[remainingLines.length - 1])) {
      result.delivery_date = this.parseDate(remainingLines[remainingLines.length - 1]);
      remainingLines.pop();
    }

    // First line is usually the name if it matches name pattern
    if (remainingLines.length > 0 && namePattern.test(remainingLines[0])) {
      result.customer_name = remainingLines[0];
      remainingLines.shift();
    }

    // Find address (usually contains location keywords)
    for (let i = 0; i < remainingLines.length; i++) {
      if (addressPattern.test(remainingLines[i])) {
        result.address = remainingLines[i];
        remainingLines.splice(i, 1);
        break;
      }
    }

    // Any remaining lines are items
    if (remainingLines.length > 0) {
      result.items = remainingLines.join('\n');
    }

    return result;
  }

  static parseDate(dateStr) {
    try {
      if (/tomorrow/i.test(dateStr)) {
        return moment().add(1, 'day').format('YYYY-MM-DD');
      } else if (/today/i.test(dateStr)) {
        return moment().format('YYYY-MM-DD');
      }
      
      // Try to parse various date formats
      const formats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];
      for (const format of formats) {
        const parsed = moment(dateStr, format, true);
        if (parsed.isValid()) {
          return parsed.format('YYYY-MM-DD');
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing date:', error);
      return null;
    }
  }

  static isValidOrderData(data) {
    return data.customer_name && 
           data.customer_phone && 
           data.address && 
           data.items;
  }
}

module.exports = OrderParser;