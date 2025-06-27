'use client';

import { useParams, useRouter } from 'next/navigation';
import { Container, Box, Typography, Paper, CircularProgress, Alert } from '@mui/material';
import { AssetForm } from '@/components/assets/AssetForm';
import { useAsset, useUpdateAsset } from '@/hooks/use-assets';
import { AssetFormData } from '@/types';

export default function EditAssetPage() {
  const params = useParams();
  const router = useRouter();
  const assetId = params.assetId as string;

  const { data: asset, isLoading, isError, error } = useAsset(assetId);
  const updateAssetMutation = useUpdateAsset();

  const handleSubmit = async (data: AssetFormData) => {
    try {
      await updateAssetMutation.mutateAsync({ id: assetId, data });
      router.push(`/assets/${assetId}`);
    } catch (error) {
      console.error('Failed to update asset:', error);
    }
  };

  const handleCancel = () => {
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
            Error loading asset: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  if (!asset) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="warning">Asset not found</Alert>
        </Box>
      </Container>
    );
  }

  // Transform asset data to form data
  const initialData: AssetFormData = {
    barcode: asset.barcode,
    qrCode: asset.qrCode,
    name: asset.name,
    description: asset.description,
    category: asset.category,
    status: asset.status,
    purchaseDate: asset.purchaseDate,
    purchasePrice: asset.purchasePrice,
    warrantyExpiry: asset.warrantyExpiry,
    serialNumber: asset.serialNumber,
    modelNumber: asset.modelNumber,
    manufacturer: asset.manufacturer,
    link: asset.link,
    locationId: asset.locationId,
    assetTemplateId: asset.assetTemplateId,
    customFields: asset.customFields,
    tags: asset.tags,
    notes: asset.notes,
    assignedUserId: asset.assignedUserId,
    parentAssetId: asset.parentAssetId,
  };

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Edit Asset
        </Typography>
        <Paper sx={{ p: 3 }}>
          <AssetForm
            initialData={initialData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={updateAssetMutation.isPending}
          />
        </Paper>
      </Box>
    </Container>
  );
}