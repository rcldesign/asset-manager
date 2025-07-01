import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Stack,
  Chip,
  Autocomplete,
  Typography,
  Alert,
  InputAdornment,
  FormHelperText,
  Divider,
  Grid,
  Card,
  CardMedia,
  CardActions,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { AssetFormData, AssetCategory, AssetStatus } from '@/types';
import { useLocations } from '@/hooks/use-locations';
import { useAssetTemplates } from '@/hooks/use-asset-templates';
import { useUsers } from '@/hooks/use-users';
import { useAssets, useGenerateBarcode } from '@/hooks/use-assets';
import { CameraCapture } from '@/components/PWA/CameraCapture';

interface AssetFormProps {
  initialData?: Partial<AssetFormData>;
  onSubmit: (data: AssetFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const statusOptions = [
  { value: AssetStatus.OPERATIONAL, label: 'Operational' },
  { value: AssetStatus.MAINTENANCE, label: 'Maintenance' },
  { value: AssetStatus.REPAIR, label: 'Repair' },
  { value: AssetStatus.RETIRED, label: 'Retired' },
  { value: AssetStatus.DISPOSED, label: 'Disposed' },
  { value: AssetStatus.LOST, label: 'Lost' },
];

const categoryOptions = [
  { value: AssetCategory.HARDWARE, label: 'Hardware' },
  { value: AssetCategory.SOFTWARE, label: 'Software' },
  { value: AssetCategory.FURNITURE, label: 'Furniture' },
  { value: AssetCategory.VEHICLE, label: 'Vehicle' },
  { value: AssetCategory.EQUIPMENT, label: 'Equipment' },
  { value: AssetCategory.PROPERTY, label: 'Property' },
  { value: AssetCategory.OTHER, label: 'Other' },
];

export const AssetForm: React.FC<AssetFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<Partial<AssetFormData>>({
    barcode: '',
    name: '',
    description: '',
    category: AssetCategory.EQUIPMENT,
    status: AssetStatus.OPERATIONAL,
    tags: [],
    ...initialData,
  });
  const [tagInput, setTagInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [templateFieldsData] = useState<Record<string, unknown>>({});
  const [attachedPhotos, setAttachedPhotos] = useState<Array<{ url: string; blob: Blob; name: string }>>([]);

  const { data: locations } = useLocations();
  const { data: templates } = useAssetTemplates();
  const { data: users } = useUsers();
  const { data: assets } = useAssets({ limit: 1000 }); // For parent asset selection
  const generateBarcodeMutation = useGenerateBarcode();

  // Load template default fields when template changes
  useEffect(() => {
    if (formData.assetTemplateId && templates) {
      const template = templates.find(t => t.id === formData.assetTemplateId);
      if (template?.defaultFields) {
        // Apply default fields to form
        const defaults = template.defaultFields as Record<string, unknown>;
        setFormData(prev => ({
          ...prev,
          ...defaults,
          // Don't override existing values
          ...(initialData || {}),
        }));
      }
    }
  }, [formData.assetTemplateId, templates, initialData]);

  const handleChange = (field: keyof AssetFormData) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: unknown } }
  ) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when field is modified
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleLocationChange = (_: unknown, value: { id: string; name: string } | null) => {
    setFormData(prev => ({
      ...prev,
      locationId: value?.id || undefined,
    }));
  };

  const handleUserChange = (_: unknown, value: { id: string; fullName: string } | null) => {
    setFormData(prev => ({
      ...prev,
      assignedUserId: value?.id || undefined,
    }));
  };

  const handleParentAssetChange = (_: unknown, value: { id: string; name: string } | null) => {
    setFormData(prev => ({
      ...prev,
      parentAssetId: value?.id || undefined,
    }));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && formData.tags && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(tag => tag !== tagToRemove) || [],
    }));
  };

  const handleGenerateBarcode = async () => {
    try {
      const result = await generateBarcodeMutation.mutateAsync();
      setFormData(prev => ({
        ...prev,
        barcode: result.barcode,
      }));
    } catch (error) {
      console.error('Failed to generate barcode:', error);
    }
  };

  // TODO: Implement custom field handling when template custom fields are defined
  // const handleCustomFieldChange = (fieldName: string, value: unknown) => {
  //   setTemplateFieldsData(prev => ({
  //     ...prev,
  //     [fieldName]: value,
  //   }));
  // };

  const handlePhotoCapture = (imageBlob: Blob, imageUrl: string) => {
    const timestamp = new Date().toISOString();
    const fileName = `asset-photo-${timestamp}.jpg`;
    
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.barcode) {
      newErrors.barcode = 'Barcode is required';
    }
    if (!formData.name) {
      newErrors.name = 'Name is required';
    }
    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    if (!formData.status) {
      newErrors.status = 'Status is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const submitData: AssetFormData = {
        barcode: formData.barcode || '',
        name: formData.name || '',
        description: formData.description,
        category: formData.category || AssetCategory.EQUIPMENT,
        status: formData.status || AssetStatus.OPERATIONAL,
        purchaseDate: formData.purchaseDate,
        purchasePrice: formData.purchasePrice ? Number(formData.purchasePrice) : undefined,
        warrantyExpiry: formData.warrantyExpiry,
        serialNumber: formData.serialNumber,
        modelNumber: formData.modelNumber,
        manufacturer: formData.manufacturer,
        link: formData.link,
        locationId: formData.locationId,
        assetTemplateId: formData.assetTemplateId,
        customFields: { ...formData.customFields, ...templateFieldsData },
        tags: formData.tags,
        notes: formData.notes,
        assignedUserId: formData.assignedUserId,
        parentAssetId: formData.parentAssetId,
        // Include photo attachments for upload handling
        attachments: attachedPhotos.map(photo => ({
          file: photo.blob,
          name: photo.name,
          type: 'image',
        })),
      };
      onSubmit(submitData);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        {/* Basic Information */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Basic Information
          </Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="Barcode"
                value={formData.barcode || ''}
                onChange={handleChange('barcode')}
                error={!!errors.barcode}
                helperText={errors.barcode}
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        onClick={handleGenerateBarcode}
                        disabled={generateBarcodeMutation.isPending}
                      >
                        Generate
                      </Button>
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="QR Code"
                value={formData.qrCode || ''}
                onChange={handleChange('qrCode')}
              />
            </Stack>
            <TextField
              fullWidth
              label="Name"
              value={formData.name || ''}
              onChange={handleChange('name')}
              error={!!errors.name}
              helperText={errors.name}
              required
            />
            <TextField
              fullWidth
              label="Description"
              value={formData.description || ''}
              onChange={handleChange('description')}
              multiline
              rows={3}
            />
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth error={!!errors.category} required>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category || ''}
                  onChange={handleChange('category')}
                  label="Category"
                >
                  {categoryOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {errors.category && <FormHelperText>{errors.category}</FormHelperText>}
              </FormControl>
              <FormControl fullWidth error={!!errors.status} required>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status || ''}
                  onChange={handleChange('status')}
                  label="Status"
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
                {errors.status && <FormHelperText>{errors.status}</FormHelperText>}
              </FormControl>
            </Stack>
          </Stack>
        </Box>

        <Divider />

        {/* Asset Details */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Asset Details
          </Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="Serial Number"
                value={formData.serialNumber || ''}
                onChange={handleChange('serialNumber')}
              />
              <TextField
                fullWidth
                label="Model Number"
                value={formData.modelNumber || ''}
                onChange={handleChange('modelNumber')}
              />
              <TextField
                fullWidth
                label="Manufacturer"
                value={formData.manufacturer || ''}
                onChange={handleChange('manufacturer')}
              />
            </Stack>
            <TextField
              fullWidth
              label="Link"
              type="url"
              value={formData.link || ''}
              onChange={handleChange('link')}
              placeholder="https://example.com"
            />
          </Stack>
        </Box>

        <Divider />

        {/* Purchase Information */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Purchase Information
          </Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="Purchase Date"
                type="date"
                value={formData.purchaseDate || ''}
                onChange={handleChange('purchaseDate')}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Purchase Price"
                type="number"
                value={formData.purchasePrice || ''}
                onChange={handleChange('purchasePrice')}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
              <TextField
                fullWidth
                label="Warranty Expiry"
                type="date"
                value={formData.warrantyExpiry || ''}
                onChange={handleChange('warrantyExpiry')}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          </Stack>
        </Box>

        <Divider />

        {/* Location and Assignment */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Location & Assignment
          </Typography>
          <Stack spacing={2}>
            <Autocomplete
              options={locations || []}
              getOptionLabel={(option) => option.name}
              value={locations?.find(l => l.id === formData.locationId) || null}
              onChange={handleLocationChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Location"
                  fullWidth
                />
              )}
            />
            <Autocomplete
              options={users?.data || []}
              getOptionLabel={(option) => option.fullName || option.email}
              value={users?.data.find(u => u.id === formData.assignedUserId) || null}
              onChange={handleUserChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assigned To"
                  fullWidth
                />
              )}
            />
            <Autocomplete
              options={assets?.data || []}
              getOptionLabel={(option) => `${option.barcode} - ${option.name}`}
              value={assets?.data.find(a => a.id === formData.parentAssetId) || null}
              onChange={handleParentAssetChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Parent Asset"
                  fullWidth
                />
              )}
            />
          </Stack>
        </Box>

        <Divider />

        {/* Template and Tags */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Template & Tags
          </Typography>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Asset Template</InputLabel>
              <Select
                value={formData.assetTemplateId || ''}
                onChange={handleChange('assetTemplateId')}
                label="Asset Template"
              >
                <MenuItem value="">None</MenuItem>
                {templates?.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <TextField
                  size="small"
                  label="Add Tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button size="small" onClick={handleAddTag}>
                  Add
                </Button>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {formData.tags?.map((tag, index) => (
                  <Chip
                    key={index}
                    label={tag}
                    onDelete={() => handleRemoveTag(tag)}
                    size="small"
                  />
                ))}
              </Stack>
            </Box>

            <TextField
              fullWidth
              label="Notes"
              value={formData.notes || ''}
              onChange={handleChange('notes')}
              multiline
              rows={3}
            />
          </Stack>
        </Box>

        {/* Custom Fields from Template */}
        {formData.assetTemplateId && templates && (
          <>
            <Divider />
            <Box>
              <Typography variant="h6" gutterBottom>
                Custom Fields
              </Typography>
              <Alert severity="info" sx={{ mb: 2 }}>
                Custom fields from the selected template will be displayed here in a future update.
              </Alert>
            </Box>
          </>
        )}

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
                Capture photos to attach to this asset
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
                          alt={`Asset photo ${index + 1}`}
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

        {/* Form Actions */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : (initialData ? 'Update' : 'Create')}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
};