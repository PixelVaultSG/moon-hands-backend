# Moon Hands Scenario Maker — Coverage Report

Generated: 2026-08-06T14:28:22.515Z
Total Scenarios: 100000
Generation Time: 1037ms

## By Category

- **booking**: 69868 scenarios (69.9%)
- **service_inquiry**: 5707 scenarios (5.7%)
- **spaced_normalization**: 2458 scenarios (2.5%)
- **typo_normalization**: 2440 scenarios (2.4%)
- **out_of_scope**: 2440 scenarios (2.4%)
- **context_reply**: 2437 scenarios (2.4%)
- **location_inquiry**: 2429 scenarios (2.4%)
- **greeting**: 1636 scenarios (1.6%)
- **mixed_intents**: 1631 scenarios (1.6%)
- **cancellation**: 1630 scenarios (1.6%)
- **time_validation**: 1623 scenarios (1.6%)
- **opening_hours**: 1620 scenarios (1.6%)
- **date_parsing**: 1612 scenarios (1.6%)
- **security**: 830 scenarios (0.8%)
- **admin_override**: 825 scenarios (0.8%)
- **fallback**: 814 scenarios (0.8%)

## By Priority

- **critical**: 60968 scenarios
- **high**: 28425 scenarios
- **medium**: 10607 scenarios

## Bug References Covered (50 unique bugs)

- **PAST-001**: 3234 scenarios
- **PAST-002**: 3254 scenarios
- **PAST-003**: 4085 scenarios
- **PAST-004**: 3262 scenarios
- **PAST-005**: 3237 scenarios
- **PAST-006**: 3296 scenarios
- **PAST-007**: 3190 scenarios
- **PAST-008**: 2449 scenarios
- **PAST-009**: 2468 scenarios
- **PAST-010**: 2422 scenarios
- **PAST-011**: 3242 scenarios
- **PAST-012**: 1637 scenarios
- **PAST-013**: 2403 scenarios
- **PAST-014**: 1627 scenarios
- **PAST-015**: 2433 scenarios
- **PAST-016**: 2429 scenarios
- **PAST-017**: 1627 scenarios
- **PAST-018**: 3277 scenarios
- **PAST-019**: 2429 scenarios
- **PAST-020**: 2437 scenarios
- **PAST-021**: 1630 scenarios
- **PAST-022**: 825 scenarios
- **PAST-023**: 2440 scenarios
- **PAST-024**: 1636 scenarios
- **PAST-025**: 1620 scenarios
- **PAST-026**: 1631 scenarios
- **PAST-027**: 2440 scenarios
- **PAST-028**: 2458 scenarios
- **PAST-029**: 1612 scenarios
- **PAST-030**: 1623 scenarios
- **PAST-031**: 825 scenarios
- **PAST-032**: 829 scenarios
- **PAST-033**: 2452 scenarios
- **PAST-034**: 810 scenarios
- **PAST-035**: 1604 scenarios
- **PAST-036**: 807 scenarios
- **PAST-037**: 1614 scenarios
- **PAST-038**: 820 scenarios
- **PAST-039**: 830 scenarios
- **PAST-040**: 814 scenarios
- **PAST-041**: 1628 scenarios
- **PAST-042**: 1626 scenarios
- **PAST-043**: 2439 scenarios
- **PAST-044**: 1628 scenarios
- **PAST-045**: 821 scenarios
- **PAST-046**: 1620 scenarios
- **PAST-047**: 825 scenarios
- **PAST-048**: 809 scenarios
- **PAST-049**: 2422 scenarios
- **PAST-050**: 2424 scenarios

## Critical Scenarios for Past Bugs

| Bug ID | Description | Count | Priority |
|--------|-------------|-------|----------|
| PAST-003 | All booking fields provided in first message | 4085 | critical |
| PAST-006 | User confirms treatment selection | 3296 | critical |
| PAST-004 | User adds treatment while bot is asking for date | 3262 | critical |
| PAST-002 | Initial booking request with multiple treatments | 3254 | critical |
| PAST-011 | User provides invalid input that looks like treatment request when bot asks for name | 3242 | critical |
| PAST-005 | User provides date and time when bot was asking for date only | 3237 | critical |
| PAST-001 | Initial booking request with single treatment | 3234 | critical |
| PAST-007 | User confirms AND adds another treatment | 3190 | critical |
| PAST-009 | User rejects treatment during confirmation | 2468 | critical |
| PAST-033 | User adds treatment when bot is asking for name | 2452 | critical |
| PAST-008 | User corrects treatment during confirmation | 2449 | critical |
| PAST-043 | All booking fields provided with multiple treatments in first message | 2439 | critical |
| PAST-015 | User confirms phone number | 2433 | critical |
| PAST-016 | User confirms final booking summary | 2429 | critical |
| PAST-050 | User provides time AND adds new treatment when bot is asking for time | 2424 | critical |
| PAST-049 | User provides date AND adds new treatment when bot is asking for date | 2422 | critical |
| PAST-010 | User provides valid name | 2422 | critical |
| PAST-013 | User confirms name | 2403 | critical |
| PAST-012 | User provides name and phone together | 1637 | critical |
| PAST-044 | User provides name when bot is confirming treatment | 1628 | critical |
| PAST-014 | User corrects name during confirmation | 1627 | critical |
| PAST-042 | User confirms name AND adds treatment during name confirmation | 1626 | critical |
| PAST-039 | Malicious input / code injection attempt | 830 | critical |
| PAST-032 | User provides three-word name (e.g., "Steven Tan Wei") | 829 | critical |
| PAST-022 | Admin triggers manual takeover | 825 | critical |
| PAST-031 | User provides name with title (Dr., Mr., Ms., Mrs., Mdm.) | 825 | critical |
