#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

// Unicode symbols
const symbols = {
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  info: '📊',
  clipboard: '📋',
  document: '📝',
  chart: '📈',
  clock: '⏱️',
  redCircle: '🔴',
  yellowCircle: '🟡',
  greenCircle: '🟢',
};

function getCoverageColor(percentage) {
  if (percentage >= 80) return symbols.greenCircle;
  if (percentage >= 50) return symbols.yellowCircle;
  return symbols.redCircle;
}

function formatCoveragePercentage(covered, total) {
  const percentage = total > 0 ? (covered / total) * 100 : 0;
  const color = getCoverageColor(percentage);
  return `${color} ${percentage.toFixed(1)}% (${covered}/${total})`;
}

// Parse test results
let testResults = null;
try {
  const resultsPath = path.join(__dirname, '../test-results.json');
  if (fs.existsSync(resultsPath)) {
    testResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  }
} catch (error) {
  console.error('Error reading test results:', error.message);
}

// Display test results
console.log(`\n${symbols.info} Test Results Summary:`);
console.log('══════════════════════════');

if (testResults) {
  const allPassed = testResults.numFailedTests === 0 && testResults.numFailedTestSuites === 0;
  const statusSymbol = allPassed ? symbols.check : symbols.cross;
  const statusText = allPassed ? 'All tests passed!' : 'Some tests failed!';
  const statusColor = allPassed ? colors.green : colors.red;
  
  console.log(`${statusSymbol} ${statusColor}${statusText}${colors.reset}`);
  console.log(`${symbols.clipboard} Test Suites: ${testResults.numPassedTestSuites}/${testResults.numTotalTestSuites} passed`);
  console.log(`${symbols.document} Tests: ${testResults.numPassedTests}/${testResults.numTotalTests} passed`);
  
  if (testResults.numFailedTestSuites > 0) {
    console.log(`${symbols.cross} Failed Suites: ${colors.red}${testResults.numFailedTestSuites}${colors.reset}`);
  }
  if (testResults.numFailedTests > 0) {
    console.log(`${symbols.cross} Failed Tests: ${colors.red}${testResults.numFailedTests}${colors.reset}`);
  }
  
  // Show test time
  if (testResults.startTime) {
    const duration = testResults.endTime && testResults.startTime 
      ? ((testResults.endTime - testResults.startTime) / 1000).toFixed(2)
      : 'N/A';
    console.log(`${symbols.clock} Time: ${duration}s`);
  }
} else {
  console.log(`${symbols.warning} No test results found. Run tests first with: npm test`);
}

// Parse and display coverage
try {
  const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
  if (fs.existsSync(coveragePath)) {
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const totals = coverage.total;
    
    console.log(`\n${symbols.chart} Coverage Summary:`);
    console.log('══════════════════════════');
    
    console.log(`Lines:      ${formatCoveragePercentage(totals.lines.covered, totals.lines.total)}`);
    console.log(`Functions:  ${formatCoveragePercentage(totals.functions.covered, totals.functions.total)}`);
    console.log(`Branches:   ${formatCoveragePercentage(totals.branches.covered, totals.branches.total)}`);
    console.log(`Statements: ${formatCoveragePercentage(totals.statements.covered, totals.statements.total)}`);
    
    // Calculate overall coverage
    const totalItems = totals.lines.total + totals.functions.total + totals.branches.total + totals.statements.total;
    const coveredItems = totals.lines.covered + totals.functions.covered + totals.branches.covered + totals.statements.covered;
    const overallPercentage = totalItems > 0 ? (coveredItems / totalItems) * 100 : 0;
    const overallStatus = overallPercentage >= 80 ? symbols.check : symbols.cross;
    const overallColor = overallPercentage >= 80 ? colors.green : colors.red;
    
    console.log(`Overall:    ${overallStatus} ${overallColor}${overallPercentage.toFixed(1)}%${colors.reset}`);
  } else {
    console.log(`\n${symbols.warning} Coverage data not available. Run tests with coverage first.`);
  }
} catch (error) {
  console.log(`\n${symbols.warning} Error reading coverage data:`, error.message);
}

console.log('');