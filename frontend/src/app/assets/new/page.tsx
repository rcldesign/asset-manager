'use client';

import { useRouter } from 'next/navigation';
import { Container, Box, Typography, Paper } from '@mui/material';
import { AssetForm } from '@/components/assets/AssetForm';
import { useCreateAsset } from '@/hooks/use-assets';
import { AssetFormData } from '@/types';

export default function NewAssetPage() {
  const router = useRouter();
  const createAssetMutation = useCreateAsset();

  const handleSubmit = async (data: AssetFormData) => {
    try {
      const newAsset = await createAssetMutation.mutateAsync(data);
      router.push(`/assets/${newAsset.id}`);
    } catch (error) {
      console.error('Failed to create asset:', error);
    }
  };

  const handleCancel = () => {
    router.push('/assets');
  };

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Typography variant="h4" component="h1" gutterBottom>
          Create New Asset
        </Typography>
        <Paper sx={{ p: 3 }}>
          <AssetForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isLoading={createAssetMutation.isPending}
          />
        </Paper>
      </Box>
    </Container>
  );
}