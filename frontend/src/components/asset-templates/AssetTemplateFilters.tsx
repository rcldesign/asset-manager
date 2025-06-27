'use client';

import React from 'react';
import {
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Paper,
  Stack,
  Button,
} from '@mui/material';
import { Clear as ClearIcon } from '@mui/icons-material';
import { AssetCategory } from '@/types';
import { AssetTemplateFilters as FiltersType } from '@/api/asset-template-api';

interface AssetTemplateFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: Partial<FiltersType>) => void;
}

export function AssetTemplateFilters({
  filters,
  onFiltersChange,
}: AssetTemplateFiltersProps) {
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ search: event.target.value || undefined });
  };

  const handleCategoryChange = (event: { target: { value: string } }) => {
    const value = event.target.value;
    onFiltersChange({ category: value ? value as AssetCategory : undefined });
  };

  const handleIncludeInactiveChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ includeInactive: event.target.checked });
  };

  const handleCustomFieldSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ customFieldSearch: event.target.value || undefined });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      search: undefined,
      category: undefined,
      includeInactive: false,
      customFieldSearch: undefined,
      hasCustomField: undefined,
    });
  };

  const hasActiveFilters = !!(
    filters.search ||
    filters.category ||
    filters.includeInactive ||
    filters.customFieldSearch ||
    filters.hasCustomField
  );

  return (
    <Paper elevation={0} sx={{ p: 2, m: 2, mt: 0, bgcolor: 'grey.50' }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            label="Search templates"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder="Search by name or description..."
            size="small"
            sx={{ minWidth: 250 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={filters.category || ''}
              onChange={handleCategoryChange}
              label="Category"
            >
              <MenuItem value="">
                <em>All Categories</em>
              </MenuItem>
              {Object.values(AssetCategory).map((category) => (
                <MenuItem key={category} value={category}>
                  {category}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Custom field search"
            value={filters.customFieldSearch || ''}
            onChange={handleCustomFieldSearchChange}
            placeholder="Search in custom fields..."
            size="small"
            sx={{ minWidth: 200 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={filters.includeInactive || false}
                onChange={handleIncludeInactiveChange}
                size="small"
              />
            }
            label="Include inactive"
          />

          {hasActiveFilters && (
            <Button
              variant="outlined"
              startIcon={<ClearIcon />}
              onClick={handleClearFilters}
              size="small"
            >
              Clear
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}