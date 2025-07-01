'use client';

import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Checkbox,
  FormControlLabel,
  Alert,
  Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { FieldSelector } from '@/components/Reports/FieldSelector';
import { FilterBuilder } from '@/components/Reports/FilterBuilder';
import { CustomReportConfig } from '@/types/reports';

const steps = ['Select Entity', 'Choose Fields', 'Add Filters', 'Configure Display', 'Preview & Save'];

const entities = [
  { value: 'asset', label: 'Assets', icon: '🏢' },
  { value: 'task', label: 'Tasks', icon: '✅' },
  { value: 'user', label: 'Users', icon: '👥' },
  { value: 'location', label: 'Locations', icon: '📍' },
  { value: 'schedule', label: 'Schedules', icon: '📅' },
];

const aggregateFunctions = ['count', 'sum', 'avg', 'min', 'max'];

export default function CustomReportBuilderPage() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState(0);
  const [reportConfig, setReportConfig] = useState<Partial<CustomReportConfig>>({
    name: '',
    description: '',
    entity: undefined,
    fields: [],
    filters: [],
    groupBy: [],
    orderBy: [],
  });

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
    setReportConfig({
      name: '',
      description: '',
      entity: undefined,
      fields: [],
      filters: [],
      groupBy: [],
      orderBy: [],
    });
  };

  const handleSaveReport = () => {
    // TODO: Implement save functionality
    console.log('Saving report:', reportConfig);
    router.push('/reports');
  };

  const handlePreviewReport = () => {
    // TODO: Implement preview functionality
    console.log('Previewing report:', reportConfig);
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select the entity type for your report
            </Typography>
            <Grid container spacing={3} sx={{ mt: 2 }}>
              {entities.map((entity) => (
                <Grid item xs={12} sm={6} md={4} key={entity.value}>
                  <Paper
                    sx={{
                      p: 3,
                      cursor: 'pointer',
                      border: reportConfig.entity === entity.value ? 2 : 1,
                      borderColor: reportConfig.entity === entity.value ? 'primary.main' : 'divider',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                    onClick={() => setReportConfig({ ...reportConfig, entity: entity.value as any })}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h4" sx={{ mr: 2 }}>
                        {entity.icon}
                      </Typography>
                      <Typography variant="h6">{entity.label}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Generate reports based on {entity.label.toLowerCase()} data
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        );

      case 1:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Select fields to include in your report
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              Choose the fields you want to display and optionally apply aggregate functions for numeric fields.
            </Alert>
            <FieldSelector
              entity={reportConfig.entity!}
              selectedFields={reportConfig.fields || []}
              onFieldsChange={(fields) => setReportConfig({ ...reportConfig, fields })}
            />
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Add filters to refine your data
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
              Filters help you focus on specific subsets of data. Leave empty to include all records.
            </Alert>
            <FilterBuilder
              entity={reportConfig.entity!}
              filters={reportConfig.filters || []}
              onFiltersChange={(filters) => setReportConfig({ ...reportConfig, filters })}
            />
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Configure display options
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Report Name"
                  value={reportConfig.name}
                  onChange={(e) => setReportConfig({ ...reportConfig, name: e.target.value })}
                  required
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={reportConfig.description}
                  onChange={(e) => setReportConfig({ ...reportConfig, description: e.target.value })}
                  multiline
                  rows={3}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Group By</InputLabel>
                  <Select
                    multiple
                    value={reportConfig.groupBy || []}
                    onChange={(e) => setReportConfig({ ...reportConfig, groupBy: e.target.value as string[] })}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selected as string[]).map((value) => (
                          <Chip key={value} label={value} size="small" />
                        ))}
                      </Box>
                    )}
                  >
                    {reportConfig.fields?.map((field) => (
                      <MenuItem key={field.field} value={field.field}>
                        {field.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>
                  Sort Order
                </Typography>
                <List>
                  {reportConfig.orderBy?.map((sort, index) => (
                    <ListItem key={index}>
                      <ListItemText
                        primary={sort.field}
                        secondary={sort.direction}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => {
                            const newOrderBy = [...(reportConfig.orderBy || [])];
                            newOrderBy.splice(index, 1);
                            setReportConfig({ ...reportConfig, orderBy: newOrderBy });
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                  <ListItem>
                    <Button
                      startIcon={<AddIcon />}
                      onClick={() => {
                        // TODO: Add sort field dialog
                      }}
                    >
                      Add Sort Field
                    </Button>
                  </ListItem>
                </List>
              </Grid>
            </Grid>
          </Box>
        );

      case 4:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              Review and save your report
            </Typography>
            
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Report Name:</strong> {reportConfig.name || 'Untitled Report'}
              </Typography>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Entity:</strong> {reportConfig.entity}
              </Typography>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Fields:</strong> {reportConfig.fields?.length || 0} selected
              </Typography>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Filters:</strong> {reportConfig.filters?.length || 0} applied
              </Typography>
              {reportConfig.groupBy && reportConfig.groupBy.length > 0 && (
                <Typography variant="subtitle1" gutterBottom>
                  <strong>Group By:</strong> {reportConfig.groupBy.join(', ')}
                </Typography>
              )}
            </Paper>
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<PreviewIcon />}
                onClick={handlePreviewReport}
              >
                Preview Report
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveReport}
                disabled={!reportConfig.name || !reportConfig.entity || reportConfig.fields?.length === 0}
              >
                Save Report
              </Button>
            </Box>
          </Box>
        );

      default:
        return 'Unknown step';
    }
  };

  const isStepValid = () => {
    switch (activeStep) {
      case 0:
        return !!reportConfig.entity;
      case 1:
        return reportConfig.fields && reportConfig.fields.length > 0;
      case 2:
        return true; // Filters are optional
      case 3:
        return !!reportConfig.name;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
          sx={{ mb: 2 }}
        >
          Back to Reports
        </Button>
        
        <Typography variant="h4" component="h1" gutterBottom>
          Custom Report Builder
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Create custom reports tailored to your specific needs
        </Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        <Box sx={{ minHeight: 400 }}>
          {getStepContent(activeStep)}
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            disabled={activeStep === 0}
            onClick={handleBack}
            startIcon={<ArrowBackIcon />}
          >
            Back
          </Button>
          
          {activeStep === steps.length - 1 ? (
            <Button onClick={handleReset}>
              Create Another Report
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleNext}
              endIcon={<ArrowForwardIcon />}
              disabled={!isStepValid()}
            >
              Next
            </Button>
          )}
        </Box>
      </Paper>
    </Container>
  );
}