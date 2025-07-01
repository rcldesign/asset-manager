'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Stack,
  Autocomplete,
  FormHelperText,
  Paper,
  Typography,
  Alert,
  SelectChangeEvent,
  Divider,
  Grid,
  Card,
  CardMedia,
  CardActions,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TaskPriority, TaskFormData } from '@/types';
import { useCreateTask, useUpdateTask } from '@/hooks/use-tasks';
import { useAssets } from '@/hooks/use-assets';
import { useUsers } from '@/hooks/use-users';
import { CameraCapture } from '@/components/PWA/CameraCapture';

const taskFormSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority),
  assetId: z.string().optional(),
  assignedUserId: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().min(0).optional(),
  notes: z.string().optional(),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (taskId: string) => void;
  task?: {
    id: string;
    title: string;
    description?: string;
    priority: TaskPriority;
    assetId?: string;
    assignedUserId?: string;
    dueDate?: string;
    estimatedHours?: number;
    notes?: string;
  };
  isFullPage?: boolean;
}

const priorityOptions = [
  { value: TaskPriority.LOW, label: 'Low' },
  { value: TaskPriority.MEDIUM, label: 'Medium' },
  { value: TaskPriority.HIGH, label: 'High' },
  { value: TaskPriority.URGENT, label: 'Urgent' },
];

