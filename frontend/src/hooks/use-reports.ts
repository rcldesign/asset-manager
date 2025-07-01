import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportsApi, ScheduledReport } from '@/api/reports-api';
import { ReportFormat } from '@/types/reports';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'react-hot-toast';

export function useReportTemplates() {
  return useQuery({
    queryKey: queryKeys.reports.templates(),
    queryFn: reportsApi.getTemplates,
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: ({ reportId, options }: { reportId: string; options?: any }) =>
      reportsApi.generateReport(reportId, options),
    onSuccess: (data, variables) => {
      if (variables.options?.format && variables.options.format !== 'json') {
        // Handle file download
        const blob = new Blob([data]);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${new Date().toISOString()}.${variables.options.format}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Report downloaded successfully');
      } else {
        toast.success('Report generated successfully');
      }
    },
    onError: () => {
      toast.error('Failed to generate report');
    },
  });
}

export function useAssetAgeAnalysis(filters?: any) {
  return useQuery({
    queryKey: queryKeys.reports.assetAge(filters),
    queryFn: () => reportsApi.generateAssetAgeAnalysis(filters),
    enabled: !!filters,
  });
}

export function useAssetWarrantyReport(filters?: any) {
  return useQuery({
    queryKey: queryKeys.reports.assetWarranty(filters),
    queryFn: () => reportsApi.generateAssetWarrantyReport(filters),
    enabled: !!filters,
  });
}

export function useTaskCompletionReport(filters?: any) {
  return useQuery({
    queryKey: queryKeys.reports.taskCompletion(filters),
    queryFn: () => reportsApi.generateTaskCompletionReport(filters),
    enabled: !!filters,
  });
}

export function useUserWorkloadReport(filters?: any) {
  return useQuery({
    queryKey: queryKeys.reports.userWorkload(filters),
    queryFn: () => reportsApi.generateUserWorkloadReport(filters),
    enabled: !!filters,
  });
}

export function useExportReport() {
  return useMutation({
    mutationFn: ({ reportType, format, filters }: { reportType: string; format: ReportFormat; filters?: any }) =>
      reportsApi.exportReport(reportType, format, filters),
    onSuccess: (data, variables) => {
      // Handle file download
      const blob = new Blob([data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${variables.reportType}-${new Date().toISOString()}.${variables.format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Report exported successfully');
    },
    onError: () => {
      toast.error('Failed to export report');
    },
  });
}

export function useScheduledReports() {
  return useQuery({
    queryKey: queryKeys.reports.scheduled(),
    queryFn: reportsApi.getScheduledReports,
  });
}

export function useCreateScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (report: Omit<ScheduledReport, 'id' | 'createdAt' | 'updatedAt'>) =>
      reportsApi.createScheduledReport(report),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.scheduled() });
      toast.success('Scheduled report created successfully');
    },
    onError: () => {
      toast.error('Failed to create scheduled report');
    },
  });
}

export function useUpdateScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, report }: { id: string; report: Partial<ScheduledReport> }) =>
      reportsApi.updateScheduledReport(id, report),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.scheduled() });
      toast.success('Scheduled report updated successfully');
    },
    onError: () => {
      toast.error('Failed to update scheduled report');
    },
  });
}

export function useDeleteScheduledReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteScheduledReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.scheduled() });
      toast.success('Scheduled report deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete scheduled report');
    },
  });
}

export function useReportHistory() {
  return useQuery({
    queryKey: queryKeys.reports.history(),
    queryFn: reportsApi.getReportHistory,
  });
}