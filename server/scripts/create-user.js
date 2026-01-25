#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function createUser() {
  try {
    console.log('='.repeat(60));
    console.log('Desk Platform - Create User');
    console.log('='.repeat(60));
    console.log('');

    const username = await question('Username: ');
    if (!username || username.length < 3) {
      console.error('❌ Username must be at least 3 characters');
      process.exit(1);
    }

    const password = await question('Password: ');
    if (!password || password.length < 8) {
      console.error('❌ Password must be at least 8 characters');
      process.exit(1);
    }

    const roleInput = await question('Role (officer/supervisor): ');
    const role = roleInput.toLowerCase();
    if (role !== 'officer' && role !== 'supervisor') {
      console.error('❌ Role must be either "officer" or "supervisor"');
      process.exit(1);
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Insert user
    const stmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
    const result = stmt.run(username, passwordHash, role);

    console.log('');
    console.log('✅ User created successfully');
    console.log(`   ID: ${result.lastInsertRowid}`);
    console.log(`   Username: ${username}`);
    console.log(`   Role: ${role}`);
    console.log('');

  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      console.error('❌ Username already exists');
    } else {
      console.error('❌ Error creating user:', error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

createUser();
