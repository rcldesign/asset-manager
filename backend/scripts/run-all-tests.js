#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🏃 Running all tests...\n');

let unitTestsPassed = true;
let integrationTestsPassed = true;

// Run unit tests
console.log('📦 Running unit tests...');
try {
  execSync('jest --config jest.unit.config.ts --json --outputFile=unit-test-results.json', { 
    stdio: 'inherit' 
  });
} catch (error) {
  unitTestsPassed = false;
}

// Run integration tests
console.log('\n🔗 Running integration tests...');
try {
  execSync('npm run test:db:start && npm run test:db:wait && npm run test:db:migrate', { 
    stdio: 'inherit' 
  });
  execSync('jest --config jest.integration.config.ts --json --outputFile=integration-test-results.json --forceExit', { 
    stdio: 'inherit' 
  });
} catch (error) {
  integrationTestsPassed = false;
}

// Combine test results
console.log('\n📊 Combining test results...');
let combinedResults = {
  success: unitTestsPassed && integrationTestsPassed,
  numTotalTestSuites: 0,
  numPassedTestSuites: 0,
  numFailedTestSuites: 0,
  numTotalTests: 0,
  numPassedTests: 0,
  numFailedTests: 0,
  startTime: Date.now(),
  endTime: Date.now()
};

// Read unit test results
if (fs.existsSync('unit-test-results.json')) {
  const unitResults = JSON.parse(fs.readFileSync('unit-test-results.json', 'utf8'));
  combinedResults.numTotalTestSuites += unitResults.numTotalTestSuites || 0;
  combinedResults.numPassedTestSuites += unitResults.numPassedTestSuites || 0;
  combinedResults.numFailedTestSuites += unitResults.numFailedTestSuites || 0;
  combinedResults.numTotalTests += unitResults.numTotalTests || 0;
  combinedResults.numPassedTests += unitResults.numPassedTests || 0;
  combinedResults.numFailedTests += unitResults.numFailedTests || 0;
  if (unitResults.startTime) {
    combinedResults.startTime = Math.min(combinedResults.startTime, unitResults.startTime);
  }
}

// Read integration test results
if (fs.existsSync('integration-test-results.json')) {
  const integrationResults = JSON.parse(fs.readFileSync('integration-test-results.json', 'utf8'));
  combinedResults.numTotalTestSuites += integrationResults.numTotalTestSuites || 0;
  combinedResults.numPassedTestSuites += integrationResults.numPassedTestSuites || 0;
  combinedResults.numFailedTestSuites += integrationResults.numFailedTestSuites || 0;
  combinedResults.numTotalTests += integrationResults.numTotalTests || 0;
  combinedResults.numPassedTests += integrationResults.numPassedTests || 0;
  combinedResults.numFailedTests += integrationResults.numFailedTests || 0;
  if (integrationResults.endTime) {
    combinedResults.endTime = Math.max(combinedResults.endTime, integrationResults.endTime);
  }
}

// Write combined results
fs.writeFileSync('test-results.json', JSON.stringify(combinedResults, null, 2));

// Generate coverage report
console.log('\n📈 Generating coverage report...');
try {
  execSync('jest --coverage --coverageReporters=json-summary --passWithNoTests', { 
    stdio: 'pipe' 
  });
} catch (error) {
  // Coverage generation might fail, but we still have the combined test results
}

// Clean up temporary files
try {
  if (fs.existsSync('unit-test-results.json')) fs.unlinkSync('unit-test-results.json');
  if (fs.existsSync('integration-test-results.json')) fs.unlinkSync('integration-test-results.json');
} catch (error) {
  // Ignore cleanup errors
}

// Exit with appropriate code
process.exit(combinedResults.success ? 0 : 1);