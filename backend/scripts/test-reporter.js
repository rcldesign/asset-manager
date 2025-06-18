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

function parseCoverageSummary() {
  try {
    const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
    if (!fs.existsSync(coveragePath)) {
      return null;
    }
    
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const totals = coverage.total;
    
    return {
      lines: totals.lines,
      functions: totals.functions,
      branches: totals.branches,
      statements: totals.statements,
    };
  } catch (error) {
    return null;
  }
}

function parseJestResults() {
  try {
    const resultsPath = path.join(__dirname, '../test-results.json');
    if (!fs.existsSync(resultsPath)) {
      return null;
    }
    
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    return {
      success: results.success,
      numTotalTestSuites: results.numTotalTestSuites,
      numPassedTestSuites: results.numPassedTestSuites,
      numFailedTestSuites: results.numFailedTestSuites,
      numTotalTests: results.numTotalTests,
      numPassedTests: results.numPassedTests,
      numFailedTests: results.numFailedTests,
      startTime: results.startTime,
      endTime: results.endTime,
    };
  } catch (error) {
    return null;
  }
}

function displayResults() {
  const testResults = parseJestResults();
  const coverage = parseCoverageSummary();
  
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
  } else {
    console.log(`${symbols.warning} No test results found`);
  }
  
  if (coverage) {
    console.log(`\n${symbols.chart} Coverage Summary:`);
    console.log('══════════════════════════');
    
    console.log(`Lines:      ${formatCoveragePercentage(coverage.lines.covered, coverage.lines.total)}`);
    console.log(`Functions:  ${formatCoveragePercentage(coverage.functions.covered, coverage.functions.total)}`);
    console.log(`Branches:   ${formatCoveragePercentage(coverage.branches.covered, coverage.branches.total)}`);
    console.log(`Statements: ${formatCoveragePercentage(coverage.statements.covered, coverage.statements.total)}`);
    
    // Calculate overall coverage
    const totalItems = coverage.lines.total + coverage.functions.total + coverage.branches.total + coverage.statements.total;
    const coveredItems = coverage.lines.covered + coverage.functions.covered + coverage.branches.covered + coverage.statements.covered;
    const overallPercentage = totalItems > 0 ? (coveredItems / totalItems) * 100 : 0;
    const overallStatus = overallPercentage >= 80 ? symbols.check : symbols.cross;
    const overallColor = overallPercentage >= 80 ? colors.green : colors.red;
    
    console.log(`Overall:    ${overallStatus} ${overallColor}${overallPercentage.toFixed(1)}%${colors.reset}`);
  }
  
  if (testResults && testResults.startTime) {
    const duration = testResults.endTime && testResults.startTime 
      ? ((testResults.endTime - testResults.startTime) / 1000).toFixed(2)
      : 'N/A';
    console.log(`\n${symbols.clock}  Time: ${duration}s`);
  }
  
  console.log('');
}

// Run the reporter
displayResults();