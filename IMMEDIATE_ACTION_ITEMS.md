# Immediate Action Items - Asset Manager Project

## 1. Fix Unit Test Failures (Priority: CRITICAL)

### Issue Summary
21 unit tests are failing due to mock expectation mismatches, not TypeScript compilation errors.

### Specific Fixes Needed:

#### a. LocationService Tests (`location.service.test.ts`)
```typescript
// Fix 1: Update getLocationById mock calls
locationService.getLocationById = jest.fn().mockResolvedValue(mockLocation);
// Should be:
locationService.getLocationById = jest.fn().mockImplementation((id, orgId) => {
  if (id === mockLocation.id && orgId === mockOrganizationId) {
    return Promise.resolve(mockLocation);
  }
  return Promise.resolve(null);
});

// Fix 2: Add Prisma transaction mocks
prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));

// Fix 3: Update moveLocation to properly return updated path
const updatedLocation = { ...mockLocation, path: '/new/path' };
```

#### b. AssetService Tests (`asset.service.test.ts`)
```typescript
// Fix 1: Update validateCustomFieldValues mock
assetTemplateService.validateCustomFieldValues = jest.fn()
  .mockResolvedValue({ valid: true, errors: [] });

// Fix 2: Update getLocationById mock to expect two parameters
locationService.getLocationById = jest.fn()
  .mockImplementation((locationId, organizationId) => {
    return Promise.resolve(mockLocation);
  });
```

#### c. AssetTemplateService Tests (`asset-template.service.test.ts`)
```typescript
// Fix: Add getTemplateById mock in validateCustomFieldValues tests
prismaMock.assetTemplate.findUnique.mockResolvedValue({
  ...mockTemplate,
  customFieldsSchema: mockSchema
});
```

## 2. Branch Management Strategy (Priority: HIGH)

### Current Situation
- Working on `phase-1-foundation` branch with Phase 2 changes
- Main branch is behind current work

### Recommended Actions:
1. **Create a new branch for current work**
   ```bash
   git checkout -b phase-2-core-functionality
   git cherry-pick <commits from phase-1-foundation that belong to phase 2>
   ```

2. **Clean up phase-1-foundation**
   - Reset to only contain Phase 1 work
   - Merge to main if Phase 1 is complete

3. **Future branch strategy**
   ```
   main
   ├── phase-1-foundation (merge when complete)
   ├── phase-2-core-functionality (current work)
   ├── phase-3-advanced-features (future)
   └── feature/* (specific features)
   ```

## 3. Frontend Development Acceleration (Priority: HIGH)

### Quick Wins (Can be done in parallel):
1. **Location Picker Component** (2 days)
   - Critical for asset creation
   - Reuse existing tree component patterns

2. **Template Selector** (1 day)
   - Simple dropdown with template preview
   - Enables structured asset creation

3. **Task Creation Form** (2 days)
   - Manual task creation capability
   - Reuse existing form patterns

### Resource Recommendations:
- Consider adding a frontend developer for 2-3 weeks
- Or use AI assistance to generate component scaffolding
- Implement components test-first for faster development

## 4. Testing Strategy Fix (Priority: MEDIUM)

### Immediate Actions:
1. **Fix existing test mocks** (4 hours)
   - Update all mock expectations to match current implementations
   - Add missing Prisma transaction mocks

2. **Add integration test coverage** (1 day)
   - Since integration tests are passing, add more
   - Cover edge cases not caught by unit tests

3. **Create test utilities** (4 hours)
   - Mock factory functions
   - Common test setup helpers

## 5. Documentation Updates (Priority: LOW)

### Quick Updates Needed:
1. Update README with Phase 2 features
2. Add API documentation for new endpoints
3. Create frontend component documentation
4. Update deployment guide with new environment variables

## Execution Order:

### Day 1:
- [ ] Fix unit test failures (4 hours)
- [ ] Create new branch structure (1 hour)
- [ ] Start Location Picker component (3 hours)

### Day 2:
- [ ] Complete Location Picker component
- [ ] Start Template Selector component
- [ ] Update test utilities

### Day 3:
- [ ] Complete Template Selector
- [ ] Start Task Creation Form
- [ ] Add integration tests

### Days 4-5:
- [ ] Complete Task Creation Form
- [ ] Fix any remaining test issues
- [ ] Update documentation

## Success Metrics:
- All tests passing (434/434)
- 3 critical frontend components implemented
- Clean branch structure established
- Updated documentation

## Commands to Run:
```bash
# Fix tests
cd backend
npm test:unit  # Should pass after fixes

# Create new branch
git checkout -b phase-2-core-functionality
git add .
git commit -m "fix: Update unit test mocks to match service implementations"

# Build and verify
npm run build
npm test
npm run test:integration
```