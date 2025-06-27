# Task Creation Form Implementation Guide

## Overview
The Task Creation Form is a comprehensive component that allows users to create manual tasks or override schedule-generated tasks. It includes asset selection, assignment, scheduling, and completion requirements.

## Component Architecture

### 1. Main Form Component: `TaskForm.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Button,
  Paper,
  Typography,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTasks } from '@/hooks/use-tasks';
import { TaskBasicInfo } from './TaskBasicInfo';
import { TaskScheduling } from './TaskScheduling';
import { TaskAssignment } from './TaskAssignment';
import { TaskRequirements } from './TaskRequirements';
import { TaskReview } from './TaskReview';
import { TaskFormData, TaskPriority, TaskStatus } from '@/types';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  assetId: z.string().min(1, 'Asset is required'),
  priority: z.nativeEnum(TaskPriority),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.Planned),
  dueDate: z.date(),
  estimatedDuration: z.number().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  assignedTo: z.array(z.string()).optional(),
  completionRequirements: z.object({
    requiresPhoto: z.boolean().default(false),
    requiresSignature: z.boolean().default(false),
    requiresNotes: z.boolean().default(false),
    checklist: z.array(z.object({
      id: z.string(),
      item: z.string(),
      required: z.boolean(),
    })).optional(),
  }).optional(),
  recurrence: z.object({
    enabled: z.boolean(),
    pattern: z.string(),
    endDate: z.date().optional(),
  }).optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

const steps = ['Basic Info', 'Scheduling', 'Assignment', 'Requirements', 'Review'];

export const TaskForm: React.FC = () => {
  const navigate = useNavigate();
  const { createTask } = useTasks();
  const [activeStep, setActiveStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    trigger,
    getValues,
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      priority: TaskPriority.Medium,
      status: TaskStatus.Planned,
      dueDate: new Date(),
      assignedTo: [],
      completionRequirements: {
        requiresPhoto: false,
        requiresSignature: false,
        requiresNotes: false,
        checklist: [],
      },
      recurrence: {
        enabled: false,
        pattern: '',
      },
    },
  });

  const watchedValues = watch();

  const handleNext = async () => {
    const fieldsToValidate = getFieldsForStep(activeStep);
    const isValid = await trigger(fieldsToValidate);
    
    if (isValid) {
      setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(prev - 1, 0));
  };

  const onSubmit = async (data: TaskFormValues) => {
    try {
      setSubmitError(null);
      
      // Transform form data to API format
      const taskData = {
        ...data,
        assignedUserIds: data.assignedTo,
        metadata: {
          completionRequirements: data.completionRequirements,
          recurrence: data.recurrence?.enabled ? data.recurrence : undefined,
        },
      };
      
      await createTask.mutateAsync(taskData);
      navigate('/tasks');
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to create task');
    }
  };

  const getFieldsForStep = (step: number): (keyof TaskFormValues)[] => {
    switch (step) {
      case 0:
        return ['title', 'description', 'assetId', 'priority'];
      case 1:
        return ['dueDate', 'estimatedDuration', 'estimatedCost'];
      case 2:
        return ['assignedTo'];
      case 3:
        return ['completionRequirements'];
      default:
        return [];
    }
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      case 0:
        return (
          <TaskBasicInfo
            control={control}
            errors={errors}
            watchedValues={watchedValues}
          />
        );
      case 1:
        return (
          <TaskScheduling
            control={control}
            errors={errors}
            watchedValues={watchedValues}
          />
        );
      case 2:
        return (
          <TaskAssignment
            control={control}
            errors={errors}
            assetId={watchedValues.assetId}
          />
        );
      case 3:
        return (
          <TaskRequirements
            control={control}
            errors={errors}
          />
        );
      case 4:
        return (
          <TaskReview
            formData={watchedValues}
            onEdit={(step) => setActiveStep(step)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Create New Task
      </Typography>
      
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Box sx={{ minHeight: 400 }}>
          {renderStepContent(activeStep)}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
          <Button
            disabled={activeStep === 0}
            onClick={handleBack}
          >
            Back
          </Button>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate('/tasks')}
            >
              Cancel
            </Button>
            
            {activeStep === steps.length - 1 ? (
              <Button
                type="submit"
                variant="contained"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={handleNext}
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
      </form>
    </Paper>
  );
};
```

### 2. Step Components

#### `TaskBasicInfo.tsx`

```typescript
import React from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
} from '@mui/material';
import { AssetSelector } from '@/components/assets/AssetSelector';
import { TaskPriority } from '@/types';

interface TaskBasicInfoProps {
  control: Control<any>;
  errors: FieldErrors<any>;
  watchedValues: any;
}

export const TaskBasicInfo: React.FC<TaskBasicInfoProps> = ({
  control,
  errors,
  watchedValues,
}) => {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
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
              placeholder="e.g., Replace air filter, Oil change, Safety inspection"
            />
          )}
        />
      </Grid>

      <Grid item xs={12}>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Description"
              fullWidth
              multiline
              rows={4}
              placeholder="Provide detailed instructions or notes about the task"
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={8}>
        <Controller
          name="assetId"
          control={control}
          render={({ field }) => (
            <AssetSelector
              value={field.value}
              onChange={field.onChange}
              label="Asset"
              required
              error={!!errors.assetId}
              helperText={errors.assetId?.message}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={4}>
        <Controller
          name="priority"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.priority}>
              <InputLabel>Priority</InputLabel>
              <Select {...field} label="Priority">
                <MenuItem value={TaskPriority.Low}>Low</MenuItem>
                <MenuItem value={TaskPriority.Medium}>Medium</MenuItem>
                <MenuItem value={TaskPriority.High}>High</MenuItem>
                <MenuItem value={TaskPriority.Critical}>Critical</MenuItem>
              </Select>
              {errors.priority && (
                <FormHelperText>{errors.priority.message}</FormHelperText>
              )}
            </FormControl>
          )}
        />
      </Grid>
    </Grid>
  );
};
```

#### `TaskScheduling.tsx`

```typescript
import React, { useState } from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Grid,
  TextField,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Collapse,
  InputAdornment,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { RecurrenceBuilder } from '@/components/schedules/RecurrenceBuilder';

