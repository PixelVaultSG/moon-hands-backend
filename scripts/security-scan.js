#!/usr/bin/env node
/**
 * Moon Hands Security Scanner
 * Pre-deploy security check inspired by Claude Code's security-guidance plugin
 * Scans codebase for 12 vulnerability patterns before deployment
 * 
 * Usage: node scripts/security-scan.js
 * Exit code 0 = clean, 1 = issues found
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const ISSUES = [];
let filesScanned = 0;
let linesScanned = 0;

function report(level, file, line, rule, message) {
  ISSUES.push({ level, file: path.relative(BACKEND_DIR, file), line, rule, message });
}

function scanFile(filePath, content) {
  const lines = content.split('\n');
  filesScanned++;
  linesScanned += lines.length;
  const ext = path.extname(filePath);
  
  // Skip test files — console.log is expected in tests
  if (filePath.includes('.test.') || filePath.includes('-test.')) return;
  if (ext !== '.js') return;
  
  // Rule 1: Exposed API keys / secrets
  const secretPatterns = [
    /['"](?:api[_-]?key|apikey|secret|token|password)['"]\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i,
    /['"](?:sk-|ghp_|github_pat_)[a-zA-Z0-9_]{20,}['"]/i,
    /['"][a-f0-9]{32,}['"]/i,
  ];
  lines.forEach((line, i) => {
    // Skip comments and env references
    const code = line.replace(/\/\/.*$/, '');
    if (code.includes('process.env') || code.includes('//')) return;
    
    secretPatterns.forEach(pattern => {
      if (pattern.test(code)) {
        const match = code.match(pattern);
        const masked = match ? match[0].substring(0, 20) + '...' : '...';
        report('CRITICAL', filePath, i + 1, 'SECRETS_EXPOSED', 
          `Potential hardcoded secret: ${masked}`);
      }
    });
  });
  
  // Rule 2: eval() and dangerous dynamic execution
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // Skip regex literals and strings that contain the pattern
    const cleanCode = code.replace(/['"`][^'"`]*['"`]/g, '""').replace(/\/[^\/]+\/\w*/g, '/*re*/');
    if (/\beval\s*\(/.test(cleanCode)) {
      report('CRITICAL', filePath, i + 1, 'DANGEROUS_EVAL', 
        'eval() detected — use JSON.parse or structured alternatives');
    }
    if (/new\s+Function\s*\(/.test(cleanCode)) {
      report('CRITICAL', filePath, i + 1, 'DANGEROUS_FUNCTION', 
        'new Function() detected — potential code injection');
    }
  });
  
  // Rule 3: Command injection via child_process
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    const cleanCode = code.replace(/['"`][^'"`]*['"`]/g, '""').replace(/\/[^\/]+\/\w*/g, '/*re*/');
    if (/child_process|\.exec\s*\(|\.execSync\s*\(/.test(cleanCode)) {
      report('HIGH', filePath, i + 1, 'COMMAND_INJECTION', 
        'child_process/exec detected — verify inputs are sanitized');
    }
  });
  
  // Rule 4: SQL injection (raw SQL with string interpolation)
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\.query\s*\(\s*`[^`]*\$\{/.test(code) || 
        /\.raw\s*\(\s*`[^`]*\$\{/.test(code)) {
      report('HIGH', filePath, i + 1, 'SQL_INJECTION', 
        'SQL string interpolation detected — use parameterized queries');
    }
  });
  
  // Rule 5: XSS - unsanitized output
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\.innerHTML\s*=/.test(code) || /document\.write\s*\(/.test(code)) {
      report('MEDIUM', filePath, i + 1, 'XSS_RISK', 
        'innerHTML or document.write — ensure content is sanitized');
    }
  });
  
  // Rule 6: Missing error handling on async functions
  const asyncFnPattern = /async\s+function\s+\w+|const\s+\w+\s*=\s*async\s*\(/g;
  const tryCatchPattern = /try\s*\{/;
  let hasTryCatch = false;
  let braceDepth = 0;
  
  lines.forEach((line, i) => {
    if (tryCatchPattern.test(line)) hasTryCatch = true;
  });
  
  // Check for unhandled promise chains
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // .then() without .catch()
    if (/\.then\s*\([^)]*\)\s*[,;]/.test(code) && !/\.catch\s*\(/.test(content.substring(0, content.indexOf(line) + line.length))) {
      // Only flag if it's a pattern that should have error handling
      if (code.includes('fetch') || code.includes('axios') || code.includes('api')) {
        report('MEDIUM', filePath, i + 1, 'UNHANDLED_PROMISE', 
          '.then() chain without .catch() — add error handling');
      }
    }
  });
  
  // Rule 7: Variables referenced but potentially undefined
  const varRefs = content.match(/\b\w+/g) || [];
  // This is a simplified check — a full AST parse would be better
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // Check for console.log with potentially undefined variables
    if (/console\.(log|warn|error)\s*\(\s*\w+/.test(code)) {
      const varInLog = code.match(/console\.(?:log|warn|error)\s*\(\s*(\w+)/);
      if (varInLog) {
        const varName = varInLog[1];
        // Check if variable is defined somewhere in the file
        const varDefPattern = new RegExp(`(const|let|var|function|class)\\s+${varName}\\b`);
        if (!varDefPattern.test(content) && !['console', 'process', 'module', 'exports', 'require'].includes(varName)) {
          report('MEDIUM', filePath, i + 1, 'UNDEFINED_VARIABLE', 
            `'${varName}' used but may not be defined in this scope`);
        }
      }
    }
  });
  
  // Rule 8: Circular dependency risk
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // Check for requires that create circular patterns
    if (/require\s*\(\s*['"]\.\.\//.test(code)) {
      const match = code.match(/require\s*\(\s*['"](\.\.\/[^'"]+)['"]/);
      if (match) {
        const requiredPath = match[1];
        // If this file's directory has an index.js that requires back, it's circular
        const thisDir = path.dirname(filePath);
        const resolvedRequired = path.resolve(thisDir, requiredPath);
        if (fs.existsSync(resolvedRequired)) {
          const requiredContent = fs.readFileSync(resolvedRequired, 'utf8');
          const thisFileName = path.basename(filePath, '.js');
          if (requiredContent.includes(thisFileName)) {
            report('HIGH', filePath, i + 1, 'CIRCULAR_DEPENDENCY', 
              `Circular dependency risk: ${path.basename(filePath)} ↔ ${path.basename(resolvedRequired)}`);
          }
        }
      }
    }
  });
  
  // Rule 9: Duplicate module.exports
  const exportsMatches = content.match(/module\.exports\s*=/g);
  if (exportsMatches && exportsMatches.length > 1) {
    report('HIGH', filePath, 0, 'DUPLICATE_EXPORTS', 
      `${exportsMatches.length} module.exports statements — last one wins, earlier exports are lost`);
  }
  
  // Rule 10: Missing auth on sensitive endpoints
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    // Look for route handlers that don't check auth
    if (/(app\.|router\.|server\.)\.(post|put|delete)\s*\(/.test(code) && 
        !content.includes('checkAuth') && 
        !content.includes('authenticate') &&
        !content.includes('requireAuth') &&
        !filePath.includes('public') &&
        !filePath.includes('health')) {
      report('MEDIUM', filePath, i + 1, 'MISSING_AUTH', 
        'POST/PUT/DELETE endpoint without auth check — add authentication');
    }
  });
  
  // Rule 11: console.log in production code
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/console\.(log|warn)\s*\(/.test(code) && 
        !code.includes('[SECURITY]') && 
        !code.includes('[WEBHOOK]') &&
        !code.includes('[360DIALOG]') &&
        !code.includes('[TELEGRAM]') &&
        !code.includes('[BOT_ENGINE]') &&
        !code.includes('[ERROR]') &&
        !code.includes('[SCAN]')) {
      report('LOW', filePath, i + 1, 'DEBUG_LOG', 
        'console.log in production code — remove or use structured logging');
    }
  });
  
  // Rule 12: process.env without defaults
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/process\.env\.\w+/.test(code) && !/\|\|/.test(code) && !/\?\./.test(code)) {
      const envVar = code.match(/process\.env\.(\w+)/);
      if (envVar && !['NODE_ENV', 'PORT'].includes(envVar[1])) {
        report('LOW', filePath, i + 1, 'ENV_NO_DEFAULT', 
          `process.env.${envVar[1]} without fallback — app crashes if unset`);
      }
    }
  });
}

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        scanFile(fullPath, content);
      } catch (err) {
        if (err.code !== 'EISDIR') {
          console.error(`[SCAN] Error reading ${fullPath}: ${err.message}`);
        }
      }
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────

console.log(`[SCAN] Moon Hands Security Scanner v1.0`);
console.log(`[SCAN] Scanning: ${BACKEND_DIR}`);
console.log('');

walkDir(BACKEND_DIR);

// Print results
if (ISSUES.length === 0) {
  console.log('\x1b[32m[PASS] No security issues found!\x1b[0m');
  console.log(`       ${filesScanned} files scanned, ${linesScanned} lines checked`);
  process.exit(0);
}

const byLevel = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] };
ISSUES.forEach(issue => {
  if (byLevel[issue.level]) byLevel[issue.level].push(issue);
});

console.log(`\x1b[31m[FAIL] ${ISSUES.length} security issue(s) found\x1b[0m`);
console.log(`       ${filesScanned} files scanned, ${linesScanned} lines checked`);
console.log('');

for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
  const issues = byLevel[level];
  if (issues.length === 0) continue;
  
  const color = level === 'CRITICAL' ? '\x1b[31m' : level === 'HIGH' ? '\x1b[33m' : '\x1b[36m';
  console.log(`${color}[${level}] ${issues.length} issue(s)\x1b[0m`);
  
  issues.forEach(issue => {
    console.log(`  ${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`);
  });
  console.log('');
}

// Summary
console.log('─'.repeat(50));
console.log('Summary:');
console.log(`  CRITICAL: ${byLevel.CRITICAL.length} (fix before deploy)`);
console.log(`  HIGH:     ${byLevel.HIGH.length} (fix strongly recommended)`);
console.log(`  MEDIUM:   ${byLevel.MEDIUM.length} (review)`);
console.log(`  LOW:      ${byLevel.LOW.length} (optional cleanup)`);
console.log('─'.repeat(50));

process.exit(byLevel.CRITICAL.length > 0 || byLevel.HIGH.length > 0 ? 1 : 0);
