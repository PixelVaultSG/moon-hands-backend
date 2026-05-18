/**
 * Moon Hands — Staff Roundtable Protocol
 * 
 * Every business discussion, ideation, production decision, or deployment
 * goes through all 6 staff agents for review. Each agent chimes in with
 * their domain-specific concerns, observations, and actionable plans.
 * 
 * Intent: Cross-check every business matter to build a million-dollar company.
 * 
 * Agents:
 *   1. Database Manager
 *   2. Security Agent
 *   3. AI Receptionist Manager
 *   4. Sales & Outreach
 *   5. DevOps/Deployment
 *   6. Business Operations
 * 
 * Usage: Before any major action, call runRoundtable(topic, details) and
 * review all 6 agent inputs before proceeding.
 */

const STAFF_AGENTS = {
  DATABASE_MANAGER: {
    id: 'DB_MGR',
    name: 'Database Manager',
    role: 'Schema, migrations, queries, RLS policies, data integrity',
    checklist: [
      'SQL syntax validated',
      'RLS policies reviewed for over-permissiveness',
      'ON DELETE rules checked (CASCADE vs SET NULL)',
      'Migration is reversible',
      'No hardcoded secrets in queries',
      'Index recommendations documented',
      'Tested against production-like data volume',
    ],
    concerns: (topic) => {
      if (topic.includes('database') || topic.includes('schema') || topic.includes('migration')) {
        return [
          'Will this schema change affect existing data?',
          'Is the migration reversible?',
          'Have RLS policies been updated for new tables/columns?',
          'Are indexes needed for new query patterns?',
          'Is there a rollback plan if migration fails?',
        ];
      }
      return ['No database impact identified for this topic.'];
    },
  },
  
  SECURITY_AGENT: {
    id: 'SEC',
    name: 'Security Agent',
    role: 'Audits, vulnerabilities, credential management, compliance',
    checklist: [
      'All env vars verified (no fallbacks, no defaults)',
      'No secrets in code (grep for API keys, tokens)',
      'RLS policies audited',
      'Input sanitization reviewed',
      'Rate limiting verified',
      'Cost caps configured',
      'Error messages don\'t leak sensitive info',
      'Kill switch functional',
    ],
    concerns: (topic) => {
      const always = [
        'Are any new API endpoints exposed?',
        'Do new features introduce injection risks?',
        'Are credentials properly scoped (not over-permissioned)?',
        'Is the cost protection layer aware of this change?',
      ];
      if (topic.includes('deploy') || topic.includes('production')) {
        always.push(
          'Are all production env vars set?',
          'Is the kill switch tested before deploy?'
        );
      }
      return always;
    },
  },
  
  AI_RECEPTIONIST_MANAGER: {
    id: 'AI_MGR',
    name: 'AI Receptionist Manager',
    role: 'Bot behavior, conversation flows, prompt engineering, testing',
    checklist: [
      'Tested with 20+ real conversation scenarios',
      'Multi-intent handling verified',
      'Chinese language responses checked',
      'Fallback response quality acceptable',
      'Cost per conversation measured',
      'Rate limit responses are on-brand',
      'Human handoff triggers work correctly',
      'Context memory functions across 3+ turns',
    ],
    concerns: (topic) => {
      if (topic.includes('bot') || topic.includes('AI') || topic.includes('conversation') || topic.includes('expert')) {
        return [
          'Have all conversation scenarios been tested?',
          'Does this change affect the smart router ($0 responses)?',
          'Are expert boundaries still clear after this change?',
          'Have Chinese-language responses been verified?',
          'Does the tone remain consistent with clinic branding?',
          'Have edge cases (vague questions, complaints) been tested?',
        ];
      }
      return ['No direct AI receptionist impact. Monitoring for indirect effects.'];
    },
  },
  
  SALES_OUTREACH: {
    id: 'SALES',
    name: 'Sales & Outreach',
    role: 'Pricing strategy, pitch materials, competitive analysis, partnerships',
    checklist: [
      'Pricing verified against costs (never sell at loss)',
      'Competitive analysis has real data',
      'Pitch materials tested with friendly audience',
      'All claims are defensible',
      'PDPA compliance mentioned where relevant',
      'Clear next steps for prospect',
    ],
    concerns: (topic) => {
      if (topic.includes('pricing') || topic.includes('cost') || topic.includes('plan')) {
        return [
          'Is this price profitable after all costs (OpenAI, WhatsApp API, hosting)?',
          'How does this compare to competitors?',
          'Is the value proposition clear to clinics?',
          'Will this pricing scale profitably at 10/50/100 clinics?',
        ];
      }
      if (topic.includes('feature') || topic.includes('build')) {
        return [
          'Can this feature be sold as a premium upsell?',
          'Does this strengthen our competitive position?',
          'What is the sales pitch for this feature?',
        ];
      }
      return ['No direct sales impact. Will monitor for marketing opportunities.'];
    },
  },
  
  DEVOPS: {
    id: 'DEVOPS',
    name: 'DevOps & Deployment',
    role: 'Infrastructure, deployment, monitoring, CI/CD',
    checklist: [
      'All env vars set in production',
      'Health endpoint returns 200',
      'Telegram alerts functional',
      'Cost protection active in production',
      'SSL certificate valid',
      'Backup strategy documented',
      'Rollback procedure documented',
    ],
    concerns: (topic) => {
      if (topic.includes('deploy') || topic.includes('production') || topic.includes('infrastructure')) {
        return [
          'Is the deployment plan documented step-by-step?',
          'Are env vars set before deploy (not after)?',
          'Is there a rollback procedure?',
          'Will this cause downtime?',
          'Is monitoring in place to catch failures?',
        ];
      }
      return ['No direct infrastructure impact.'];
    },
  },
  
  BUSINESS_OPS: {
    id: 'BIZ',
    name: 'Business Operations',
    role: 'Legal, compliance, finance, business strategy',
    checklist: [
      'Terms of Use reviewed by lawyer',
      'PDPA compliance verified',
      'Business registration current',
      'Vendor contracts reviewed',
      'Insurance coverage adequate',
      'Financial runway calculated',
    ],
    concerns: (topic) => {
      const always = [
        'Does this comply with Singapore PDPA?',
        'Are patient data handling practices documented?',
        'Is there liability exposure?',
      ];
      if (topic.includes('pricing') || topic.includes('cost') || topic.includes('revenue')) {
        always.push(
          'Have we modeled unit economics at 10/50/100 clinics?',
          'Is cash flow positive at each milestone?'
        );
      }
      if (topic.includes('contract') || topic.includes('partner')) {
        always.push(
          'Have vendor terms been reviewed?',
          'What is the exit clause?'
        );
      }
      return always;
    },
  },
};

