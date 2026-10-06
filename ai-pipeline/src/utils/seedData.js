import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';

dotenv.config();

// ===========================================================================
// Hackathon Demo Seed Data Definitions
// ===========================================================================

export const DEMO_CREDENTIALS = {
  operator: {
    email: 'operator@civicfix.gov.in',
    rawPassword: 'OperatorPassword123!',
    role: 'OPERATOR',
    name: 'Rajesh Verma (Municipal Ward Officer)'
  },
  citizen: {
    email: 'citizen@civicfix.org',
    rawPassword: 'CitizenPassword123!',
    role: 'CITIZEN',
    name: 'Priya Sharma (Resident)'
  }
};

/**
 * 3 Overlapping Drainage Complaints near a school zone in Indiranagar, Bangalore.
 * All situated within ~200 meters of each other (Lat: 12.978x, Long: 77.640x).
 * Perfect for evaluating ClusterAgent.
 */
export const DRAINAGE_SCHOOL_ZONE_COMPLAINTS = [
  {
    title: 'Severe stormwater drain blockage outside Kendriya Vidyalaya main gate',
    description:
      'Stormwater drain is completely clogged with solid waste and silt. Black foul-smelling water overflowing onto pedestrian sidewalk where schoolchildren cross daily.',
    category: 'DRAINAGE',
    priority: 'HIGH',
    status: 'SUBMITTED',
    location_text: 'Gate 1, Kendriya Vidyalaya, 100 Feet Road, Indiranagar, Bangalore',
    latitude: 12.9785,
    longitude: 77.6408,
    photo_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18f15c4?auto=format&fit=crop&w=800&q=80'
  },
  {
    title: 'Overflowing sewage drain backing up near School Playground boundary',
    description:
      'Sewer canal water backed up from blocked underground conduits. Contaminated wastewater is pooling 10 meters from the children playground, creating health hazard.',
    category: 'DRAINAGE',
    priority: 'HIGH',
    status: 'SUBMITTED',
    location_text: 'Behind Kendriya Vidyalaya Playground, 12th Main Road, Indiranagar, Bangalore',
    latitude: 12.9789,
    longitude: 77.6412,
    photo_url: 'https://images.unsplash.com/photo-1574958269340-fa927503f3dd?auto=format&fit=crop&w=800&q=80'
  },
  {
    title: 'Broken concrete drain slab with rainwater gushing across school bus stop',
    description:
      'Heavy runoff shattered the concrete drain cover. Gushing runoff creating waterlogged puddle right at the student pickup/drop-off point.',
    category: 'DRAINAGE',
    priority: 'HIGH',
    status: 'SUBMITTED',
    location_text: 'School Bus Stop, 100 Feet Road & 12th Main Junction, Indiranagar, Bangalore',
    latitude: 12.9782,
    longitude: 77.6405,
    photo_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80'
  }
];

/**
 * 1 Pothole issue marked RESOLVED but with negative citizen feedback.
 * Ready for testing Closed-Loop Verification and Replanning.
 */
export const RESOLVED_POTHOLE_FOR_VERIFICATION = {
  complaint: {
    title: 'Dangerous 2-foot pothole on Outer Ring Road underpass',
    description:
      'Large deep crater causing two-wheelers to skid and heavy traffic bottlenecks during rush hour.',
    category: 'POTHOLE',
    priority: 'HIGH',
    status: 'RESOLVED',
    location_text: 'Marathahalli Underpass, Outer Ring Road, Bangalore',
    latitude: 12.9562,
    longitude: 77.7011,
    photo_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80'
  },
  plan: {
    plan_title: 'Asphalt Patching & Road Surface Leveling',
    estimated_cost: 6500,
    estimated_hours: 3.5,
    status: 'COMPLETED'
  },
  tasks: [
    {
      step_number: 1,
      task_name: 'Site excavation & debris clearance',
      description: 'Remove fractured asphalt and clear pooled water from pothole interior.',
      assigned_team: 'Road Maintenance Crew',
      status: 'COMPLETED'
    },
    {
      step_number: 2,
      task_name: 'Cold-mix asphalt compaction',
      description: 'Deposit bitumen cold mix and compact with vibrating plate tamper.',
      assigned_team: 'Road Maintenance Crew',
      status: 'COMPLETED'
    }
  ],
  negativeFeedback: {
    citizen_feedback:
      'Substandard repair! The field crew merely dumped loose gravel without any bitumen binder. The first light rain washed all the gravel away, and the crater is even deeper now. Vehicles are violently bottoming out!',
    is_resolved: false
  }
};

