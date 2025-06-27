'use client';

import React, { useEffect, useState } from 'react';
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
  FormHelperText,
  Box,
  Typography,
  FormControlLabel,
  Switch,
  Tabs,
  Tab,
  Paper,
  Alert,
  Chip,
} from '@mui/material';
import {
  Info as InfoIcon,
  Schedule as ScheduleIcon,
  Task as TaskIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Schedule, ScheduleType, TaskPriority } from '@/types';
import { useCreateSchedule, useUpdateSchedule, usePreviewOccurrences } from '@/hooks/use-schedules';
import { useAssets } from '@/hooks/use-assets';

const scheduleFormSchema = z.object({
  name: z.string().min(1, 'Schedule name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  scheduleType: z.nativeEnum(ScheduleType, { required_error: 'Schedule type is required' }),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  recurrenceRule: z.string().optional(),
  intervalDays: z.number().int().min(1).optional(),
  isActive: z.boolean(),
  assetId: z.string().optional(),
  taskTitle: z.string().min(1, 'Task title is required'),
  taskDescription: z.string().optional(),
  taskPriority: z.nativeEnum(TaskPriority),
  estimatedDuration: z.number().int().min(1).optional(),
  estimatedCost: z.number().min(0).optional(),
});

type ScheduleFormData = z.infer<typeof scheduleFormSchema>;

interface ScheduleFormDialogProps {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule;
}

export function ScheduleFormDialog({
  open,
  onClose,
  schedule,
}: ScheduleFormDialogProps) {
  const isEditing = Boolean(schedule);
  const [activeTab, setActiveTab] = useState(0);
  const createScheduleMutation = useCreateSchedule();
  const updateScheduleMutation = useUpdateSchedule();
  const { data: assets } = useAssets();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      scheduleType: ScheduleType.ONE_OFF,
      startDate: '',
      endDate: '',
      recurrenceRule: '',
      intervalDays: 1,
      isActive: true,
      assetId: '',
      taskTitle: '',
      taskDescription: '',
      taskPriority: TaskPriority.MEDIUM,
      estimatedDuration: undefined,
      estimatedCost: undefined,
    },
  });

  const watchedValues = watch();

  // Preview occurrences
  const { data: previewData } = usePreviewOccurrences({
    scheduleType: watchedValues.scheduleType,
    startDate: watchedValues.startDate,
    endDate: watchedValues.endDate || undefined,
    recurrenceRule: watchedValues.recurrenceRule || undefined,
    intervalDays: watchedValues.intervalDays || undefined,
    count: 5,
  });

  // Reset form when dialog opens/closes or schedule changes
  useEffect(() => {
    if (open) {
      if (isEditing && schedule) {
        const taskTemplate = schedule.taskTemplate as Record<string, unknown>;
        reset({
          name: schedule.name,
          description: schedule.description || '',
          scheduleType: schedule.scheduleType,
          startDate: schedule.startDate.split('T')[0],
          endDate: schedule.endDate?.split('T')[0] || '',
          recurrenceRule: schedule.recurrenceRule || '',
          intervalDays: schedule.intervalDays || 1,
          isActive: schedule.isActive,
          assetId: schedule.assetId || '',
          taskTitle: (taskTemplate?.title ?? '') as string,
          taskDescription: (taskTemplate?.description ?? '') as string,
          taskPriority: (taskTemplate?.priority ?? TaskPriority.MEDIUM) as TaskPriority,
          estimatedDuration: (taskTemplate?.estimatedDuration ?? undefined) as number | undefined,
          estimatedCost: (taskTemplate?.estimatedCost ?? undefined) as number | undefined,
        });
      } else {
        reset({
          name: '',
          description: '',
          scheduleType: ScheduleType.ONE_OFF,
          startDate: new Date().toISOString().split('T')[0],
          endDate: '',
          recurrenceRule: '',
          intervalDays: 1,
          isActive: true,
          assetId: '',
          taskTitle: '',
          taskDescription: '',
          taskPriority: TaskPriority.MEDIUM,
          estimatedDuration: undefined,
          estimatedCost: undefined,
        });
      }
    }
  }, [open, isEditing, schedule, reset]);

  const onSubmit = async (data: ScheduleFormData) => {
    try {
      const taskTemplate = {
        title: data.taskTitle,
        description: data.taskDescription || undefined,
        priority: data.taskPriority,
        estimatedDuration: data.estimatedDuration || undefined,
        estimatedCost: data.estimatedCost || undefined,
      };

      const scheduleData = {
        name: data.name,
        description: data.description || undefined,
        scheduleType: data.scheduleType,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
        recurrenceRule: data.recurrenceRule || undefined,
        intervalDays: data.intervalDays || undefined,
        isActive: data.isActive,
        assetId: data.assetId || undefined,
        taskTemplate,
      };

      if (isEditing && schedule) {
        await updateScheduleMutation.mutateAsync({
          id: schedule.id,
          data: scheduleData,
        });
      } else {
        await createScheduleMutation.mutateAsync(scheduleData);
      }
      onClose();
    } catch (error) {
      console.error('Failed to save schedule:', error);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const renderScheduleTypeFields = () => {
    switch (watchedValues.scheduleType) {
      case ScheduleType.ONE_OFF:
        return null;

      case ScheduleType.FIXED_INTERVAL:
        return (
          <Controller
            name="intervalDays"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Interval (Days)"
                type="number"
                value={field.value || ''}
                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                error={!!errors.intervalDays}
                helperText={errors.intervalDays?.message || 'Number of days between occurrences'}
                fullWidth
                inputProps={{ min: 1 }}
              />
            )}
          />
        );

      case ScheduleType.CUSTOM:
        return (
          <Controller
            name="recurrenceRule"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Recurrence Rule (RRULE)"
                error={!!errors.recurrenceRule}
                helperText={errors.recurrenceRule?.message || 'RFC 2445 RRULE format (e.g., FREQ=WEEKLY;BYDAY=MO,WE,FR)'}
                placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                fullWidth
                multiline
                rows={2}
              />
            )}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {isEditing ? 'Edit Schedule' : 'Create Schedule'}
        </DialogTitle>
        
        <DialogContent>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Schedule Details" icon={<ScheduleIcon />} iconPosition="start" />
            <Tab label="Task Template" icon={<TaskIcon />} iconPosition="start" />
          </Tabs>

          {activeTab === 0 && (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Schedule Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    required
                    autoFocus
                    fullWidth
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
                    multiline
                    rows={2}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                    fullWidth
                  />
                )}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="scheduleType"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.scheduleType}>
                      <InputLabel>Schedule Type</InputLabel>
                      <Select
                        {...field}
                        label="Schedule Type"
                      >
                        <MenuItem value={ScheduleType.ONE_OFF}>One-off</MenuItem>
                        <MenuItem value={ScheduleType.FIXED_INTERVAL}>Fixed Interval</MenuItem>
                        <MenuItem value={ScheduleType.CUSTOM}>Custom (RRULE)</MenuItem>
                      </Select>
                      {errors.scheduleType && (
                        <FormHelperText>{errors.scheduleType.message}</FormHelperText>
                      )}
                    </FormControl>
                  )}
                />

                <Controller
                  name="assetId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Asset (Optional)</InputLabel>
                      <Select
                        {...field}
                        label="Asset (Optional)"
                        value={field.value || ''}
                      >
                        <MenuItem value="">
                          <em>No Asset</em>
                        </MenuItem>
                        {assets?.data?.map((asset) => (
                          <MenuItem key={asset.id} value={asset.id}>
                            {asset.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="startDate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Start Date"
                      type="date"
                      error={!!errors.startDate}
                      helperText={errors.startDate?.message}
                      required
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />

                <Controller
                  name="endDate"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="End Date (Optional)"
                      type="date"
                      error={!!errors.endDate}
                      helperText={errors.endDate?.message}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  )}
                />
              </Box>

              {renderScheduleTypeFields()}

              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.value}
                        onChange={field.onChange}
                      />
                    }
                    label="Active Schedule"
                  />
                )}
              />

              {/* Preview Section */}
              {previewData && previewData.occurrences.length > 0 && (
                <Paper sx={{ p: 2, bgcolor: 'info.light' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Next {previewData.occurrences.length} Occurrences:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {previewData.occurrences.map((occurrence, index) => (
                      <Chip
                        key={index}
                        label={new Date(occurrence).toLocaleDateString()}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                    {previewData.hasMore && (
                      <Chip label="..." size="small" variant="outlined" />
                    )}
                  </Box>
                </Paper>
              )}
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="info" icon={<InfoIcon />}>
                <Typography variant="body2">
                  Define the task template that will be used to create tasks from this schedule.
                  Each generated task will use these settings as defaults.
                </Typography>
              </Alert>

              <Controller
                name="taskTitle"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Task Title"
                    error={!!errors.taskTitle}
                    helperText={errors.taskTitle?.message}
                    required
                    fullWidth
                  />
                )}
              />

              <Controller
                name="taskDescription"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Task Description"
                    multiline
                    rows={3}
                    error={!!errors.taskDescription}
                    helperText={errors.taskDescription?.message}
                    fullWidth
                  />
                )}
              />

              <Controller
                name="taskPriority"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Priority</InputLabel>
                    <Select
                      {...field}
                      label="Priority"
                    >
                      <MenuItem value={TaskPriority.LOW}>Low</MenuItem>
                      <MenuItem value={TaskPriority.MEDIUM}>Medium</MenuItem>
                      <MenuItem value={TaskPriority.HIGH}>High</MenuItem>
                      <MenuItem value={TaskPriority.URGENT}>Urgent</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="estimatedDuration"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Estimated Duration (minutes)"
                      type="number"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                      error={!!errors.estimatedDuration}
                      helperText={errors.estimatedDuration?.message}
                      fullWidth
                      inputProps={{ min: 1 }}
                    />
                  )}
                />

                <Controller
                  name="estimatedCost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Estimated Cost"
                      type="number"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                      error={!!errors.estimatedCost}
                      helperText={errors.estimatedCost?.message}
                      fullWidth
                      inputProps={{ min: 0, step: 0.01 }}
                    />
                  )}
                />
              </Box>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}