/**
 * Run a roundtable review on any business topic.
 * Returns structured input from all 6 agents.
 */
function runRoundtable(topic, details = '') {
  const timestamp = new Date().toISOString();
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  STAFF ROUNDTABLE — ${topic}`);
  console.log(`  ${timestamp}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  const results = {};
  
  for (const [key, agent] of Object.entries(STAFF_AGENTS)) {
    const concerns = agent.concerns(topic);
    
    console.log(`┌── ${agent.name} (${agent.id})`);
    console.log(`│ Role: ${agent.role}`);
    console.log(`│`);
    console.log(`│ CONCERNS:`);
    concerns.forEach(c => console.log(`│   • ${c}`));
    console.log(`│`);
    console.log(`│ CHECKLIST (must complete before action):`);
    agent.checklist.forEach(item => console.log(`│   □ ${item}`));
    console.log(`└──────────────────────────────────────────────────────────────\n`);
    
    results[key] = {
      agent: agent.name,
      role: agent.role,
      concerns,
      checklist: agent.checklist,
      approved: false, // Must be manually marked after review
    };
  }
  
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`  ALL AGENTS HAVE CHIMED IN`);
  console.log(`  ACTION REQUIRED: Review concerns, complete checklists,`);
  console.log(`  then mark each agent as APPROVED before proceeding.`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  return results;
}

/**
 * Mark an agent as approved after their checklist is completed.
 */
function approveAgent(roundtableResults, agentKey) {
  if (roundtableResults[agentKey]) {
    roundtableResults[agentKey].approved = true;
    roundtableResults[agentKey].approvedAt = new Date().toISOString();
    console.log(`✅ ${STAFF_AGENTS[agentKey].name} APPROVED`);
  }
}

/**
 * Check if all agents are approved (ready to proceed).
 */
function isReadyToProceed(roundtableResults) {
  const allApproved = Object.values(roundtableResults).every(r => r.approved);
  const pending = Object.entries(roundtableResults)
    .filter(([_, r]) => !r.approved)
    .map(([key, _]) => STAFF_AGENTS[key].name);
  
  return {
    ready: allApproved,
    pending,
    approvedCount: Object.values(roundtableResults).filter(r => r.approved).length,
    totalCount: Object.keys(roundtableResults).length,
  };
}

/**
 * Generate a decision log entry for documentation.
 */
function generateDecisionLog(roundtableResults, topic, decision) {
  return {
    topic,
    timestamp: new Date().toISOString(),
    decision,
    agentInputs: roundtableResults,
    approvalStatus: isReadyToProceed(roundtableResults),
  };
}

module.exports = {
  STAFF_AGENTS,
  runRoundtable,
  approveAgent,
  isReadyToProceed,
  generateDecisionLog,
};
