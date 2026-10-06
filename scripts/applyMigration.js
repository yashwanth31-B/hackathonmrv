/**
 * CivicFix - Supabase Schema Bootstrapper
 * Applies the full schema migration directly via Supabase REST API
 * Run: node scripts/applyMigration.js
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

// Read the full migration SQL file
const migrationPath = path.join(__dirname, '../supabase/migrations/20261006000000_civicfix_initial_schema.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

// Split into individual statements for sequential execution
// Filter out comment-only lines and empty statements
const statements = migrationSQL
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log('\n===========================================================');
console.log('🔧 [CivicFix] Applying Database Migration via REST API...');
console.log('===========================================================\n');
console.log(`📡 Target: ${SUPABASE_URL}`);
console.log(`📄 Statements detected: ${statements.length}\n`);

async function executeSQL(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql + ';' }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response;
}

// Alternative: Use Supabase management API to run SQL
async function applyMigrationViaManagementAPI() {
  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
  
  console.log(`🔑 Project Ref: ${projectRef}`);
  console.log('⚠️  Note: Management API requires a Personal Access Token.\n');
  console.log('Please apply the migration manually:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`1. Visit: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  console.log('2. Copy the migration file contents (see below)');
  console.log('3. Paste into the SQL editor and click Run');
  console.log('─────────────────────────────────────────────────────────\n');

  // Try checking if tables exist already
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('🔍 Checking current database state...');
  
  const tables = ['departments', 'users', 'complaints', 'complaint_clusters', 'action_plans', 'verification_logs', 'audit_logs'];
  
  let existingTables = [];
  let missingTables = [];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('count').limit(1);
    if (error && error.message.includes('schema cache')) {
      missingTables.push(table);
    } else {
      existingTables.push(table);
    }
  }

  console.log(`\n📊 Database Status:`);
  if (existingTables.length > 0) {
    console.log(`   ✅ Existing tables (${existingTables.length}): ${existingTables.join(', ')}`);
  }
  if (missingTables.length > 0) {
    console.log(`   ❌ Missing tables (${missingTables.length}): ${missingTables.join(', ')}`);
  }

  if (missingTables.length === 0) {
    console.log('\n🎉 All tables exist! You can run the seed now:');
    console.log('   node scripts/seedDemoData.js\n');
    return true;
  }

  console.log('\n⚠️  Migration is required. Open the Supabase SQL Editor and run:');
  console.log(`   👉 https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
  console.log('📋 Migration file location:');
  console.log(`   ${migrationPath}\n`);
  return false;
}

applyMigrationViaManagementAPI();
