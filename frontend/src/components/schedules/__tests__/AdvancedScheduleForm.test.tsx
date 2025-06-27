import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import AdvancedScheduleForm from '../AdvancedScheduleForm';
import type { AdvancedSchedule } from '../../../api/advanced-schedules-api';

// Mock the hooks
vi.mock('../../../hooks/use-advanced-schedules', () => ({
  useCreateAdvancedSchedule: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useUpdateAdvancedSchedule: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
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

describe('AdvancedScheduleForm', () => {
  const mockAsset = {
    id: 'asset-123',
    name: 'Test Asset',
  };

  const mockOnSuccess = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with all fields', () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    expect(screen.getByLabelText(/Schedule Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Schedule Type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Task Template/i)).toBeInTheDocument();
    expect(screen.getByText(/Save Schedule/i)).toBeInTheDocument();
  });

  it('shows seasonal fields when SEASONAL type is selected', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const typeSelect = screen.getByLabelText(/Schedule Type/i);
    fireEvent.mouseDown(typeSelect);
    
    const seasonalOption = await screen.findByText('Seasonal');
    fireEvent.click(seasonalOption);

    await waitFor(() => {
      expect(screen.getByText(/Select Seasons/i)).toBeInTheDocument();
    });
  });

  it('shows monthly fields when MONTHLY type is selected', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const typeSelect = screen.getByLabelText(/Schedule Type/i);
    fireEvent.mouseDown(typeSelect);
    
    const monthlyOption = await screen.findByText('Monthly on Specific Day');
    fireEvent.click(monthlyOption);

    await waitFor(() => {
      expect(screen.getByLabelText(/Day of Month/i)).toBeInTheDocument();
    });
  });

  it('shows usage fields when USAGE_BASED type is selected', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const typeSelect = screen.getByLabelText(/Schedule Type/i);
    fireEvent.mouseDown(typeSelect);
    
    const usageOption = await screen.findByText('Usage-Based');
    fireEvent.click(usageOption);

    await waitFor(() => {
      expect(screen.getByLabelText(/Usage Threshold/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Counter Type/i)).toBeInTheDocument();
    });
  });

  it('validates required fields before submission', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const saveButton = screen.getByText(/Save Schedule/i);
    fireEvent.click(saveButton);

    // Form should not be submitted without required fields
    await waitFor(() => {
      expect(mockOnSuccess).not.toHaveBeenCalled();
    });
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const cancelButton = screen.getByText(/Cancel/i);
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('handles business days only toggle', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const businessDaysToggle = screen.getByLabelText(/Business Days Only/i);
    fireEvent.click(businessDaysToggle);

    expect(businessDaysToggle).toBeChecked();
  });

  it('allows adding blackout dates', async () => {
    render(
      <AdvancedScheduleForm
        asset={mockAsset}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />,
      { wrapper }
    );

    const addBlackoutButton = screen.getByText(/Add Blackout Date/i);
    fireEvent.click(addBlackoutButton);

    // Should show date picker or input
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Select date/i)).toBeInTheDocument();
    });
  });
});