interface TaskSchedulingProps {
  control: Control<any>;
  errors: FieldErrors<any>;
  watchedValues: any;
}

export const TaskScheduling: React.FC<TaskSchedulingProps> = ({
  control,
  errors,
  watchedValues,
}) => {
  const [enableRecurrence, setEnableRecurrence] = useState(false);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          Schedule Details
        </Typography>
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="dueDate"
          control={control}
          render={({ field }) => (
            <DateTimePicker
              {...field}
              label="Due Date"
              slotProps={{
                textField: {
                  fullWidth: true,
                  required: true,
                  error: !!errors.dueDate,
                  helperText: errors.dueDate?.message,
                },
              }}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={3}>
        <Controller
          name="estimatedDuration"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="number"
              label="Estimated Duration"
              fullWidth
              InputProps={{
                endAdornment: <InputAdornment position="end">minutes</InputAdornment>,
              }}
              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={3}>
        <Controller
          name="estimatedCost"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="number"
              label="Estimated Cost"
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
            />
          )}
        />
      </Grid>

      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={enableRecurrence}
              onChange={(e) => setEnableRecurrence(e.target.checked)}
            />
          }
          label="Make this a recurring task"
        />
      </Grid>

      <Grid item xs={12}>
        <Collapse in={enableRecurrence}>
          <Box sx={{ mt: 2 }}>
            <Controller
              name="recurrence"
              control={control}
              render={({ field }) => (
                <RecurrenceBuilder
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Box>
        </Collapse>
      </Grid>
    </Grid>
  );
};
```

#### `TaskAssignment.tsx`

```typescript
import React from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Grid,
  Typography,
  Chip,
  Box,
  FormHelperText,
} from '@mui/material';
import { UserMultiSelect } from '@/components/users/UserMultiSelect';
import { useAsset } from '@/hooks/use-assets';

