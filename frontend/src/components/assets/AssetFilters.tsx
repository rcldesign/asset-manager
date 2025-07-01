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
  IconButton,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { AssetFilters, AssetStatus, AssetCategory } from '@/types';
import { useDebounce } from '@/hooks/use-debounce';
import { useLocations } from '@/hooks/use-locations';
import { useAssetTemplates } from '@/hooks/use-asset-templates';
import { BarcodeScanner } from '@/components/PWA/BarcodeScanner';

interface AssetFiltersComponentProps {
  filters: AssetFilters;
  onFilterChange: (filters: Partial<AssetFilters>) => void;
}

const statusOptions: { value: AssetStatus; label: string }[] = [
  { value: AssetStatus.OPERATIONAL, label: 'Operational' },
  { value: AssetStatus.MAINTENANCE, label: 'Maintenance' },
  { value: AssetStatus.REPAIR, label: 'Repair' },
  { value: AssetStatus.RETIRED, label: 'Retired' },
  { value: AssetStatus.DISPOSED, label: 'Disposed' },
  { value: AssetStatus.LOST, label: 'Lost' },
];

const categoryOptions: { value: AssetCategory; label: string }[] = [
  { value: AssetCategory.HARDWARE, label: 'Hardware' },
  { value: AssetCategory.SOFTWARE, label: 'Software' },
  { value: AssetCategory.FURNITURE, label: 'Furniture' },
  { value: AssetCategory.VEHICLE, label: 'Vehicle' },
  { value: AssetCategory.EQUIPMENT, label: 'Equipment' },
  { value: AssetCategory.PROPERTY, label: 'Property' },
  { value: AssetCategory.OTHER, label: 'Other' },
];

export const AssetFiltersComponent: React.FC<AssetFiltersComponentProps> = ({
  filters,
  onFilterChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState(filters.search || '');
  const debouncedSearch = useDebounce(search, 300);

  const { data: locations } = useLocations();
  const { data: templates } = useAssetTemplates();

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, onFilterChange]);

  const handleStatusChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ status: value ? value as AssetStatus : undefined });
  };

  const handleCategoryChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ category: value ? value as AssetCategory : undefined });
  };

  const handleLocationChange = (_: unknown, value: { id: string; name: string } | null) => {
    onFilterChange({ locationId: value?.id || undefined });
  };

  const handleTemplateChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFilterChange({ assetTemplateId: value || undefined });
  };

  const handleClearFilters = () => {
    setSearch('');
    onFilterChange({
      search: undefined,
      status: undefined,
      category: undefined,
      locationId: undefined,
      assetTemplateId: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      purchasedAfter: undefined,
      purchasedBefore: undefined,
    });
  };

  const handleBarcodeScanned = (barcode: string) => {
    // When a barcode is scanned, set it as the search term
    setSearch(barcode);
    onFilterChange({ search: barcode });
  };

  const activeFiltersCount = [
    filters.status,
    filters.category,
    filters.locationId,
    filters.assetTemplateId,
    filters.minPrice,
    filters.maxPrice,
    filters.purchasedAfter,
    filters.purchasedBefore,
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
              placeholder="Search assets or scan barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <BarcodeScanner
                      onScan={handleBarcodeScanned}
                      customTrigger={
                        <Tooltip title="Scan Barcode">
                          <IconButton 
                            size="small" 
                            edge="end"
                            aria-label="scan barcode"
                          >
                            <QrCodeScannerIcon />
                          </IconButton>
                        </Tooltip>
                      }
                    />
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
              <InputLabel>Category</InputLabel>
              <Select
                value={filters.category || ''}
                onChange={handleCategoryChange}
                label="Category"
              >
                <MenuItem value="">All</MenuItem>
                {categoryOptions.map((option) => (
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
            <Box sx={{ minWidth: 200, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <Autocomplete
                options={locations || []}
                getOptionLabel={(option) => option.name}
                value={locations?.find(l => l.id === filters.locationId) || null}
                onChange={handleLocationChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Location"
                    size="small"
                    fullWidth
                  />
                )}
              />
            </Box>
            <Box sx={{ minWidth: 200, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <FormControl fullWidth size="small">
                <InputLabel>Asset Template</InputLabel>
                <Select
                  value={filters.assetTemplateId || ''}
                  onChange={handleTemplateChange}
                  label="Asset Template"
                >
                  <MenuItem value="">All</MenuItem>
                  {templates?.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Min Price"
                type="number"
                value={filters.minPrice || ''}
                onChange={(e) => onFilterChange({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Max Price"
                type="number"
                value={filters.maxPrice || ''}
                onChange={(e) => onFilterChange({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Purchased After"
                type="date"
                value={filters.purchasedAfter || ''}
                onChange={(e) => onFilterChange({ purchasedAfter: e.target.value || undefined })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <Box sx={{ minWidth: 150, flexGrow: 1, maxWidth: { xs: '100%', sm: '48%', md: '23%' } }}>
              <TextField
                fullWidth
                size="small"
                label="Purchased Before"
                type="date"
                value={filters.purchasedBefore || ''}
                onChange={(e) => onFilterChange({ purchasedBefore: e.target.value || undefined })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          </Box>
        </Collapse>
      </Stack>
    </Box>
  );
};