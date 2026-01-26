#!/usr/bin/env node
/**
 * Test script for AI provider connectivity
 * Usage: node test-providers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  getInstanceDefaultProvider,
  getAvailableProviders
} = require('./lib/ai/provider-manager');

async function testProvider() {
  console.log('🧪 Testing AI Provider Configuration\n');

  // Show available providers
  console.log('📋 Available Providers:');
  const providers = getAvailableProviders();
  providers.forEach(p => {
    console.log(`   - ${p.name} (${p.id})`);
  });
  console.log();

  // Test instance default
  try {
    console.log('🔧 Testing Instance Default Provider...');
    const provider = getInstanceDefaultProvider();

    console.log(`   Provider: ${process.env.DESK_AI_PROVIDER || 'anthropic'}`);
    console.log(`   Model: ${process.env.DESK_AI_MODEL || 'claude-sonnet-4-5-20250929'}`);

    // Run healthcheck
    console.log('   Running healthcheck...');
    const result = await provider.healthcheck();

    if (result.healthy) {
      console.log(`   ✅ ${result.message}`);

      // Show capabilities
      const caps = provider.capabilities();
      console.log(`   Capabilities:`);
      console.log(`     - Streaming: ${caps.streaming ? '✓' : '✗'}`);
      console.log(`     - Tools: ${caps.tools ? '✓' : '✗'}`);
      console.log(`     - Vision: ${caps.vision ? '✓' : '✗'}`);
      console.log(`     - Max Tokens: ${caps.maxTokens}`);

      // Test simple generation
      console.log('\n   Testing message generation...');
      const response = await provider.generate([
        { role: 'user', content: 'Say "Hello from Desk!" in one sentence.' }
      ], { maxTokens: 100 });

      console.log(`   Response: "${response.content.substring(0, 100)}..."`);
      console.log('\n✅ All tests passed!\n');
    } else {
      console.error(`   ❌ ${result.message}`);
      console.error('\n💡 Check your .env configuration\n');
      process.exit(1);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check .env file exists and has correct API key');
    console.error('   2. Verify API key is valid and has credits');
    console.error('   3. Check network connectivity');
    console.error('   4. For Ollama: ensure ollama service is running\n');
    process.exit(1);
  }
}

// Run test
testProvider().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
