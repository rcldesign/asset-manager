#!/usr/bin/env node
import axios from 'axios';
import { generateTokens } from '../src/utils/auth';

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testTaskAPI() {
  console.log('Testing Task API endpoints...\n');

  // Generate a test token
  const tokens = generateTokens({
    userId: 'test-user-id',
    organizationId: 'test-org-id',
    role: 'MANAGER',
  });

  const headers = {
    'Authorization': `Bearer ${tokens.accessToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // Test 1: Create a task
    console.log('1. Testing POST /api/tasks...');
    const createResponse = await axios.post(
      `${API_URL}/api/tasks`,
      {
        title: 'Test Task from Script',
        description: 'This is a test task',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        priority: 'HIGH',
      },
      { headers }
    );
    console.log('✓ Task created:', createResponse.data.id);

    const taskId = createResponse.data.id;

    // Test 2: Get task by ID
    console.log('\n2. Testing GET /api/tasks/:id...');
    const getResponse = await axios.get(
      `${API_URL}/api/tasks/${taskId}`,
      { headers }
    );
    console.log('✓ Task retrieved:', getResponse.data.title);

    // Test 3: List tasks
    console.log('\n3. Testing GET /api/tasks...');
    const listResponse = await axios.get(
      `${API_URL}/api/tasks`,
      { headers }
    );
    console.log('✓ Tasks listed:', listResponse.data.total, 'total');

    // Test 4: Update task
    console.log('\n4. Testing PUT /api/tasks/:id...');
    const updateResponse = await axios.put(
      `${API_URL}/api/tasks/${taskId}`,
      {
        status: 'IN_PROGRESS',
        actualMinutes: 60,
      },
      { headers }
    );
    console.log('✓ Task updated to status:', updateResponse.data.status);

    // Test 5: Add comment
    console.log('\n5. Testing POST /api/tasks/:id/comments...');
    const commentResponse = await axios.post(
      `${API_URL}/api/tasks/${taskId}/comments`,
      {
        content: 'Test comment from script',
      },
      { headers }
    );
    console.log('✓ Comment added:', commentResponse.data.id);

    // Test 6: Get statistics
    console.log('\n6. Testing GET /api/tasks/stats...');
    const statsResponse = await axios.get(
      `${API_URL}/api/tasks/stats`,
      { headers }
    );
    console.log('✓ Stats retrieved:', statsResponse.data.total, 'total tasks');

    // Test 7: Delete task
    console.log('\n7. Testing DELETE /api/tasks/:id...');
    await axios.delete(
      `${API_URL}/api/tasks/${taskId}`,
      { headers }
    );
    console.log('✓ Task deleted');

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testTaskAPI();