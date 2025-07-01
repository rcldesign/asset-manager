import React, { useState } from 'react';
import {
  Box,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Button,
  Paper,
  Typography,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

interface Filter {
  field: string;
  operator: string;
  value: any;
}

interface FilterBuilderProps {
  entity: string;
  filters: Filter[];
  onFiltersChange: (filters: Filter[]) => void;
}

// Mock field definitions - in a real app, these would come from the API
const fieldsByEntity: Record<string, Array<{ field: string; label: string; type: string }>> = {
  asset: [
    { field: 'name', label: 'Name', type: 'string' },
    { field: 'barcode', label: 'Barcode', type: 'string' },
    { field: 'category', label: 'Category', type: 'enum' },
    { field: 'status', label: 'Status', type: 'enum' },
    { field: 'purchasePrice', label: 'Purchase Price', type: 'number' },
    { field: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { field: 'warrantyExpiry', label: 'Warranty Expiry', type: 'date' },
    { field: 'location.name', label: 'Location', type: 'string' },
  ],
  task: [
    { field: 'title', label: 'Title', type: 'string' },
    { field: 'status', label: 'Status', type: 'enum' },
    { field: 'priority', label: 'Priority', type: 'enum' },
    { field: 'dueDate', label: 'Due Date', type: 'date' },
    { field: 'estimatedCost', label: 'Estimated Cost', type: 'number' },
    { field: 'actualCost', label: 'Actual Cost', type: 'number' },
  ],
  user: [
    { field: 'fullName', label: 'Full Name', type: 'string' },
    { field: 'email', label: 'Email', type: 'string' },
    { field: 'role', label: 'Role', type: 'enum' },
    { field: 'isActive', label: 'Active', type: 'boolean' },
  ],
};

const operatorsByType: Record<string, Array<{ value: string; label: string }>> = {
  string: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts_with', label: 'Starts With' },
    { value: 'ends_with', label: 'Ends With' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
    { value: 'between', label: 'Between' },
  ],
  date: [
    { value: 'equals', label: 'On' },
    { value: 'greater_than', label: 'After' },
    { value: 'less_than', label: 'Before' },
    { value: 'between', label: 'Between' },
  ],
  enum: [
    { value: 'equals', label: 'Is' },
    { value: 'not_equals', label: 'Is Not' },
    { value: 'in', label: 'In' },
  ],
  boolean: [
    { value: 'equals', label: 'Is' },
  ],
};

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  entity,
  filters,
  onFiltersChange,
}) => {
  const [newFilter, setNewFilter] = useState<Partial<Filter>>({});
  const fields = fieldsByEntity[entity] || [];

  const handleAddFilter = () => {
    if (newFilter.field && newFilter.operator && newFilter.value !== undefined) {
      onFiltersChange([...filters, newFilter as Filter]);
      setNewFilter({});
    }
  };

  const handleRemoveFilter = (index: number) => {
    const updatedFilters = filters.filter((_, i) => i !== index);
    onFiltersChange(updatedFilters);
  };

  const getFieldType = (fieldName: string) => {
    const field = fields.find((f) => f.field === fieldName);
    return field?.type || 'string';
  };

  const renderValueInput = () => {
    if (!newFilter.field) return null;

    const fieldType = getFieldType(newFilter.field);

    switch (fieldType) {
      case 'date':
        return (
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <DatePicker
              label="Value"
              value={newFilter.value || null}
              onChange={(date) => setNewFilter({ ...newFilter, value: date })}
              renderInput={(params) => <TextField {...params} fullWidth />}
            />
          </LocalizationProvider>
        );

      case 'number':
        return (
          <TextField
            fullWidth
            label="Value"
            type="number"
            value={newFilter.value || ''}
            onChange={(e) => setNewFilter({ ...newFilter, value: parseFloat(e.target.value) || 0 })}
          />
        );

      case 'boolean':
        return (
          <FormControl fullWidth>
            <InputLabel>Value</InputLabel>
            <Select
              value={newFilter.value || ''}
              onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value === 'true' })}
            >
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </Select>
          </FormControl>
        );

      case 'enum':
        // In a real app, these would come from the API
        const options = ['Option 1', 'Option 2', 'Option 3'];
        return (
          <FormControl fullWidth>
            <InputLabel>Value</InputLabel>
            <Select
              value={newFilter.value || ''}
              onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
            >
              {options.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      default:
        return (
          <TextField
            fullWidth
            label="Value"
            value={newFilter.value || ''}
            onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
          />
        );
    }
  };

  return (
    <Box>
      {/* Existing Filters */}
      {filters.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Active Filters
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {filters.map((filter, index) => {
              const field = fields.find((f) => f.field === filter.field);
              return (
                <Chip
                  key={index}
                  label={`${field?.label || filter.field} ${filter.operator} ${filter.value}`}
                  onDelete={() => handleRemoveFilter(index)}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Add New Filter */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Add Filter
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Field</InputLabel>
              <Select
                value={newFilter.field || ''}
                onChange={(e) => setNewFilter({ field: e.target.value, operator: '', value: '' })}
              >
                {fields.map((field) => (
                  <MenuItem key={field.field} value={field.field}>
                    {field.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <FormControl fullWidth disabled={!newFilter.field}>
              <InputLabel>Operator</InputLabel>
              <Select
                value={newFilter.operator || ''}
                onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value })}
              >
                {newFilter.field &&
                  operatorsByType[getFieldType(newFilter.field)]?.map((op) => (
                    <MenuItem key={op.value} value={op.value}>
                      {op.label}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            {renderValueInput()}
          </Grid>
          
          <Grid item xs={12} md={2}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddFilter}
              disabled={!newFilter.field || !newFilter.operator || newFilter.value === undefined}
            >
              Add
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};