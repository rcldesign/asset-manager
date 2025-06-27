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
import { ScheduleType } from '@/types';
import { ScheduleFilters as FiltersType } from '@/api/schedule-api';

interface ScheduleFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: Partial<FiltersType>) => void;
}

export function ScheduleFilters({
  filters,
  onFiltersChange,
}: ScheduleFiltersProps) {
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ search: event.target.value || undefined });
  };

  const handleScheduleTypeChange = (event: { target: { value: string } }) => {
    const value = event.target.value;
    onFiltersChange({ scheduleType: value ? value as ScheduleType : undefined });
  };

  const handleIsActiveChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ isActive: event.target.checked ? true : undefined });
  };

  const handleStartDateFromChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ startDateFrom: event.target.value || undefined });
  };

  const handleStartDateToChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ startDateTo: event.target.value || undefined });
  };

  const handleClearFilters = () => {
    onFiltersChange({
      search: undefined,
      scheduleType: undefined,
      isActive: undefined,
      startDateFrom: undefined,
      startDateTo: undefined,
      assetId: undefined,
    });
  };

  const hasActiveFilters = !!(
    filters.search ||
    filters.scheduleType ||
    filters.isActive !== undefined ||
    filters.startDateFrom ||
    filters.startDateTo ||
    filters.assetId
  );

  return (
    <Paper elevation={0} sx={{ p: 2, m: 2, mt: 0, bgcolor: 'grey.50' }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            label="Search schedules"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder="Search by name or description..."
            size="small"
            sx={{ minWidth: 250 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Schedule Type</InputLabel>
            <Select
              value={filters.scheduleType || ''}
              onChange={handleScheduleTypeChange}
              label="Schedule Type"
            >
              <MenuItem value="">
                <em>All Types</em>
              </MenuItem>
              <MenuItem value={ScheduleType.ONE_OFF}>One-off</MenuItem>
              <MenuItem value={ScheduleType.FIXED_INTERVAL}>Fixed Interval</MenuItem>
              <MenuItem value={ScheduleType.CUSTOM}>Custom</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Start Date From"
            type="date"
            value={filters.startDateFrom || ''}
            onChange={handleStartDateFromChange}
            size="small"
            sx={{ minWidth: 150 }}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="Start Date To"
            type="date"
            value={filters.startDateTo || ''}
            onChange={handleStartDateToChange}
            size="small"
            sx={{ minWidth: 150 }}
            InputLabelProps={{ shrink: true }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={filters.isActive === true}
                onChange={handleIsActiveChange}
                size="small"
              />
            }
            label="Active only"
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