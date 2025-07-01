'use client';

import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  FormControlLabel,
  Switch,
  Alert,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Schedule as ScheduleIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useScheduledReports, useCreateScheduledReport, useDeleteScheduledReport } from '@/hooks/use-reports';
import { ReportFormat } from '@/types/reports';
import { format } from 'date-fns';

const reportTypes = [
  { value: 'asset-age-analysis', label: 'Asset Age Analysis' },
  { value: 'asset-warranty', label: 'Asset Warranty Report' },
  { value: 'asset-maintenance', label: 'Asset Maintenance History' },
  { value: 'task-completion', label: 'Task Completion Report' },
  { value: 'task-cost', label: 'Task Cost Analysis' },
  { value: 'user-workload', label: 'User Workload Report' },
  { value: 'user-performance', label: 'User Performance Report' },
];

const scheduleOptions = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

export default function ScheduledReportsPage() {
  const router = useRouter();
  const { data: scheduledReports, isLoading } = useScheduledReports();
  const createMutation = useCreateScheduledReport();
  const deleteMutation = useDeleteScheduledReport();
  
  const [openDialog, setOpenDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: '',
    format: ReportFormat.PDF,
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 1, // Monday
      dayOfMonth: 1,
      time: '09:00',
    },
    recipients: [] as string[],
    enabled: true,
  });
  const [recipientEmail, setRecipientEmail] = useState('');

  const handleAddRecipient = () => {
    if (recipientEmail && recipientEmail.includes('@')) {
      setFormData({
        ...formData,
        recipients: [...formData.recipients, recipientEmail],
      });
      setRecipientEmail('');
    }
  };

  const handleRemoveRecipient = (email: string) => {
    setFormData({
      ...formData,
      recipients: formData.recipients.filter((r) => r !== email),
    });
  };

  const handleSubmit = () => {
    createMutation.mutate({
      name: formData.name,
      description: formData.description,
      type: formData.type,
      format: formData.format,
      schedule: formData.schedule,
      recipients: formData.recipients,
      enabled: formData.enabled,
      nextRunAt: new Date().toISOString(), // This would be calculated based on schedule
      customReportId: 'temp-id', // This would come from selected report
    });
    setOpenDialog(false);
    resetForm();
  };

  const handleDelete = () => {
    if (selectedReport) {
      deleteMutation.mutate(selectedReport);
      setDeleteConfirmOpen(false);
      setSelectedReport(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: '',
      format: ReportFormat.PDF,
      schedule: {
        frequency: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: 1,
        time: '09:00',
      },
      recipients: [],
      enabled: true,
    });
    setRecipientEmail('');
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="lg">
        <Box sx={{ mb: 4 }}>
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
                Scheduled Reports
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Automate report generation and delivery
              </Typography>
            </Box>
            
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenDialog(true)}
            >
              Schedule New Report
            </Button>
          </Box>
        </Box>

        {scheduledReports && scheduledReports.length > 0 ? (
          <Grid container spacing={3}>
            {scheduledReports.map((report) => (
              <Grid item xs={12} md={6} key={report.id}>
                <Paper sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {report.name}
                      </Typography>
                      <Chip
                        label={report.enabled ? 'Active' : 'Paused'}
                        color={report.enabled ? 'success' : 'default'}
                        size="small"
                      />
                    </Box>
                    <Box>
                      <IconButton
                        size="small"
                        onClick={() => router.push(`/reports/scheduled/${report.id}/edit`)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setSelectedReport(report.id);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {report.description}
                  </Typography>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Report Type
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      {report.type} • {report.format.toUpperCase()}
                    </Typography>
                    
                    <Typography variant="caption" color="text.secondary">
                      Schedule
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <ScheduleIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      {report.schedule.frequency}
                    </Typography>
                    
                    <Typography variant="caption" color="text.secondary">
                      Recipients
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <EmailIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                      {report.recipients.length} recipient{report.recipients.length !== 1 ? 's' : ''}
                    </Typography>
                    
                    <Typography variant="caption" color="text.secondary">
                      Next Run
                    </Typography>
                    <Typography variant="body2">
                      {format(new Date(report.nextRunAt), 'PPp')}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Alert severity="info">
            No scheduled reports yet. Click the button above to schedule your first automated report.
          </Alert>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
          <DialogTitle>Schedule New Report</DialogTitle>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Report Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  multiline
                  rows={2}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required>
                  <InputLabel>Report Type</InputLabel>
                  <Select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    {reportTypes.map((type) => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Format</InputLabel>
                  <Select
                    value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as ReportFormat })}
                  >
                    <MenuItem value={ReportFormat.PDF}>PDF</MenuItem>
                    <MenuItem value={ReportFormat.EXCEL}>Excel</MenuItem>
                    <MenuItem value={ReportFormat.CSV}>CSV</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Frequency</InputLabel>
                  <Select
                    value={formData.schedule.frequency}
                    onChange={(e) => setFormData({
                      ...formData,
                      schedule: { ...formData.schedule, frequency: e.target.value }
                    })}
                  >
                    {scheduleOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Time"
                  type="time"
                  value={formData.schedule.time}
                  onChange={(e) => setFormData({
                    ...formData,
                    schedule: { ...formData.schedule, time: e.target.value }
                  })}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Recipients
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField
                    fullWidth
                    placeholder="Enter email address"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecipient();
                      }
                    }}
                  />
                  <Button onClick={handleAddRecipient}>Add</Button>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {formData.recipients.map((email) => (
                    <Chip
                      key={email}
                      label={email}
                      onDelete={() => handleRemoveRecipient(email)}
                    />
                  ))}
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    />
                  }
                  label="Enable report immediately"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!formData.name || !formData.type || formData.recipients.length === 0}
            >
              Schedule Report
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
          <DialogTitle>Delete Scheduled Report?</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete this scheduled report? This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </LocalizationProvider>
  );
}