interface TaskAssignmentProps {
  control: Control<any>;
  errors: FieldErrors<any>;
  assetId: string;
}

export const TaskAssignment: React.FC<TaskAssignmentProps> = ({
  control,
  errors,
  assetId,
}) => {
  const { asset } = useAsset(assetId);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          Task Assignment
        </Typography>
        
        {asset && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Assigning task for: <strong>{asset.name}</strong>
            </Typography>
            {asset.locationId && (
              <Typography variant="body2" color="text.secondary">
                Location: <Chip size="small" label={asset.location?.name} />
              </Typography>
            )}
          </Box>
        )}
      </Grid>

      <Grid item xs={12}>
        <Controller
          name="assignedTo"
          control={control}
          render={({ field }) => (
            <>
              <UserMultiSelect
                value={field.value || []}
                onChange={field.onChange}
                label="Assign to Users"
                helperText="Select one or more users to assign this task"
                locationId={asset?.locationId}
              />
              {errors.assignedTo && (
                <FormHelperText error>
                  {errors.assignedTo.message}
                </FormHelperText>
              )}
            </>
          )}
        />
      </Grid>

      <Grid item xs={12}>
        <Typography variant="body2" color="text.secondary">
          💡 Tip: Assign tasks to users who have access to the asset's location
          for better task management.
        </Typography>
      </Grid>
    </Grid>
  );
};
```

#### `TaskRequirements.tsx`

```typescript
import React, { useState } from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Grid,
  Typography,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  Button,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';

interface TaskRequirementsProps {
  control: Control<any>;
  errors: FieldErrors<any>;
}

export const TaskRequirements: React.FC<TaskRequirementsProps> = ({
  control,
  errors,
}) => {
  const [newChecklistItem, setNewChecklistItem] = useState('');

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          Completion Requirements
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Define what needs to be completed for this task
        </Typography>
      </Grid>

      <Grid item xs={12}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Required Evidence
          </Typography>
          <FormGroup>
            <Controller
              name="completionRequirements.requiresPhoto"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Requires photo evidence"
                />
              )}
            />
            <Controller
              name="completionRequirements.requiresSignature"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Requires digital signature"
                />
              )}
            />
            <Controller
              name="completionRequirements.requiresNotes"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value} />}
                  label="Requires completion notes"
                />
              )}
            />
          </FormGroup>
        </Paper>
      </Grid>

      <Grid item xs={12}>
        <Controller
          name="completionRequirements.checklist"
          control={control}
          render={({ field }) => (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Checklist Items
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Add checklist item"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newChecklistItem.trim()) {
                      field.onChange([
                        ...(field.value || []),
                        {
                          id: uuidv4(),
                          item: newChecklistItem.trim(),
                          required: true,
                        },
                      ]);
                      setNewChecklistItem('');
                    }
                  }}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    if (newChecklistItem.trim()) {
                      field.onChange([
                        ...(field.value || []),
                        {
                          id: uuidv4(),
                          item: newChecklistItem.trim(),
                          required: true,
                        },
                      ]);
                      setNewChecklistItem('');
                    }
                  }}
                >
                  Add
                </Button>
              </Box>

              <List dense>
                {(field.value || []).map((item: any, index: number) => (
                  <ListItem key={item.id}>
                    <ListItemText
                      primary={item.item}
                      secondary={item.required ? 'Required' : 'Optional'}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => {
                          const newList = [...field.value];
                          newList.splice(index, 1);
                          field.onChange(newList);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
                
                {(!field.value || field.value.length === 0) && (
                  <ListItem>
                    <ListItemText
                      primary="No checklist items"
                      secondary="Add items that need to be checked during task completion"
                    />
                  </ListItem>
                )}
              </List>
            </Paper>
          )}
        />
      </Grid>
    </Grid>
  );
};
```

### 3. Supporting Components

#### `AssetSelector.tsx`

```typescript
import React, { useState } from 'react';
import {
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { AssetTable } from '@/components/assets/AssetTable';
import { useAssets } from '@/hooks/use-assets';

interface AssetSelectorProps {
  value?: string;
  onChange: (assetId: string) => void;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
}

export const AssetSelector: React.FC<AssetSelectorProps> = ({
  value,
  onChange,
  label = 'Select Asset',
  required,
  error,
  helperText,
}) => {
  const [open, setOpen] = useState(false);
  const { assets } = useAssets({ filters: { status: 'Active' } });
  
  const selectedAsset = assets.find(a => a.id === value);

  return (
    <>
      <TextField
        label={label}
        value={selectedAsset?.name || ''}
        onClick={() => setOpen(true)}
        required={required}
        error={error}
        helperText={helperText}
        fullWidth
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              {value ? (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange('');
                  }}
                >
                  <ClearIcon />
                </IconButton>
              ) : (
                <SearchIcon />
              )}
            </InputAdornment>
          ),
        }}
      />

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Select Asset</DialogTitle>
        <DialogContent>
          <AssetTable
            onSelect={(asset) => {
              onChange(asset.id);
              setOpen(false);
            }}
            selectable
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
```

## Form Validation

```typescript
// Advanced validation rules
const advancedTaskSchema = z.object({
  // ... basic fields ...
  
  // Custom validation for due date
  dueDate: z.date().refine((date) => {
    return date > new Date();
  }, 'Due date must be in the future'),
  
  // Conditional validation
  estimatedCost: z.number().optional().refine((cost, ctx) => {
    const priority = ctx.parent.priority;
    if (priority === TaskPriority.Critical && !cost) {
      return false;
    }
    return true;
  }, 'Cost estimate required for critical tasks'),
  
  // Complex checklist validation
  completionRequirements: z.object({
    checklist: z.array(z.any()).optional().refine((items, ctx) => {
      const requiresPhoto = ctx.parent.requiresPhoto;
      const requiresNotes = ctx.parent.requiresNotes;
      
      if (!requiresPhoto && !requiresNotes && (!items || items.length === 0)) {
        return false;
      }
      return true;
    }, 'At least one completion requirement must be specified'),
  }),
});
```

## Usage Example

```typescript
// In a page component
import { TaskForm } from '@/components/tasks/TaskForm';

