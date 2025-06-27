# Unit Test Fix Guide

This guide provides specific fixes for the 21 failing unit tests in the Asset Manager backend.

## Overview of Issues

The tests are failing due to:
1. Mock method signature mismatches
2. Missing Prisma transaction mocks
3. Incorrect return value expectations

## Detailed Fixes by Test File

### 1. Location Service Tests (`src/test/unit/services/location.service.test.ts`)

#### Fix A: Update Mock Signatures

```typescript
// OLD (incorrect)
locationService.getLocationById = jest.fn().mockResolvedValue(mockLocation);

// NEW (correct - expects two parameters)
locationService.getLocationById = jest.fn()
  .mockImplementation((id: string, organizationId: string) => {
    if (id === mockLocation.id && organizationId === mockOrganizationId) {
      return Promise.resolve(mockLocation);
    }
    return Promise.resolve(null);
  });
```

#### Fix B: Add Transaction Support

```typescript
// Add to test setup
beforeEach(() => {
  // ... existing setup ...
  
  // Mock transaction to pass through the callback
  prismaMock.$transaction.mockImplementation((callback) => {
    if (typeof callback === 'function') {
      return callback(prismaMock);
    }
    return Promise.resolve(callback);
  });
});
```

#### Fix C: Update moveLocation Tests

```typescript
// In 'should update location path when moved' test
const updatedLocation = {
  ...mockLocation,
  path: `${mockParentLocation.path}/${mockLocation.name}`,
  parentId: mockParentLocation.id,
};

// Mock the update to return the location with new path
prismaMock.location.update.mockResolvedValue(updatedLocation);

// Update expectation
expect(result.path).toBe(`${mockParentLocation.path}/${mockLocation.name}`);
```

#### Fix D: Update Delete Tests

```typescript
// In 'should delete location and subtree' test
// Mock the recursive delete operation
prismaMock.location.deleteMany.mockResolvedValue({ count: 1 });

// Add mock for finding subtree
prismaMock.location.findMany.mockResolvedValue([]);
```

### 2. Asset Service Tests (`src/test/unit/services/asset.service.test.ts`)

#### Fix A: Update validateCustomFieldValues Mock

```typescript
// In 'should create asset with template' test
beforeEach(() => {
  // Mock with correct signature (3 parameters)
  assetTemplateService.validateCustomFieldValues = jest.fn()
    .mockImplementation((templateId: string, values: any, organizationId: string) => {
      return Promise.resolve({ valid: true, errors: [] });
    });
});
```

#### Fix B: Update getLocationById Mock

```typescript
// In 'should create asset with location' test
locationService.getLocationById = jest.fn()
  .mockImplementation((locationId: string, organizationId: string) => {
    if (locationId === mockLocation.id && organizationId === mockOrganizationId) {
      return Promise.resolve(mockLocation);
    }
    return Promise.resolve(null);
  });

// Update test expectation
expect(locationService.getLocationById).toHaveBeenCalledWith(
  mockLocation.id,
  mockOrganizationId
);
```

### 3. Asset Template Service Tests (`src/test/unit/services/asset-template.service.test.ts`)

#### Fix A: Add Template Mock for validateCustomFieldValues

```typescript
// In validateCustomFieldValues describe block
describe('validateCustomFieldValues', () => {
  beforeEach(() => {
    // Mock the internal getTemplateById call
    jest.spyOn(assetTemplateService, 'getTemplateById')
      .mockResolvedValue({
        ...mockTemplate,
        customFieldsSchema: {
          type: 'object',
          properties: {
            cpuModel: { type: 'string' },
            ramSize: { type: 'number', minimum: 0 }
          },
          required: ['cpuModel']
        }
      });
  });

  it('should validate correct values', async () => {
    const values = { cpuModel: 'Intel i7', ramSize: 16 };
    
    const result = await assetTemplateService.validateCustomFieldValues(
      mockTemplate.id,
      values,
      mockOrganizationId
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
```

#### Fix B: Handle Empty Schema Test

```typescript
it('should handle empty schema', async () => {
  // Mock template without schema
  jest.spyOn(assetTemplateService, 'getTemplateById')
    .mockResolvedValue({
      ...mockTemplate,
      customFieldsSchema: null
    });

  const result = await assetTemplateService.validateCustomFieldValues(
    mockTemplate.id,
    {},
    mockOrganizationId
  );

  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
});
```

## General Testing Best Practices

### 1. Mock Setup Pattern

```typescript
// Create a test helper file: src/test/helpers/mock-factories.ts
export const createMockLocation = (overrides?: Partial<Location>): Location => ({
  id: 'loc-123',
  name: 'Test Location',
  organizationId: 'org-123',
  path: '/test',
  parentId: null,
  description: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockAsset = (overrides?: Partial<Asset>): Asset => ({
  id: 'asset-123',
  name: 'Test Asset',
  organizationId: 'org-123',
  category: 'Equipment',
  status: 'Active',
  // ... other fields
  ...overrides,
});
```

### 2. Service Mock Pattern

```typescript
// Create reusable service mocks
export const createMockLocationService = () => ({
  getLocationById: jest.fn(),
  createLocation: jest.fn(),
  updateLocation: jest.fn(),
  deleteLocation: jest.fn(),
  moveLocation: jest.fn(),
  findSubtree: jest.fn(),
  findAncestors: jest.fn(),
  getLocationByPath: jest.fn(),
  searchLocations: jest.fn(),
});
```

### 3. Prisma Mock Enhancement

```typescript
// In src/test/setup.ts or similar
import { PrismaClient } from '@prisma/client';
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended';

const prismaMock = mockDeep<PrismaClient>();

// Add transaction support by default
prismaMock.$transaction.mockImplementation((callback: any) => {
  if (typeof callback === 'function') {
    return callback(prismaMock);
  }
  return Promise.resolve(callback);
});

export { prismaMock };
```

## Running the Fixed Tests

```bash
# Run only the fixed test files
npm test -- location.service.test.ts
npm test -- asset.service.test.ts
npm test -- asset-template.service.test.ts

# Run all unit tests
npm run test:unit

# Run with coverage
npm run test:unit -- --coverage
```

## Verification Steps

1. Each test file should pass individually
2. No TypeScript compilation errors
3. All mocks should match actual service signatures
4. Coverage should remain high (>80%)

## Common Pitfalls to Avoid

1. **Don't mock what you're testing** - Only mock dependencies
2. **Match parameter order** - Ensure mocks match actual method signatures
3. **Return appropriate types** - Mocks should return proper typed objects
4. **Clean up after tests** - Use afterEach to reset mocks
5. **Test both success and failure** - Cover error cases too

## Next Steps

After fixing these tests:
1. Run full test suite to ensure no regressions
2. Update CI/CD pipeline if needed
3. Document any API changes that led to test failures
4. Consider adding integration tests for complex flows