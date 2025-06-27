'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CloneIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { AssetTemplate } from '@/types';
import { Pagination } from '@/components/ui/Pagination';

interface AssetTemplateTableProps {
  templates: AssetTemplate[];
  loading?: boolean;
  pagination: {
    total: number;
    page: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  onEdit: (template: AssetTemplate) => void;
  onDelete: (template: AssetTemplate) => void;
  onClone: (template: AssetTemplate) => void;
  onView?: (template: AssetTemplate) => void;
}

export function AssetTemplateTable({
  templates,
  loading = false,
  pagination,
  onEdit,
  onDelete,
  onClone,
  onView,
}: AssetTemplateTableProps) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
      HARDWARE: 'primary',
      SOFTWARE: 'secondary',
      FURNITURE: 'success',
      VEHICLE: 'warning',
      EQUIPMENT: 'info',
      PROPERTY: 'error',
      OTHER: 'primary' as const,
    };
    return colors[category] || 'primary';
  };

  const getFieldsCount = (template: AssetTemplate) => {
    const defaultCount = Object.keys(template.defaultFields || {}).length;
    const customCount = Object.keys(template.customFields || {}).length;
    return { defaultCount, customCount, total: defaultCount + customCount };
  };

  if (loading && templates.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Fields</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Updated</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((template) => {
              const fieldsCount = getFieldsCount(template);
              
              return (
                <TableRow key={template.id} hover>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {template.name}
                      </Typography>
                      {template.description && (
                        <Typography variant="caption" color="text.secondary">
                          {template.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Chip
                      label={template.category}
                      color={getCategoryColor(template.category)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  
                  <TableCell>
                    <Box>
                      <Typography variant="body2">
                        {fieldsCount.total} field{fieldsCount.total !== 1 ? 's' : ''}
                      </Typography>
                      {fieldsCount.total > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {fieldsCount.defaultCount} default
                          {fieldsCount.customCount > 0 && `, ${fieldsCount.customCount} custom`}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Chip
                      label={template.isActive ? 'Active' : 'Inactive'}
                      color={template.isActive ? 'success' : 'default'}
                      size="small"
                      variant={template.isActive ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(template.createdAt), 'MMM d, yyyy')}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(template.updatedAt), 'MMM d, yyyy')}
                    </Typography>
                  </TableCell>
                  
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      {onView && (
                        <Tooltip title="View template details">
                          <IconButton
                            size="small"
                            onClick={() => onView(template)}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      
                      <Tooltip title="Clone template">
                        <IconButton
                          size="small"
                          onClick={() => onClone(template)}
                          color="info"
                        >
                          <CloneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Edit template">
                        <IconButton
                          size="small"
                          onClick={() => onEdit(template)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Delete template">
                        <IconButton
                          size="small"
                          onClick={() => onDelete(template)}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && (
        <Box display="flex" justifyContent="center" p={2}>
          <CircularProgress size={20} />
        </Box>
      )}

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Pagination
          page={pagination.page}
          totalPages={Math.ceil(pagination.total / pagination.limit)}
          onPageChange={pagination.onPageChange}
        />
      </Box>
    </Box>
  );
}