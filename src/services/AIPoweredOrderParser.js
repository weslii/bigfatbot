const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function parseOrderWithAI(message) {
  const prompt = `Extract the following fields from this order message:\n- customer_name\n- customer_phone\n- address\n- items\n- delivery_date (look for any mention of a date, even if written as 'to be delivered on the 23rd', 'for tomorrow', etc.)\n- notes\nIf a field is missing, return it as null.\nMessage:\n\"\"\"${message}\"\"\"\nReturn as JSON.`;
  try {
    console.log('[AI Parser] Calling OpenAI API...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });
    let text = response.choices[0].message.content;
    console.log('[AI Parser] Raw response:', text);
    // Remove code block markers if present
    text = text.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(text);
    // Basic validation
    if (!parsed || typeof parsed !== 'object') {
      console.log('[AI Parser] Parsed response is not an object, returning null');
      return null;
    }
    const requiredFields = ['customer_name', 'customer_phone', 'address'];
    for (const field of requiredFields) {
      if (!parsed[field]) {
        console.log(`[AI Parser] Missing required field: ${field}, returning null`);
        return null;
      }
    }
    return parsed;
  } catch (err) {
    console.log('[AI Parser] Error or invalid JSON:', err);
    return null;
  }
}

// Retry logic with slow-processing callback
async function parseOrderWithAIRetry(message, { maxRetries = 3, retryDelayMs = 5000, onSlow = null, slowThresholdMs = 5000 } = {}) {
  let attempt = 0;
  let lastError = null;
  let slowTimer;
  let slowNotified = false;
  return new Promise(async (resolve) => {
    const tryParse = async () => {
      attempt++;
      slowNotified = false;
      if (onSlow) {
        slowTimer = setTimeout(() => {
          slowNotified = true;
          onSlow();
        }, slowThresholdMs);
      }
      const result = await parseOrderWithAI(message);
      if (slowTimer) clearTimeout(slowTimer);
      if (result) {
        resolve(result);
        return;
      }
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, retryDelayMs));
        await tryParse();
      } else {
        resolve(null);
      }
    };
    await tryParse();
  });
}

async function matchItemWithAI(itemName, inventoryList) {
  const prompt = `You are a strict item matching system. Your job is to determine if the given item matches any inventory item with HIGH accuracy.

Given item: "${itemName}"
Available inventory: ${inventoryList}

IMPORTANT RULES:
1. Only return a match if you are VERY confident (confidence >= 0.85)
2. The item must be the SAME TYPE of product (e.g., "durag" should NOT match "soft brush")
3. If the item is not clearly the same as any inventory item, return "NO_MATCH|0.0"
4. Be extremely strict - it's better to return no match than a wrong match
5. Consider synonyms and common variations, but only if they're clearly the same item

Return format: "exact_inventory_item_name|confidence_score" or "NO_MATCH|0.0"

Examples:
- "soft brush" + ["hard brush", "soft brush"] = "soft brush|1.0"
- "durag" + ["hard brush", "soft brush"] = "NO_MATCH|0.0"
- "brush" + ["hard brush", "soft brush"] = "NO_MATCH|0.0" (too ambiguous)`;
  
  try {
    console.log('[AI Item Matcher] Calling OpenAI API...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini-2025-04-14',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });
    
    let text = response.choices[0].message.content.trim();
    console.log('[AI Item Matcher] Raw response:', text);
    
    // Parse the response
    const [matchedName, confidenceStr] = text.split('|');
    const confidence = parseFloat(confidenceStr);
    
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      console.log('[AI Item Matcher] Invalid confidence score:', confidence);
      return null;
    }
    
    // Check for NO_MATCH response
    if (matchedName.trim() === 'NO_MATCH' || confidence < 0.85) {
      console.log('[AI Item Matcher] No match found or confidence too low:', { matchedName, confidence });
      return null;
    }
    
    return {
      matchedName: matchedName.trim(),
      confidence: confidence
    };
  } catch (err) {
    console.log('[AI Item Matcher] Error:', err);
    return null;
  }
}

module.exports = { parseOrderWithAI, parseOrderWithAIRetry, matchItemWithAI }; 