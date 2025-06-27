#!/usr/bin/env ts-node

/**
 * Component Generator Script
 * Quickly scaffold new React components with tests, stories, and hooks
 * 
 * Usage: npm run generate:component ComponentName [options]
 * Example: npm run generate:component LocationPicker --dir=locations --hook
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { program } from 'commander';

interface ComponentOptions {
  dir?: string;
  hook?: boolean;
  story?: boolean;
  api?: boolean;
}

const componentTemplate = (name: string) => `import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { use${name} } from '@/hooks/use-${name.toLowerCase()}';

export interface ${name}Props {
  // Define component props
  onSelect?: (item: any) => void;
  disabled?: boolean;
}

export const ${name}: React.FC<${name}Props> = ({
  onSelect,
  disabled = false,
}) => {
  const { data, loading, error } = use${name}();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        Error loading data: {error.message}
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        ${name}
      </Typography>
      
      <Box>
        {/* Component implementation */}
        <Button
          variant="contained"
          disabled={disabled}
          onClick={() => onSelect?.(data)}
        >
          Select
        </Button>
      </Box>
    </Paper>
  );
};`;

const testTemplate = (name: string) => `import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ${name} } from './${name}';
import { use${name} } from '@/hooks/use-${name.toLowerCase()}';

// Mock the hook
jest.mock('@/hooks/use-${name.toLowerCase()}');

const mockUse${name} = use${name} as jest.MockedFunction<typeof use${name}>;

describe('${name}', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state', () => {
    mockUse${name}.mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
    } as any);

    render(<${name} />, { wrapper });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockUse${name}.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Test error'),
    } as any);

    render(<${name} />, { wrapper });

    expect(screen.getByText(/Error loading data: Test error/)).toBeInTheDocument();
  });

  it('should render data and handle selection', async () => {
    const mockData = { id: '1', name: 'Test Item' };
    const onSelect = jest.fn();

    mockUse${name}.mockReturnValue({
      data: mockData,
      loading: false,
      error: null,
    } as any);

    render(<${name} onSelect={onSelect} />, { wrapper });

    const selectButton = screen.getByText('Select');
    fireEvent.click(selectButton);

    expect(onSelect).toHaveBeenCalledWith(mockData);
  });

  it('should disable interactions when disabled prop is true', () => {
    mockUse${name}.mockReturnValue({
      data: { id: '1', name: 'Test Item' },
      loading: false,
      error: null,
    } as any);

    render(<${name} disabled />, { wrapper });

    const selectButton = screen.getByText('Select');
    expect(selectButton).toBeDisabled();
  });
});`;

const storyTemplate = (name: string) => `import type { Meta, StoryObj } from '@storybook/react';
import { ${name} } from './${name}';

