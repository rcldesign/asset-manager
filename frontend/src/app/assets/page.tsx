'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Container,
  Typography,
  Paper,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useRouter } from 'next/navigation';
import { useAssets } from '@/hooks/use-assets';
import { AssetFilters } from '@/types';
import { AssetTable } from '@/components/assets/AssetTable';
import { AssetFiltersComponent } from '@/components/assets/AssetFilters';
import { Pagination } from '@/components/ui/Pagination';

export default function AssetsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<AssetFilters>({
    page: 1,
    limit: 20,
    sortBy: 'name',
    order: 'asc',
  });

  const { data, isLoading, isError, error } = useAssets(filters);

  const handleFilterChange = (newFilters: Partial<AssetFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1, // Reset to first page when filters change
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handleSort = (field: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: field,
      order: prev.sortBy === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleCreateAsset = () => {
    router.push('/assets/new');
  };

  const handleViewAsset = (assetId: string) => {
    router.push(`/assets/${assetId}`);
  };

  if (isLoading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="error">
            Error loading assets: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box py={4}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" component="h1">
            Assets
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateAsset}
          >
            New Asset
          </Button>
        </Stack>

        <Paper sx={{ p: 2, mb: 3 }}>
          <AssetFiltersComponent
            filters={filters}
            onFilterChange={handleFilterChange}
          />
        </Paper>

        <Paper>
          <AssetTable
            assets={data?.data || []}
            sortBy={filters.sortBy}
            sortOrder={filters.order}
            onSort={handleSort}
            onViewAsset={handleViewAsset}
          />
          
          {data && data.totalPages > 1 && (
            <Box p={2}>
              <Pagination
                page={filters.page || 1}
                totalPages={data.totalPages}
                onPageChange={handlePageChange}
              />
            </Box>
          )}
        </Paper>

        {data && (
          <Box mt={2}>
            <Typography variant="body2" color="text.secondary">
              Showing {data.data.length} of {data.total} assets
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}