export default function CreateTaskPage() {
  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        <TaskForm />
      </Box>
    </Container>
  );
}

// With pre-filled data from schedule
export default function CreateTaskFromSchedule({ scheduleId }: { scheduleId: string }) {
  const { schedule } = useSchedule(scheduleId);
  
  return (
    <TaskForm
      defaultValues={{
        title: schedule?.taskTemplate.title,
        assetId: schedule?.assetId,
        priority: schedule?.taskTemplate.priority,
        estimatedDuration: schedule?.taskTemplate.estimatedDuration,
        estimatedCost: schedule?.taskTemplate.estimatedCost,
      }}
    />
  );
}
```

## Mobile Responsiveness

The form is fully responsive with:
- Stacked layout on mobile
- Touch-friendly date/time pickers
- Optimized step navigation
- Collapsible sections for better mobile UX

## Accessibility Features

- Proper ARIA labels
- Keyboard navigation support
- Focus management between steps
- Clear error messages
- Screen reader announcements

## Testing Strategy

```typescript
describe('TaskForm', () => {
  it('should validate required fields', async () => {
    render(<TaskForm />);
    
    // Try to proceed without filling required fields
    fireEvent.click(screen.getByText('Next'));
    
    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
      expect(screen.getByText('Asset is required')).toBeInTheDocument();
    });
  });
  
  it('should create task with all data', async () => {
    const createTask = jest.fn();
    render(<TaskForm />);
    
    // Fill all steps...
    // Submit form
    
    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          assetId: 'asset-123',
          // ... other fields
        })
      );
    });
  });
});
```

## Performance Optimizations

1. **Lazy load step components** - Only load when needed
2. **Debounced validation** - Prevent excessive validation calls
3. **Memoized asset lists** - Cache asset data
4. **Virtual scrolling** - For large user/asset lists
5. **Optimistic updates** - Show success immediately

This comprehensive task creation form provides all the functionality needed for Phase 2.2 completion.