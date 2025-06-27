import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import TaskEnhancementsPanel from '../TaskEnhancementsPanel';
import type { EnhancedTask } from '../../../api/task-enhancements-api';

// Mock the hooks
vi.mock('../../../hooks/use-task-enhancements', () => ({
  useAssignUsers: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useUnassignUser: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useCreateSubtask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useUpdateSubtask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useDeleteSubtask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useUpdateCompletionRequirements: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateChecklistItem: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

vi.mock('../../../hooks/use-users', () => ({
  useUsers: () => ({
    data: {
      users: [
        { id: 'user-1', email: 'user1@example.com', fullName: 'User One' },
        { id: 'user-2', email: 'user2@example.com', fullName: 'User Two' },
        { id: 'user-3', email: 'user3@example.com', fullName: 'User Three' },
      ],
    },
    isLoading: false,
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('TaskEnhancementsPanel', () => {
  const mockTask: EnhancedTask = {
    id: 'task-123',
    title: 'Test Task',
    assignments: [
      {
        id: 'assign-1',
        userId: 'user-1',
        taskId: 'task-123',
        assignedAt: new Date().toISOString(),
        user: { id: 'user-1', email: 'user1@example.com', fullName: 'User One' },
      },
    ],
    subtasks: [
      {
        id: 'subtask-1',
        title: 'Subtask 1',
        description: 'First subtask',
        status: 'PLANNED',
        parentTaskId: 'task-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    completionRequirements: {
      checklist: [
        { id: '1', label: 'Check item 1', completed: false },
        { id: '2', label: 'Check item 2', completed: true },
      ],
      photoRequired: false,
      signatureRequired: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all sections', () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    expect(screen.getByText('Assigned Users')).toBeInTheDocument();
    expect(screen.getByText('Subtasks')).toBeInTheDocument();
    expect(screen.getByText('Completion Requirements')).toBeInTheDocument();
  });

  it('displays assigned users', () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    expect(screen.getByText('U')).toBeInTheDocument(); // Avatar initial
  });

  it('opens assign users dialog', async () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const assignButton = screen.getAllByText('Assign')[0];
    fireEvent.click(assignButton);

    await waitFor(() => {
      expect(screen.getByText('Select Users')).toBeInTheDocument();
      expect(screen.getByText('User Two')).toBeInTheDocument();
      expect(screen.getByText('User Three')).toBeInTheDocument();
    });
  });

  it('displays subtasks with progress', () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    expect(screen.getByText('Subtask 1')).toBeInTheDocument();
    expect(screen.getByText('First subtask')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 completed')).toBeInTheDocument();
  });

  it('opens create subtask dialog', async () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const addSubtaskButton = screen.getByText('Add Subtask');
    fireEvent.click(addSubtaskButton);

    await waitFor(() => {
      expect(screen.getByText('Create Subtask')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });
  });

  it('updates subtask status', async () => {
    const mockUpdateSubtask = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateSubtask).mockReturnValue({
      mutateAsync: mockUpdateSubtask,
      isPending: false,
    } as any);

    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const statusSelect = screen.getByDisplayValue('PLANNED');
    fireEvent.mouseDown(statusSelect);
    
    const inProgressOption = await screen.findByText('In Progress');
    fireEvent.click(inProgressOption);

    await waitFor(() => {
      expect(mockUpdateSubtask).toHaveBeenCalledWith({
        taskId: 'task-123',
        subtaskId: 'subtask-1',
        updates: { status: 'IN_PROGRESS' },
      });
    });
  });

  it('displays completion requirements checklist', () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    expect(screen.getByText('Check item 1')).toBeInTheDocument();
    expect(screen.getByText('Check item 2')).toBeInTheDocument();
  });

  it('adds new checklist item', async () => {
    const mockUpdateRequirements = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateCompletionRequirements).mockReturnValue({
      mutateAsync: mockUpdateRequirements,
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const addItemInput = screen.getByPlaceholderText('Add checklist item');
    fireEvent.change(addItemInput, { target: { value: 'New check item' } });
    
    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockUpdateRequirements).toHaveBeenCalledWith({
        taskId: 'task-123',
        requirements: expect.objectContaining({
          checklist: expect.arrayContaining([
            expect.objectContaining({ label: 'New check item' }),
          ]),
        }),
      });
    });
  });

  it('toggles photo required', async () => {
    const mockUpdateRequirements = vi.fn();
    vi.mocked(useUpdateCompletionRequirements).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      mutate: mockUpdateRequirements,
      isPending: false,
    } as any);

    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const photoCheckbox = screen.getByLabelText('Photo Required');
    fireEvent.click(photoCheckbox);

    await waitFor(() => {
      expect(mockUpdateRequirements).toHaveBeenCalledWith({
        taskId: 'task-123',
        requirements: expect.objectContaining({
          photoRequired: true,
        }),
      });
    });
  });

  it('toggles signature required', async () => {
    const mockUpdateRequirements = vi.fn();
    vi.mocked(useUpdateCompletionRequirements).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      mutate: mockUpdateRequirements,
      isPending: false,
    } as any);

    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    const signatureCheckbox = screen.getByLabelText('Signature Required');
    fireEvent.click(signatureCheckbox);

    await waitFor(() => {
      expect(mockUpdateRequirements).toHaveBeenCalledWith({
        taskId: 'task-123',
        requirements: expect.objectContaining({
          signatureRequired: true,
        }),
      });
    });
  });

  it('collapses and expands sections', async () => {
    render(<TaskEnhancementsPanel task={mockTask} />, { wrapper });

    // Find the collapse button for subtasks section
    const subtasksSection = screen.getByText('Subtasks').parentElement;
    const collapseButton = subtasksSection?.querySelector('button');
    
    if (collapseButton) {
      fireEvent.click(collapseButton);
      
      await waitFor(() => {
        expect(screen.queryByText('Subtask 1')).not.toBeInTheDocument();
      });
      
      fireEvent.click(collapseButton);
      
      await waitFor(() => {
        expect(screen.getByText('Subtask 1')).toBeInTheDocument();
      });
    }
  });
});