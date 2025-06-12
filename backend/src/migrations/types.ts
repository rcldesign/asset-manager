/**
 * Type definitions for DumbAssets JSON format migration
 */

/**
 * Original DumbAssets Asset format (inferred from typical structure)
 */
export interface LegacyAsset {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string; // maps to modelNumber
  serial?: string; // maps to serialNumber
  purchaseDate?: string; // ISO date string
  purchasePrice?: number;
  description?: string;
  link?: string;
  tags?: string[];
  warranty?: {
    scope?: string;
    expiry?: string; // ISO date string
    lifetime?: boolean;
    secondaryScope?: string;
    secondaryExpiry?: string;
  };
  photos?: string[]; // file paths
  receipt?: string; // file path
  manual?: string; // file path
  components?: LegacyComponent[];
  maintenanceEvents?: LegacyMaintenanceEvent[];
  notes?: string;
  location?: string;
  condition?: string;
  value?: number; // current estimated value
  depreciation?: {
    method?: string;
    rate?: number;
    residualValue?: number;
  };
  customFields?: Record<string, unknown>;
  createdAt?: string; // ISO date string
  updatedAt?: string; // ISO date string
}

/**
 * Original DumbAssets Component format
 */
export interface LegacyComponent {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serial?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  description?: string;
  link?: string;
  tags?: string[];
  warranty?: {
    scope?: string;
    expiry?: string;
    lifetime?: boolean;
  };
  photos?: string[];
  receipt?: string;
  manual?: string;
  parentComponentId?: string; // for nested components
  notes?: string;
  condition?: string;
  customFields?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Original DumbAssets Maintenance Event format
 */
export interface LegacyMaintenanceEvent {
  id: string;
  title: string;
  description?: string;
  dueDate?: string; // ISO date string
  completedDate?: string; // ISO date string
  cost?: number;
  estimatedDuration?: number; // minutes
  actualDuration?: number; // minutes
  status?: 'pending' | 'completed' | 'skipped' | 'overdue';
  priority?: 'high' | 'medium' | 'low';
  recurring?: {
    enabled: boolean;
    interval: number; // days
    lastGenerated?: string;
  };
  attachments?: string[]; // file paths
  notes?: string;
  assignedTo?: string; // user identifier
  customFields?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Original DumbAssets User format (if any)
 */
export interface LegacyUser {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  preferences?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Original DumbAssets Organization/Household format
 */
export interface LegacyOrganization {
  id: string;
  name: string;
  description?: string;
  members?: string[]; // user IDs
  settings?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Root DumbAssets export format
 */
export interface LegacyDataExport {
  version: string;
  exportDate: string;
  metadata?: {
    appVersion?: string;
    totalAssets?: number;
    totalComponents?: number;
    totalMaintenanceEvents?: number;
    totalUsers?: number;
  };
  organizations?: LegacyOrganization[];
  users?: LegacyUser[];
  assets: LegacyAsset[];
  globalSettings?: Record<string, unknown>;
}

/**
 * Migration context for tracking progress and errors
 */
export interface MigrationContext {
  organizationId: string;
  ownerUserId: string;
  dryRun: boolean;
  preserveIds: boolean;
  baseUploadPath?: string;
  stats: {
    assetsProcessed: number;
    componentsProcessed: number;
    tasksCreated: number;
    filesProcessed: number;
    errors: number;
    warnings: number;
  };
  errors: Array<{
    type: 'asset' | 'component' | 'task' | 'file' | 'validation';
    id?: string;
    message: string;
    details?: unknown;
  }>;
  warnings: Array<{
    type: 'asset' | 'component' | 'task' | 'file' | 'data';
    id?: string;
    message: string;
    details?: unknown;
  }>;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  dryRun?: boolean;
  preserveIds?: boolean;
  defaultOrganizationName?: string;
  defaultOwnerEmail?: string;
  defaultOwnerName?: string;
  baseUploadPath?: string;
  skipFileValidation?: boolean;
  skipDuplicateAssets?: boolean;
  createDefaultTasks?: boolean;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

/**
 * File mapping for asset attachments
 */
export interface FileMapping {
  originalPath: string;
  newPath: string;
  type: 'photo' | 'receipt' | 'manual' | 'attachment';
  assetId?: string;
  componentId?: string;
  taskId?: string;
  processed: boolean;
  error?: string;
}