export const TaskFormDialog: React.FC<TaskFormDialogProps> = ({
  open,
  onClose,
  onSuccess,
  task,
  isFullPage = false,
}) => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attachedPhotos, setAttachedPhotos] = useState<Array<{ url: string; blob: Blob; name: string }>>([]);

  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const { data: assets } = useAssets({ limit: 100 });
  const { data: users } = useUsers({ limit: 100 });

  const isEditing = !!task;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: TaskPriority.MEDIUM,
      assetId: '',
      assignedUserId: '',
      dueDate: '',
      estimatedHours: 0,
      notes: '',
    },
  });

  useEffect(() => {
    if (task) {
      reset({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        assetId: task.assetId || '',
        assignedUserId: task.assignedUserId || '',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        estimatedHours: task.estimatedHours || 0,
        notes: task.notes || '',
      });
    } else {
      reset({
        title: '',
        description: '',
        priority: TaskPriority.MEDIUM,
        assetId: '',
        assignedUserId: '',
        dueDate: '',
        estimatedHours: 0,
        notes: '',
      });
    }
  }, [task, reset]);

  const handlePhotoCapture = (imageBlob: Blob, imageUrl: string) => {
    const timestamp = new Date().toISOString();
    const fileName = `task-photo-${timestamp}.jpg`;
    
    setAttachedPhotos(prev => [
      ...prev,
      {
        url: imageUrl,
        blob: imageBlob,
        name: fileName,
      }
    ]);
  };

  const handleRemovePhoto = (index: number) => {
    setAttachedPhotos(prev => {
      const updated = [...prev];
      // Clean up object URL to prevent memory leaks
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  };

  const onSubmit = async (data: TaskFormValues) => {
    try {
      setSubmitError(null);
      
      const formData: TaskFormData = {
        title: data.title,
        description: data.description || undefined,
        priority: data.priority,
        assetId: data.assetId || undefined,
        assignedUserId: data.assignedUserId || undefined,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
        estimatedDuration: data.estimatedHours || undefined,
        notes: data.notes || undefined,
        isAutomated: false, // Manual tasks are not automated
        // Include photo attachments for upload handling
        attachments: attachedPhotos.map(photo => ({
          file: photo.blob,
          name: photo.name,
          type: 'image',
        })),
      };

      if (isEditing && task) {
        const updatedTask = await updateTaskMutation.mutateAsync({
          id: task.id,
          data: formData,
        });
        onSuccess?.(updatedTask.id);
      } else {
        const newTask = await createTaskMutation.mutateAsync(formData);
        onSuccess?.(newTask.id);
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving task:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to save task');
    }
  };

  const content = (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <Stack spacing={3}>
        {submitError && (
          <Alert severity="error" onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <Controller
          name="title"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Task Title"
              fullWidth
              required
              error={!!errors.title}
              helperText={errors.title?.message}
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
              rows={3}
              error={!!errors.description}
              helperText={errors.description?.message}
            />
          )}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Controller
            name="priority"
            control={control}
            render={({ field }) => (
              <FormControl fullWidth error={!!errors.priority}>
                <InputLabel>Priority</InputLabel>
                <Select
                  {...field}
                  label="Priority"
                  onChange={(event: SelectChangeEvent) => field.onChange(event.target.value)}
                >
                  {priorityOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {errors.priority && (
                  <FormHelperText>{errors.priority.message}</FormHelperText>
                )}
              </FormControl>
            )}
          />

          <Controller
            name="dueDate"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Due Date"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                error={!!errors.dueDate}
                helperText={errors.dueDate?.message}
              />
            )}
          />
        </Box>

        <Controller
          name="assetId"
          control={control}
          render={({ field: { value, onChange } }) => (
            <Autocomplete
              options={assets?.data || []}
              getOptionLabel={(option) => option.name}
              value={assets?.data.find(a => a.id === value) || null}
              onChange={(_, newValue) => onChange(newValue?.id || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Asset"
                  fullWidth
                  error={!!errors.assetId}
                  helperText={errors.assetId?.message}
                />
              )}
            />
          )}
        />

        <Controller
          name="assignedUserId"
          control={control}
          render={({ field: { value, onChange } }) => (
            <Autocomplete
              options={users?.data || []}
              getOptionLabel={(option) => option.fullName || option.email}
              value={users?.data.find(u => u.id === value) || null}
              onChange={(_, newValue) => onChange(newValue?.id || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assign To"
                  fullWidth
                  error={!!errors.assignedUserId}
                  helperText={errors.assignedUserId?.message}
                />
              )}
            />
          )}
        />

        <Controller
          name="estimatedHours"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextField
              label="Estimated Hours"
              type="number"
              inputProps={{ min: 0, step: 0.5 }}
              value={value || ''}
              onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : 0)}
              fullWidth
              error={!!errors.estimatedHours}
              helperText={errors.estimatedHours?.message}
            />
          )}
        />

        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Notes"
              fullWidth
              multiline
              rows={3}
              error={!!errors.notes}
              helperText={errors.notes?.message}
            />
          )}
        />

        <Divider />

        {/* Photo Attachments */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Photo Attachments
          </Typography>
          
          <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CameraCapture 
                onCapture={handlePhotoCapture}
                buttonText="Take Photo"
                maxSizeMB={5}
              />
              <Typography variant="body2" color="text.secondary">
                Capture photos related to this task
              </Typography>
            </Box>

            {attachedPhotos.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Attached Photos ({attachedPhotos.length})
                </Typography>
                <Grid container spacing={2}>
                  {attachedPhotos.map((photo, index) => (
                    <Grid item xs={6} sm={4} md={3} key={index}>
                      <Card>
                        <CardMedia
                          component="img"
                          height="120"
                          image={photo.url}
                          alt={`Task photo ${index + 1}`}
                          sx={{ objectFit: 'cover' }}
                        />
                        <CardActions sx={{ justifyContent: 'center', p: 1 }}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemovePhoto(index)}
                            aria-label="Remove photo"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}
          </Stack>
        </Box>

        {!isFullPage && (
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Task' : 'Create Task'}
            </Button>
          </Stack>
        )}
      </Stack>

      {isFullPage && (
        <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button onClick={onClose} size="large">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Task' : 'Create Task'}
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );

  if (isFullPage) {
    return (
      <Paper sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h5" gutterBottom>
          {isEditing ? 'Edit Task' : 'Create New Task'}
        </Typography>
        {content}
      </Paper>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {isEditing ? 'Edit Task' : 'Create New Task'}
      </DialogTitle>
      <DialogContent>
        {content}
      </DialogContent>
    </Dialog>
  );
};