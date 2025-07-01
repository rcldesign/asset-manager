import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportTable } from '../ReportTable';

describe('ReportTable', () => {
  const mockData = [
    {
      id: '1',
      name: 'Laptop-001',
      category: 'Computer',
      status: 'Active',
      location: 'Office A',
      purchasePrice: 1500,
      purchaseDate: '2023-01-15',
    },
    {
      id: '2',
      name: 'Desk-002',
      category: 'Furniture',
      status: 'Active',
      location: 'Office B',
      purchasePrice: 300,
      purchaseDate: '2023-02-20',
    },
    {
      id: '3',
      name: 'Server-003',
      category: 'Equipment',
      status: 'Maintenance',
      location: 'Data Center',
      purchasePrice: 5000,
      purchaseDate: '2023-03-10',
    },
  ];

  const mockColumns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'status', label: 'Status', sortable: false },
    { key: 'location', label: 'Location', sortable: true },
    { key: 'purchasePrice', label: 'Price', sortable: true, type: 'currency' },
    { key: 'purchaseDate', label: 'Purchase Date', sortable: true, type: 'date' },
  ];

  it('should render table with data and columns', () => {
    render(<ReportTable data={mockData} columns={mockColumns} />);

    // Check headers
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Category')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Check data
    expect(screen.getByText('Laptop-001')).toBeInTheDocument();
    expect(screen.getByText('Computer')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should render loading state', () => {
    render(<ReportTable data={[]} columns={mockColumns} loading={true} />);

    expect(screen.getByTestId('table-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('table-skeleton-row')).toHaveLength(5);
  });

  it('should render empty state when no data', () => {
    render(<ReportTable data={[]} columns={mockColumns} />);

    expect(screen.getByTestId('table-empty')).toBeInTheDocument();
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('should render error state', () => {
    const errorMessage = 'Failed to load report data';
    render(<ReportTable data={[]} columns={mockColumns} error={errorMessage} />);

    expect(screen.getByTestId('table-error')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should handle column sorting', () => {
    const onSortMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        onSort={onSortMock}
      />
    );

    const nameHeader = screen.getByTestId('column-header-name');
    fireEvent.click(nameHeader);

    expect(onSortMock).toHaveBeenCalledWith('name', 'asc');

    // Click again for descending sort
    fireEvent.click(nameHeader);
    expect(onSortMock).toHaveBeenCalledWith('name', 'desc');
  });

  it('should disable sorting for non-sortable columns', () => {
    render(<ReportTable data={mockData} columns={mockColumns} />);

    const statusHeader = screen.getByTestId('column-header-status');
    expect(statusHeader).not.toHaveClass('sortable');
    expect(statusHeader.querySelector('.sort-icon')).toBeNull();
  });

  it('should format currency values', () => {
    render(<ReportTable data={mockData} columns={mockColumns} />);

    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
  });

  it('should format date values', () => {
    render(<ReportTable data={mockData} columns={mockColumns} />);

    expect(screen.getByText('Jan 15, 2023')).toBeInTheDocument();
    expect(screen.getByText('Feb 20, 2023')).toBeInTheDocument();
    expect(screen.getByText('Mar 10, 2023')).toBeInTheDocument();
  });

  it('should handle row selection', () => {
    const onRowSelectMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        selectable={true}
        onRowSelect={onRowSelectMock}
      />
    );

    const firstRowCheckbox = screen.getByTestId('row-checkbox-1');
    fireEvent.click(firstRowCheckbox);

    expect(onRowSelectMock).toHaveBeenCalledWith(['1']);
  });

  it('should handle select all functionality', () => {
    const onRowSelectMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        selectable={true}
        onRowSelect={onRowSelectMock}
      />
    );

    const selectAllCheckbox = screen.getByTestId('select-all-checkbox');
    fireEvent.click(selectAllCheckbox);

    expect(onRowSelectMock).toHaveBeenCalledWith(['1', '2', '3']);
  });

  it('should handle pagination', () => {
    const onPageChangeMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        pagination={{
          page: 1,
          pageSize: 2,
          total: 10,
        }}
        onPageChange={onPageChangeMock}
      />
    );

    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    
    const nextButton = screen.getByTestId('next-page-button');
    fireEvent.click(nextButton);

    expect(onPageChangeMock).toHaveBeenCalledWith(2);
  });

  it('should handle row clicks', () => {
    const onRowClickMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        onRowClick={onRowClickMock}
      />
    );

    const firstRow = screen.getByTestId('table-row-1');
    fireEvent.click(firstRow);

    expect(onRowClickMock).toHaveBeenCalledWith(mockData[0]);
  });

  it('should render custom cell renderers', () => {
    const customColumns = [
      ...mockColumns,
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => (
          <button data-testid={`action-button-${row.id}`}>
            Edit {row.name}
          </button>
        ),
      },
    ];

    render(<ReportTable data={mockData} columns={customColumns} />);

    expect(screen.getByTestId('action-button-1')).toBeInTheDocument();
    expect(screen.getByText('Edit Laptop-001')).toBeInTheDocument();
  });

  it('should apply row highlighting based on conditions', () => {
    const rowClassifier = (row: any) => {
      if (row.status === 'Maintenance') return 'warning';
      if (row.purchasePrice > 2000) return 'expensive';
      return '';
    };

    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        rowClassifier={rowClassifier}
      />
    );

    const maintenanceRow = screen.getByTestId('table-row-3');
    expect(maintenanceRow).toHaveClass('warning');

    const expensiveRow = screen.getByTestId('table-row-3');
    expect(expensiveRow).toHaveClass('expensive');
  });

  it('should handle filtering', () => {
    const { rerender } = render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        filters={{ category: 'Computer' }}
      />
    );

    // Only computer should be visible
    expect(screen.getByText('Laptop-001')).toBeInTheDocument();
    expect(screen.queryByText('Desk-002')).not.toBeInTheDocument();

    // Update filters
    rerender(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        filters={{ status: 'Active' }}
      />
    );

    expect(screen.getByText('Laptop-001')).toBeInTheDocument();
    expect(screen.getByText('Desk-002')).toBeInTheDocument();
    expect(screen.queryByText('Server-003')).not.toBeInTheDocument();
  });

  it('should render with sticky headers', () => {
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        stickyHeader={true}
      />
    );

    const tableHeader = screen.getByTestId('table-header');
    expect(tableHeader).toHaveClass('sticky');
  });

  it('should handle keyboard navigation', () => {
    const onRowClickMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        onRowClick={onRowClickMock}
        keyboardNavigation={true}
      />
    );

    const firstRow = screen.getByTestId('table-row-1');
    
    // Focus the row
    firstRow.focus();
    expect(firstRow).toHaveFocus();

    // Press Enter key
    fireEvent.keyDown(firstRow, { key: 'Enter', code: 'Enter' });
    expect(onRowClickMock).toHaveBeenCalledWith(mockData[0]);

    // Test arrow key navigation
    fireEvent.keyDown(firstRow, { key: 'ArrowDown', code: 'ArrowDown' });
    const secondRow = screen.getByTestId('table-row-2');
    expect(secondRow).toHaveFocus();
  });

  it('should handle column resizing', () => {
    const onColumnResizeMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        resizable={true}
        onColumnResize={onColumnResizeMock}
      />
    );

    const resizeHandle = screen.getByTestId('resize-handle-name');
    
    fireEvent.mouseDown(resizeHandle, { clientX: 100 });
    fireEvent.mouseMove(document, { clientX: 150 });
    fireEvent.mouseUp(document);

    expect(onColumnResizeMock).toHaveBeenCalled();
  });

  it('should render with column groups', () => {
    const groupedColumns = [
      {
        label: 'Basic Info',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
        ],
      },
      {
        label: 'Financial',
        columns: [
          { key: 'purchasePrice', label: 'Price', type: 'currency' },
          { key: 'purchaseDate', label: 'Date', type: 'date' },
        ],
      },
    ];

    render(
      <ReportTable 
        data={mockData} 
        columnGroups={groupedColumns}
      />
    );

    expect(screen.getByText('Basic Info')).toBeInTheDocument();
    expect(screen.getByText('Financial')).toBeInTheDocument();
  });

  it('should handle data export', () => {
    const onExportMock = jest.fn();
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        exportable={true}
        onExport={onExportMock}
      />
    );

    const exportButton = screen.getByTestId('export-button');
    fireEvent.click(exportButton);

    expect(onExportMock).toHaveBeenCalledWith(mockData, mockColumns);
  });

  it('should render footer with summary information', () => {
    const footerData = {
      totalRows: mockData.length,
      totalValue: mockData.reduce((sum, item) => sum + item.purchasePrice, 0),
    };

    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        footer={footerData}
      />
    );

    expect(screen.getByTestId('table-footer')).toBeInTheDocument();
    expect(screen.getByText('Total: 3 items')).toBeInTheDocument();
    expect(screen.getByText('$6,800.00')).toBeInTheDocument();
  });

  it('should handle virtual scrolling for large datasets', async () => {
    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      id: i.toString(),
      name: `Item ${i}`,
      category: 'Test',
      status: 'Active',
      location: 'Location',
      purchasePrice: 100 * i,
      purchaseDate: '2023-01-01',
    }));

    render(
      <ReportTable 
        data={largeData} 
        columns={mockColumns} 
        virtualScrolling={true}
        rowHeight={50}
      />
    );

    const virtualTable = screen.getByTestId('virtual-table');
    expect(virtualTable).toBeInTheDocument();

    // Only a subset of rows should be rendered
    const visibleRows = screen.getAllByTestId(/table-row-/);
    expect(visibleRows.length).toBeLessThan(largeData.length);
  });

  it('should render with search functionality', () => {
    render(
      <ReportTable 
        data={mockData} 
        columns={mockColumns} 
        searchable={true}
      />
    );

    const searchInput = screen.getByTestId('table-search');
    fireEvent.change(searchInput, { target: { value: 'Laptop' } });

    expect(screen.getByText('Laptop-001')).toBeInTheDocument();
    expect(screen.queryByText('Desk-002')).not.toBeInTheDocument();
  });
});