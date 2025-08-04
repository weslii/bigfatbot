const database = require('../config/database');
const logger = require('../utils/logger');

class AdaptiveConfidenceService {
  constructor() {
    this.defaultThresholds = {
      autoAccept: 0.9, // Much stricter - only very high confidence matches
      aiRequired: 0.85, // AI must be very confident
      humanRequired: 0.6 // Human confirmation for medium confidence
    };
    
    this.businessThresholds = new Map();
    this.thresholdCacheTTL = 10 * 60 * 1000; // 10 minutes
  }

  async getAdaptiveThresholds(businessId) {
    // Check cache first
    if (this.businessThresholds.has(businessId)) {
      const cached = this.businessThresholds.get(businessId);
      if (Date.now() - cached.timestamp < this.thresholdCacheTTL) {
        return cached.thresholds;
      }
    }

    try {
      const successRate = await this.getHistoricalSuccessRate(businessId);
      const thresholds = this.calculateThresholds(successRate);
      
      // Cache the thresholds
      this.businessThresholds.set(businessId, {
        thresholds,
        timestamp: Date.now()
      });
      
      logger.info('Calculated adaptive thresholds', {
        businessId,
        successRate: successRate.toFixed(3),
        thresholds
      });
      
      return thresholds;
    } catch (error) {
      logger.error('Error calculating adaptive thresholds:', error);
      return this.defaultThresholds;
    }
  }

  async getHistoricalSuccessRate(businessId) {
    try {
      // Get matching data from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const result = await database.query('matching_learning_data')
        .where('business_id', businessId)
        .where('created_at', '>=', thirtyDaysAgo)
        .select('user_confirmed');
      
      if (result.length === 0) {
        return 0.8; // Default confidence for new businesses
      }
      
      const confirmed = result.filter(r => r.user_confirmed === true).length;
      const successRate = confirmed / result.length;
      
      logger.debug('Historical success rate calculated', {
        businessId,
        totalMatches: result.length,
        confirmedMatches: confirmed,
        successRate: successRate.toFixed(3)
      });
      
      return successRate;
    } catch (error) {
      logger.error('Error getting historical success rate:', error);
      return 0.8; // Default fallback
    }
  }

  calculateThresholds(successRate) {
    // Adjust thresholds based on business performance
    if (successRate > 0.9) {
      // High success rate - can be more lenient
      return {
        autoAccept: 0.8,
        aiRequired: 0.6,
        humanRequired: 0.4
      };
    } else if (successRate > 0.8) {
      // Good success rate - moderate thresholds
      return {
        autoAccept: 0.85,
        aiRequired: 0.65,
        humanRequired: 0.45
      };
    } else if (successRate > 0.7) {
      // Average success rate - standard thresholds
      return this.defaultThresholds;
    } else if (successRate > 0.6) {
      // Below average - stricter thresholds
      return {
        autoAccept: 0.9,
        aiRequired: 0.7,
        humanRequired: 0.5
      };
    } else {
      // Low success rate - very strict thresholds
      return {
        autoAccept: 0.95,
        aiRequired: 0.8,
        humanRequired: 0.6
      };
    }
  }

  async recordMatchResult(businessId, originalText, matchedItemId, matchedItemType, userConfirmed, confidenceScore) {
    try {
      await database.query('matching_learning_data').insert({
        business_id: businessId,
        original_text: originalText,
        matched_item_id: matchedItemId,
        matched_item_type: matchedItemType,
        user_confirmed: userConfirmed,
        confidence_score: confidenceScore,
        created_at: new Date()
      });
      
      // Clear cached thresholds for this business to force recalculation
      this.businessThresholds.delete(businessId);
      
      logger.debug('Recorded match result for learning', {
        businessId,
        originalText,
        userConfirmed,
        confidenceScore
      });
    } catch (error) {
      logger.error('Error recording match result:', error);
    }
  }

  async getBusinessMatchingStats(businessId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const stats = await database.query('matching_learning_data')
        .where('business_id', businessId)
        .where('created_at', '>=', thirtyDaysAgo)
        .select(
          database.raw('COUNT(*) as total_matches'),
          database.raw('COUNT(CASE WHEN user_confirmed = true THEN 1 END) as confirmed_matches'),
          database.raw('AVG(confidence_score) as avg_confidence'),
          database.raw('COUNT(CASE WHEN confidence_score >= 0.85 THEN 1 END) as auto_matched'),
          database.raw('COUNT(CASE WHEN confidence_score >= 0.65 AND confidence_score < 0.85 THEN 1 END) as ai_matched'),
          database.raw('COUNT(CASE WHEN confidence_score < 0.65 THEN 1 END) as human_confirmed')
        )
        .first();
      
      return {
        totalMatches: parseInt(stats.total_matches) || 0,
        confirmedMatches: parseInt(stats.confirmed_matches) || 0,
        successRate: stats.total_matches > 0 ? 
          (parseInt(stats.confirmed_matches) / parseInt(stats.total_matches)) : 0,
        averageConfidence: parseFloat(stats.avg_confidence) || 0,
        autoMatched: parseInt(stats.auto_matched) || 0,
        aiMatched: parseInt(stats.ai_matched) || 0,
        humanConfirmed: parseInt(stats.human_confirmed) || 0
      };
    } catch (error) {
      logger.error('Error getting business matching stats:', error);
      return {
        totalMatches: 0,
        confirmedMatches: 0,
        successRate: 0,
        averageConfidence: 0,
        autoMatched: 0,
        aiMatched: 0,
        humanConfirmed: 0
      };
    }
  }

  clearThresholdCache() {
    const size = this.businessThresholds.size;
    this.businessThresholds.clear();
    logger.info('Cleared threshold cache', { clearedEntries: size });
  }
}

module.exports = AdaptiveConfidenceService; 