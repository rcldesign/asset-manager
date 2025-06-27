import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Collapse,
  Button,
  InputAdornment,
  SelectChangeEvent,
  Autocomplete,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { TaskFilters, TaskStatus, TaskPriority } from '@/types';
import { useDebounce } from '@/hooks/use-debounce';
import { useAssets } from '@/hooks/use-assets';
import { useUsers } from '@/hooks/use-users';

interface TaskFiltersComponentProps {
  filters: TaskFilters;
  onFilterChange: (filters: Partial<TaskFilters>) => void;
}

const statusOptions = [
  { value: TaskStatus.PLANNED, label: 'Planned' },
  { value: TaskStatus.IN_PROGRESS, label: 'In Progress' },
  { value: TaskStatus.DONE, label: 'Done' },
  { value: TaskStatus.CANCELLED, label: 'Cancelled' },
  { value: TaskStatus.SKIPPED, label: 'Skipped' },
];

const priorityOptions = [
  { value: TaskPriority.LOW, label: 'Low' },
  { value: TaskPriority.MEDIUM, label: 'Medium' },
  { value: TaskPriority.HIGH, label: 'High' },
  { value: TaskPriority.URGENT, label: 'Urgent' },
];

const dueDateOptions = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due Today' },
  { value: 'week', label: 'Due This Week' },
  { value: 'month', label: 'Due This Month' },
];

export const TaskFiltersComponent: React.FC<TaskFiltersComponentProps> = ({
  filters,
  onFilterChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState(filters.search || '');
  const debouncedSearch = useDebounce(search, 300);

  const { data: assets } = useAssets({ limit: 100 });
  const { data: users } = useUsers({ limit: 100 });

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, onFilterChange]);

  const handleStatusChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ status: value ? value as TaskStatus : undefined });
  };

  const handlePriorityChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ priority: value ? value as TaskPriority : undefined });
  };

  const handleDueDateChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (value) {
      case 'overdue':
        onFilterChange({ overdue: true, dueBefore: undefined, dueAfter: undefined });
        break;
      case 'today':
        onFilterChange({ 
          overdue: undefined,
          dueAfter: today.toISOString().split('T')[0],
          dueBefore: today.toISOString().split('T')[0]
        });
        break;
      case 'week':
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        onFilterChange({ 
          overdue: undefined,
          dueAfter: today.toISOString().split('T')[0],
          dueBefore: weekEnd.toISOString().split('T')[0]
        });
        break;
      case 'month':
        const monthEnd = new Date(today);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        onFilterChange({ 
          overdue: undefined,
          dueAfter: today.toISOString().split('T')[0],
          dueBefore: monthEnd.toISOString().split('T')[0]
        });
        break;
      default:
        onFilterChange({ overdue: undefined, dueBefore: undefined, dueAfter: undefined });
    }
  };

  const handleAssetChange = (_: unknown, value: { id: string; name: string } | null) => {
    onFilterChange({ assetId: value?.id || undefined });
  };

  const handleUserChange = (_: unknown, value: { id: string; fullName: string } | null) => {
    onFilterChange({ assignedUserId: value?.id || undefined });
  };

  const handleAutomatedChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ isAutomated: value === '' ? undefined : value === 'true' });
  };

  const handleClearFilters = () => {
    setSearch('');
    onFilterChange({
      search: undefined,
      status: undefined,
      priority: undefined,
      assetId: undefined,
      assignedUserId: undefined,
      overdue: undefined,
      dueBefore: undefined,
      dueAfter: undefined,
      isAutomated: undefined,
    });
  };

  const activeFiltersCount = [
    filters.status,
    filters.priority,
    filters.assetId,
    filters.assignedUserId,
    filters.overdue,
    filters.dueBefore,
    filters.dueAfter,
    filters.isAutomated !== undefined,
  ].filter(Boolean).length;

  return (
    <Box>
      <Stack spacing={2}>
        {/* Search and Quick Filters */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1, minWidth: 200, maxWidth: { xs: '100%', md: 400 } }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status || ''}
                onChange={handleStatusChange}
                label="Status"
              >
                <MenuItem value="">All</MenuItem>
                {statusOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Priority</InputLabel>
              <Select
                value={filters.priority || ''}
                onChange={handlePriorityChange}
                label="Priority"
              >
                <MenuItem value="">All</MenuItem>
                {priorityOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Due Date</InputLabel>
              <Select
                value=""
                onChange={handleDueDateChange}
                label="Due Date"
              >
                <MenuItem value="">All</MenuItem>
                {dueDateOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end' }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                size="small"
                variant="outlined"
                startIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                Advanced Filters
                {activeFiltersCount > 0 && (
                  <Chip
                    label={activeFiltersCount}
                    size="small"
                    color="primary"
                    sx={{ ml: 1, height: 20, minWidth: 20 }}
                  />
                )}
              </Button>
              {activeFiltersCount > 0 && (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ClearIcon />}
                  onClick={handleClearFilters}
                >
                  Clear All
                </Button>
              )}
            </Stack>
          </Box>
        </Box>

        {/* Advanced Filters */}
        <Collapse in={showAdvanced}>
          <Box sx={{ pt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ minWidth: 200, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '30%' } }}>
              <Autocomplete
                options={assets?.data || []}
                getOptionLabel={(option) => option.name}
                value={assets?.data.find(a => a.id === filters.assetId) || null}
                onChange={handleAssetChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Asset"
                    size="small"
                    fullWidth
                  />
                )}
              />
            </Box>
            <Box sx={{ minWidth: 200, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '30%' } }}>
              <Autocomplete
                options={users?.data || []}
                getOptionLabel={(option) => option.fullName || option.email}
                value={users?.data.find(u => u.id === filters.assignedUserId) || null}
                onChange={handleUserChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Assigned To"
                    size="small"
                    fullWidth
                  />
                )}
              />
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '30%' } }}>
              <FormControl fullWidth size="small">
                <InputLabel>Task Type</InputLabel>
                <Select
                  value={filters.isAutomated === undefined ? '' : filters.isAutomated.toString()}
                  onChange={handleAutomatedChange}
                  label="Task Type"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Automated</MenuItem>
                  <MenuItem value="false">Manual</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '30%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Due After"
                type="date"
                value={filters.dueAfter || ''}
                onChange={(e) => onFilterChange({ dueAfter: e.target.value || undefined })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '30%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Due Before"
                type="date"
                value={filters.dueBefore || ''}
                onChange={(e) => onFilterChange({ dueBefore: e.target.value || undefined })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          </Box>
        </Collapse>
      </Stack>
    </Box>
  );
};