'use client';

import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  Chip,
  IconButton,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Description as DescriptionIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
  BuildCircle as BuildIcon,
  FileDownload as DownloadIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useReportTemplates, useScheduledReports, useReportHistory, useExportReport } from '@/hooks/use-reports';
import { ReportFormat } from '@/types/reports';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`report-tabpanel-${index}`}
      aria-labelledby={`report-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const standardReports = [
  {
    id: 'asset-age-analysis',
    name: 'Asset Age Analysis',
    description: 'Analyze asset ages, depreciation, and lifecycle management',
    category: 'Assets',
    icon: '📊',
  },
  {
    id: 'asset-warranty',
    name: 'Asset Warranty Report',
    description: 'Track warranty status, expiring warranties, and coverage',
    category: 'Assets',
    icon: '🛡️',
  },
  {
    id: 'asset-maintenance',
    name: 'Asset Maintenance History',
    description: 'Review maintenance records, costs, and schedules',
    category: 'Assets',
    icon: '🔧',
  },
  {
    id: 'task-completion',
    name: 'Task Completion Report',
    description: 'Analyze task completion rates, delays, and trends',
    category: 'Tasks',
    icon: '✅',
  },
  {
    id: 'task-cost',
    name: 'Task Cost Analysis',
    description: 'Compare estimated vs actual costs, identify overruns',
    category: 'Tasks',
    icon: '💰',
  },
  {
    id: 'user-workload',
    name: 'User Workload Report',
    description: 'View workload distribution and team performance',
    category: 'Users',
    icon: '👥',
  },
  {
    id: 'user-performance',
    name: 'User Performance Report',
    description: 'Individual performance metrics and trends',
    category: 'Users',
    icon: '📈',
  },
];

export default function ReportsPage() {
  const router = useRouter();
  const [tabValue, setTabValue] = useState(0);
  const { data: templates, isLoading: templatesLoading } = useReportTemplates();
  const { data: scheduledReports, isLoading: scheduledLoading } = useScheduledReports();
  const { data: reportHistory, isLoading: historyLoading } = useReportHistory();
  const exportReportMutation = useExportReport();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleViewReport = (reportId: string) => {
    router.push(`/reports/${reportId}`);
  };

  const handleExportReport = (reportId: string, format: ReportFormat) => {
    exportReportMutation.mutate({ reportType: reportId, format });
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Assets':
        return 'primary';
      case 'Tasks':
        return 'secondary';
      case 'Users':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Reports
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Generate insights and analytics from your asset management data
        </Typography>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="report tabs">
          <Tab label="Standard Reports" icon={<DescriptionIcon />} iconPosition="start" />
          <Tab label="Custom Reports" icon={<BuildIcon />} iconPosition="start" />
          <Tab label="Scheduled Reports" icon={<ScheduleIcon />} iconPosition="start" />
          <Tab label="Report History" icon={<HistoryIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3}>
          {standardReports.map((report) => (
            <Grid item xs={12} sm={6} md={4} key={report.id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h4" sx={{ mr: 2 }}>
                      {report.icon}
                    </Typography>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="h6" component="h2" gutterBottom>
                        {report.name}
                      </Typography>
                      <Chip
                        label={report.category}
                        size="small"
                        color={getCategoryColor(report.category)}
                      />
                    </Box>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {report.description}
                  </Typography>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<PlayIcon />}
                    onClick={() => handleViewReport(report.id)}
                  >
                    Generate
                  </Button>
                  <IconButton
                    size="small"
                    title="Export as PDF"
                    onClick={() => handleExportReport(report.id, ReportFormat.PDF)}
                  >
                    <DownloadIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <Box sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<BuildIcon />}
            onClick={() => router.push('/reports/builder')}
          >
            Create Custom Report
          </Button>
        </Box>
        {templatesLoading ? (
          <CircularProgress />
        ) : templates && templates.length > 0 ? (
          <Grid container spacing={3}>
            {templates.map((template) => (
              <Grid item xs={12} sm={6} md={4} key={template.name}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {template.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {template.description}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={() => handleViewReport(template.name)}>
                      Generate
                    </Button>
                    <IconButton size="small">
                      <EditIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Alert severity="info">No custom reports created yet. Click the button above to create your first custom report.</Alert>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <Box sx={{ mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<ScheduleIcon />}
            onClick={() => router.push('/reports/scheduled')}
          >
            Schedule New Report
          </Button>
        </Box>
        {scheduledLoading ? (
          <CircularProgress />
        ) : scheduledReports && scheduledReports.length > 0 ? (
          <List>
            {scheduledReports.map((report) => (
              <ListItem key={report.id} divider>
                <ListItemText
                  primary={report.name}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        {report.type} • {report.format.toUpperCase()}
                      </Typography>
                      {' — '}
                      Next run: {format(new Date(report.nextRunAt), 'PPp')}
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <Chip
                    label={report.enabled ? 'Active' : 'Paused'}
                    color={report.enabled ? 'success' : 'default'}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <IconButton edge="end" onClick={() => router.push(`/reports/scheduled/${report.id}/edit`)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton edge="end">
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        ) : (
          <Alert severity="info">No scheduled reports yet. Click the button above to schedule your first report.</Alert>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        {historyLoading ? (
          <CircularProgress />
        ) : reportHistory && reportHistory.length > 0 ? (
          <List>
            {reportHistory.map((report) => (
              <ListItem key={report.id} divider>
                <ListItemText
                  primary={report.type}
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        Generated by {report.generatedBy.fullName}
                      </Typography>
                      {' — '}
                      {format(new Date(report.generatedAt), 'PPp')} • {report.recordCount} records • {report.format.toUpperCase()}
                    </>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton edge="end" title="Download report">
                    <DownloadIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        ) : (
          <Alert severity="info">No reports generated yet. Generate a report from the Standard Reports or Custom Reports tabs.</Alert>
        )}
      </TabPanel>
    </Container>
  );
}