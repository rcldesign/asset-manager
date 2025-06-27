'use client';

import { useRouter, useParams } from 'next/navigation';
import { Container, Box, Typography, Button, Stack, CircularProgress, Alert } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTask } from '@/hooks/use-tasks';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';

export default function EditTaskPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;

  const { data: task, isLoading, isError, error } = useTask(taskId);

  const handleBack = () => {
    router.push(`/tasks/${taskId}`);
  };

  const handleSuccess = () => {
    router.push(`/tasks/${taskId}`);
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
            Error loading task: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  if (!task) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="warning">Task not found</Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box py={4}>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
          >
            Back to Task
          </Button>
          <Typography variant="h4" component="h1">
            Edit Task
          </Typography>
        </Stack>

        <TaskFormDialog
          open={true}
          onClose={handleBack}
          onSuccess={handleSuccess}
          task={{
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            assetId: task.assetId,
            assignedUserId: task.assignedUserId,
            dueDate: task.dueDate,
            estimatedHours: task.estimatedDuration,
            notes: task.notes,
          }}
          isFullPage={true}
        />
      </Box>
    </Container>
  );
}