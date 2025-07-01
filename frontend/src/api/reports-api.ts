import apiClient from '@/lib/api-client';
import { 
  AssetAgeAnalysisReport, 
  AssetWarrantyReport, 
  AssetMaintenanceReport,
  TaskCompletionReport, 
  TaskCostReport, 
  UserWorkloadReport,
  UserPerformanceReport,
  CustomReportConfig,
  CustomReportResult,
  ReportFormat
} from '@/types/reports';

export interface ReportTemplate {
  name: string;
  description: string;
  type: string;
  columns: ReportColumn[];
}

export interface ReportColumn {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface ReportDefinition {
  id: string;
  name: string;
  description?: string;
  type: 'asset' | 'task' | 'schedule' | 'maintenance' | 'financial' | 'custom';
  filters: Record<string, any>;
  columns: ReportColumn[];
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  isPublic: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  description?: string;
  type: string;
  format: string;
  schedule: any;
  recipients: string[];
  filters?: any;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt: string;
  customReportId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportHistory {
  id: string;
  type: string;
  format: string;
  parameters: any;
  filePath: string;
  fileSize: number;
  recordCount: number;
  generatedAt: string;
  generatedBy: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface GenerateReportOptions {
  format?: ReportFormat;
  includeHeaders?: boolean;
  dateFormat?: string;
  numberFormat?: string;
  timezone?: string;
}

export const reportsApi = {
  // Get available report templates
  async getTemplates() {
    const { data } = await apiClient.get<ReportTemplate[]>('/reports/templates');
    return data;
  },

  // Create a custom report definition
  async createReportDefinition(definition: Omit<ReportDefinition, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) {
    const { data } = await apiClient.post<ReportDefinition>('/reports', definition);
    return data;
  },

  // Generate a report from a definition
  async generateReport(reportId: string, options: GenerateReportOptions = {}) {
    const { data } = await apiClient.post(`/reports/${reportId}/generate`, options, {
      responseType: options.format && options.format !== 'json' ? 'blob' : 'json',
    });
    return data;
  },

  // Quick reports
  async generateAssetInventory(format: ReportFormat = 'json', filters?: any) {
    const params = new URLSearchParams({ format, ...filters });
    const { data } = await apiClient.get(`/reports/quick/asset-inventory?${params}`, {
      responseType: format !== 'json' ? 'blob' : 'json',
    });
    return data;
  },

  async generateMaintenanceSummary(format: ReportFormat = 'json', filters?: any) {
    const params = new URLSearchParams({ format, ...filters });
    const { data } = await apiClient.get(`/reports/quick/maintenance-summary?${params}`, {
      responseType: format !== 'json' ? 'blob' : 'json',
    });
    return data;
  },

  // Standard reports
  async generateAssetAgeAnalysis(filters?: any): Promise<AssetAgeAnalysisReport> {
    const params = new URLSearchParams(filters);
    const { data } = await apiClient.get(`/reports/asset-age-analysis?${params}`);
    return data;
  },

  async generateAssetWarrantyReport(filters?: any): Promise<AssetWarrantyReport> {
    const params = new URLSearchParams(filters);
    const { data } = await apiClient.get(`/reports/asset-warranty?${params}`);
    return data;
  },

  async generateTaskCompletionReport(filters?: any): Promise<TaskCompletionReport> {
    const params = new URLSearchParams(filters);
    const { data } = await apiClient.get(`/reports/task-completion?${params}`);
    return data;
  },

  async generateUserWorkloadReport(filters?: any): Promise<UserWorkloadReport> {
    const params = new URLSearchParams(filters);
    const { data } = await apiClient.get(`/reports/user-workload?${params}`);
    return data;
  },

  // Export report in different formats
  async exportReport(reportType: string, format: ReportFormat, filters?: any) {
    const params = new URLSearchParams({ format, ...filters });
    const { data } = await apiClient.get(`/reports/${reportType}?${params}`, {
      responseType: 'blob',
    });
    return data;
  },

  // Scheduled reports
  async getScheduledReports() {
    const { data } = await apiClient.get<ScheduledReport[]>('/reports/scheduled');
    return data;
  },

  async createScheduledReport(report: Omit<ScheduledReport, 'id' | 'createdAt' | 'updatedAt'>) {
    const { data } = await apiClient.post<ScheduledReport>('/reports/scheduled', report);
    return data;
  },

  async updateScheduledReport(id: string, report: Partial<ScheduledReport>) {
    const { data } = await apiClient.patch<ScheduledReport>(`/reports/scheduled/${id}`, report);
    return data;
  },

  async deleteScheduledReport(id: string) {
    await apiClient.delete(`/reports/scheduled/${id}`);
  },

  // Report history
  async getReportHistory() {
    const { data } = await apiClient.get<ReportHistory[]>('/reports/history');
    return data;
  },
};