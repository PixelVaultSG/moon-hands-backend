# Moon Hands Scenario System
## 100,000 Conversation Scenarios for Triage System Training

### Overview
This system generates 100,000+ labeled conversation scenarios to train and validate the Moon Hands triage system to **98%+ accuracy** before falling back to OpenAI.

### Files

| File | Purpose | Size |
|------|---------|------|
| `scenario-maker.js` | Generates 100K scenarios from combinatorial templates | 15KB |
| `scenario-test.js` | Validates triage routing against labeled scenarios | 12KB |
| `scenarios.jsonl` | Full dataset (100,000 scenarios) | 68MB |
| `scenarios-sample.jsonl` | Representative sample (1,000 scenarios) | 697KB |
| `scenarios-coverage-report.json` | Category/priority coverage metrics | 2KB |
| `scenarios-summary.md` | Human-readable coverage summary | 5KB |

### Usage

#### Generate Scenarios
```bash
node ai/scenario-maker.js --count 100000 --output ai/scenarios.jsonl
```

#### Run Tests
```bash
# Test 10,000 scenarios
node ai/scenario-test.js --limit 10000 --report ai/test-report.json

# Test only booking scenarios
node ai/scenario-test.js --category booking --limit 5000

# Test only critical priority scenarios
node ai/scenario-test.js --priority critical --limit 5000
```

### 50 Bug Categories Covered (PAST-001 through PAST-050)

#### Critical Booking Flow Bugs
- **PAST-001/002**: Single/multi-treatment initial booking requests
- **PAST-003/043**: All fields provided in first message → must confirm, NOT auto-book
- **PAST-004/033/049**: Treatment additions during date/time collection
- **PAST-005/050**: Date+time provided when asking for date/time
- **PAST-006-009**: Smart confirmation (yes/yes+add/correct/reject)
- **PAST-010-014**: Name collection and validation
- **PAST-015-017**: Phone confirmation and final booking

#### Multi-Treatment Bugs
- **PAST-002/041/043**: Multiple treatments in one request
- **PAST-007/042**: Confirm + add treatment during confirmation
- **PAST-028/041**: Spaced treatment names ("micro needling")

#### Context & Service Bugs
- **PAST-018/034/046**: Service inquiries (pricing, description, comparison)
- **PAST-019/020**: Location inquiries and "Both" context replies
- **PAST-025/030/037**: Opening hours and time validation

#### Edge Cases & Security
- **PAST-022**: Admin override ("I WILL TAKE OVER")
- **PAST-023/039/040**: Out-of-scope, malicious input, empty/emoji
- **PAST-027/028/047**: Typos and normalization
- **PAST-036**: Invalid phone numbers
- **PAST-038/048**: Repeated messages and "Both" confirmation

### Scenario Format

Each scenario is a JSON object:

```json
{
  "id": 1,
  "input": "I want to book Botox and Thread Lift",
  "current_state": { "state": "idle", "data": {} },
  "context": "What can I help you with today?",
  "expected": {
    "expected_intents": ["booking"],
    "expected_next_state": "awaiting_date",
    "response_must_contain_any": ["Which date", "date works"],
    "response_must_not_contain": ["Booking request received"],
    "priority": "critical",
    "bug_category": "multi_treatment"
  },
  "category": "booking",
  "bug_reference": "PAST-002",
  "description": "Initial booking request with multiple treatments",
  "notes": "Must extract BOTH treatments. Must NOT mention only one."
}
```

### Test Validation Checks

The test runner validates:

1. **Intent Extraction** - Correct intents detected from input
2. **Smart Confirmation Parsing** - Yes/No/Add/Correct/Reject detected
3. **Name Validation** - Invalid names (treatments) rejected
4. **State Transition Validation** - Only valid state transitions allowed
5. **Auto-Booking Prevention** - No path skips confirmation → name → phone → summary
6. **Treatment Addition Detection** - New treatments detected during any state
7. **Security** - Malicious input handled safely
8. **Response Content** - Must/must-not contain expected phrases

### Results

**Latest Run: 100.00% accuracy on 10,000 scenarios**
- Total: 10,000
- Passed: 10,000
- Failed: 0
- Duration: ~7 seconds

### Architecture

```
User Message
    │
    ▼
┌─────────────────┐
│  scenario-maker │──► 100,000 labeled scenarios
│   (generator)   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  scenario-test  │──► Validates routing logic
│   (validator)   │
└─────────────────┘
         │
         ▼
    Pass/Fail Report
         │
    ┌────┴────┐
    ▼         ▼
  PASS      FAIL
    │         │
    ▼         ▼
 Deploy    Fix Code
           ▲   │
           └───┘
```

### Integration with CI/CD

Add to Render deploy pipeline:
```bash
# Pre-deploy validation
node ai/scenario-test.js --limit 5000
if [ $? -ne 0 ]; then
  echo "Triage system below 98% accuracy. Aborting deploy."
  exit 1
fi
```

### Maintenance

When new bugs are discovered:
1. Add a new generator function in `scenario-maker.js`
2. Assign bug reference (e.g., `PAST-051`)
3. Define expected behavior in `EXPECTED_BEHAVIOR`
4. Regenerate scenarios: `node ai/scenario-maker.js --count 100000`
5. Run tests: `node ai/scenario-test.js --limit 10000`
6. Fix code until accuracy ≥ 98%

### Key Design Decisions

1. **Combinatorial Generation** - Templates × variables = exponential coverage
2. **Weighted Distribution** - Critical bugs get more test scenarios
3. **State-Aware Testing** - Each scenario includes full bot state context
4. **Negative Testing** - Tests what the bot must NOT do (auto-book, leak info)
5. **Normalization Testing** - Spaced names, typos, abbreviations all covered
