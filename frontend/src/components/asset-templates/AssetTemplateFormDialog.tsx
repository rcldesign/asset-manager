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
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AssetTemplate, AssetCategory } from '@/types';
import { useCreateAssetTemplate, useUpdateAssetTemplate } from '@/hooks/use-asset-templates';

const templateFormSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  category: z.nativeEnum(AssetCategory, { required_error: 'Category is required' }),
  isActive: z.boolean(),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface AssetTemplateFormDialogProps {
  open: boolean;
  onClose: () => void;
  template?: AssetTemplate;
}

interface CustomField {
  key: string;
  value: string | number | boolean;
  type: 'string' | 'number' | 'boolean' | 'date';
}

export function AssetTemplateFormDialog({
  open,
  onClose,
  template,
}: AssetTemplateFormDialogProps) {
  const isEditing = Boolean(template);
  const [activeTab, setActiveTab] = useState(0);
  const [defaultFields, setDefaultFields] = useState<CustomField[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const createTemplateMutation = useCreateAssetTemplate();
  const updateTemplateMutation = useUpdateAssetTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      description: '',
      category: AssetCategory.OTHER,
      isActive: true,
    },
  });

  // Reset form when dialog opens/closes or template changes
  useEffect(() => {
    if (open) {
      if (isEditing && template) {
        reset({
          name: template.name,
          description: template.description || '',
          category: template.category,
          isActive: template.isActive,
        });

        // Convert template fields to CustomField format
        const defaultFieldsArray: CustomField[] = Object.entries(template.defaultFields || {}).map(([key, value]) => ({
          key,
          value: value as string | number | boolean,
          type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
        }));

        const customFieldsArray: CustomField[] = Object.entries(template.customFields || {}).map(([key, value]) => ({
          key,
          value: value as string | number | boolean,
          type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
        }));

        setDefaultFields(defaultFieldsArray);
        setCustomFields(customFieldsArray);
      } else {
        reset({
          name: '',
          description: '',
          category: AssetCategory.OTHER,
          isActive: true,
        });
        setDefaultFields([]);
        setCustomFields([]);
      }
    }
  }, [open, isEditing, template, reset]);

  const onSubmit = async (data: TemplateFormData) => {
    try {
      // Convert fields arrays back to objects
      const defaultFieldsObj = defaultFields.reduce((acc, field) => {
        if (field.key.trim()) {
          acc[field.key] = field.value;
        }
        return acc;
      }, {} as Record<string, string | number | boolean>);

      const customFieldsObj = customFields.reduce((acc, field) => {
        if (field.key.trim()) {
          acc[field.key] = field.value;
        }
        return acc;
      }, {} as Record<string, string | number | boolean>);

      if (isEditing && template) {
        await updateTemplateMutation.mutateAsync({
          id: template.id,
          data: {
            name: data.name,
            description: data.description || undefined,
            category: data.category,
            isActive: data.isActive,
            defaultFields: defaultFieldsObj,
            customFields: customFieldsObj,
          },
        });
      } else {
        await createTemplateMutation.mutateAsync({
          name: data.name,
          description: data.description || undefined,
          category: data.category,
          defaultFields: defaultFieldsObj,
          customFields: customFieldsObj,
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const addField = (type: 'default' | 'custom') => {
    const newField: CustomField = { key: '', value: '', type: 'string' };
    if (type === 'default') {
      setDefaultFields([...defaultFields, newField]);
    } else {
      setCustomFields([...customFields, newField]);
    }
  };

  const removeField = (index: number, type: 'default' | 'custom') => {
    if (type === 'default') {
      setDefaultFields(defaultFields.filter((_, i) => i !== index));
    } else {
      setCustomFields(customFields.filter((_, i) => i !== index));
    }
  };

  const updateField = (index: number, type: 'default' | 'custom', updates: Partial<CustomField>) => {
    if (type === 'default') {
      setDefaultFields(defaultFields.map((field, i) => 
        i === index ? { ...field, ...updates } : field
      ));
    } else {
      setCustomFields(customFields.map((field, i) => 
        i === index ? { ...field, ...updates } : field
      ));
    }
  };

  const renderFieldEditor = (fields: CustomField[], type: 'default' | 'custom') => (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {type === 'default' ? 'Default Fields' : 'Custom Fields'}
        </Typography>
        <Button
          startIcon={<AddIcon />}
          onClick={() => addField(type)}
          size="small"
        >
          Add Field
        </Button>
      </Box>

      {fields.length === 0 ? (
        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.50' }}>
          <Typography variant="body2" color="text.secondary">
            No {type} fields defined. Click &quot;Add Field&quot; to get started.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {fields.map((field, index) => (
            <Paper key={index} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label="Field Name"
                  value={field.key}
                  onChange={(e) => updateField(index, type, { key: e.target.value })}
                  size="small"
                  sx={{ flex: 1 }}
                />
                
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={field.type}
                    onChange={(e) => updateField(index, type, { 
                      type: e.target.value as CustomField['type'],
                      value: e.target.value === 'boolean' ? false : ''
                    })}
                    label="Type"
                  >
                    <MenuItem value="string">Text</MenuItem>
                    <MenuItem value="number">Number</MenuItem>
                    <MenuItem value="boolean">Boolean</MenuItem>
                    <MenuItem value="date">Date</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Default Value"
                  value={field.value}
                  onChange={(e) => {
                    let value: string | number | boolean = e.target.value;
                    if (field.type === 'number') {
                      value = value ? parseFloat(value) : 0;
                    } else if (field.type === 'boolean') {
                      value = value === 'true';
                    }
                    updateField(index, type, { value });
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                  InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                />

                <Tooltip title="Remove field">
                  <IconButton
                    onClick={() => removeField(index, type)}
                    color="error"
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {isEditing ? 'Edit Asset Template' : 'Create Asset Template'}
        </DialogTitle>
        
        <DialogContent>
          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label="Basic Information" />
            <Tab label="Field Configuration" />
          </Tabs>

          {activeTab === 0 && (
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Template Name"
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
                    rows={3}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                    fullWidth
                  />
                )}
              />

              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.category}>
                    <InputLabel>Category</InputLabel>
                    <Select
                      {...field}
                      label="Category"
                    >
                      {Object.values(AssetCategory).map((category) => (
                        <MenuItem key={category} value={category}>
                          {category}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.category && (
                      <FormHelperText>{errors.category.message}</FormHelperText>
                    )}
                  </FormControl>
                )}
              />

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
                    label="Active Template"
                  />
                )}
              />
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ mb: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <InfoIcon fontSize="small" />
                  <Typography variant="subtitle2">Field Configuration</Typography>
                </Box>
                <Typography variant="body2">
                  Define default fields and custom fields for this template. Default fields provide
                  standard values, while custom fields create additional fields specific to this template.
                </Typography>
              </Box>

              {renderFieldEditor(defaultFields, 'default')}
              {renderFieldEditor(customFields, 'custom')}
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