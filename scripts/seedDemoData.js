import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '../src/config/supabase.js';

dotenv.config();

// Fixed deterministic UUIDs for safe, repeatable upsert runs
const IDS = {
  depts: {
    publicWorks: '11111111-1111-1111-1111-111111111111',
    sanitation: '22222222-2222-2222-2222-222222222222',
    waterPower: '33333333-3333-3333-3333-333333333333',
    traffic: '44444444-4444-4444-4444-444444444444',
  },
  users: {
    citizen: 'aaaa1111-1111-1111-1111-111111111111',
    operator: 'bbbb2222-2222-2222-2222-222222222222',
    admin: 'cccc3333-3333-3333-3333-333333333333',
  },
  cluster: 'eeee4444-4444-4444-4444-444444444444',
  actionPlan: 'ffff5555-5555-5555-5555-555555555555',
  complaints: [
    'c0000001-0000-0000-0000-000000000001',
    'c0000002-0000-0000-0000-000000000002',
    'c0000003-0000-0000-0000-000000000003',
    'c0000004-0000-0000-0000-000000000004',
    'c0000005-0000-0000-0000-000000000005',
  ],
};

const DEMO_PASSWORD = 'Password123!';

async function seed() {
  console.log('\n=============================================================');
  console.log('🌱 [CivicFix Demo Seeder] Initializing Hackathon Demo Data...');
  console.log('=============================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. SEED DEPARTMENTS
    // -------------------------------------------------------------------------
    console.log('🏢 [Step 1/5] Seeding Municipal Departments...');
    const departmentsData = [
      {
        id: IDS.depts.publicWorks,
        name: 'Public Works & Infrastructure',
        contact_email: 'publicworks@civicfix.city.gov',
        priority_level: 'high',
        sla_hours_default: 24,
      },
      {
        id: IDS.depts.sanitation,
        name: 'Sanitation & Solid Waste Management',
        contact_email: 'sanitation@civicfix.city.gov',
        priority_level: 'medium',
        sla_hours_default: 48,
      },
      {
        id: IDS.depts.waterPower,
        name: 'Water & Power Supply',
        contact_email: 'waterpower@civicfix.city.gov',
        priority_level: 'critical',
        sla_hours_default: 12,
      },
      {
        id: IDS.depts.traffic,
        name: 'Traffic & Transit Operations',
        contact_email: 'traffic@civicfix.city.gov',
        priority_level: 'high',
        sla_hours_default: 18,
      },
    ];

    const { error: deptError } = await supabaseAdmin
      .from('departments')
      .upsert(departmentsData, { onConflict: 'id' });

    if (deptError) {
      console.warn('⚠️  Could not upsert departments (check connection/table):', deptError.message);
    } else {
      console.log('   ✅ 4 Departments seeded: Public Works, Sanitation, Water & Power, Traffic.');
    }

    // -------------------------------------------------------------------------
    // 2. SEED USERS (Citizen, Operator, Admin)
    // -------------------------------------------------------------------------
    console.log('\n👥 [Step 2/5] Seeding Pre-Configured Test Users...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

    const usersData = [
      {
        id: IDS.users.citizen,
        name: 'Alex Johnson (Citizen)',
        email: 'citizen@civicfix.city',
        password_hash: passwordHash,
        role: 'citizen',
        department_id: null,
        phone_number: '+1-555-0101',
      },
      {
        id: IDS.users.operator,
        name: 'Dana Vance (Public Works Operator)',
        email: 'operator@civicfix.city',
        password_hash: passwordHash,
        role: 'operator',
        department_id: IDS.depts.publicWorks,
        phone_number: '+1-555-0102',
      },
      {
        id: IDS.users.admin,
        name: 'Sarah Connor (City Admin)',
        email: 'admin@civicfix.city',
        password_hash: passwordHash,
        role: 'admin',
        department_id: null,
        phone_number: '+1-555-0100',
      },
    ];

    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert(usersData, { onConflict: 'id' });

    if (userError) {
      console.warn('⚠️  Could not upsert users:', userError.message);
    } else {
      console.log('   ✅ 3 Test Users seeded:');
      console.log('      - Citizen:  citizen@civicfix.city  / Password123!');
      console.log('      - Operator: operator@civicfix.city / Password123!');
      console.log('      - Admin:    admin@civicfix.city    / Password123!');
    }

    // -------------------------------------------------------------------------
    // 3. SEED PRE-CALCULATED ROOT-CAUSE CLUSTER (PLAN Stage)
    // -------------------------------------------------------------------------
    console.log('\n🧠 [Step 3/5] Seeding Pre-Calculated Complaint Cluster...');
    const clusterData = {
      id: IDS.cluster,
      root_cause_title: 'Underground Mainline Rupture Causing Progressive Road Subsidence',
      priority_score: 9.25,
      summary:
        'Cluster of 5 high-density citizen reports within a 65-meter corridor of Elm & 4th Avenue. Fresh potable water is bubbling up through subterranean fractures, causing severe asphalt cavitation and multiple vehicle wheel damage incidents.',
      status: 'planning',
    };

    const { error: clusterError } = await supabaseAdmin
      .from('complaint_clusters')
      .upsert(clusterData, { onConflict: 'id' });

    if (clusterError) {
      console.warn('⚠️  Could not upsert complaint cluster:', clusterError.message);
    } else {
      console.log('   ✅ Complaint Cluster seeded (Priority Score: 9.25, Status: planning).');
    }

    // -------------------------------------------------------------------------
    // 4. SEED 5 GEOGRAPHICALLY CLUSTERED COMPLAINTS (OBSERVE Stage)
    // -------------------------------------------------------------------------
    console.log('\n📍 [Step 4/5] Seeding 5 Clustered Neighborhood Complaints...');
    // Base epicenter: Downtown Elm St corridor (12.9716, 77.5946 or approx neighborhood)
    const complaintsData = [
      {
        id: IDS.complaints[0],
        title: 'Deep crater expanding across the east-bound lane',
        description:
          'A two-foot deep pothole has opened up overnight following heavy water accumulation beneath the road.',
        category: 'Pothole',
        photo_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800',
        latitude: 12.97158,
        longitude: 77.59461,
        address: '402 Elm St, Downtown Ward',
        status: 'clustered',
        citizen_id: IDS.users.citizen,
        cluster_id: IDS.cluster,
      },
      {
        id: IDS.complaints[1],
        title: 'Pressurized water bubbling through road surface fissures',
        description:
          'Continuous stream of fresh water erupting from hairline cracks in the asphalt. Street is flooded.',
        category: 'Water Leak',
        photo_url: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800',
        latitude: 12.97165,
        longitude: 77.59475,
        address: '416 Elm St, Downtown Ward',
        status: 'clustered',
        citizen_id: IDS.users.citizen,
        cluster_id: IDS.cluster,
      },
      {
        id: IDS.complaints[2],
        title: 'Dangerous cavity near crosswalk rim damaging tires',
        description:
          'Third vehicle had its rim buckled this morning. Water ponding hides the true depth of the asphalt gap.',
        category: 'Pothole',
        photo_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?w=800',
        latitude: 12.97172,
        longitude: 77.59455,
        address: 'Intersection of Elm St & 4th Ave',
        status: 'clustered',
        citizen_id: IDS.users.citizen,
        cluster_id: IDS.cluster,
      },
      {
        id: IDS.complaints[3],
        title: 'Low residential water pressure and muddy runoff in curb',
        description:
          'Water pressure in our building dropped to zero while sediment-laden water is gushing into the stormwater drain.',
        category: 'Water Leak',
        photo_url: 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?w=800',
        latitude: 12.97149,
        longitude: 77.59482,
        address: '428 Elm St, Building B Frontage',
        status: 'clustered',
        citizen_id: IDS.users.citizen,
        cluster_id: IDS.cluster,
      },
      {
        id: IDS.complaints[4],
        title: 'Sidewalk curb sinking alongside saturated roadway',
        description:
          'Pedestrian walkway has subsided 4 inches due to foundation washaway beneath the saturated street bed.',
        category: 'Pothole',
        photo_url: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800',
        latitude: 12.97181,
        longitude: 77.59469,
        address: '435 Elm St, Downtown Ward',
        status: 'clustered',
        citizen_id: IDS.users.citizen,
        cluster_id: IDS.cluster,
      },
    ];

    const { error: compError } = await supabaseAdmin
      .from('complaints')
      .upsert(complaintsData, { onConflict: 'id' });

    if (compError) {
      console.warn('⚠️  Could not upsert complaints:', compError.message);
    } else {
      console.log('   ✅ 5 Geographically clustered complaints seeded along Elm Street corridor.');
    }

    // Attempt to invoke PostGIS centroid recalculation
    try {
      await supabaseAdmin.rpc('recalculate_cluster_centroid', { p_cluster_id: IDS.cluster });
      console.log('   🗺️  PostGIS cluster geographic centroid recomputed.');
    } catch {
      // Graceful fallback if database function is not yet registered
    }

    // -------------------------------------------------------------------------
    // 5. SEED PENDING ACTION PLAN (Ready for Operator Approval)
    // -------------------------------------------------------------------------
    console.log('\n📋 [Step 5/5] Seeding AI Action Plan Awaiting Human Approval...');
    const actionPlanData = {
      id: IDS.actionPlan,
      cluster_id: IDS.cluster,
      assigned_department_id: IDS.depts.waterPower,
      requires_operator_approval: true,
      approval_status: 'pending',
      approval_notes: 'Automated AI proposal: Multi-agency coordination required (Water & Power + Public Works).',
      estimated_cost: 5800.0,
      steps_json: [
        {
          order: 1,
          action: 'Perform acoustic leak correlation and isolate sector valve #W-104',
          department: 'Water & Power Supply',
          sla_hours: 4,
          automated: false,
          equipment_needed: ['Acoustic Listening Kit', 'Valve Key Truck'],
          cost_estimate: 750.0,
        },
        {
          order: 2,
          action: 'Excavate 12m trench along Elm St & replace fractured ductile iron mainline pipe',
          department: 'Water & Power Supply',
          sla_hours: 14,
          automated: false,
          equipment_needed: ['Mini Excavator', 'Ductile Iron Pipe Section', 'Dewatering Pump'],
          cost_estimate: 3200.0,
        },
        {
          order: 3,
          action: 'Compacted gravel sub-base stabilization and hot-mix asphalt repaving',
          department: 'Public Works & Infrastructure',
          sla_hours: 24,
          automated: false,
          equipment_needed: ['Vibratory Plate Compactor', 'Asphalt Paver'],
          cost_estimate: 1850.0,
        },
        {
          order: 4,
          action: 'Autonomous AI vision drone sweep to verify pavement leveling and seal integrity',
          department: 'Traffic & Transit Operations',
          sla_hours: 36,
          automated: true,
          cost_estimate: 0.0,
        },
      ],
    };

    const { error: planError } = await supabaseAdmin
      .from('action_plans')
      .upsert(actionPlanData, { onConflict: 'id' });

    if (planError) {
      console.warn('⚠️  Could not upsert action plan:', planError.message);
    } else {
      console.log('   ✅ Action Plan seeded in PENDING approval status.');
      console.log('      - Estimated Cost: $5,800.00');
      console.log('      - Steps: 4 structured phases (Acoustic Isolation -> Excavation -> Asphalt -> AI Verification)');
    }

    // -------------------------------------------------------------------------
    // 6. RECORD INITIAL AUDIT LOGS FOR PROVENANCE
    // -------------------------------------------------------------------------
    await supabaseAdmin.from('audit_logs').insert([
      {
        entity_type: 'cluster',
        entity_id: IDS.cluster,
        action: 'CLUSTERED_BY_DEMO_SEEDER',
        metadata_json: {
          note: 'Seed script simulated Gemini AI observation & spatial clustering pass',
          complaints_linked: 5,
        },
      },
      {
        entity_type: 'action_plan',
        entity_id: IDS.actionPlan,
        action: 'ACTION_PLAN_PROPOSED_BY_AGENT',
        metadata_json: {
          note: 'Autonomous Gemini Planner generated 4-step remediation plan',
          requires_approval: true,
        },
      },
    ]);

    console.log('\n=============================================================');
    console.log('🎉 [Seed Success] CivicFix Hackathon Demo Environment is Ready!');
    console.log('=============================================================');
    console.log('\n🔑 Quick-Login Credentials:');
    console.table([
      { Role: 'Citizen', Email: 'citizen@civicfix.city', Password: DEMO_PASSWORD },
      { Role: 'Operator', Email: 'operator@civicfix.city', Password: DEMO_PASSWORD },
      { Role: 'Admin', Email: 'admin@civicfix.city', Password: DEMO_PASSWORD },
    ]);
    console.log('\n🚀 Next Steps:');
    console.log('  1. Start server:   npm run dev');
    console.log('  2. View pending:   GET /api/v1/operator/action-plans/pending');
    console.log('  3. Approve plan:   POST /api/v1/operator/action-plans/' + IDS.actionPlan + '/approve');
    console.log('  4. Verify closure: POST /api/v1/verification/complaints/' + IDS.complaints[0] + '/verify\n');
  } catch (err) {
    console.error('❌ [Seed Fatal Error] Unexpected failure during demo seeding:', err);
    process.exit(1);
  }
}

seed();
