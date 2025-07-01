import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DataImportService } from '../../../services/data-import.service';

// Mock all external dependencies
jest.mock('../../../lib/prisma');
jest.mock('../../../services/audit.service');
jest.mock('fs/promises');
jest.mock('csv-parse');
jest.mock('xlsx');

describe('DataImportService', () => {
  let service: DataImportService;

  beforeEach(() => {
    service = new DataImportService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance of DataImportService', () => {
      expect(service).toBeInstanceOf(DataImportService);
    });
  });

  describe('applyFieldMapping', () => {
    it('should apply simple field mapping', () => {
      const record = {
        'Product Name': 'Test Product',
        'Product Type': 'Hardware',
        'Serial #': '12345',
      };

      const mapping = {
        'Product Name': 'name',
        'Product Type': 'category',
        'Serial #': 'serialNumber',
      };

      const result = service['applyFieldMapping'](record, mapping);

      expect(result).toEqual({
        name: 'Test Product',
        category: 'Hardware',
        serialNumber: '12345',
      });
    });

    it('should apply complex mapping with transformation', () => {
      const record = {
        price: '1000',
        date: '01/15/2024',
        status: 'active',
      };

      const mapping = {
        price: {
          targetField: 'purchasePrice',
          transform: (value: string) => parseFloat(value),
        },
        date: {
          targetField: 'purchaseDate',
          transform: (value: string) => {
            const [month, day, year] = value.split('/');
            return `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`;
          },
        },
        status: {
          targetField: 'status',
          transform: (value: string) => value === 'active' ? 'OPERATIONAL' : 'MAINTENANCE',
        },
      };

      const result = service['applyFieldMapping'](record, mapping);

      expect(result).toEqual({
        purchasePrice: 1000,
        purchaseDate: '2024-01-15',
        status: 'OPERATIONAL',
      });
    });

    it('should handle required fields and default values', () => {
      const record = {
        name: 'Test',
      };

      const mapping = {
        name: 'name',
        category: {
          targetField: 'category',
          required: false,
          defaultValue: 'OTHER',
        },
        status: {
          targetField: 'status',
          defaultValue: 'OPERATIONAL',
        },
      };

      const result = service['applyFieldMapping'](record, mapping);

      expect(result).toEqual({
        name: 'Test',
        category: 'OTHER',
        status: 'OPERATIONAL',
      });
    });

    it('should throw error for missing required fields without default', () => {
      const record = {
        name: 'Test',
      };

      const mapping = {
        category: {
          targetField: 'category',
          required: true,
        },
      };

      expect(() => service['applyFieldMapping'](record, mapping))
        .toThrow("Required field 'category' is missing or empty");
    });
  });

  describe('sortLocationsByHierarchy', () => {
    it('should sort locations with parents after children', () => {
      const locations = [
        { id: '3', name: 'Grandchild', parentId: '2' },
        { id: '1', name: 'Root', parentId: null },
        { id: '2', name: 'Child', parentId: '1' },
      ];

      const sorted = service['sortLocationsByHierarchy'](locations);

      expect(sorted.map(l => l.id)).toEqual(['1', '2', '3']);
    });

    it('should handle multiple root locations', () => {
      const locations = [
        { id: '2', name: 'Root 2', parentId: null },
        { id: '3', name: 'Child of 1', parentId: '1' },
        { id: '1', name: 'Root 1', parentId: null },
      ];

      const sorted = service['sortLocationsByHierarchy'](locations);

      expect(sorted[0].parentId).toBeNull();
      expect(sorted[1].parentId).toBeNull();
      expect(sorted[2].parentId).toBe('1');
    });

    it('should handle circular dependencies gracefully', () => {
      const locations = [
        { id: '1', name: 'A', parentId: '2' },
        { id: '2', name: 'B', parentId: '1' },
      ];

      const sorted = service['sortLocationsByHierarchy'](locations);

      // Should include all locations even with circular dependency
      expect(sorted).toHaveLength(2);
    });
  });
});