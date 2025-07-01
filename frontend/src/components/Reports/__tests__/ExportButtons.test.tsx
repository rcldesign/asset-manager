import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButtons } from '../ExportButtons';
import { ReportFormat } from '@/types/reports';

describe('ExportButtons', () => {
  const mockOnExport = jest.fn();

  beforeEach(() => {
    mockOnExport.mockClear();
  });

  it('should render export button group', () => {
    render(<ExportButtons onExport={mockOnExport} />);
    
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '' })).toBeInTheDocument(); // Arrow button
  });

  it('should call onExport with PDF format when main button is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    await user.click(exportButton);
    
    expect(mockOnExport).toHaveBeenCalledWith(ReportFormat.PDF);
  });

  it('should open menu when arrow button is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const arrowButton = screen.getByRole('button', { name: '' });
    await user.click(arrowButton);
    
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Export as PDF')).toBeInTheDocument();
    expect(screen.getByText('Export as Excel')).toBeInTheDocument();
    expect(screen.getByText('Export as CSV')).toBeInTheDocument();
  });

  it('should show descriptions for each export option', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const arrowButton = screen.getByRole('button', { name: '' });
    await user.click(arrowButton);
    
    expect(screen.getByText('Best for printing and sharing')).toBeInTheDocument();
    expect(screen.getByText('Best for data analysis')).toBeInTheDocument();
    expect(screen.getByText('Best for data import')).toBeInTheDocument();
  });

  it('should call onExport with correct format when menu item is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const arrowButton = screen.getByRole('button', { name: '' });
    await user.click(arrowButton);
    
    // Click Excel option
    const excelOption = screen.getByText('Export as Excel');
    await user.click(excelOption);
    
    expect(mockOnExport).toHaveBeenCalledWith(ReportFormat.EXCEL);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(); // Menu should close
  });

  it('should close menu after selecting an option', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const arrowButton = screen.getByRole('button', { name: '' });
    await user.click(arrowButton);
    
    const csvOption = screen.getByText('Export as CSV');
    await user.click(csvOption);
    
    expect(mockOnExport).toHaveBeenCalledWith(ReportFormat.CSV);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('should show loading spinner when loading is true', () => {
    render(<ExportButtons onExport={mockOnExport} loading={true} />);
    
    const exportButton = screen.getByRole('button', { name: /export/i });
    const spinner = within(exportButton).getByRole('progressbar');
    
    expect(spinner).toBeInTheDocument();
  });

  it('should disable buttons when disabled is true', () => {
    render(<ExportButtons onExport={mockOnExport} disabled={true} />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should disable buttons when loading is true', () => {
    render(<ExportButtons onExport={mockOnExport} loading={true} />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('should disable menu items when loading is true', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} loading={true} />);
    
    // Force open menu by enabling the button temporarily
    const arrowButton = screen.getByRole('button', { name: '' });
    arrowButton.removeAttribute('disabled');
    await user.click(arrowButton);
    
    const menuItems = screen.getAllByRole('menuitem');
    menuItems.forEach(item => {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('should render with different variants', () => {
    const { rerender } = render(<ExportButtons onExport={mockOnExport} variant="contained" />);
    
    let buttonGroup = screen.getByRole('group');
    expect(buttonGroup).toHaveClass('MuiButtonGroup-contained');
    
    rerender(<ExportButtons onExport={mockOnExport} variant="text" />);
    buttonGroup = screen.getByRole('group');
    expect(buttonGroup).toHaveClass('MuiButtonGroup-text');
  });

  it('should render with different sizes', () => {
    const { rerender } = render(<ExportButtons onExport={mockOnExport} size="small" />);
    
    let buttonGroup = screen.getByRole('group');
    expect(buttonGroup).toHaveClass('MuiButtonGroup-sizeSmall');
    
    rerender(<ExportButtons onExport={mockOnExport} size="large" />);
    buttonGroup = screen.getByRole('group');
    expect(buttonGroup).toHaveClass('MuiButtonGroup-sizeLarge');
  });

  it('should render all export formats in menu', async () => {
    const user = userEvent.setup();
    render(<ExportButtons onExport={mockOnExport} />);
    
    const arrowButton = screen.getByRole('button', { name: '' });
    await user.click(arrowButton);
    
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(3);
    
    // Test each format
    const formats = [
      { text: 'Export as PDF', format: ReportFormat.PDF },
      { text: 'Export as Excel', format: ReportFormat.EXCEL },
      { text: 'Export as CSV', format: ReportFormat.CSV },
    ];
    
    for (const { text } of formats) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});