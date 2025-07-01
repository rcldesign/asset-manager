'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  ButtonGroup,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Divider,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  FileDownload as DownloadIcon,
  Print as PrintIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useRouter, useParams } from 'next/navigation';
import { useGenerateReport, useExportReport } from '@/hooks/use-reports';
import { ReportFormat } from '@/types/reports';
import { ReportTable } from '@/components/Reports/ReportTable';
import { ReportChart } from '@/components/Reports/ReportChart';
import { format } from 'date-fns';

// Mock report configuration for demonstration
const reportConfigs: Record<string, any> = {
  'asset-age-analysis': {
    name: 'Asset Age Analysis',
    description: 'Analysis of asset ages and depreciation',
    hasCharts: true,
    chartType: 'bar',
  },
  'asset-warranty': {
    name: 'Asset Warranty Report',
    description: 'Warranty status and expiration tracking',
    hasCharts: true,
    chartType: 'pie',
  },
  'task-completion': {
    name: 'Task Completion Report',
    description: 'Task completion rates and performance metrics',
    hasCharts: true,
    chartType: 'line',
  },
  'user-workload': {
    name: 'User Workload Report',
    description: 'Workload distribution across team members',
    hasCharts: true,
    chartType: 'bar',
  },
};

export default function ReportViewerPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.reportId as string;
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [reportData, setReportData] = useState<any>(null);
  
  const generateReportMutation = useGenerateReport();
  const exportReportMutation = useExportReport();
  
  const reportConfig = reportConfigs[reportId] || {
    name: 'Custom Report',
    description: 'Generated report',
    hasCharts: false,
  };

  useEffect(() => {
    // Generate report on mount
    generateReportMutation.mutate(
      { reportId, options: { format: ReportFormat.JSON } },
      {
        onSuccess: (data) => {
          setReportData(data);
        },
      }
    );
  }, [reportId]);

  const handleExport = (format: ReportFormat) => {
    exportReportMutation.mutate({ reportType: reportId, format });
    setAnchorEl(null);
  };

  const handlePrint = () => {
    window.print();
    setAnchorEl(null);
  };

  const handleRefresh = () => {
    generateReportMutation.mutate(
      { reportId, options: { format: ReportFormat.JSON } },
      {
        onSuccess: (data) => {
          setReportData(data);
        },
      }
    );
  };

  const isLoading = generateReportMutation.isPending;
  const error = generateReportMutation.error;

  if (isLoading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Box sx={{ mt: 4 }}>
          <Alert severity="error">Failed to generate report. Please try again.</Alert>
          <Button sx={{ mt: 2 }} onClick={() => router.back()}>
            Go Back
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" className="print-container">
      <Box sx={{ mb: 4, '@media print': { display: 'none' } }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
          sx={{ mb: 2 }}
        >
          Back to Reports
        </Button>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              {reportConfig.name}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {reportConfig.description}
            </Typography>
          </Box>
          
          <Box>
            <ButtonGroup variant="outlined" sx={{ mr: 2 }}>
              <Button startIcon={<DownloadIcon />} onClick={() => handleExport(ReportFormat.PDF)}>
                PDF
              </Button>
              <Button onClick={() => handleExport(ReportFormat.CSV)}>
                CSV
              </Button>
              <Button onClick={() => handleExport(ReportFormat.EXCEL)}>
                Excel
              </Button>
            </ButtonGroup>
            
            <IconButton onClick={handleRefresh} sx={{ mr: 1 }}>
              <RefreshIcon />
            </IconButton>
            
            <IconButton onClick={handlePrint} sx={{ mr: 1 }}>
              <PrintIcon />
            </IconButton>
            
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <MoreVertIcon />
            </IconButton>
            
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
            >
              <MenuItem onClick={() => router.push(`/reports/scheduled/new?reportId=${reportId}`)}>
                Schedule This Report
              </MenuItem>
              <MenuItem onClick={() => router.push(`/reports/builder?template=${reportId}`)}>
                Customize Report
              </MenuItem>
            </Menu>
          </Box>
        </Box>
      </Box>

      {reportData && (
        <>
          {/* Report Metadata */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">
                  Generated At
                </Typography>
                <Typography variant="body2">
                  {format(new Date(reportData.metadata?.generatedAt || new Date()), 'PPp')}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">
                  Total Records
                </Typography>
                <Typography variant="body2">
                  {reportData.metadata?.rowCount || reportData.data?.length || 0}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">
                  Report Period
                </Typography>
                <Typography variant="body2">
                  Last 30 days
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Summary Section */}
          {reportData.summary && (
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {Object.entries(reportData.summary).map(([key, value]: [string, any]) => (
                <Grid item xs={12} sm={6} md={3} key={key}>
                  <Card>
                    <CardContent>
                      <Typography variant="caption" color="text.secondary" gutterBottom>
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Typography>
                      <Typography variant="h5">
                        {typeof value === 'number' ? value.toLocaleString() : value}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Charts Section */}
          {reportConfig.hasCharts && reportData.chartData && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Visual Analysis
              </Typography>
              <ReportChart
                type={reportConfig.chartType}
                data={reportData.chartData}
                height={400}
              />
            </Paper>
          )}

          <Divider sx={{ my: 3 }} />

          {/* Data Table */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Detailed Data
            </Typography>
            <ReportTable
              data={reportData.data || []}
              columns={reportData.columns || []}
            />
          </Paper>
        </>
      )}

      <style jsx global>{`
        @media print {
          .print-container {
            margin: 0;
            padding: 20px;
          }
          
          .MuiPaper-root {
            box-shadow: none !important;
            border: 1px solid #e0e0e0;
          }
          
          .MuiButton-root,
          .MuiIconButton-root,
          .MuiButtonGroup-root {
            display: none !important;
          }
        }
      `}</style>
    </Container>
  );
}