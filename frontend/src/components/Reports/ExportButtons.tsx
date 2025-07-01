import React, { useState } from 'react';
import {
  Button,
  ButtonGroup,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  FileDownload as DownloadIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Description as CsvIcon,
  ArrowDropDown as ArrowDropDownIcon,
} from '@mui/icons-material';
import { ReportFormat } from '@/types/reports';

interface ExportButtonsProps {
  onExport: (format: ReportFormat) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'text' | 'outlined' | 'contained';
  size?: 'small' | 'medium' | 'large';
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExport,
  loading = false,
  disabled = false,
  variant = 'outlined',
  size = 'medium',
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleExport = (format: ReportFormat) => {
    onExport(format);
    handleClose();
  };

  const exportOptions = [
    {
      format: ReportFormat.PDF,
      label: 'Export as PDF',
      icon: <PdfIcon />,
      description: 'Best for printing and sharing',
    },
    {
      format: ReportFormat.EXCEL,
      label: 'Export as Excel',
      icon: <ExcelIcon />,
      description: 'Best for data analysis',
    },
    {
      format: ReportFormat.CSV,
      label: 'Export as CSV',
      icon: <CsvIcon />,
      description: 'Best for data import',
    },
  ];

  return (
    <>
      <ButtonGroup variant={variant} size={size} disabled={disabled || loading}>
        <Button
          startIcon={loading ? <CircularProgress size={16} /> : <DownloadIcon />}
          onClick={() => handleExport(ReportFormat.PDF)}
        >
          Export
        </Button>
        <Button
          size="small"
          onClick={handleClick}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        {exportOptions.map((option) => (
          <MenuItem
            key={option.format}
            onClick={() => handleExport(option.format)}
            disabled={loading}
          >
            <ListItemIcon>{option.icon}</ListItemIcon>
            <ListItemText
              primary={option.label}
              secondary={option.description}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};