/**
 * 1 Critical Streetlight issue requiring Operator Approval.
 * High estimated cost (> ₹10,000) + CRITICAL priority ensures operatorApprovalRequired is true.
 */
export const CRITICAL_STREETLIGHT_FOR_APPROVAL = {
  complaint: {
    title: 'Complete blackout of high-mast lighting pole near busy pedestrian crossing',
    description:
      'High-mast tower #HM-04 power junction short-circuited. 8 sodium luminaires dead, plunging entire arterial pedestrian crossing into pitch darkness at night. Extreme accident risk.',
    category: 'STREETLIGHT',
    priority: 'CRITICAL',
    status: 'PLANNED',
    location_text: 'MG Road Metro Station Pedestrian Junction, Bangalore',
    latitude: 12.9756,
    longitude: 77.6066,
    photo_url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32b?auto=format&fit=crop&w=800&q=80'
  },
  plan: {
    plan_title: 'Emergency High-Mast Transformer & Luminaire Replacement',
    estimated_cost: 28500,
    estimated_hours: 8.0,
    status: 'PENDING_APPROVAL'
  },
  tasks: [
    {
      step_number: 1,
      task_name: 'Traffic lane diversion & safety barricades',
      description: 'Coordinate with traffic police to cordon off lane 1 during boom crane deployment.',
      assigned_team: 'Electrical & Public Lighting Crew',
      status: 'PENDING'
    },
    {
      step_number: 2,
      task_name: 'Isolate high-voltage step-down transformer',
      description: 'De-energise circuit box, disconnect shorted wiring harness, test for ground faults.',
      assigned_team: 'Electrical & Public Lighting Crew',
      status: 'PENDING'
    },
    {
      step_number: 3,
      task_name: 'Install replacement 400W LED floodlights & surge suppressors',
      description: 'Mount 8 new energy-efficient LED luminaires on high-mast crown and reconnect power.',
      assigned_team: 'Electrical & Public Lighting Crew',
      status: 'PENDING'
    }
  ]
};

// ===========================================================================
// Seed Executor
// ===========================================================================

