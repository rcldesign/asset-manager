'use client';

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Chip,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Alert,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { 
  useCreateAdvancedSchedule, 
  useUpdateAdvancedSchedule 
} from '../../hooks/use-advanced-schedules';
import type { AdvancedSchedule, CreateAdvancedScheduleDto } from '../../api/advanced-schedules-api';

interface AdvancedScheduleFormProps {
  open: boolean;
  onClose: () => void;
  schedule?: AdvancedSchedule;
  assetId?: string;
}

const SEASONS = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdvancedScheduleForm({ 
  open, 
  onClose, 
  schedule, 
  assetId 
}: AdvancedScheduleFormProps) {
  const isEdit = !!schedule;
  const createMutation = useCreateAdvancedSchedule();
  const updateMutation = useUpdateAdvancedSchedule();

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<CreateAdvancedScheduleDto>({
    defaultValues: schedule || {
      name: '',
      description: '',
      assetId: assetId || '',
      frequency: 'SEASONAL',
      config: {
        seasons: [],
        daysOfWeek: [],
        dayOfMonth: undefined,
        usageThreshold: undefined,
        dependencies: [],
        blackoutDates: [],
        businessDaysOnly: false,
      },
      isActive: true,
    },
  });

  const frequency = watch('frequency');
  const [newBlackoutDate, setNewBlackoutDate] = React.useState<Date | null>(null);
  const [newDependency, setNewDependency] = React.useState('');

  const onSubmit = async (data: CreateAdvancedScheduleDto) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: schedule.id, schedule: data });
      } else {
        await createMutation.mutateAsync(data);
      }
      reset();
      onClose();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    }
  };

  const handleAddBlackoutDate = () => {
    if (newBlackoutDate) {
      const currentDates = watch('config.blackoutDates') || [];
      setValue('config.blackoutDates', [...currentDates, newBlackoutDate.toISOString()]);
      setNewBlackoutDate(null);
    }
  };

  const handleRemoveBlackoutDate = (index: number) => {
    const currentDates = watch('config.blackoutDates') || [];
    setValue('config.blackoutDates', currentDates.filter((_, i) => i !== index));
  };

  const handleAddDependency = () => {
    if (newDependency.trim()) {
      const currentDeps = watch('config.dependencies') || [];
      setValue('config.dependencies', [...currentDeps, newDependency.trim()]);
      setNewDependency('');
    }
  };

  const handleRemoveDependency = (index: number) => {
    const currentDeps = watch('config.dependencies') || [];
    setValue('config.dependencies', currentDeps.filter((_, i) => i !== index));
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {isEdit ? 'Edit Advanced Schedule' : 'Create Advanced Schedule'}
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Controller
              name="name"
              control={control}
              rules={{ required: 'Name is required' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Schedule Name"
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Description"
                  fullWidth
                  multiline
                  rows={2}
                />
              )}
            />

            <Controller
              name="frequency"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Frequency Type</InputLabel>
                  <Select {...field} label="Frequency Type">
                    <MenuItem value="SEASONAL">Seasonal</MenuItem>
                    <MenuItem value="MONTHLY">Monthly</MenuItem>
                    <MenuItem value="USAGE_BASED">Usage Based</MenuItem>
                  </Select>
                </FormControl>
              )}
            />

            {/* Seasonal Configuration */}
            {frequency === 'SEASONAL' && (
              <>
                <Typography variant="subtitle2">Select Seasons</Typography>
                <Controller
                  name="config.seasons"
                  control={control}
                  render={({ field }) => (
                    <ToggleButtonGroup
                      {...field}
                      value={field.value || []}
                      onChange={(_, value) => field.onChange(value)}
                      aria-label="seasons"
                    >
                      {SEASONS.map((season) => (
                        <ToggleButton key={season} value={season}>
                          {season}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  )}
                />

                <Typography variant="subtitle2">Select Days of Week</Typography>
                <Controller
                  name="config.daysOfWeek"
                  control={control}
                  render={({ field }) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {DAYS_OF_WEEK.map((day, index) => (
                        <FormControlLabel
                          key={day}
                          control={
                            <Checkbox
                              checked={(field.value || []).includes(index)}
                              onChange={(e) => {
                                const current = field.value || [];
                                if (e.target.checked) {
                                  field.onChange([...current, index]);
                                } else {
                                  field.onChange(current.filter(d => d !== index));
                                }
                              }}
                            />
                          }
                          label={day}
                        />
                      ))}
                    </Box>
                  )}
                />
              </>
            )}

            {/* Monthly Configuration */}
            {frequency === 'MONTHLY' && (
              <Controller
                name="config.dayOfMonth"
                control={control}
                rules={{ 
                  required: 'Day of month is required',
                  min: { value: 1, message: 'Must be between 1 and 31' },
                  max: { value: 31, message: 'Must be between 1 and 31' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="Day of Month"
                    fullWidth
                    error={!!errors.config?.dayOfMonth}
                    helperText={errors.config?.dayOfMonth?.message}
                  />
                )}
              />
            )}

            {/* Usage Based Configuration */}
            {frequency === 'USAGE_BASED' && (
              <Controller
                name="config.usageThreshold"
                control={control}
                rules={{ 
                  required: 'Usage threshold is required',
                  min: { value: 1, message: 'Must be greater than 0' }
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="Usage Threshold"
                    fullWidth
                    error={!!errors.config?.usageThreshold}
                    helperText={errors.config?.usageThreshold?.message || 'Task will be created when usage reaches this value'}
                  />
                )}
              />
            )}

            {/* Dependencies */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Dependencies (Other schedules that must complete first)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  value={newDependency}
                  onChange={(e) => setNewDependency(e.target.value)}
                  placeholder="Schedule ID"
                  size="small"
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={handleAddDependency}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(watch('config.dependencies') || []).map((dep, index) => (
                  <Chip
                    key={index}
                    label={dep}
                    onDelete={() => handleRemoveDependency(index)}
                  />
                ))}
              </Box>
            </Box>

            {/* Blackout Dates */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Blackout Dates (Dates when tasks should not be created)
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    value={newBlackoutDate}
                    onChange={setNewBlackoutDate}
                    slotProps={{
                      textField: {
                        size: 'small',
                        fullWidth: true,
                      },
                    }}
                  />
                </LocalizationProvider>
                <Button
                  variant="outlined"
                  onClick={handleAddBlackoutDate}
                  startIcon={<AddIcon />}
                >
                  Add
                </Button>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(watch('config.blackoutDates') || []).map((date, index) => (
                  <Chip
                    key={index}
                    label={new Date(date).toLocaleDateString()}
                    onDelete={() => handleRemoveBlackoutDate(index)}
                  />
                ))}
              </Box>
            </Box>

            {/* Business Days Only */}
            <Controller
              name="config.businessDaysOnly"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value || false}
                      onChange={field.onChange}
                    />
                  }
                  label="Business days only (exclude weekends)"
                />
              )}
            />

            {/* Active Status */}
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  }
                  label="Schedule is active"
                />
              )}
            />

            {(createMutation.isError || updateMutation.isError) && (
              <Alert severity="error">
                Failed to save schedule. Please try again.
              </Alert>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}