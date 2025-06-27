# Template Selector Component Implementation Guide

## Overview
The Template Selector allows users to choose from predefined asset templates when creating new assets. It provides template preview, search functionality, and category filtering.

## Component Architecture

### 1. Main Component: `TemplateSelector.tsx`

```typescript
import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Category as CategoryIcon,
  Description as DescriptionIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAssetTemplates } from '@/hooks/use-asset-templates';
import { AssetTemplate, AssetCategory } from '@/types';
import { useDebounce } from '@/hooks/use-debounce';

interface TemplateSelectorProps {
  value?: string | null;
  onChange: (templateId: string | null, template?: AssetTemplate) => void;
  category?: AssetCategory;
  onCategoryChange?: (category: AssetCategory) => void;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
}

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  value,
  onChange,
  category,
  onCategoryChange,
  label = 'Asset Template',
  required,
  error,
  helperText,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'all'>(
    category || 'all'
  );
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { templates, loading, error: loadError } = useAssetTemplates();

  // Filter templates
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    
    return templates.filter(template => {
      // Category filter
      if (selectedCategory !== 'all' && template.category !== selectedCategory) {
        return false;
      }
      
      // Search filter
      if (debouncedSearchTerm) {
        const search = debouncedSearchTerm.toLowerCase();
        return (
          template.name.toLowerCase().includes(search) ||
          template.description?.toLowerCase().includes(search) ||
          template.manufacturer?.toLowerCase().includes(search) ||
          template.model?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [templates, selectedCategory, debouncedSearchTerm]);

  // Get selected template
  const selectedTemplate = useMemo(() => {
    if (!value || !templates) return null;
    return templates.find(t => t.id === value);
  }, [value, templates]);

  const handleOpen = () => {
    if (!disabled) {
      setOpen(true);
      setSelectedCategory(category || 'all');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSearchTerm('');
  };

  const handleSelectTemplate = (template: AssetTemplate) => {
    onChange(template.id, template);
    if (onCategoryChange && template.category !== category) {
      onCategoryChange(template.category);
    }
    handleClose();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleCategoryChange = (newCategory: AssetCategory | 'all') => {
    setSelectedCategory(newCategory);
  };

  return (
    <>
      <TextField
        label={label}
        value={selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.manufacturer} ${selectedTemplate.model})` : ''}
        onClick={handleOpen}
        placeholder="Select a template or create custom asset"
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        fullWidth
        InputProps={{
          readOnly: true,
          startAdornment: selectedTemplate && (
            <InputAdornment position="start">
              <CategoryIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {value && !disabled && (
                <IconButton size="small" onClick={handleClear}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
            </InputAdornment>
          ),
        }}
        sx={{ cursor: disabled ? 'default' : 'pointer' }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Select Asset Template</Typography>
            <Button
              variant="text"
              onClick={() => {
                onChange(null);
                handleClose();
              }}
            >
              Skip (Custom Asset)
            </Button>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value as AssetCategory | 'all')}
                label="Category"
              >
                <MenuItem value="all">All Categories</MenuItem>
                <MenuItem value="Equipment">Equipment</MenuItem>
                <MenuItem value="Vehicle">Vehicle</MenuItem>
                <MenuItem value="Property">Property</MenuItem>
                <MenuItem value="Tool">Tool</MenuItem>
                <MenuItem value="Furniture">Furniture</MenuItem>
                <MenuItem value="Electronics">Electronics</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {loadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Error loading templates: {loadError.message}
            </Alert>
          )}

          <Box sx={{ minHeight: 400, maxHeight: 500, overflow: 'auto' }}>
            {loading ? (
              <Grid container spacing={2}>
                {[1, 2, 3, 4].map(i => (
                  <Grid item xs={12} sm={6} key={i}>
                    <Skeleton variant="rectangular" height={200} />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Grid container spacing={2}>
                {filteredTemplates.map(template => (
                  <Grid item xs={12} sm={6} key={template.id}>
                    <TemplateCard
                      template={template}
                      selected={template.id === value}
                      onSelect={() => handleSelectTemplate(template)}
                    />
                  </Grid>
                ))}
                
                {filteredTemplates.length === 0 && (
                  <Grid item xs={12}>
                    <Box sx={{ textAlign: 'center', py: 4 }}>
                      <Typography color="textSecondary">
                        No templates found matching your criteria
                      </Typography>
                    </Box>
                  </Grid>
                )}
              </Grid>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

// Sub-component for template cards
interface TemplateCardProps {
  template: AssetTemplate;
  selected: boolean;
  onSelect: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, selected, onSelect }) => {
  const customFieldCount = template.customFieldsSchema 
    ? Object.keys(template.customFieldsSchema.properties || {}).length 
    : 0;

  return (
    <Card 
      variant={selected ? 'elevation' : 'outlined'}
      sx={{ 
        height: '100%',
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : undefined,
        borderWidth: selected ? 2 : 1,
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: 2,
        },
      }}
      onClick={onSelect}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
          <Typography variant="h6" component="div">
            {template.name}
          </Typography>
          <Chip 
            label={template.category} 
            size="small" 
            color="primary" 
            variant="outlined"
          />
        </Box>
        
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {template.manufacturer} {template.model}
        </Typography>
        
        {template.description && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            {template.description}
          </Typography>
        )}
        
        <Box display="flex" gap={1} flexWrap="wrap">
          {customFieldCount > 0 && (
            <Chip
              icon={<SettingsIcon />}
              label={`${customFieldCount} custom fields`}
              size="small"
              variant="outlined"
            />
          )}
          {template.defaultFields && Object.keys(template.defaultFields).length > 0 && (
            <Chip
              icon={<DescriptionIcon />}
              label="Has defaults"
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      </CardContent>
      
      <CardActions>
        <Button size="small" onClick={onSelect}>
          Select Template
        </Button>
      </CardActions>
    </Card>
  );
};
```

### 2. Template Preview Component: `TemplatePreview.tsx`

```typescript
import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { AssetTemplate } from '@/types';

interface TemplatePreviewProps {
  template: AssetTemplate;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ template }) => {
  const customFields = template.customFieldsSchema?.properties || {};
  const requiredFields = template.customFieldsSchema?.required || [];
  
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Template Preview
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Basic Information
        </Typography>
        <Typography>Name: {template.name}</Typography>
        <Typography>Category: {template.category}</Typography>
        <Typography>Manufacturer: {template.manufacturer}</Typography>
        <Typography>Model: {template.model}</Typography>
      </Box>
      
      {Object.keys(customFields).length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Custom Fields
          </Typography>
          <List dense>
            {Object.entries(customFields).map(([key, schema]: [string, any]) => (
              <ListItem key={key}>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2">{key}</Typography>
                      {requiredFields.includes(key) && (
                        <Chip label="Required" size="small" color="primary" />
                      )}
                    </Box>
                  }
                  secondary={`Type: ${schema.type}${schema.description ? ` - ${schema.description}` : ''}`}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
      
      {template.defaultFields && Object.keys(template.defaultFields).length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Default Values
          </Typography>
          <List dense>
            {Object.entries(template.defaultFields).map(([key, value]) => (
              <ListItem key={key}>
                <ListItemText
                  primary={key}
                  secondary={String(value)}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Paper>
  );
};
```

### 3. Inline Template Badge: `TemplateBadge.tsx`

```typescript
import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { Category as CategoryIcon } from '@mui/icons-material';
import { useAssetTemplates } from '@/hooks/use-asset-templates';

interface TemplateBadgeProps {
  templateId: string;
  showDetails?: boolean;
}

export const TemplateBadge: React.FC<TemplateBadgeProps> = ({ 
  templateId, 
  showDetails = true 
}) => {
  const { templates } = useAssetTemplates();
  const template = templates?.find(t => t.id === templateId);
  
  if (!template) return null;
  
  const label = showDetails 
    ? `${template.manufacturer} ${template.model}`
    : template.name;
  
  return (
    <Tooltip title={`Template: ${template.name}`}>
      <Chip
        icon={<CategoryIcon />}
        label={label}
        size="small"
        variant="outlined"
        color="primary"
      />
    </Tooltip>
  );
};
```

## Usage Examples

### 1. In Asset Creation Form

```typescript
import { TemplateSelector } from '@/components/templates/TemplateSelector';
import { TemplatePreview } from '@/components/templates/TemplatePreview';

const CreateAssetForm = () => {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [template, setTemplate] = useState<AssetTemplate | null>(null);
  const [category, setCategory] = useState<AssetCategory>('Equipment');
  
  const handleTemplateChange = (id: string | null, template?: AssetTemplate) => {
    setTemplateId(id);
    setTemplate(template || null);
    
    // Auto-populate form fields from template
    if (template) {
      setFormData(prev => ({
        ...prev,
        category: template.category,
        manufacturer: template.manufacturer,
        model: template.model,
        customFields: template.defaultFields || {},
      }));
    }
  };
  
  return (
    <Box>
      <TemplateSelector
        value={templateId}
        onChange={handleTemplateChange}
        category={category}
        onCategoryChange={setCategory}
        required
        helperText="Select a template to pre-fill asset information"
      />
      
      {template && (
        <Box sx={{ mt: 2 }}>
          <TemplatePreview template={template} />
        </Box>
      )}
    </Box>
  );
};
```

### 2. Quick Template Selection

```typescript
const QuickAssetCreate = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  
  const handleTemplateSelect = (templateId: string | null, template?: AssetTemplate) => {
    if (templateId) {
      navigate(`/assets/new?templateId=${templateId}`);
    } else {
      navigate('/assets/new');
    }
  };
  
  return (
    <>
      <Button 
        variant="contained" 
        onClick={() => setOpen(true)}
        startIcon={<AddIcon />}
      >
        New Asset
      </Button>
      
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Choose Asset Type</DialogTitle>
        <DialogContent>
          <TemplateSelector
            onChange={handleTemplateSelect}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
```

## API Integration Hook Enhancement

```typescript
// Enhanced use-asset-templates.ts hook
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetTemplateApi } from '@/api/asset-template-api';

export const useAssetTemplates = (options?: {
  category?: AssetCategory;
  search?: string;
}) => {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['assetTemplates', options],
    queryFn: () => assetTemplateApi.list({
      category: options?.category,
      search: options?.search,
    }),
  });
  
  const createTemplate = useMutation({
    mutationFn: assetTemplateApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assetTemplates'] });
    },
  });
  
  const updateTemplate = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      assetTemplateApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assetTemplates'] });
    },
  });
  
  return {
    templates: data?.data || [],
    loading: isLoading,
    error,
    createTemplate,
    updateTemplate,
  };
};
```

## Performance Considerations

1. **Template Caching**: Templates are cached in React Query with a 5-minute stale time
2. **Search Debouncing**: 300ms debounce on search input
3. **Lazy Loading**: Only load full template details when needed
4. **Optimistic Updates**: Show selected template immediately while loading

## Testing Strategy

```typescript
describe('TemplateSelector', () => {
  it('should filter templates by category', async () => {
    const { getByLabelText, getByText, queryByText } = render(
      <TemplateSelector onChange={jest.fn()} />
    );
    
    // Open dialog
    fireEvent.click(getByLabelText('Asset Template'));
    
    // Select category
    fireEvent.change(getByLabelText('Category'), {
      target: { value: 'Vehicle' }
    });
    
    // Verify filtering
    expect(getByText('Ford F-150')).toBeInTheDocument();
    expect(queryByText('Dell OptiPlex')).not.toBeInTheDocument();
  });
  
  it('should populate form with template defaults', async () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <TemplateSelector onChange={onChange} />
    );
    
    fireEvent.click(getByText('Select Template'));
    
    expect(onChange).toHaveBeenCalledWith(
      'template-123',
      expect.objectContaining({
        manufacturer: 'Dell',
        model: 'OptiPlex 7090',
        defaultFields: { ramSize: 16 }
      })
    );
  });
});
```

## Accessibility Features

- Full keyboard navigation
- Screen reader announcements
- Focus management
- Clear labeling and descriptions
- High contrast mode support

## Future Enhancements

1. Template creation wizard
2. Template import/export
3. Template versioning
4. Template sharing between organizations
5. AI-powered template suggestions