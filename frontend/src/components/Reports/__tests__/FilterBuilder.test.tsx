import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from '../FilterBuilder';

describe('FilterBuilder', () => {
  const mockFields = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'category', label: 'Category', type: 'select', options: ['Computer', 'Furniture', 'Equipment'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive', 'Maintenance'] },
    { key: 'purchasePrice', label: 'Purchase Price', type: 'number' },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { key: 'isWarrantyActive', label: 'Warranty Active', type: 'boolean' },
  ];

  const mockExistingFilters = [
    {
      id: '1',
      field: 'category',
      operator: 'equals',
      value: 'Computer',
    },
    {
      id: '2',
      field: 'purchasePrice',
      operator: 'greaterThan',
      value: 1000,
    },
  ];

  it('should render filter builder with available fields', () => {
    render(<FilterBuilder fields={mockFields} />);

    expect(screen.getByTestId('filter-builder')).toBeInTheDocument();
    expect(screen.getByTestId('add-filter-button')).toBeInTheDocument();
  });

  it('should render existing filters', () => {
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
      />
    );

    expect(screen.getByDisplayValue('Computer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
  });

  it('should add new filter when add button clicked', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        onFiltersChange={onFiltersChangeMock}
      />
    );

    const addButton = screen.getByTestId('add-filter-button');
    await user.click(addButton);

    expect(screen.getByTestId('filter-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('field-select-0')).toBeInTheDocument();
    expect(screen.getByTestId('operator-select-0')).toBeInTheDocument();
  });

  it('should remove filter when remove button clicked', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        onFiltersChange={onFiltersChangeMock}
      />
    );

    const removeButton = screen.getByTestId('remove-filter-1');
    await user.click(removeButton);

    expect(onFiltersChangeMock).toHaveBeenCalledWith([mockExistingFilters[1]]);
  });

  it('should update filter field when field selector changes', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={[{ id: '1', field: 'name', operator: 'equals', value: '' }]}
        onFiltersChange={onFiltersChangeMock}
      />
    );

    const fieldSelect = screen.getByTestId('field-select-0');
    await user.selectOptions(fieldSelect, 'category');

    expect(onFiltersChangeMock).toHaveBeenCalledWith([
      expect.objectContaining({
        field: 'category',
        operator: 'equals',
        value: '',
      }),
    ]);
  });

  it('should show appropriate operators for different field types', async () => {
    const user = userEvent.setup();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={[{ id: '1', field: 'purchasePrice', operator: 'equals', value: '' }]}
      />
    );

    const operatorSelect = screen.getByTestId('operator-select-0');
    
    // Number field should have numeric operators
    expect(screen.getByText('Greater than')).toBeInTheDocument();
    expect(screen.getByText('Less than')).toBeInTheDocument();
    expect(screen.getByText('Between')).toBeInTheDocument();
  });

  it('should render different input types based on field type', () => {
    const filters = [
      { id: '1', field: 'name', operator: 'contains', value: 'test' },
      { id: '2', field: 'category', operator: 'equals', value: 'Computer' },
      { id: '3', field: 'purchasePrice', operator: 'greaterThan', value: 1000 },
      { id: '4', field: 'purchaseDate', operator: 'equals', value: '2023-01-01' },
      { id: '5', field: 'isWarrantyActive', operator: 'equals', value: true },
    ];

    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={filters}
      />
    );

    // Text input for name
    expect(screen.getByTestId('value-input-0')).toHaveAttribute('type', 'text');
    
    // Select for category
    expect(screen.getByTestId('value-select-1')).toBeInTheDocument();
    
    // Number input for price
    expect(screen.getByTestId('value-input-2')).toHaveAttribute('type', 'number');
    
    // Date input for date
    expect(screen.getByTestId('value-input-3')).toHaveAttribute('type', 'date');
    
    // Checkbox for boolean
    expect(screen.getByTestId('value-checkbox-4')).toHaveAttribute('type', 'checkbox');
  });

  it('should handle between operator with two inputs', async () => {
    const user = userEvent.setup();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={[{ id: '1', field: 'purchasePrice', operator: 'between', value: [1000, 2000] }]}
      />
    );

    expect(screen.getByTestId('value-input-min-0')).toHaveValue(1000);
    expect(screen.getByTestId('value-input-max-0')).toHaveValue(2000);
  });

  it('should validate filter values', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={[{ id: '1', field: 'purchasePrice', operator: 'greaterThan', value: '' }]}
        onFiltersChange={onFiltersChangeMock}
        validateFilters={true}
      />
    );

    const valueInput = screen.getByTestId('value-input-0');
    await user.type(valueInput, 'invalid-number');

    expect(screen.getByTestId('filter-error-0')).toBeInTheDocument();
    expect(screen.getByText('Invalid number format')).toBeInTheDocument();
  });

  it('should clear all filters', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        onFiltersChange={onFiltersChangeMock}
        showClearAll={true}
      />
    );

    const clearAllButton = screen.getByTestId('clear-all-filters');
    await user.click(clearAllButton);

    expect(onFiltersChangeMock).toHaveBeenCalledWith([]);
  });

  it('should handle preset filters', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    const presets = [
      {
        id: 'active-computers',
        label: 'Active Computers',
        filters: [
          { field: 'category', operator: 'equals', value: 'Computer' },
          { field: 'status', operator: 'equals', value: 'Active' },
        ],
      },
      {
        id: 'expensive-items',
        label: 'Expensive Items',
        filters: [
          { field: 'purchasePrice', operator: 'greaterThan', value: 2000 },
        ],
      },
    ];

    render(
      <FilterBuilder 
        fields={mockFields} 
        onFiltersChange={onFiltersChangeMock}
        presets={presets}
      />
    );

    const presetSelect = screen.getByTestId('preset-select');
    await user.selectOptions(presetSelect, 'active-computers');

    expect(onFiltersChangeMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ field: 'category', value: 'Computer' }),
        expect.objectContaining({ field: 'status', value: 'Active' }),
      ])
    );
  });

  it('should save custom filter preset', async () => {
    const user = userEvent.setup();
    const onPresetSaveMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        onPresetSave={onPresetSaveMock}
        allowPresetSave={true}
      />
    );

    const saveButton = screen.getByTestId('save-preset-button');
    await user.click(saveButton);

    const nameInput = screen.getByTestId('preset-name-input');
    await user.type(nameInput, 'My Custom Filter');

    const confirmButton = screen.getByTestId('confirm-save-preset');
    await user.click(confirmButton);

    expect(onPresetSaveMock).toHaveBeenCalledWith('My Custom Filter', mockExistingFilters);
  });

  it('should handle complex nested filters with AND/OR logic', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        onFiltersChange={onFiltersChangeMock}
        supportLogicalOperators={true}
      />
    );

    const addGroupButton = screen.getByTestId('add-filter-group');
    await user.click(addGroupButton);

    expect(screen.getByTestId('filter-group-0')).toBeInTheDocument();
    expect(screen.getByTestId('logical-operator-select-0')).toBeInTheDocument();
  });

  it('should export filter configuration', () => {
    const onExportMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        onExport={onExportMock}
        exportable={true}
      />
    );

    const exportButton = screen.getByTestId('export-filters');
    fireEvent.click(exportButton);

    expect(onExportMock).toHaveBeenCalledWith({
      fields: mockFields,
      filters: mockExistingFilters,
    });
  });

  it('should import filter configuration', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        onFiltersChange={onFiltersChangeMock}
        importable={true}
      />
    );

    const importButton = screen.getByTestId('import-filters');
    await user.click(importButton);

    const fileInput = screen.getByTestId('filter-file-input');
    const file = new File(['{"filters":[]}'], 'filters.json', { type: 'application/json' });
    
    await user.upload(fileInput, file);

    expect(onFiltersChangeMock).toHaveBeenCalled();
  });

  it('should show filter summary', () => {
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        showSummary={true}
      />
    );

    expect(screen.getByTestId('filter-summary')).toBeInTheDocument();
    expect(screen.getByText('2 filters applied')).toBeInTheDocument();
    expect(screen.getByText('Category equals Computer')).toBeInTheDocument();
    expect(screen.getByText('Purchase Price greater than 1000')).toBeInTheDocument();
  });

  it('should handle filter search and suggestions', async () => {
    const user = userEvent.setup();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        searchable={true}
        suggestions={true}
      />
    );

    const searchInput = screen.getByTestId('filter-search');
    await user.type(searchInput, 'price');

    await waitFor(() => {
      expect(screen.getByTestId('field-suggestion-purchasePrice')).toBeInTheDocument();
    });
  });

  it('should handle keyboard shortcuts', async () => {
    const user = userEvent.setup();
    const onFiltersChangeMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        onFiltersChange={onFiltersChangeMock}
        keyboardShortcuts={true}
      />
    );

    // Test Ctrl+Enter to add filter
    await user.keyboard('{Control>}{Enter}{/Control}');
    
    expect(screen.getByTestId('filter-row-0')).toBeInTheDocument();
  });

  it('should render in compact mode', () => {
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={mockExistingFilters}
        compact={true}
      />
    );

    const filterBuilder = screen.getByTestId('filter-builder');
    expect(filterBuilder).toHaveClass('compact');
  });

  it('should handle real-time filter application', async () => {
    const user = userEvent.setup();
    const onFilterApplyMock = jest.fn();
    
    render(
      <FilterBuilder 
        fields={mockFields} 
        filters={[{ id: '1', field: 'name', operator: 'contains', value: '' }]}
        onFilterApply={onFilterApplyMock}
        realTimeFiltering={true}
      />
    );

    const valueInput = screen.getByTestId('value-input-0');
    await user.type(valueInput, 'laptop');

    await waitFor(() => {
      expect(onFilterApplyMock).toHaveBeenCalledWith([
        expect.objectContaining({ value: 'laptop' }),
      ]);
    });
  });
});