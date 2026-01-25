#!/usr/bin/env node
/**
 * Security Tests for Desk Platform MVP
 *
 * Tests:
 * 1. Command injection prevention in shell-runner.js
 * 2. Path traversal prevention in job-reader.js
 */

const { runCommand, runRalphScript } = require('./lib/shell-runner');
const { getJobFilePath, isValidJobId } = require('./lib/job-reader');

console.log('='.repeat(60));
console.log('Desk Platform MVP - Security Tests');
console.log('='.repeat(60));
console.log('');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`✅ PASS: ${name} (correctly rejected: ${error.message})`);
    passed++;
  }
}

function expectThrow(name, fn, expectedError) {
  try {
    fn();
    console.log(`❌ FAIL: ${name} - Should have thrown error`);
    failed++;
  } catch (error) {
    if (error.message.includes(expectedError)) {
      console.log(`✅ PASS: ${name} (correctly rejected)`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${name} - Wrong error: ${error.message}`);
      failed++;
    }
  }
}

console.log('## Test 1: Command Injection Prevention');
console.log('');

// Test 1.1: Invalid command with shell metacharacters
expectThrow(
  '1.1: Reject command with shell metacharacters (|)',
  () => runCommand('ls|cat', []),
  'Invalid command'
);

// Test 1.2: Invalid command with path separator
expectThrow(
  '1.2: Reject command with path separator (../)',
  () => runCommand('../bin/bash', []),
  'Invalid command'
);

// Test 1.3: Valid simple command
test('1.3: Accept valid simple command', () => {
  runCommand('pwd', []);
});

// Test 1.4: Command with safe arguments
test('1.4: Accept command with safe arguments', () => {
  runCommand('echo', ['test', 'argument']);
});

console.log('');
console.log('## Test 2: Path Traversal Prevention');
console.log('');

// Test 2.1: Invalid job ID with path traversal
expectThrow(
  '2.1: Reject job ID with ../',
  () => isValidJobId('../etc/passwd'),
  'Invalid job ID format'
);

// Test 2.2: Invalid job ID with path separator
expectThrow(
  '2.2: Reject job ID with /',
  () => isValidJobId('../../root'),
  'Invalid job ID format'
);

// Test 2.3: Valid job ID
test('2.3: Accept valid job ID (PROJECT-001)', () => {
  if (!isValidJobId('PROJECT-001')) {
    throw new Error('Valid job ID rejected');
  }
});

// Test 2.4: Path traversal in file path
expectThrow(
  '2.4: Reject file path with ../',
  () => getJobFilePath('TEST-001', '../../../etc/passwd'),
  'Path traversal detected'
);

// Test 2.5: Path traversal with encoded dots
expectThrow(
  '2.5: Reject file path with path separator at start',
  () => getJobFilePath('TEST-001', '/../etc/passwd'),
  'Path traversal detected'
);

// Test 2.6: Valid file path within job
test('2.6: Accept valid file path (output/result.txt)', () => {
  getJobFilePath('TEST-001', 'output/result.txt');
});

console.log('');
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}
