import React from 'react';
import { Pagination as MuiPagination, Box } from '@mui/material';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
}) => {
  const handleChange = (_: React.ChangeEvent<unknown>, value: number) => {
    onPageChange(value);
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <Box display="flex" justifyContent="center">
      <MuiPagination
        count={totalPages}
        page={page}
        onChange={handleChange}
        color="primary"
        showFirstButton
        showLastButton
        siblingCount={1}
        boundaryCount={1}
      />
    </Box>
  );
};