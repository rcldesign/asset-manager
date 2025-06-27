'use client';

import { useRouter } from 'next/navigation';
import { Container, Box, Typography, Button, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';

export default function NewTaskPage() {
  const router = useRouter();

  const handleBack = () => {
    router.push('/tasks');
  };

  const handleSuccess = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
  };

  return (
    <Container maxWidth="md">
      <Box py={4}>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
          >
            Back to Tasks
          </Button>
          <Typography variant="h4" component="h1">
            Create New Task
          </Typography>
        </Stack>

        <TaskFormDialog
          open={true}
          onClose={handleBack}
          onSuccess={handleSuccess}
          isFullPage={true}
        />
      </Box>
    </Container>
  );
}