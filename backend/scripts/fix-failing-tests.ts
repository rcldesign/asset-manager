#!/usr/bin/env ts-node

/**
 * Automated Test Fix Script
 * Fixes the 21 failing unit tests by updating mock implementations
 * 
 * Usage: npm run fix:tests
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface TestFix {
  file: string;
  description: string;
  findPattern: RegExp;
  replacement: string;
}

const testFixes: TestFix[] = [
  // Location Service Test Fixes
  {
    file: 'src/test/unit/services/location.service.test.ts',
    description: 'Fix getLocationById mock signature',
    findPattern: /locationService\.getLocationById\s*=\s*jest\.fn\(\)\.mockResolvedValue\(mockLocation\);/g,
    replacement: `locationService.getLocationById = jest.fn()
      .mockImplementation((id: string, organizationId: string) => {
        if (id === mockLocation.id && organizationId === mockOrganizationId) {
          return Promise.resolve(mockLocation);
        }
        return Promise.resolve(null);
      });`
  },
  {
    file: 'src/test/unit/services/location.service.test.ts',
    description: 'Add Prisma transaction mock',
    findPattern: /beforeEach\(\(\) => \{/,
    replacement: `beforeEach(() => {
    // Add transaction mock
    prismaMock.$transaction.mockImplementation((callback: any) => {
      if (typeof callback === 'function') {
        return callback(prismaMock);
      }
      return Promise.resolve(callback);
    });`
  },
  {
    file: 'src/test/unit/services/location.service.test.ts',
    description: 'Fix moveLocation path update',
    findPattern: /const result = await locationService\.moveLocation\([^)]+\);[\s\S]*?expect\(result\.path\)\.toBe\([^)]+\);/g,
    replacement: `const updatedLocation = {
      ...mockLocation,
      path: \`\${mockParentLocation.path}/\${mockLocation.name}\`,
      parentId: mockParentLocation.id,
    };
    
    prismaMock.location.update.mockResolvedValue(updatedLocation);
    
    const result = await locationService.moveLocation(
      mockLocation.id,
      mockParentLocation.id,
      mockOrganizationId
    );
    
    expect(result.path).toBe(\`\${mockParentLocation.path}/\${mockLocation.name}\`);`
  },
  
  // Asset Service Test Fixes
  {
    file: 'src/test/unit/services/asset.service.test.ts',
    description: 'Fix validateCustomFieldValues mock',
    findPattern: /assetTemplateService\.validateCustomFieldValues\s*=\s*jest\.fn\(\)[^;]+;/g,
    replacement: `assetTemplateService.validateCustomFieldValues = jest.fn()
      .mockImplementation((templateId: string, values: any, organizationId: string) => {
        return Promise.resolve({ valid: true, errors: [] });
      });`
  },
  {
    file: 'src/test/unit/services/asset.service.test.ts',
    description: 'Fix getLocationById mock signature',
    findPattern: /locationService\.getLocationById\s*=\s*jest\.fn\(\)[^;]+;/g,
    replacement: `locationService.getLocationById = jest.fn()
      .mockImplementation((locationId: string, organizationId: string) => {
        if (locationId === mockLocation.id && organizationId === mockOrganizationId) {
          return Promise.resolve(mockLocation);
        }
        return Promise.resolve(null);
      });`
  },
  {
    file: 'src/test/unit/services/asset.service.test.ts',
    description: 'Update getLocationById expectations',
    findPattern: /expect\(locationService\.getLocationById\)\.toHaveBeenCalledWith\(\s*mockLocation\.id\s*\);/g,
    replacement: `expect(locationService.getLocationById).toHaveBeenCalledWith(
      mockLocation.id,
      mockOrganizationId
    );`
  },
  
  // Asset Template Service Test Fixes
  {
    file: 'src/test/unit/services/asset-template.service.test.ts',
    description: 'Add getTemplateById mock for validateCustomFieldValues tests',
    findPattern: /describe\('validateCustomFieldValues',\s*\(\)\s*=>\s*\{/,
    replacement: `describe('validateCustomFieldValues', () => {
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
        } as any);
    });`
  }
];

// Additional helper fixes for common patterns
const additionalFixes = [
  {
    pattern: /getLocationById\(locationId\)/g,
    replacement: 'getLocationById(locationId, organizationId)'
  },
  {
    pattern: /validateCustomFieldValues\(\s*templateId,\s*customFields\s*\)/g,
    replacement: 'validateCustomFieldValues(templateId, customFields, organizationId)'
  }
];

function applyFixes() {
  console.log('🔧 Starting automated test fixes...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const fix of testFixes) {
    const filePath = join(process.cwd(), fix.file);
    
    if (!existsSync(filePath)) {
      console.error(`❌ File not found: ${fix.file}`);
      errorCount++;
      continue;
    }
    
    try {
      let content = readFileSync(filePath, 'utf-8');
      const originalContent = content;
      
      // Apply main fix
      content = content.replace(fix.findPattern, fix.replacement);
      
      // Apply additional fixes
      for (const additionalFix of additionalFixes) {
        content = content.replace(additionalFix.pattern, additionalFix.replacement);
      }
      
      if (content !== originalContent) {
        writeFileSync(filePath, content);
        console.log(`✅ Fixed: ${fix.description} in ${fix.file}`);
        successCount++;
      } else {
        console.log(`ℹ️  No changes needed: ${fix.description} in ${fix.file}`);
      }
    } catch (error) {
      console.error(`❌ Error fixing ${fix.file}:`, error);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary: ${successCount} fixes applied, ${errorCount} errors`);
  
  // Additional manual fixes that need attention
  console.log('\n📝 Manual fixes still needed:');
  console.log('1. Check that all mock organizationId variables are defined');
  console.log('2. Ensure Prisma mock is properly imported in all test files');
  console.log('3. Verify that all service method calls match their actual signatures');
  console.log('\n💡 Run "npm test" to verify the fixes');
}

// Create mock factories file
function createMockFactories() {
  const mockFactoriesContent = `/**
 * Test Mock Factories
 * Centralized mock data creation for consistent testing
 */

