// src/services/OrderParser.js
const logger = require('../utils/logger');

class OrderParser {
  static addressPatterns = [
    /\d+.*(?:street|road|avenue|lane|close|way|estate|island|mainland)/i,
    /(?:no\.|number)\s*\d+/i,
    /\d+[,\s]/, // Starts with number and comma/space
    /.{20,}/, // Longer text likely to be address
    // Lagos Areas
    /(?:lekki|ikoyi|ajah|victoria|island|mainland|surulere|yaba|ikeja|ogba|maryland|ogudu|ojota|ketu|magodo|oshodi|apapa|festac|amowo|odogunyan|ikorodu|badagry|ejigbo|ikotun|agidingbi|sangotedo|abraham|adesa|abijo|agungi|ajah|akodo|badore|banana|ikate|ilaje|ilasan|jakande|langbasa|osborne|sangotedo|vitoria)/i,
    // Common Estate Names
    /(?:phase|estate|garden|court|close|avenue|boulevard|drive|heights|park|plaza|terrace|villas|waters|woods)/i,
    // Common Address Terms
    /(?:block|flat|house|plot|road|street|way|zone|area|district|extension|layout|quarters|residence|settlement)/i,
    // Common Nigerian Address Indicators
    /(?:behind|beside|close to|near|opposite|after|before|by|off|on|at)/i,
    // Common Landmarks
    /(?:church|mosque|school|market|hospital|bank|mall|plaza|hotel|restaurant|junction|roundabout|bridge|expressway)/i,
    // Add plaza pattern since it's in the example
    /(?:plaza|complex|building|center|centre|mall)/i
  ];

  static itemPatterns = [
    /(?:cake|food|pizza|burger|rice|chicken|beef|fish|drink|water|juice)/i,
    /(?:jar|gift|box|package|item|order)/i, // Common item containers/terms
    /\d+\s*(?:pack|piece|bottle|plate|portion)/i,
    /(?:\d+\s*x\s*|\d+\s+)/, // Quantity indicators (optional)
    // Add apology jar pattern since it's in the example
    /(?:apology|sorry|thank you|birthday|anniversary)\s*(?:jar|gift|box|package)/i
  ];

  static namePatterns = [
    /^[A-Za-z\s]{2,50}$/, // Letters and spaces only, reasonable length
    /^[A-Za-z]+\s+[A-Za-z]+/ // At least two words
  ];

  static addressContinuationPatterns = [
    /(?:phase|estate|garden|court|close|avenue|boulevard|drive|heights|park|plaza|terrace|villas|waters|woods)/i,
    /(?:block|flat|house|plot|road|street|way|zone|area|district|extension|layout|quarters|residence|settlement)/i,
    /(?:behind|beside|close to|near|opposite|after|before|by|off|on|at)/i,
    /(?:church|mosque|school|market|hospital|bank|mall|plaza|hotel|restaurant|junction|roundabout|bridge|expressway)/i,
    /(?:plaza|complex|building|center|centre|mall)/i
  ];

  static itemContinuationPatterns = [
    /(?:and|with|plus|including|contains|comes with)/i,
    /(?:pack|piece|bottle|plate|portion|set|box|jar|gift)/i,
    /^\d+\s*(?:x|×|\*)\s*\d+/i, // Quantity patterns
    /^\d+\s*(?:pack|piece|bottle|plate|portion)/i,
    /(?:apology|sorry|thank you|birthday|anniversary)\s*(?:jar|gift|box|package)/i
  ];

