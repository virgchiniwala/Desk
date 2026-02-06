#!/usr/bin/env node
/**
 * Security Tests for Desk Platform MVP
 */

const { runCommand } = require('./lib/shell-runner');
const { getJobFilePath, isValidJobId } = require('./lib/job-reader');

console.log('='.repeat(60));
console.log('Desk Platform MVP - Security Tests');
console.log('='.repeat(60));
console.log('');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name} - ${error.message}`);
    failed++;
  }
}

async function expectThrow(name, fn, expectedError) {
  try {
    await fn();
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

async function expectFalse(name, fn) {
  try {
    const result = await fn();
    if (result === false) {
      console.log(`✅ PASS: ${name}`);
      passed++;
      return;
    }
    console.log(`❌ FAIL: ${name} - Expected false, got ${result}`);
    failed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name} - Threw error: ${error.message}`);
    failed++;
  }
}

async function main() {
  console.log('## Test 1: Command Injection Prevention');
  console.log('');

  await expectThrow(
    '1.1: Reject command with shell metacharacters (|)',
    async () => runCommand('ls|cat', []),
    'Invalid command'
  );

  await expectThrow(
    '1.2: Reject command with path separator (../)',
    async () => runCommand('../bin/bash', []),
    'Invalid command'
  );

  await test('1.3: Accept valid simple command', async () => {
    await runCommand('pwd', []);
  });

  await test('1.4: Command with safe arguments', async () => {
    await runCommand('echo', ['test', 'argument']);
  });

  console.log('');
  console.log('## Test 2: Path Traversal Prevention');
  console.log('');

  await expectFalse(
    '2.1: Reject job ID with ../',
    () => isValidJobId('../etc/passwd')
  );

  await expectFalse(
    '2.2: Reject job ID with /',
    () => isValidJobId('../../root')
  );

  await test('2.3: Accept valid job ID (PROJECT-001)', () => {
    if (!isValidJobId('PROJECT-001')) {
      throw new Error('Valid job ID rejected');
    }
  });

  await expectThrow(
    '2.4: Reject file path with ../',
    () => getJobFilePath('TEST-001', '../../../etc/passwd'),
    'Path traversal detected'
  );

  await expectThrow(
    '2.5: Reject file path with path separator at start',
    () => getJobFilePath('TEST-001', '/../etc/passwd'),
    'Path traversal detected'
  );

  await test('2.6: Accept valid file path (output/result.txt)', () => {
    getJobFilePath('TEST-001', 'output/result.txt');
  });

  console.log('');
  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