const meta = {
  title: 'Components/${name}',
  component: ${name},
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ${name}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const WithCallback: Story = {
  args: {
    onSelect: (item) => {
      console.log('Selected:', item);
      alert(\`Selected: \${JSON.stringify(item)}\`);
    },
  },
};`;

const hookTemplate = (name: string) => `import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ${name.toLowerCase()}Api } from '@/api/${name.toLowerCase()}-api';
import { ${name}Filters } from '@/types';

interface Use${name}Options {
  filters?: ${name}Filters;
  enabled?: boolean;
}

export function use${name}(options?: Use${name}Options) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => ['${name.toLowerCase()}', { page, pageSize, ...options?.filters }],
    [page, pageSize, options?.filters]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => ${name.toLowerCase()}Api.list({
      page,
      pageSize,
      ...options?.filters,
    }),
    enabled: options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const create${name} = useMutation({
    mutationFn: ${name.toLowerCase()}Api.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['${name.toLowerCase()}'] });
    },
  });

  const update${name} = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      ${name.toLowerCase()}Api.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['${name.toLowerCase()}'] });
    },
  });

  const delete${name} = useMutation({
    mutationFn: ${name.toLowerCase()}Api.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['${name.toLowerCase()}'] });
    },
  });

  return {
    data: data?.data || [],
    total: data?.total || 0,
    page: data?.page || page,
    pageSize: data?.pageSize || pageSize,
    loading: isLoading,
    error,
    setPage,
    setPageSize,
    refetch,
    create${name},
    update${name},
    delete${name},
  };
}`;

const apiTemplate = (name: string) => `import { BaseApiService } from './base.api';
import { ${name}, ${name}CreateDTO, ${name}UpdateDTO } from '@/types';

class ${name}ApiService extends BaseApiService<${name}, ${name}CreateDTO, ${name}UpdateDTO> {
  protected readonly endpoint = '/${name.toLowerCase()}s';

  // Add any specific methods for this API
}

export const ${name.toLowerCase()}Api = new ${name}ApiService();`;

const indexTemplate = (name: string) => `export { ${name} } from './${name}';
export type { ${name}Props } from './${name}';`;

function generateComponent(name: string, options: ComponentOptions) {
  const baseDir = join(process.cwd(), 'src/components', options.dir || '');
  const componentDir = join(baseDir, name);

  // Create directories
  if (!existsSync(componentDir)) {
    mkdirSync(componentDir, { recursive: true });
  }

  // Generate component file
  const componentPath = join(componentDir, `${name}.tsx`);
  if (!existsSync(componentPath)) {
    writeFileSync(componentPath, componentTemplate(name));
    console.log(`✅ Created component: ${componentPath}`);
  } else {
    console.log(`⚠️  Component already exists: ${componentPath}`);
  }

  // Generate test file
  const testPath = join(componentDir, `${name}.test.tsx`);
  if (!existsSync(testPath)) {
    writeFileSync(testPath, testTemplate(name));
    console.log(`✅ Created test: ${testPath}`);
  }

  // Generate index file
  const indexPath = join(componentDir, 'index.ts');
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, indexTemplate(name));
    console.log(`✅ Created index: ${indexPath}`);
  }

  // Generate story file if requested
  if (options.story) {
    const storyPath = join(componentDir, `${name}.stories.tsx`);
    if (!existsSync(storyPath)) {
      writeFileSync(storyPath, storyTemplate(name));
      console.log(`✅ Created story: ${storyPath}`);
    }
  }

  // Generate hook if requested
  if (options.hook) {
    const hooksDir = join(process.cwd(), 'src/hooks');
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
    }
    
    const hookPath = join(hooksDir, `use-${name.toLowerCase()}.ts`);
    if (!existsSync(hookPath)) {
      writeFileSync(hookPath, hookTemplate(name));
      console.log(`✅ Created hook: ${hookPath}`);
    }
  }

  // Generate API service if requested
  if (options.api) {
    const apiDir = join(process.cwd(), 'src/api');
    if (!existsSync(apiDir)) {
      mkdirSync(apiDir, { recursive: true });
    }
    
    const apiPath = join(apiDir, `${name.toLowerCase()}-api.ts`);
    if (!existsSync(apiPath)) {
      writeFileSync(apiPath, apiTemplate(name));
      console.log(`✅ Created API service: ${apiPath}`);
    }
  }

  console.log(`\n🎉 Component ${name} generated successfully!`);
  console.log('\n📝 Next steps:');
  console.log(`1. Update the component implementation in ${componentPath}`);
  console.log(`2. Add proper TypeScript types in @/types`);
  console.log(`3. Run tests: npm test ${name}`);
  if (options.hook) {
    console.log(`4. Implement the API calls in the hook`);
  }
}

// CLI setup
program
  .name('generate-component')
  .description('Generate React component with tests and optional extras')
  .argument('<name>', 'Component name (PascalCase)')
  .option('-d, --dir <dir>', 'Subdirectory within components folder')
  .option('-h, --hook', 'Generate custom hook')
  .option('-s, --story', 'Generate Storybook story')
  .option('-a, --api', 'Generate API service')
  .action((name: string, options: ComponentOptions) => {
    if (!/^[A-Z][a-zA-Z]*$/.test(name)) {
      console.error('❌ Component name must be in PascalCase (e.g., MyComponent)');
      process.exit(1);
    }
    
    generateComponent(name, options);
  });

program.parse();

// Also export for programmatic use
export { generateComponent };