  static datePatterns = [
    /\d{1,2}\/\d{1,2}\/\d{4}/,
    /\d{1,2}-\d{1,2}-\d{4}/,
    /\d{4}-\d{1,2}-\d{1,2}/,
    /(tomorrow|today)/i,
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    // Month Day Year patterns
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}/i,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4}/i,
    // Day Month Year patterns
    /\d{1,2}(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i,
    /\d{1,2}(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}/i
  ];

  static nigerianPhonePatterns = [
    /^0[789][01]\d{8}$/,  // 080, 090, 070
    /^234[789][01]\d{8}$/, // 23480, 23490, 23470
    /^\+234[789][01]\d{8}$/ // +23480, +23490, +23470
  ];

  static parseOrder(messageBody, senderName) {
    try {
      const lines = messageBody.trim().split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length < 3) {
        return null;
      }

      let customerName = null;
      let phoneNumber = null;
      let address = null;
      let items = null;
      let deliveryDate = null;
      let notes = null;

      // First pass: Look for labeled format
      const labeledData = this.parseLabeledFormat(lines);
      if (labeledData.customerName) customerName = labeledData.customerName;
      if (labeledData.phoneNumber) phoneNumber = labeledData.phoneNumber;
      if (labeledData.address) address = labeledData.address;
      if (labeledData.items) items = labeledData.items;
      if (labeledData.deliveryDate) deliveryDate = labeledData.deliveryDate;
      if (labeledData.notes) notes = labeledData.notes;

      // Second pass: Fill missing fields using flexible unlabeled parsing
      if (!customerName || !phoneNumber || !address || !items) {
        const unlabeledData = this.parseUnlabeledFormat(lines);
        if (!customerName && unlabeledData.customerName) customerName = unlabeledData.customerName;
        if (!phoneNumber && unlabeledData.phoneNumber) phoneNumber = unlabeledData.phoneNumber;
        if (!address && unlabeledData.address) address = unlabeledData.address;
        if (!items && unlabeledData.items) items = unlabeledData.items;
        if (!deliveryDate && unlabeledData.deliveryDate) deliveryDate = unlabeledData.deliveryDate;
        if (!notes && unlabeledData.notes) notes = unlabeledData.notes;
      }

      // Validate required fields
      if (!customerName || !phoneNumber || !address || !items) {
        logger.warn('Incomplete order data parsed', { customerName, phoneNumber, address, items });
        return null;
      }

      return {
        customer_name: customerName.trim(),
        customer_phone: phoneNumber.trim(),
        address: address.trim(),
        items: items.trim(),
        delivery_date: deliveryDate,
        notes: notes,
        added_by: senderName
      };
    } catch (error) {
      logger.error('Error parsing order:', error);
      return null;
    }
  }

  static parseLabeledFormat(lines) {
    const result = {};
    
    // Common label variations
    const labelPatterns = {
      name: ['name:', 'customer:', 'customer name:', 'full name:', 'client:', 'client name:'],
      phone: ['phone:', 'phone number:', 'mobile:', 'mobile number:', 'tel:', 'telephone:', 'contact:'],
      address: ['address:', 'delivery address:', 'location:', 'delivery location:', 'where:', 'place:'],
      items: ['items:', 'order:', 'order items:', 'what:', 'product:', 'products:', 'goods:'],
      date: ['date:', 'delivery date:', 'when:', 'delivery:', 'delivery time:', 'time:'],
      notes: ['notes:', 'note:', 'special instructions:', 'instructions:', 'comment:', 'comments:', 'additional info:', 'extra info:']
    };

    // First pass: Look for exact matches with labels
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check for name patterns
      if (labelPatterns.name.some(label => lowerLine.startsWith(label))) {
        result.customerName = line.substring(line.indexOf(':') + 1).trim();
        continue;
      }
      
      // Check for phone patterns
      if (labelPatterns.phone.some(label => lowerLine.includes(label))) {
        const phonePart = line.substring(line.indexOf(':') + 1).trim();
        const numbers = this.extractPhoneNumbers(phonePart);
        if (numbers.length > 0) {
          result.phoneNumber = numbers[0];
          if (numbers.length > 1) {
            logger.warn('Multiple phone numbers found in labeled format', {
              line,
              selectedNumber: result.phoneNumber,
              allNumbers: numbers
            });
          }
        }
        continue;
      }
      
      // Check for address patterns
      if (labelPatterns.address.some(label => lowerLine.startsWith(label))) {
        result.address = line.substring(line.indexOf(':') + 1).trim();
        continue;
      }
      
      // Check for items patterns
      if (labelPatterns.items.some(label => lowerLine.startsWith(label))) {
        result.items = line.substring(line.indexOf(':') + 1).trim();
        continue;
      }
      
      // Check for date patterns
      if (labelPatterns.date.some(label => lowerLine.startsWith(label))) {
        const datePart = line.substring(line.indexOf(':') + 1).trim();
        result.deliveryDate = this.parseDate(datePart);
        continue;
      }
      
      // Check for notes patterns
      if (labelPatterns.notes.some(label => lowerLine.startsWith(label))) {
        result.notes = line.substring(line.indexOf(':') + 1).trim();
        continue;
      }
    }

    // Second pass: Look for unlabeled fields that might be part of a labeled section
    let currentSection = null;
    let sectionContent = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check if this line starts a new section
      const newSection = Object.entries(labelPatterns).find(([_, patterns]) => 
        patterns.some(label => lowerLine.startsWith(label))
      );

      if (newSection) {
        // Process previous section if exists
        if (currentSection && sectionContent.length > 0) {
          this.processSection(currentSection[0], sectionContent.join(' '), result);
        }
        // Start new section
        currentSection = newSection;
        sectionContent = [line.substring(line.indexOf(':') + 1).trim()];
      } else if (currentSection && line.trim()) {
        // Add to current section
        sectionContent.push(line.trim());
      }
    }

    // Process last section
    if (currentSection && sectionContent.length > 0) {
      this.processSection(currentSection[0], sectionContent.join(' '), result);
    }

    return result;
  }

  static processSection(sectionType, content, result) {
    switch (sectionType) {
      case 'name':
        if (!result.customerName) result.customerName = content;
        break;
      case 'phone':
        if (!result.phoneNumber) {
          const phoneMatch = content.match(/\d[\d\s-]{8,}/);
          if (phoneMatch) result.phoneNumber = phoneMatch[0].replace(/\s+/g, '');
        }
        break;
      case 'address':
        if (!result.address) result.address = content;
        break;
      case 'items':
        if (!result.items) result.items = content;
        break;
      case 'date':
        if (!result.deliveryDate) result.deliveryDate = this.parseDate(content);
        break;
      case 'notes':
        if (!result.notes) result.notes = content;
        break;
    }
  }

  static parseUnlabeledFormat(lines) {
    const result = {};
    const usedLines = new Set();

    // First, group lines into blocks based on whitespace and content similarity
    const blocks = this.groupLinesIntoBlocks(lines);
    
    // Find phone numbers first (most distinctive)
    const phoneNumbers = [];
    blocks.forEach((block, index) => {
      const phoneLines = block.map(line => ({
        line,
        numbers: this.extractPhoneNumbers(line)
      })).filter(item => item.numbers.length > 0);

      if (phoneLines.length > 0) {
        // Get all numbers from all lines in the block
        const allNumbers = phoneLines.flatMap(item => item.numbers);
        phoneNumbers.push({ 
          numbers: allNumbers,
          index,
          isMultiple: allNumbers.length > 1,
          originalText: phoneLines.map(item => item.line).join(' ')
        });
      }
    });

    // Use the first valid phone number found
    if (phoneNumbers.length > 0) {
      result.phoneNumber = phoneNumbers[0].numbers[0];
      usedLines.add(phoneNumbers[0].index);
      
      // Log if multiple phone numbers were found
      if (phoneNumbers[0].isMultiple) {
        logger.warn('Multiple phone numbers found', {
          block: blocks[phoneNumbers[0].index],
          selectedNumber: result.phoneNumber,
          allNumbers: phoneNumbers[0].numbers,
          originalText: phoneNumbers[0].originalText
        });
      }
    }

    // Find dates (optional)
    blocks.forEach((block, index) => {
      if (!usedLines.has(index)) {
        const dateLine = block.find(line => this.isDateString(line));
        if (dateLine) {
          result.deliveryDate = this.parseDate(dateLine);
          usedLines.add(index);
        }
      }
    });

    // Process remaining blocks for name, address, items
    const remainingBlocks = blocks.filter((_, index) => !usedLines.has(index));
    
    if (remainingBlocks.length > 0) {
      // Smart assignment based on content patterns and context
      const assignments = this.assignRemainingFieldsWithContext(remainingBlocks);
      if (assignments.customerName) result.customerName = assignments.customerName;
      if (assignments.address) result.address = assignments.address;
      if (assignments.items) result.items = assignments.items;
    }

    return result;
  }

  static groupLinesIntoBlocks(lines) {
    const blocks = [];
    let currentBlock = [];
    let lastLineType = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock);
          currentBlock = [];
          lastLineType = null;
        }
        continue;
      }

      // Determine the type of the current line
      const currentLineType = this.getLineType(trimmedLine);
      
      // Check if we should start a new block
      if (currentBlock.length > 0) {
        const shouldStartNewBlock = this.shouldStartNewBlock(
          lastLineType,
          currentLineType,
          currentBlock,
          trimmedLine
        );

        if (shouldStartNewBlock) {
          blocks.push(currentBlock);
          currentBlock = [];
        }
      }

      currentBlock.push(trimmedLine);
      lastLineType = currentLineType;
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
    }

    return blocks;
  }

  static getLineType(line) {
    if (this.isPhoneNumber(line)) return 'phone';
    if (this.isDateString(line)) return 'date';
    if (/^\d+/.test(line)) return 'number';
    if (/^[A-Z]/.test(line)) return 'capitalized';
    if (/^[a-z]/.test(line)) return 'lowercase';
    return 'other';
  }

  static shouldStartNewBlock(lastType, currentType, currentBlock, currentLine) {
    // Always start new block for phone numbers
    if (currentType === 'phone') return true;

    // Always start new block for dates
    if (currentType === 'date') return true;

    // Start new block if line starts with a number and previous line doesn't
    if (currentType === 'number' && lastType !== 'number') return true;

    // Start new block if line starts with capital letter and previous line doesn't
    if (currentType === 'capitalized' && lastType !== 'capitalized') return true;

    // Check for address continuation patterns
    const isAddressContinuation = this.isAddressContinuation(currentBlock, currentLine);
    if (!isAddressContinuation) return true;

    // Check for item continuation patterns
    const isItemContinuation = this.isItemContinuation(currentBlock, currentLine);
    if (!isItemContinuation) return true;

    return false;
  }

  static isAddressContinuation(block, line) {
    if (!block || !line) return false;

    const blockText = block.join(' ').toLowerCase();
    const lineText = line.toLowerCase();

    // Check if current block looks like an address
    const isAddressBlock = block.some(line => 
      this.calculatePatternScore(line, this.addressPatterns) > 0
    );

    if (!isAddressBlock) return false;

    return this.addressContinuationPatterns.some(pattern => pattern.test(lineText));
  }

  static isItemContinuation(block, line) {
    if (!block || !line) return false;

    const blockText = block.join(' ').toLowerCase();
    const lineText = line.toLowerCase();

    // Check if current block looks like items
    const isItemBlock = block.some(line => 
      this.calculatePatternScore(line, this.itemPatterns) > 0
    );

    if (!isItemBlock) return false;

    return this.itemContinuationPatterns.some(pattern => pattern.test(lineText));
  }

  static assignRemainingFieldsWithContext(blocks) {
    const result = {};
    
    // First, check for dates in any block
    let dateFound = false;
    let dateBlockIndex = -1;
    
    for (let i = 0; i < blocks.length; i++) {
      const blockText = blocks[i].join(' ');
      if (this.isDateString(blockText)) {
        result.deliveryDate = this.parseDate(blockText);
        dateFound = true;
        dateBlockIndex = i;
        break;
      }
    }
    
    // Score each block based on its content and position (excluding date block)
    const blockScores = blocks.map((block, index) => {
      const blockText = block.join(' ');
      
      // Skip scoring if this is the date block
      if (dateFound && index === dateBlockIndex) {
        return {
          block,
          index,
          nameScore: 0,
          addressScore: 0,
          itemScore: 0,
          positionScore: { name: 0, address: 0, items: 0 },
          isDateBlock: true
        };
      }
      
      return {
        block,
        index,
        nameScore: this.calculatePatternScore(blockText, this.namePatterns),
        addressScore: this.calculatePatternScore(blockText, this.addressPatterns),
        itemScore: this.calculatePatternScore(blockText, this.itemPatterns),
        // Position-based scoring
        positionScore: {
          name: index === 0 ? 2 : 0, // First block likely to be name
          address: index > 0 && index < blocks.length - 1 ? 1 : 0, // Middle blocks likely to be address
          items: index === blocks.length - 1 ? 2 : 0 // Last block likely to be items
        },
        isDateBlock: false
      };
    });

    // Calculate final scores with position weighting
    const finalScores = blockScores.map(score => ({
      ...score,
      finalNameScore: score.nameScore + score.positionScore.name,
      finalAddressScore: score.addressScore + score.positionScore.address,
      finalItemScore: score.itemScore + score.positionScore.items
    }));

    // Assign fields based on best matches (excluding date block)
    const usedBlockIndexes = new Set();
    if (dateFound) {
      usedBlockIndexes.add(dateBlockIndex);
    }
    
    const assigned = { name: false, address: false, items: false };
    
    // Sort by confidence and assign
    const sortedByConfidence = finalScores
      .filter(score => !score.isDateBlock) // Exclude date block from assignment
      .map(score => ({
        ...score,
        maxScore: Math.max(score.finalNameScore, score.finalAddressScore, score.finalItemScore),
        bestType: score.finalNameScore >= score.finalAddressScore && score.finalNameScore >= score.finalItemScore ? 'name' :
                  score.finalAddressScore >= score.finalItemScore ? 'address' : 'items'
      }))
      .sort((a, b) => b.maxScore - a.maxScore);

    // Assign fields based on best matches
    for (const item of sortedByConfidence) {
      if (item.bestType === 'name' && !assigned.name && !usedBlockIndexes.has(item.index)) {
        result.customerName = item.block.join(' ').trim();
        assigned.name = true;
        usedBlockIndexes.add(item.index);
      } else if (item.bestType === 'address' && !assigned.address && !usedBlockIndexes.has(item.index)) {
        result.address = item.block.join(' ').trim();
        assigned.address = true;
        usedBlockIndexes.add(item.index);
      } else if (item.bestType === 'items' && !assigned.items && !usedBlockIndexes.has(item.index)) {
        result.items = item.block.join(' ').trim();
        assigned.items = true;
        usedBlockIndexes.add(item.index);
      }
    }

    // Fill any remaining unassigned fields in order, only using unused blocks
    const unassignedBlocks = blocks.filter((block, idx) =>
      !usedBlockIndexes.has(idx)
    );

    let unassignedIndex = 0;
    if (!assigned.name && unassignedIndex < unassignedBlocks.length) {
      result.customerName = unassignedBlocks[unassignedIndex].join(' ').trim();
      unassignedIndex++;
    }
    if (!assigned.address && unassignedIndex < unassignedBlocks.length) {
      result.address = unassignedBlocks[unassignedIndex].join(' ').trim();
      unassignedIndex++;
    }
    if (!assigned.items && unassignedIndex < unassignedBlocks.length) {
      result.items = unassignedBlocks[unassignedIndex].join(' ').trim();
    }

    return result;
  }

  static calculatePatternScore(text, patterns) {
    if (!text || !patterns || !Array.isArray(patterns)) {
      return 0;
    }

    let score = 0;
    for (const pattern of patterns) {
      if (pattern && pattern.test(text)) {
        score += 1;
      }
    }
    return score;
  }

  static isPhoneNumber(str) {
    if (!str) return false;
    const numbers = this.extractPhoneNumbers(str);
    return numbers.length > 0;
  }

  static extractPhoneNumbers(str) {
    // Remove all non-digit characters except for common separators
    const cleaned = str.replace(/[^\d\s,;\/]/g, '');
    
    // Split by common separators
    const parts = cleaned.split(/[\s,;\/]+/).filter(part => part.length > 0);
    
    const validNumbers = [];
    for (const part of parts) {
      // Remove any remaining non-digit characters
      const number = part.replace(/\D/g, '');
      
      // Validate the number
      if (this.isValidPhoneNumber(number)) {
        validNumbers.push(number);
      }
    }
    
    return validNumbers;
  }

  static isValidPhoneNumber(number) {
    if (!number) return false;
    
    // Check length
    if (number.length < 10 || number.length > 15) {
      return false;
    }
    
    return this.nigerianPhonePatterns.some(pattern => pattern.test(number));
  }

  static isDateString(str) {
    if (!str) return false;
    return this.datePatterns.some(pattern => pattern.test(str));
  }

  static parseDate(dateStr) {
    try {
      const moment = require('moment');
      
      // Handle natural language expressions
      const lowerDateStr = dateStr.toLowerCase().trim();
      
      // Today/Tomorrow variations
      if (/today|now|tonight/i.test(lowerDateStr)) {
        return moment().format('YYYY-MM-DD');
      }
      if (/tomorrow|next day/i.test(lowerDateStr)) {
        return moment().add(1, 'day').format('YYYY-MM-DD');
      }
      
      // Next week variations
      if (/next week/i.test(lowerDateStr)) {
        return moment().add(1, 'week').format('YYYY-MM-DD');
      }
      
      // Days of the week
      const daysOfWeek = {
        'monday': 1, 'mon': 1,
        'tuesday': 2, 'tue': 2,
        'wednesday': 3, 'wed': 3,
        'thursday': 4, 'thu': 4,
        'friday': 5, 'fri': 5,
        'saturday': 6, 'sat': 6,
        'sunday': 0, 'sun': 0
      };
      
      for (const [day, value] of Object.entries(daysOfWeek)) {
        if (lowerDateStr.includes(day)) {
          const currentDay = moment().day();
          const targetDay = value;
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd <= 0) daysToAdd += 7; // If the day has passed this week, get next week's
          return moment().add(daysToAdd, 'days').format('YYYY-MM-DD');
        }
      }
      
      // Handle "in X days/weeks"
      const inDaysMatch = lowerDateStr.match(/in\s+(\d+)\s+days?/i);
      if (inDaysMatch) {
        return moment().add(parseInt(inDaysMatch[1]), 'days').format('YYYY-MM-DD');
      }
      
      const inWeeksMatch = lowerDateStr.match(/in\s+(\d+)\s+weeks?/i);
      if (inWeeksMatch) {
        return moment().add(parseInt(inWeeksMatch[1]), 'weeks').format('YYYY-MM-DD');
      }
      
      // Handle "next month"
      if (/next month/i.test(lowerDateStr)) {
        return moment().add(1, 'month').format('YYYY-MM-DD');
      }
      
      // Handle "end of month"
      if (/end of month/i.test(lowerDateStr)) {
        return moment().endOf('month').format('YYYY-MM-DD');
      }
      
      // Handle "beginning of month"
      if (/beginning of month|start of month/i.test(lowerDateStr)) {
        return moment().startOf('month').format('YYYY-MM-DD');
      }
      
      // Try to parse various date formats
      const formats = [
        'DD/MM/YYYY',
        'MM/DD/YYYY',
        'YYYY-MM-DD',
        'DD-MM-YYYY',
        'DD.MM.YYYY',
        'MMM DD, YYYY',
        'DD MMM YYYY',
        'MMMM DD, YYYY',
        'DD MMMM YYYY',
        'DD/MM/YY',
        'MM/DD/YY',
        'YY-MM-DD',
        // Add month-first formats
        'MMMM D YYYY',
        'MMMM Do YYYY',
        'MMM D YYYY',
        'MMM Do YYYY'
      ];
      
      for (const format of formats) {
        const parsed = moment(dateStr, format, true);
        if (parsed.isValid()) {
          return parsed.format('YYYY-MM-DD');
        }
      }
      
      // Try to parse dates with ordinal indicators (1st, 2nd, 3rd, etc.)
      const ordinalMatch = dateStr.match(/(\d+)(?:st|nd|rd|th)\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
      if (ordinalMatch) {
        const day = ordinalMatch[1];
        const month = ordinalMatch[2];
        const year = ordinalMatch[3] || moment().year();
        const dateStr = `${day} ${month} ${year}`;
        const parsed = moment(dateStr, 'D MMMM YYYY', true);
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
}

module.exports = OrderParser;