export async function runSeed() {
  console.log('====================================================');
  console.log('🌱 CIVICFIX: SEEDING DEMO DATA FOR HACKATHON JUDGES');
  console.log('====================================================');

  try {
    // -------------------------------------------------------------------------
    // 1. Seed Accounts (1 Operator + 1 Citizen)
    // -------------------------------------------------------------------------
    console.log('\n[1/4] Seeding Demo User Accounts...');
    const saltRounds = 10;

    const operatorPasswordHash = await bcrypt.hash(
      DEMO_CREDENTIALS.operator.rawPassword,
      saltRounds
    );
    const citizenPasswordHash = await bcrypt.hash(
      DEMO_CREDENTIALS.citizen.rawPassword,
      saltRounds
    );

    // Upsert Operator
    let [operatorUser] = await dbQuery(
      supabaseAdmin
        .from('users')
        .upsert(
          {
            email: DEMO_CREDENTIALS.operator.email,
            password_hash: operatorPasswordHash,
            role: DEMO_CREDENTIALS.operator.role,
            name: DEMO_CREDENTIALS.operator.name
          },
          { onConflict: 'email' }
        )
        .select()
    );

    // Upsert Citizen
    let [citizenUser] = await dbQuery(
      supabaseAdmin
        .from('users')
        .upsert(
          {
            email: DEMO_CREDENTIALS.citizen.email,
            password_hash: citizenPasswordHash,
            role: DEMO_CREDENTIALS.citizen.role,
            name: DEMO_CREDENTIALS.citizen.name
          },
          { onConflict: 'email' }
        )
        .select()
    );

    console.log(`✅ Operator created: ${operatorUser.email} (ID: ${operatorUser.id})`);
    console.log(`✅ Citizen created:  ${citizenUser.email} (ID: ${citizenUser.id})`);

    // -------------------------------------------------------------------------
    // 2. Seed 3 Overlapping Drainage Complaints (School Zone Clustering Test)
    // -------------------------------------------------------------------------
    console.log('\n[2/4] Seeding 3 Overlapping Drainage Complaints (School Zone)...');
    const drainageRows = DRAINAGE_SCHOOL_ZONE_COMPLAINTS.map((item) => ({
      citizen_id: citizenUser.id,
      title: item.title,
      description: item.description,
      category: item.category,
      priority: item.priority,
      status: item.status,
      location_text: item.location_text,
      latitude: item.latitude,
      longitude: item.longitude,
      photo_url: item.photo_url
    }));

    const seededDrainage = await dbQuery(
      supabaseAdmin.from('complaints').insert(drainageRows).select()
    );

    console.log(`✅ Inserted ${seededDrainage.length} Drainage Complaints:`);
    seededDrainage.forEach((c, idx) => {
      console.log(`   #${idx + 1} [${c.id}] ${c.title.slice(0, 55)}...`);
    });

    // -------------------------------------------------------------------------
    // 3. Seed Resolved Pothole with Negative Feedback (Closed-Loop Replanning Test)
    // -------------------------------------------------------------------------
    console.log('\n[3/4] Seeding Resolved Pothole with Negative Verification Feedback...');
    const [potholeComplaint] = await dbQuery(
      supabaseAdmin
        .from('complaints')
        .insert({
          citizen_id: citizenUser.id,
          title: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.title,
          description: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.description,
          category: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.category,
          priority: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.priority,
          status: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.status,
          location_text: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.location_text,
          latitude: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.latitude,
          longitude: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.longitude,
          photo_url: RESOLVED_POTHOLE_FOR_VERIFICATION.complaint.photo_url
        })
        .select()
    );

    // Insert associated completed plan
    const [potholePlan] = await dbQuery(
      supabaseAdmin
        .from('plans')
        .insert({
          complaint_id: potholeComplaint.id,
          plan_title: RESOLVED_POTHOLE_FOR_VERIFICATION.plan.plan_title,
          estimated_cost: RESOLVED_POTHOLE_FOR_VERIFICATION.plan.estimated_cost,
          estimated_hours: RESOLVED_POTHOLE_FOR_VERIFICATION.plan.estimated_hours,
          status: RESOLVED_POTHOLE_FOR_VERIFICATION.plan.status
        })
        .select()
    );

    // Insert completed tasks
    const potholeTasks = RESOLVED_POTHOLE_FOR_VERIFICATION.tasks.map((t) => ({
      plan_id: potholePlan.id,
      step_number: t.step_number,
      task_name: t.task_name,
      description: t.description,
      assigned_team: t.assigned_team,
      status: t.status
    }));

    await dbQuery(supabaseAdmin.from('tasks').insert(potholeTasks));

    // Insert verification record capturing citizen dissatisfaction
    const [potholeVerification] = await dbQuery(
      supabaseAdmin
        .from('verifications')
        .insert({
          complaint_id: potholeComplaint.id,
          is_resolved: RESOLVED_POTHOLE_FOR_VERIFICATION.negativeFeedback.is_resolved,
          citizen_feedback:
            RESOLVED_POTHOLE_FOR_VERIFICATION.negativeFeedback.citizen_feedback,
          photo_url: potholeComplaint.photo_url
        })
        .select()
    );

    console.log(
      `✅ Pothole complaint created [${potholeComplaint.id}] with completed plan [${potholePlan.id}]`
    );
    console.log(
      `   Verification flagged [${potholeVerification.id}]: "${RESOLVED_POTHOLE_FOR_VERIFICATION.negativeFeedback.citizen_feedback.slice(
        0,
        60
      )}..."`
    );

    // -------------------------------------------------------------------------
    // 4. Seed Critical Streetlight Issue (Operator Approval Required)
    // -------------------------------------------------------------------------
    console.log('\n[4/4] Seeding Critical Streetlight Issue (Human-in-the-Loop Test)...');
    const [streetlightComplaint] = await dbQuery(
      supabaseAdmin
        .from('complaints')
        .insert({
          citizen_id: citizenUser.id,
          title: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.title,
          description: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.description,
          category: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.category,
          priority: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.priority,
          status: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.status,
          location_text: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.location_text,
          latitude: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.latitude,
          longitude: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.longitude,
          photo_url: CRITICAL_STREETLIGHT_FOR_APPROVAL.complaint.photo_url
        })
        .select()
    );

    // Insert high-cost pending plan requiring approval
    const [streetlightPlan] = await dbQuery(
      supabaseAdmin
        .from('plans')
        .insert({
          complaint_id: streetlightComplaint.id,
          plan_title: CRITICAL_STREETLIGHT_FOR_APPROVAL.plan.plan_title,
          estimated_cost: CRITICAL_STREETLIGHT_FOR_APPROVAL.plan.estimated_cost,
          estimated_hours: CRITICAL_STREETLIGHT_FOR_APPROVAL.plan.estimated_hours,
          status: CRITICAL_STREETLIGHT_FOR_APPROVAL.plan.status // 'PENDING_APPROVAL'
        })
        .select()
    );

    const streetlightTasks = CRITICAL_STREETLIGHT_FOR_APPROVAL.tasks.map((t) => ({
      plan_id: streetlightPlan.id,
      step_number: t.step_number,
      task_name: t.task_name,
      description: t.description,
      assigned_team: t.assigned_team,
      status: t.status
    }));

    await dbQuery(supabaseAdmin.from('tasks').insert(streetlightTasks));

    console.log(
      `✅ Streetlight Complaint [${streetlightComplaint.id}] created with Priority: CRITICAL`
    );
    console.log(
      `   Plan [${streetlightPlan.id}] Status: ${streetlightPlan.status} (Cost: ₹${streetlightPlan.estimated_cost})`
    );

    // -------------------------------------------------------------------------
    // Summary Output for Judges
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    console.log('🎉 DEMO DATA SUCCESSFULLY SEEDED INTO SUPABASE!');
    console.log('====================================================');
    console.log('📌 HACKATHON JUDGING CHEAT SHEET:');
    console.log('----------------------------------------------------');
    console.log('1. DEMO CREDENTIALS:');
    console.log(`   Operator: ${DEMO_CREDENTIALS.operator.email} / ${DEMO_CREDENTIALS.operator.rawPassword}`);
    console.log(`   Citizen:  ${DEMO_CREDENTIALS.citizen.email} / ${DEMO_CREDENTIALS.citizen.rawPassword}`);
    console.log('\n2. CLUSTERING TEST:');
    console.log('   Run POST /api/complaints/:id/cluster with any of:');
    seededDrainage.forEach((c) => console.log(`   - ${c.id} (${c.title.slice(0, 45)}...)`));
    console.log('\n3. HUMAN-IN-THE-LOOP APPROVAL TEST:');
    console.log(`   Operator Plan ID: ${streetlightPlan.id}`);
    console.log(`   Call: POST /api/plans/${streetlightPlan.id}/approve with Operator JWT`);
    console.log('\n4. CLOSED-LOOP REPLANNING VERIFICATION TEST:');
    console.log(`   Pothole Complaint ID: ${potholeComplaint.id}`);
    console.log(`   Call: POST /api/complaints/${potholeComplaint.id}/verify with negative feedback to trigger auto-replan.`);
    console.log('====================================================\n');

    return {
      success: true,
      operatorUser,
      citizenUser,
      drainageComplaints: seededDrainage,
      potholeComplaint,
      potholePlan,
      streetlightComplaint,
      streetlightPlan
    };
  } catch (error) {
    console.error('❌ Error during database seeding:', error.message);
    console.error('💡 Tip: Ensure your Supabase tables are created using schema.sql and .env credentials are valid.');
    throw error;
  }
}

// Auto-run if executed directly via node CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('seedData.js') || process.argv[1].includes('seedData'));

if (isDirectExecution) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default {
  DEMO_CREDENTIALS,
  DRAINAGE_SCHOOL_ZONE_COMPLAINTS,
  RESOLVED_POTHOLE_FOR_VERIFICATION,
  CRITICAL_STREETLIGHT_FOR_APPROVAL,
  runSeed
};
