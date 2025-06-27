import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Divider,
  Link,
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CategoryIcon from '@mui/icons-material/Category';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import LinkIcon from '@mui/icons-material/Link';
import { Asset } from '@/types';
import { format } from 'date-fns';

interface AssetDetailsTabProps {
  asset: Asset;
}

export const AssetDetailsTab: React.FC<AssetDetailsTabProps> = ({ asset }) => {
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

  const categoryIcons = {
    HARDWARE: '🖥️',
    SOFTWARE: '💿',
    FURNITURE: '🪑',
    VEHICLE: '🚗',
    EQUIPMENT: '🔧',
    PROPERTY: '🏢',
    OTHER: '📦',
  };

  return (
    <Box>
      <Stack spacing={3}>
        {/* Basic Information */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Basic Information
          </Typography>
          <Stack spacing={2}>
            {asset.description && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Description
                </Typography>
                <Typography>{asset.description}</Typography>
              </Box>
            )}
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Category
              </Typography>
              <Chip
                icon={<Typography>{categoryIcons[asset.category]}</Typography>}
                label={asset.category}
                variant="outlined"
              />
            </Box>
            {asset.serialNumber && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Serial Number
                </Typography>
                <Typography fontFamily="monospace">{asset.serialNumber}</Typography>
              </Box>
            )}
            {asset.modelNumber && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Model Number
                </Typography>
                <Typography>{asset.modelNumber}</Typography>
              </Box>
            )}
            {asset.manufacturer && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Manufacturer
                </Typography>
                <Typography>{asset.manufacturer}</Typography>
              </Box>
            )}
          </Stack>
        </Box>

        <Divider />

        {/* Location Information */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Location
          </Typography>
          {asset.location ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <LocationOnIcon color="action" />
              <Typography>{asset.location.name}</Typography>
              {asset.location.path && (
                <Typography variant="body2" color="text.secondary">
                  ({asset.location.path})
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography color="text.secondary">No location assigned</Typography>
          )}
        </Box>

        <Divider />

        {/* Purchase Information */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Purchase Information
          </Typography>
          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Purchase Date
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <CalendarTodayIcon fontSize="small" color="action" />
                <Typography>{formatDate(asset.purchaseDate)}</Typography>
              </Stack>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Purchase Price
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <AttachMoneyIcon fontSize="small" color="action" />
                <Typography>{formatCurrency(asset.purchasePrice)}</Typography>
              </Stack>
            </Box>
            {asset.warrantyExpiry && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Warranty Expiry
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <WarningAmberIcon 
                    fontSize="small" 
                    color={new Date(asset.warrantyExpiry) > new Date() ? 'success' : 'error'} 
                  />
                  <Typography>{formatDate(asset.warrantyExpiry)}</Typography>
                  {new Date(asset.warrantyExpiry) > new Date() && (
                    <Chip label="Active" size="small" color="success" />
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>

        {/* Additional Information */}
        {(asset.qrCode || asset.link || asset.tags.length > 0) && (
          <>
            <Divider />
            <Box>
              <Typography variant="h6" gutterBottom>
                Additional Information
              </Typography>
              <Stack spacing={2}>
                {asset.qrCode && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      QR Code
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <QrCode2Icon color="action" />
                      <Typography fontFamily="monospace">{asset.qrCode}</Typography>
                    </Stack>
                  </Box>
                )}
                {asset.link && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Link
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinkIcon color="action" />
                      <Link href={asset.link} target="_blank" rel="noopener">
                        {asset.link}
                      </Link>
                    </Stack>
                  </Box>
                )}
                {asset.tags.length > 0 && (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Tags
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {asset.tags.map((tag, index) => (
                        <Chip key={index} label={tag} size="small" />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </Box>
          </>
        )}

        {/* Custom Fields */}
        {asset.customFields && Object.keys(asset.customFields).length > 0 && (
          <>
            <Divider />
            <Box>
              <Typography variant="h6" gutterBottom>
                Custom Fields
              </Typography>
              <Stack spacing={2}>
                {Object.entries(asset.customFields).map(([key, value]) => (
                  <Box key={key}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {key}
                    </Typography>
                    <Typography>
                      {value?.toString() || '-'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}

        {/* Template Information */}
        {asset.assetTemplate && (
          <>
            <Divider />
            <Box>
              <Typography variant="h6" gutterBottom>
                Template
              </Typography>
              <Chip
                icon={<CategoryIcon />}
                label={asset.assetTemplate.name}
                variant="outlined"
              />
            </Box>
          </>
        )}

        {/* Metadata */}
        <Divider />
        <Box>
          <Typography variant="h6" gutterBottom>
            System Information
          </Typography>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Created: {formatDate(asset.createdAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last Updated: {formatDate(asset.updatedAt)}
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};