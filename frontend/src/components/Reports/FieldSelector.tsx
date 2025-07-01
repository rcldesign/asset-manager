import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Divider,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  Functions as FunctionsIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Field {
  field: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

interface FieldSelectorProps {
  entity: string;
  selectedFields: Field[];
  onFieldsChange: (fields: Field[]) => void;
}

// Mock available fields - in a real app, these would come from the API
const availableFieldsByEntity: Record<string, Field[]> = {
  asset: [
    { field: 'id', label: 'ID', type: 'string' },
    { field: 'barcode', label: 'Barcode', type: 'string' },
    { field: 'name', label: 'Name', type: 'string' },
    { field: 'description', label: 'Description', type: 'string' },
    { field: 'category', label: 'Category', type: 'enum' },
    { field: 'status', label: 'Status', type: 'enum' },
    { field: 'purchasePrice', label: 'Purchase Price', type: 'number' },
    { field: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { field: 'warrantyExpiry', label: 'Warranty Expiry', type: 'date' },
    { field: 'serialNumber', label: 'Serial Number', type: 'string' },
    { field: 'manufacturer', label: 'Manufacturer', type: 'string' },
    { field: 'location.name', label: 'Location', type: 'string' },
    { field: 'assignedUser.fullName', label: 'Assigned To', type: 'string' },
  ],
  task: [
    { field: 'id', label: 'ID', type: 'string' },
    { field: 'title', label: 'Title', type: 'string' },
    { field: 'description', label: 'Description', type: 'string' },
    { field: 'status', label: 'Status', type: 'enum' },
    { field: 'priority', label: 'Priority', type: 'enum' },
    { field: 'dueDate', label: 'Due Date', type: 'date' },
    { field: 'completedAt', label: 'Completed Date', type: 'date' },
    { field: 'estimatedCost', label: 'Estimated Cost', type: 'number' },
    { field: 'actualCost', label: 'Actual Cost', type: 'number' },
    { field: 'estimatedDuration', label: 'Estimated Hours', type: 'number' },
    { field: 'actualDuration', label: 'Actual Hours', type: 'number' },
    { field: 'asset.name', label: 'Asset', type: 'string' },
    { field: 'assignedUser.fullName', label: 'Assigned To', type: 'string' },
  ],
  user: [
    { field: 'id', label: 'ID', type: 'string' },
    { field: 'fullName', label: 'Full Name', type: 'string' },
    { field: 'email', label: 'Email', type: 'string' },
    { field: 'role', label: 'Role', type: 'enum' },
    { field: 'isActive', label: 'Active', type: 'boolean' },
    { field: 'createdAt', label: 'Created Date', type: 'date' },
  ],
};

function SortableFieldItem({ field, onToggle, onAggregateChange }: {
  field: Field;
  onToggle: () => void;
  onAggregateChange: (aggregate?: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.field });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={{
        bgcolor: 'background.paper',
        mb: 1,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <ListItemIcon {...attributes} {...listeners} sx={{ cursor: 'grab' }}>
        <DragIcon />
      </ListItemIcon>
      <ListItemText
        primary={field.label}
        secondary={
          field.type === 'number' && field.aggregate && (
            <Chip
              size="small"
              label={field.aggregate.toUpperCase()}
              icon={<FunctionsIcon />}
            />
          )
        }
      />
      <ListItemSecondaryAction>
        {field.type === 'number' && (
          <FormControl size="small" sx={{ mr: 2, minWidth: 100 }}>
            <Select
              value={field.aggregate || ''}
              onChange={(e) => onAggregateChange(e.target.value)}
              displayEmpty
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="sum">Sum</MenuItem>
              <MenuItem value="avg">Average</MenuItem>
              <MenuItem value="min">Min</MenuItem>
              <MenuItem value="max">Max</MenuItem>
              <MenuItem value="count">Count</MenuItem>
            </Select>
          </FormControl>
        )}
        <IconButton edge="end" onClick={onToggle}>
          <Checkbox checked edge="end" />
        </IconButton>
      </ListItemSecondaryAction>
    </ListItem>
  );
}

export const FieldSelector: React.FC<FieldSelectorProps> = ({
  entity,
  selectedFields,
  onFieldsChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const availableFields = availableFieldsByEntity[entity] || [];
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const selectedFieldIds = selectedFields.map((f) => f.field);
  const unselectedFields = availableFields.filter(
    (f) => !selectedFieldIds.includes(f.field) &&
    f.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleField = (field: Field) => {
    const isSelected = selectedFieldIds.includes(field.field);
    
    if (isSelected) {
      onFieldsChange(selectedFields.filter((f) => f.field !== field.field));
    } else {
      onFieldsChange([...selectedFields, field]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = selectedFields.findIndex((f) => f.field === active.id);
      const newIndex = selectedFields.findIndex((f) => f.field === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onFieldsChange(arrayMove(selectedFields, oldIndex, newIndex));
      }
    }
  };

  const handleAggregateChange = (fieldId: string, aggregate?: string) => {
    const updatedFields = selectedFields.map((f) =>
      f.field === fieldId
        ? { ...f, aggregate: aggregate as any }
        : f
    );
    onFieldsChange(updatedFields);
  };

  return (
    <Box sx={{ display: 'flex', gap: 3 }}>
      {/* Available Fields */}
      <Paper sx={{ flex: 1, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Available Fields
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Search fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        <List>
          {unselectedFields.map((field) => (
            <ListItem
              key={field.field}
              button
              onClick={() => handleToggleField(field)}
            >
              <ListItemIcon>
                <Checkbox checked={false} />
              </ListItemIcon>
              <ListItemText
                primary={field.label}
                secondary={field.type}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* Selected Fields */}
      <Paper sx={{ flex: 1, p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Selected Fields ({selectedFields.length})
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Drag to reorder. For numeric fields, you can apply aggregate functions.
        </Typography>
        
        {selectedFields.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No fields selected. Choose fields from the left panel.
          </Typography>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={selectedFields.map((f) => f.field)}
              strategy={verticalListSortingStrategy}
            >
              <List>
                {selectedFields.map((field) => (
                  <SortableFieldItem
                    key={field.field}
                    field={field}
                    onToggle={() => handleToggleField(field)}
                    onAggregateChange={(aggregate) => handleAggregateChange(field.field, aggregate)}
                  />
                ))}
              </List>
            </SortableContext>
          </DndContext>
        )}
      </Paper>
    </Box>
  );
};