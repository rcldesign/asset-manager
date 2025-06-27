import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  IconButton,
  Box,
  Typography,
  Tooltip,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import VisibilityIcon from '@mui/icons-material/Visibility';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { Asset, AssetStatus, AssetCategory } from '@/types';
import { format } from 'date-fns';

interface AssetTableProps {
  assets: Asset[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort: (field: string) => void;
  onViewAsset: (assetId: string) => void;
}

const statusColors: Record<AssetStatus, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  [AssetStatus.OPERATIONAL]: 'success',
  [AssetStatus.MAINTENANCE]: 'warning',
  [AssetStatus.REPAIR]: 'info',
  [AssetStatus.RETIRED]: 'error',
  [AssetStatus.DISPOSED]: 'default',
  [AssetStatus.LOST]: 'error',
};

const categoryIcons: Record<AssetCategory, string> = {
  [AssetCategory.HARDWARE]: '🖥️',
  [AssetCategory.SOFTWARE]: '💿',
  [AssetCategory.FURNITURE]: '🪑',
  [AssetCategory.VEHICLE]: '🚗',
  [AssetCategory.EQUIPMENT]: '🔧',
  [AssetCategory.PROPERTY]: '🏢',
  [AssetCategory.OTHER]: '📦',
};

export const AssetTable: React.FC<AssetTableProps> = ({
  assets,
  sortBy,
  sortOrder,
  onSort,
  onViewAsset,
}) => {
  const createSortHandler = (property: string) => () => {
    onSort(property);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <TableContainer>
      <Table sx={{ minWidth: 750 }} aria-labelledby="tableTitle">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>
              <TableSortLabel
                active={sortBy === 'barcode'}
                direction={sortBy === 'barcode' ? sortOrder : 'asc'}
                onClick={createSortHandler('barcode')}
              >
                Barcode
                {sortBy === 'barcode' ? (
                  <Box component="span" sx={visuallyHidden}>
                    {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                  </Box>
                ) : null}
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'name'}
                direction={sortBy === 'name' ? sortOrder : 'asc'}
                onClick={createSortHandler('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell>Category</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'status'}
                direction={sortBy === 'status' ? sortOrder : 'asc'}
                onClick={createSortHandler('status')}
              >
                Status
              </TableSortLabel>
            </TableCell>
            <TableCell>Location</TableCell>
            <TableCell align="right">
              <TableSortLabel
                active={sortBy === 'purchasePrice'}
                direction={sortBy === 'purchasePrice' ? sortOrder : 'asc'}
                onClick={createSortHandler('purchasePrice')}
              >
                Purchase Price
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'purchaseDate'}
                direction={sortBy === 'purchaseDate' ? sortOrder : 'asc'}
                onClick={createSortHandler('purchaseDate')}
              >
                Purchase Date
              </TableSortLabel>
            </TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} align="center">
                <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                  No assets found
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            assets.map((asset) => (
              <TableRow
                key={asset.id}
                hover
                sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
              >
                <TableCell padding="checkbox">
                  {asset.qrCode && (
                    <Tooltip title="Has QR Code">
                      <QrCode2Icon fontSize="small" color="action" />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell component="th" scope="row">
                  <Typography variant="body2" fontFamily="monospace">
                    {asset.barcode}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {categoryIcons[asset.category]} {asset.name}
                    </Typography>
                    {asset.description && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {asset.description.length > 50
                          ? `${asset.description.substring(0, 50)}...`
                          : asset.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    label={asset.category}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={asset.status}
                    size="small"
                    color={statusColors[asset.status]}
                  />
                </TableCell>
                <TableCell>
                  {asset.location ? (
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <LocationOnIcon fontSize="small" color="action" />
                      <Typography variant="body2">
                        {asset.location.name}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      -
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {formatCurrency(asset.purchasePrice)}
                </TableCell>
                <TableCell>
                  {formatDate(asset.purchaseDate)}
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={() => onViewAsset(asset.id)}
                    aria-label={`View asset ${asset.name}`}
                  >
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};