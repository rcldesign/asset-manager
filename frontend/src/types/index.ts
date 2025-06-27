// Common types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

// Location types
export interface Location {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  path: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  children?: Location[];
}

// Asset Template types
export interface AssetTemplate {
  id: string;
  name: string;
  description?: string;
  category: AssetCategory;
  defaultFields: Record<string, unknown>;
  customFields: Record<string, unknown>;
  isActive: boolean;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Asset types
export enum AssetCategory {
  HARDWARE = 'HARDWARE',
  SOFTWARE = 'SOFTWARE',
  FURNITURE = 'FURNITURE',
  VEHICLE = 'VEHICLE',
  EQUIPMENT = 'EQUIPMENT',
  PROPERTY = 'PROPERTY',
  OTHER = 'OTHER',
}

export enum AssetStatus {
  OPERATIONAL = 'OPERATIONAL',
  MAINTENANCE = 'MAINTENANCE',
  REPAIR = 'REPAIR',
  RETIRED = 'RETIRED',
  DISPOSED = 'DISPOSED',
  LOST = 'LOST',
}

export interface Asset {
  id: string;
  barcode: string;
  qrCode?: string;
  name: string;
  description?: string;
  category: AssetCategory;
  status: AssetStatus;
  purchaseDate?: string;
  purchasePrice?: number;
  warrantyExpiry?: string;
  serialNumber?: string;
  modelNumber?: string;
  manufacturer?: string;
  link?: string;
  locationId?: string;
  location?: Location;
  assetTemplateId?: string;
  assetTemplate?: AssetTemplate;
  customFields?: Record<string, unknown>;
  tags: string[];
  notes?: string;
  assignedUserId?: string;
  assignedUser?: User;
  parentAssetId?: string;
  parentAsset?: Asset;
  childAssets?: Asset[];
  attachments?: AssetAttachment[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Asset Attachment types
export interface AssetAttachment {
  id: string;
  assetId: string;
  type: 'IMAGE' | 'MANUAL' | 'WARRANTY' | 'INVOICE' | 'OTHER';
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  isPrimary: boolean;
  uploadDate: string;
  uploadedById: string;
  uploadedBy?: User;
}

// User types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  organizationId: string;
  isActive?: boolean;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Task types
export enum TaskStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
  SKIPPED = 'SKIPPED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  completedAt?: string;
  assignedUserId?: string;
  assignedUser?: User;
  assetId?: string;
  asset?: Asset;
  scheduleId?: string;
  estimatedCost?: number;
  actualCost?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  isAutomated?: boolean;
  notes?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Schedule types
export enum ScheduleType {
  ONE_OFF = 'ONE_OFF',
  FIXED_INTERVAL = 'FIXED_INTERVAL',
  CUSTOM = 'CUSTOM',
}

export interface Schedule {
  id: string;
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  taskTemplate: Record<string, unknown>;
  startDate: string;
  endDate?: string;
  recurrenceRule?: string;
  intervalDays?: number;
  nextOccurrence?: string;
  isActive: boolean;
  assetId?: string;
  asset?: Asset;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

// Notification types
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
  assetId?: string;
  taskId?: string;
  scheduleId?: string;
  createdAt: string;
}


export interface TaskAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: User;
}

// Form types
export interface AssetFormData {
  barcode: string;
  qrCode?: string;
  name: string;
  description?: string;
  category: AssetCategory;
  status: AssetStatus;
  purchaseDate?: string;
  purchasePrice?: number;
  warrantyExpiry?: string;
  serialNumber?: string;
  modelNumber?: string;
  manufacturer?: string;
  link?: string;
  locationId?: string;
  assetTemplateId?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  notes?: string;
  assignedUserId?: string;
  parentAssetId?: string;
}

export interface TaskFormData {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assignedUserId?: string;
  assetId?: string;
  estimatedCost?: number;
  estimatedDuration?: number;
  notes?: string;
  isAutomated?: boolean;
}

// Phase 3 types
export interface UserInvitation {
  id: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  token: string;
  invitedById: string;
  invitedBy?: User;
  organizationId: string;
  acceptedAt?: string;
  expiresAt: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleFormData {
  name: string;
  description?: string;
  scheduleType: ScheduleType;
  taskTemplate: Record<string, unknown>;
  startDate: string;
  endDate?: string;
  recurrenceRule?: string;
  intervalDays?: number;
  isActive: boolean;
  assetId?: string;
}

// Filter types
export interface AssetFilters {
  search?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  locationId?: string;
  assetTemplateId?: string;
  assignedUserId?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  purchasedAfter?: string;
  purchasedBefore?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface TaskFilters {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedUserId?: string;
  assetId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  dueAfter?: string;
  dueBefore?: string;
  scheduleId?: string;
  isAutomated?: boolean;
  overdue?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}