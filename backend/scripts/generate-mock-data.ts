#!/usr/bin/env ts-node

/**
 * Mock Data Generator
 * Generates realistic test data for development and testing
 * 
 * Usage: npm run generate:mocks [--output=./mocks] [--count=100]
 */

import { faker } from '@faker-js/faker';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { program } from 'commander';

interface GeneratorOptions {
  output: string;
  count: number;
}

// Type definitions matching Prisma schema
interface Location {
  id: string;
  name: string;
  organizationId: string;
  path: string;
  parentId: string | null;
  description: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetTemplate {
  id: string;
  name: string;
  organizationId: string;
  category: string;
  manufacturer: string;
  model: string;
  description: string | null;
  customFieldsSchema: any;
  defaultFields: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface Asset {
  id: string;
  name: string;
  organizationId: string;
  category: string;
  status: string;
  assetTemplateId: string | null;
  locationId: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  purchaseDate: Date | null;
  purchasePrice: number | null;
  currentValue: number | null;
  warrantyExpiration: Date | null;
  description: string | null;
  tags: string[];
  customFields: Record<string, any>;
  metadata: Record<string, any>;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Task {
  id: string;
  title: string;
  organizationId: string;
  assetId: string;
  scheduleId: string | null;
  status: string;
  priority: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  completedById: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
  metadata: Record<string, any>;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Schedule {
  id: string;
  name: string;
  organizationId: string;
  assetId: string;
  scheduleType: string;
  frequency: string;
  interval: number;
  rrule: string | null;
  startDate: Date;
  endDate: Date | null;
  nextDue: Date;
  lastCompleted: Date | null;
  isActive: boolean;
  taskTemplate: Record<string, any>;
  metadata: Record<string, any>;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

class MockDataGenerator {
  private organizationId = 'org-' + faker.string.uuid();
  private userIds: string[] = [];
  private locationIds: string[] = [];
  private templateIds: string[] = [];
  private assetIds: string[] = [];
  private taskIds: string[] = [];
  private scheduleIds: string[] = [];

  constructor(private options: GeneratorOptions) {
    // Generate some user IDs
    for (let i = 0; i < 10; i++) {
      this.userIds.push('user-' + faker.string.uuid());
    }
  }

  generateLocations(count: number): Location[] {
    const locations: Location[] = [];
    const rootLocations = Math.ceil(count * 0.2); // 20% root locations
    
    // Generate root locations
    for (let i = 0; i < rootLocations; i++) {
      const location = this.generateLocation(null, '');
      locations.push(location);
      this.locationIds.push(location.id);
    }
    
    // Generate child locations
    for (let i = rootLocations; i < count; i++) {
      const parentIdx = faker.number.int({ min: 0, max: locations.length - 1 });
      const parent = locations[parentIdx];
      const location = this.generateLocation(parent.id, parent.path);
      locations.push(location);
      this.locationIds.push(location.id);
    }
    
    return locations;
  }

  private generateLocation(parentId: string | null, parentPath: string): Location {
    const name = faker.helpers.arrayElement([
      `Building ${faker.location.buildingNumber()}`,
      `Floor ${faker.number.int({ min: 1, max: 10 })}`,
      `Room ${faker.location.secondaryAddress()}`,
      faker.location.street(),
      `${faker.company.name()} Office`,
      `Warehouse ${faker.string.alpha({ length: 1, casing: 'upper' })}`,
      `Section ${faker.number.int({ min: 1, max: 50 })}`,
      'Server Room',
      'Storage Area',
      'Maintenance Shop',
    ]);
    
    const path = parentPath ? `${parentPath}/${name}` : `/${name}`;
    
    return {
      id: 'loc-' + faker.string.uuid(),
      name,
      organizationId: this.organizationId,
      path,
      parentId,
      description: faker.datatype.boolean() ? faker.lorem.sentence() : null,
      metadata: {
        capacity: faker.number.int({ min: 1, max: 100 }),
        type: faker.helpers.arrayElement(['office', 'warehouse', 'outdoor', 'restricted']),
      },
      createdAt: faker.date.past({ years: 2 }),
      updatedAt: faker.date.recent({ days: 30 }),
    };
  }

  generateAssetTemplates(count: number): AssetTemplate[] {
    const templates: AssetTemplate[] = [];
    
    const templateConfigs = [
      // Equipment templates
      { category: 'Equipment', manufacturer: 'Dell', model: 'OptiPlex 7090', fields: ['cpuModel', 'ramSize', 'storageSize'] },
      { category: 'Equipment', manufacturer: 'HP', model: 'EliteDesk 800 G6', fields: ['cpuModel', 'ramSize', 'storageSize'] },
      { category: 'Equipment', manufacturer: 'Lenovo', model: 'ThinkCentre M920', fields: ['cpuModel', 'ramSize'] },
      
      // Vehicle templates
      { category: 'Vehicle', manufacturer: 'Ford', model: 'F-150', fields: ['vin', 'mileage', 'fuelType'] },
      { category: 'Vehicle', manufacturer: 'Toyota', model: 'Camry', fields: ['vin', 'mileage', 'color'] },
      { category: 'Vehicle', manufacturer: 'Caterpillar', model: '320 Excavator', fields: ['hoursUsed', 'lastService'] },
      
      // Electronics templates
      { category: 'Electronics', manufacturer: 'Apple', model: 'MacBook Pro 16"', fields: ['serialNumber', 'processor', 'memory'] },
      { category: 'Electronics', manufacturer: 'Samsung', model: 'Galaxy S23', fields: ['imei', 'storageCapacity'] },
      { category: 'Electronics', manufacturer: 'LG', model: '55" OLED TV', fields: ['screenSize', 'resolution'] },
      
      // Tool templates
      { category: 'Tool', manufacturer: 'DeWalt', model: 'DCD791D2', fields: ['batteryType', 'voltage'] },
      { category: 'Tool', manufacturer: 'Milwaukee', model: 'M18 FUEL', fields: ['batteryCount', 'rpm'] },
      
      // Furniture templates
      { category: 'Furniture', manufacturer: 'Herman Miller', model: 'Aeron Chair', fields: ['size', 'color', 'material'] },
      { category: 'Furniture', manufacturer: 'IKEA', model: 'BEKANT Desk', fields: ['width', 'height', 'color'] },
    ];
    
    for (let i = 0; i < Math.min(count, templateConfigs.length); i++) {
      const config = templateConfigs[i];
      const template = this.generateAssetTemplate(config);
      templates.push(template);
      this.templateIds.push(template.id);
    }
    
    // Generate additional random templates if needed
    for (let i = templateConfigs.length; i < count; i++) {
      const config = faker.helpers.arrayElement(templateConfigs);
      const template = this.generateAssetTemplate({
        ...config,
        model: config.model + ' ' + faker.string.alphanumeric({ length: 4, casing: 'upper' }),
      });
      templates.push(template);
      this.templateIds.push(template.id);
    }
    
    return templates;
  }

  private generateAssetTemplate(config: any): AssetTemplate {
    const customFieldsSchema = this.generateCustomFieldsSchema(config.fields || []);
    
    return {
      id: 'template-' + faker.string.uuid(),
      name: `${config.manufacturer} ${config.model}`,
      organizationId: this.organizationId,
      category: config.category,
      manufacturer: config.manufacturer,
      model: config.model,
      description: faker.lorem.sentence(),
      customFieldsSchema,
      defaultFields: this.generateDefaultFields(config.fields || []),
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 }),
    };
  }

  private generateCustomFieldsSchema(fields: string[]): any {
    const properties: any = {};
    const required: string[] = [];
    
    fields.forEach(field => {
      switch (field) {
        case 'cpuModel':
          properties.cpuModel = { type: 'string', description: 'CPU model' };
          required.push('cpuModel');
          break;
        case 'ramSize':
          properties.ramSize = { type: 'number', minimum: 0, description: 'RAM size in GB' };
          break;
        case 'storageSize':
          properties.storageSize = { type: 'number', minimum: 0, description: 'Storage size in GB' };
          break;
        case 'vin':
          properties.vin = { type: 'string', pattern: '^[A-HJ-NPR-Z0-9]{17}$' };
          required.push('vin');
          break;
        case 'mileage':
          properties.mileage = { type: 'number', minimum: 0 };
          break;
        case 'hoursUsed':
          properties.hoursUsed = { type: 'number', minimum: 0 };
          break;
        default:
          properties[field] = { type: 'string' };
      }
    });
    
    return {
      type: 'object',
      properties,
      required,
    };
  }

  private generateDefaultFields(fields: string[]): Record<string, any> {
    const defaults: Record<string, any> = {};
    
    fields.forEach(field => {
      switch (field) {
        case 'ramSize':
          defaults.ramSize = faker.helpers.arrayElement([8, 16, 32, 64]);
          break;
        case 'storageSize':
          defaults.storageSize = faker.helpers.arrayElement([256, 512, 1024, 2048]);
          break;
        case 'fuelType':
          defaults.fuelType = faker.helpers.arrayElement(['Gasoline', 'Diesel', 'Electric', 'Hybrid']);
          break;
        case 'batteryType':
          defaults.batteryType = faker.helpers.arrayElement(['Li-Ion', 'NiMH', 'NiCd']);
          break;
      }
    });
    
    return defaults;
  }

  generateAssets(count: number): Asset[] {
    const assets: Asset[] = [];
    
    for (let i = 0; i < count; i++) {
      const asset = this.generateAsset();
      assets.push(asset);
      this.assetIds.push(asset.id);
    }
    
    return assets;
  }

  private generateAsset(): Asset {
    const hasTemplate = faker.datatype.boolean({ probability: 0.7 });
    const templateId = hasTemplate && this.templateIds.length > 0
      ? faker.helpers.arrayElement(this.templateIds)
      : null;
    
    const category = faker.helpers.arrayElement([
      'Equipment', 'Vehicle', 'Property', 'Tool', 'Furniture', 'Electronics', 'Other'
    ]);
    
    const status = faker.helpers.weightedArrayElement([
      { value: 'Active', weight: 70 },
      { value: 'In Maintenance', weight: 10 },
      { value: 'Retired', weight: 5 },
      { value: 'Disposed', weight: 5 },
      { value: 'In Storage', weight: 10 },
    ]);
    
    const purchaseDate = faker.date.past({ years: 5 });
    const purchasePrice = faker.number.int({ min: 100, max: 50000 });
    const depreciationRate = faker.number.float({ min: 0.1, max: 0.3 });
    const yearsOwned = (new Date().getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    const currentValue = Math.max(100, purchasePrice * (1 - depreciationRate * yearsOwned));
    
    return {
      id: 'asset-' + faker.string.uuid(),
      name: this.generateAssetName(category),
      organizationId: this.organizationId,
      category,
      status,
      assetTemplateId: templateId,
      locationId: this.locationIds.length > 0 ? faker.helpers.arrayElement(this.locationIds) : null,
      serialNumber: faker.string.alphanumeric({ length: 12, casing: 'upper' }),
      manufacturer: faker.company.name(),
      model: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
      purchaseDate,
      purchasePrice,
      currentValue: Math.round(currentValue),
      warrantyExpiration: faker.date.future({ years: 3, refDate: purchaseDate }),
      description: faker.datatype.boolean() ? faker.lorem.paragraph() : null,
      tags: this.generateTags(),
      customFields: this.generateAssetCustomFields(category),
      metadata: {
        condition: faker.helpers.arrayElement(['Excellent', 'Good', 'Fair', 'Poor']),
        lastInspection: faker.date.recent({ days: 90 }),
      },
      createdById: faker.helpers.arrayElement(this.userIds),
      createdAt: purchaseDate,
      updatedAt: faker.date.recent({ days: 30 }),
    };
  }

  private generateAssetName(category: string): string {
    switch (category) {
      case 'Equipment':
        return faker.helpers.arrayElement(['Desktop PC', 'Laptop', 'Server', 'Printer', 'Scanner']) + 
               ' #' + faker.number.int({ min: 100, max: 999 });
      case 'Vehicle':
        return faker.vehicle.manufacturer() + ' ' + faker.vehicle.model();
      case 'Property':
        return faker.location.street() + ' ' + faker.helpers.arrayElement(['Building', 'Unit', 'Suite']);
      case 'Tool':
        return faker.helpers.arrayElement(['Drill', 'Saw', 'Hammer', 'Wrench Set', 'Multimeter']) +
               ' ' + faker.string.alpha({ length: 3, casing: 'upper' });
      case 'Furniture':
        return faker.helpers.arrayElement(['Desk', 'Chair', 'Cabinet', 'Table', 'Shelf']) +
               ' ' + faker.color.human();
      case 'Electronics':
        return faker.helpers.arrayElement(['Monitor', 'Phone', 'Tablet', 'Camera', 'Router']) +
               ' ' + faker.string.numeric({ length: 3 });
      default:
        return faker.commerce.productName();
    }
  }

  private generateTags(): string[] {
    const tagCount = faker.number.int({ min: 0, max: 5 });
    const tags: string[] = [];
    
    for (let i = 0; i < tagCount; i++) {
      tags.push(faker.helpers.arrayElement([
        'critical', 'backup', 'primary', 'secondary', 'shared',
        'personal', 'department', 'project', 'temporary', 'permanent',
        'high-value', 'low-priority', 'requires-certification', 'outdoor',
      ]));
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private generateAssetCustomFields(category: string): Record<string, any> {
    const fields: Record<string, any> = {};
    
    switch (category) {
      case 'Equipment':
        if (faker.datatype.boolean()) fields.cpuModel = faker.helpers.arrayElement(['Intel i7', 'Intel i5', 'AMD Ryzen 7']);
        if (faker.datatype.boolean()) fields.ramSize = faker.helpers.arrayElement([8, 16, 32, 64]);
        break;
      case 'Vehicle':
        if (faker.datatype.boolean()) fields.vin = faker.vehicle.vin();
        if (faker.datatype.boolean()) fields.mileage = faker.number.int({ min: 0, max: 200000 });
        break;
      case 'Tool':
        if (faker.datatype.boolean()) fields.voltage = faker.helpers.arrayElement(['12V', '18V', '20V', '110V']);
        break;
    }
    
    return fields;
  }

  generateTasks(count: number): Task[] {
    const tasks: Task[] = [];
    
    for (let i = 0; i < count; i++) {
      const task = this.generateTask();
      tasks.push(task);
      this.taskIds.push(task.id);
    }
    
    return tasks;
  }

  private generateTask(): Task {
    const status = faker.helpers.weightedArrayElement([
      { value: 'Planned', weight: 30 },
      { value: 'In Progress', weight: 20 },
      { value: 'Completed', weight: 40 },
      { value: 'Skipped', weight: 5 },
      { value: 'Overdue', weight: 5 },
    ]);
    
    const priority = faker.helpers.weightedArrayElement([
      { value: 'Low', weight: 20 },
      { value: 'Medium', weight: 50 },
      { value: 'High', weight: 25 },
      { value: 'Critical', weight: 5 },
    ]);
    
    const dueDate = faker.date.between({ 
      from: faker.date.recent({ days: 30 }), 
      to: faker.date.future({ years: 1 }) 
    });
    
    const isCompleted = status === 'Completed';
    const completedAt = isCompleted ? faker.date.recent({ days: 7 }) : null;
    const completedById = isCompleted ? faker.helpers.arrayElement(this.userIds) : null;
    
    const estimatedDuration = faker.number.int({ min: 30, max: 480 }); // minutes
    const actualDuration = isCompleted 
      ? faker.number.int({ min: estimatedDuration * 0.5, max: estimatedDuration * 1.5 })
      : null;
    
    const estimatedCost = faker.number.int({ min: 50, max: 5000 });
    const actualCost = isCompleted
      ? faker.number.int({ min: estimatedCost * 0.8, max: estimatedCost * 1.2 })
      : null;
    
    return {
      id: 'task-' + faker.string.uuid(),
      title: this.generateTaskTitle(),
      organizationId: this.organizationId,
      assetId: faker.helpers.arrayElement(this.assetIds),
      scheduleId: faker.datatype.boolean() ? faker.helpers.arrayElement(this.scheduleIds) : null,
      status,
      priority,
      description: faker.datatype.boolean() ? faker.lorem.paragraph() : null,
      dueDate,
      completedAt,
      completedById,
      estimatedDuration,
      actualDuration,
      estimatedCost,
      actualCost,
      metadata: {
        checklist: this.generateTaskChecklist(),
        notes: faker.datatype.boolean() ? faker.lorem.sentence() : null,
      },
      createdById: faker.helpers.arrayElement(this.userIds),
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 }),
    };
  }

  private generateTaskTitle(): string {
    return faker.helpers.arrayElement([
      'Routine Maintenance',
      'Safety Inspection',
      'Oil Change',
      'Filter Replacement',
      'Software Update',
      'Calibration Check',
      'Performance Test',
      'Visual Inspection',
      'Deep Cleaning',
      'Parts Replacement',
      'System Diagnostics',
      'Backup Verification',
      'License Renewal',
      'Compliance Check',
      'Emergency Repair',
    ]);
  }

  private generateTaskChecklist(): Array<{ item: string; completed: boolean }> {
    const items = faker.helpers.arrayElements([
      'Check fluid levels',
      'Inspect for damage',
      'Test functionality',
      'Clean components',
      'Update documentation',
      'Verify settings',
      'Replace consumables',
      'Run diagnostics',
      'Check connections',
      'Test safety features',
    ], { min: 2, max: 5 });
    
    return items.map(item => ({
      item,
      completed: faker.datatype.boolean(),
    }));
  }

  generateSchedules(count: number): Schedule[] {
    const schedules: Schedule[] = [];
    
    for (let i = 0; i < count; i++) {
      const schedule = this.generateSchedule();
      schedules.push(schedule);
      this.scheduleIds.push(schedule.id);
    }
    
    return schedules;
  }

  private generateSchedule(): Schedule {
    const scheduleType = faker.helpers.arrayElement(['OneOff', 'Fixed', 'Seasonal', 'UsageBased']);
    const frequency = faker.helpers.arrayElement(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']);
    const interval = faker.number.int({ min: 1, max: 4 });
    
    const startDate = faker.date.past({ years: 1 });
    const endDate = faker.datatype.boolean() ? faker.date.future({ years: 2 }) : null;
    
    return {
      id: 'schedule-' + faker.string.uuid(),
      name: this.generateScheduleName(frequency),
      organizationId: this.organizationId,
      assetId: faker.helpers.arrayElement(this.assetIds),
      scheduleType,
      frequency,
      interval,
      rrule: scheduleType === 'Fixed' ? this.generateRRule(frequency, interval) : null,
      startDate,
      endDate,
      nextDue: faker.date.future({ years: 1 }),
      lastCompleted: faker.datatype.boolean() ? faker.date.recent({ days: 30 }) : null,
      isActive: faker.datatype.boolean({ probability: 0.9 }),
      taskTemplate: {
        title: this.generateTaskTitle(),
        priority: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
        estimatedDuration: faker.number.int({ min: 30, max: 240 }),
        estimatedCost: faker.number.int({ min: 100, max: 2000 }),
      },
      metadata: {
        season: scheduleType === 'Seasonal' ? faker.helpers.arrayElement(['Spring', 'Summer', 'Fall', 'Winter']) : null,
        usageThreshold: scheduleType === 'UsageBased' ? faker.number.int({ min: 100, max: 10000 }) : null,
      },
      createdById: faker.helpers.arrayElement(this.userIds),
      createdAt: startDate,
      updatedAt: faker.date.recent({ days: 7 }),
    };
  }

  private generateScheduleName(frequency: string): string {
    const prefix = faker.helpers.arrayElement([
      'Preventive Maintenance',
      'Regular Inspection',
      'Routine Service',
      'Scheduled Check',
      'Periodic Review',
    ]);
    
    return `${prefix} - ${frequency}`;
  }

  private generateRRule(frequency: string, interval: number): string {
    const freqMap: Record<string, string> = {
      'Daily': 'DAILY',
      'Weekly': 'WEEKLY',
      'Monthly': 'MONTHLY',
      'Quarterly': 'MONTHLY',
      'Yearly': 'YEARLY',
    };
    
    const freq = freqMap[frequency];
    const actualInterval = frequency === 'Quarterly' ? interval * 3 : interval;
    
    return `FREQ=${freq};INTERVAL=${actualInterval}`;
  }

  async generate() {
    console.log('🎲 Generating mock data...\n');
    
    const outputDir = this.options.output;
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate data
    const locations = this.generateLocations(Math.floor(this.options.count * 0.3));
    console.log(`✅ Generated ${locations.length} locations`);
    
    const templates = this.generateAssetTemplates(20);
    console.log(`✅ Generated ${templates.length} asset templates`);
    
    const assets = this.generateAssets(this.options.count);
    console.log(`✅ Generated ${assets.length} assets`);
    
    const schedules = this.generateSchedules(Math.floor(this.options.count * 0.5));
    console.log(`✅ Generated ${schedules.length} schedules`);
    
    const tasks = this.generateTasks(this.options.count * 2);
    console.log(`✅ Generated ${tasks.length} tasks`);
    
    // Write files
    const data = {
      organizationId: this.organizationId,
      userIds: this.userIds,
      locations,
      assetTemplates: templates,
      assets,
      schedules,
      tasks,
    };
    
    writeFileSync(
      join(outputDir, 'mock-data.json'),
      JSON.stringify(data, null, 2)
    );
    
    // Write individual files for easier use
    writeFileSync(join(outputDir, 'locations.json'), JSON.stringify(locations, null, 2));
    writeFileSync(join(outputDir, 'asset-templates.json'), JSON.stringify(templates, null, 2));
    writeFileSync(join(outputDir, 'assets.json'), JSON.stringify(assets, null, 2));
    writeFileSync(join(outputDir, 'schedules.json'), JSON.stringify(schedules, null, 2));
    writeFileSync(join(outputDir, 'tasks.json'), JSON.stringify(tasks, null, 2));
    
    // Generate seed script
    this.generateSeedScript(outputDir);
    
    console.log(`\n✨ Mock data generated successfully in ${outputDir}`);
    console.log('\n📊 Summary:');
    console.log(`- Organization ID: ${this.organizationId}`);
    console.log(`- Users: ${this.userIds.length}`);
    console.log(`- Locations: ${locations.length}`);
    console.log(`- Templates: ${templates.length}`);
    console.log(`- Assets: ${assets.length}`);
    console.log(`- Schedules: ${schedules.length}`);
    console.log(`- Tasks: ${tasks.length}`);
  }

  private generateSeedScript(outputDir: string) {
    const seedScript = `#!/usr/bin/env ts-node
/**
 * Database Seed Script
 * Seeds the database with generated mock data
 */

import { PrismaClient } from '@prisma/client';
import mockData from './mock-data.json';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding database...');
  
  try {
    // Create organization
    await prisma.organization.create({
      data: {
        id: mockData.organizationId,
        name: 'Demo Organization',
      },
    });
    
    // Create users
    for (const userId of mockData.userIds) {
      await prisma.user.create({
        data: {
          id: userId,
          email: \`user-\${userId.slice(0, 8)}@example.com\`,
          name: \`Test User \${userId.slice(0, 8)}\`,
          password: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', // secret
          role: 'MEMBER',
          organizationId: mockData.organizationId,
          emailVerified: true,
        },
      });
    }
    
    // Create locations
    for (const location of mockData.locations) {
      await prisma.location.create({ data: location });
    }
    
    // Create asset templates
    for (const template of mockData.assetTemplates) {
      await prisma.assetTemplate.create({ data: template });
    }
    
    // Create assets
    for (const asset of mockData.assets) {
      await prisma.asset.create({ data: asset });
    }
    
    // Create schedules
    for (const schedule of mockData.schedules) {
      await prisma.schedule.create({ data: schedule });
    }
    
    // Create tasks
    for (const task of mockData.tasks) {
      await prisma.task.create({ data: task });
    }
    
    console.log('✅ Database seeded successfully!');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch(console.error);
`;

    writeFileSync(join(outputDir, 'seed.ts'), seedScript);
    console.log('✅ Generated seed script');
  }
}

// CLI setup
program
  .name('generate-mock-data')
  .description('Generate realistic mock data for testing and development')
  .option('-o, --output <dir>', 'Output directory', './mocks')
  .option('-c, --count <number>', 'Number of assets to generate', '100')
  .action((options) => {
    const generator = new MockDataGenerator({
      output: options.output,
      count: parseInt(options.count, 10),
    });
    
    generator.generate().catch(console.error);
  });

program.parse();