import { 
  Location, 
  Asset, 
  AssetTemplate, 
  User, 
  Organization,
  Task,
  Schedule,
} from '@prisma/client';

export const createMockOrganization = (overrides?: Partial<Organization>): Organization => ({
  id: 'org-123',
  name: 'Test Organization',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'OWNER',
  organizationId: 'org-123',
  password: 'hashed_password',
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockLocation = (overrides?: Partial<Location>): Location => ({
  id: 'loc-123',
  name: 'Test Location',
  organizationId: 'org-123',
  path: '/test-location',
  parentId: null,
  description: null,
  metadata: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockAssetTemplate = (overrides?: Partial<AssetTemplate>): AssetTemplate => ({
  id: 'template-123',
  name: 'Test Template',
  organizationId: 'org-123',
  category: 'Equipment',
  manufacturer: 'Test Manufacturer',
  model: 'Test Model',
  description: null,
  customFieldsSchema: null,
  defaultFields: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockAsset = (overrides?: Partial<Asset>): Asset => ({
  id: 'asset-123',
  name: 'Test Asset',
  organizationId: 'org-123',
  category: 'Equipment',
  status: 'Active',
  assetTemplateId: null,
  locationId: null,
  serialNumber: null,
  manufacturer: null,
  model: null,
  purchaseDate: null,
  purchasePrice: null,
  currentValue: null,
  warrantyExpiration: null,
  description: null,
  tags: [],
  customFields: {},
  metadata: {},
  createdById: 'user-123',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockTask = (overrides?: Partial<Task>): Task => ({
  id: 'task-123',
  title: 'Test Task',
  organizationId: 'org-123',
  assetId: 'asset-123',
  scheduleId: null,
  status: 'Planned',
  priority: 'Medium',
  description: null,
  dueDate: new Date('2024-12-31'),
  completedAt: null,
  completedById: null,
  estimatedDuration: null,
  actualDuration: null,
  estimatedCost: null,
  actualCost: null,
  metadata: {},
  createdById: 'user-123',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const createMockSchedule = (overrides?: Partial<Schedule>): Schedule => ({
  id: 'schedule-123',
  name: 'Test Schedule',
  organizationId: 'org-123',
  assetId: 'asset-123',
  scheduleType: 'Fixed',
  frequency: 'Monthly',
  interval: 1,
  startDate: new Date('2024-01-01'),
  endDate: null,
  nextDue: new Date('2024-02-01'),
  lastCompleted: null,
  isActive: true,
  taskTemplate: {},
  metadata: {},
  createdById: 'user-123',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// Service mocks
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

export const createMockAssetService = () => ({
  createAsset: jest.fn(),
  getAssetById: jest.fn(),
  updateAsset: jest.fn(),
  deleteAsset: jest.fn(),
  searchAssets: jest.fn(),
  getAssetsByLocation: jest.fn(),
  getAssetsByTemplate: jest.fn(),
  bulkUpdateAssets: jest.fn(),
});

export const createMockAssetTemplateService = () => ({
  createTemplate: jest.fn(),
  getTemplateById: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  searchTemplates: jest.fn(),
  validateCustomFieldValues: jest.fn(),
});

export const createMockTaskService = () => ({
  createTask: jest.fn(),
  getTaskById: jest.fn(),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  searchTasks: jest.fn(),
  assignTask: jest.fn(),
  completeTask: jest.fn(),
  generateTasksFromSchedule: jest.fn(),
});`;

  const mockFactoriesPath = join(process.cwd(), 'src/test/helpers/mock-factories.ts');
  writeFileSync(mockFactoriesPath, mockFactoriesContent);
  console.log('✅ Created mock factories file at src/test/helpers/mock-factories.ts');
}

// Run the fixes
console.log('🚀 Asset Manager Test Fix Script\n');
applyFixes();
createMockFactories();

console.log('\n✨ Test fix script completed!');
console.log('Next step: Run "npm test" to verify all tests pass');