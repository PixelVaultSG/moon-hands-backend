/**
 * Episodic Memory System for Moon Hands
 * 
 * Stores and retrieves project knowledge across sessions.
 * Inspired by Claude Code's episodic-memory plugin.
 * 
 * Usage:
 *   const memory = require('./memory');
 *   memory.query('webhook format'); // returns relevant memories
 *   memory.remember({ title: '...', content: '...', tags: ['webhook'] });
 */

const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, 'memory.json');

function loadMemory() {
  try {
    const data = fs.readFileSync(MEMORY_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[MEMORY] Failed to load memory:', err.message);
    return { version: '1.0', project: 'moon-hands', categories: {} };
  }
}

function saveMemory(memory) {
  try {
    memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    return true;
  } catch (err) {
    console.error('[MEMORY] Failed to save memory:', err.message);
    return false;
  }
}

/**
 * Query memories by keywords. Returns most relevant matches sorted by score.
 * @param {string} query - Space-separated keywords
 * @param {number} limit - Max results to return
 * @returns {Array} Relevant memories with score
 */
function query(queryStr, limit = 5) {
  const memory = loadMemory();
  const keywords = queryStr.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  if (keywords.length === 0) return [];
  
  const results = [];
  
  for (const [category, entries] of Object.entries(memory.categories)) {
    for (const entry of entries) {
      let score = 0;
      const text = `${entry.title} ${entry.content} ${entry.tags?.join(' ') || ''}`.toLowerCase();
      
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          // Title matches score higher
          if (entry.title.toLowerCase().includes(keyword)) score += 3;
          // Tag matches score higher
          else if (entry.tags?.some(t => t.toLowerCase().includes(keyword))) score += 2;
          // Content matches
          else score += 1;
        }
      }
      
      if (score > 0) {
        results.push({ ...entry, score, category });
      }
    }
  }
  
  // Sort by score descending, then by date descending
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.date) - new Date(a.date);
  });
  
  return results.slice(0, limit);
}

/**
 * Get memories formatted as context string for AI prompt injection.
 * @param {string} queryStr - What the AI is currently working on
 * @param {number} limit - Max memories to include
 * @returns {string} Formatted context string (or empty if none found)
 */
function getContext(queryStr, limit = 3) {
  const results = query(queryStr, limit);
  if (results.length === 0) return '';
  
  const lines = ['\n=== PROJECT KNOWLEDGE (relevant to current task) ==='];
  
  for (const entry of results) {
    lines.push(`\n[${entry.id}] ${entry.title}`);
    lines.push(`Relevance: ${entry.score}/5 | Confidence: ${entry.confidence} | Date: ${entry.date}`);
    lines.push(entry.content);
    lines.push('');
  }
  
  lines.push('=== END PROJECT KNOWLEDGE ===\n');
  return lines.join('\n');
}

/**
 * Add a new memory entry.
 * @param {Object} entry - Memory entry
 * @param {string} entry.title - Short title
 * @param {string} entry.content - Full content
 * @param {Array<string>} entry.tags - Search tags
 * @param {string} entry.category - Category (architecture, lessons_learned, third_party, configuration, code_patterns)
 * @param {string} entry.confidence - 'confirmed', 'hypothesis', 'deprecated'
 * @param {string} entry.source - Where this knowledge came from
 */
function remember(entry) {
  const memory = loadMemory();
  
  const category = entry.category || 'lessons_learned';
  if (!memory.categories[category]) {
    memory.categories[category] = [];
  }
  
  const newEntry = {
    id: entry.id || `${category}-${String(memory.categories[category].length + 1).padStart(3, '0')}`,
    title: entry.title,
    content: entry.content,
    tags: entry.tags || [],
    confidence: entry.confidence || 'hypothesis',
    date: entry.date || new Date().toISOString().split('T')[0],
    source: entry.source || 'session'
  };
  
  memory.categories[category].unshift(newEntry); // Add to front (newest first)
  
  const saved = saveMemory(memory);
  if (saved) {
    console.log(`[MEMORY] Stored: ${newEntry.id} - ${newEntry.title}`);
  }
  return saved ? newEntry : null;
}

/**
 * Get all memories in a category.
 * @param {string} category - Category name
 * @returns {Array} All entries in that category
 */
function getCategory(category) {
  const memory = loadMemory();
  return memory.categories[category] || [];
}

/**
 * List all available categories.
 * @returns {Array} Category names
 */
function getCategories() {
  const memory = loadMemory();
  return Object.keys(memory.categories);
}

module.exports = {
  query,
  getContext,
  remember,
  getCategory,
  getCategories
};
