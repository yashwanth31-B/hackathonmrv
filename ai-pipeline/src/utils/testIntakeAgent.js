import dotenv from 'dotenv';
dotenv.config();

async function runIntakeTest() {
  console.log('====================================================');
  console.log('🧪 TEST: INTAKE & TRIAGE AGENT AUTOMATED PIPELINE');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:5000';

  // 1. Authenticate Citizen
  console.log('1. Authenticating as Citizen (citizen@civicfix.org)...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'citizen@civicfix.org',
      password: 'CitizenPassword123!'
    })
  });

  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.token) {
    throw new Error(`Citizen login failed: ${JSON.stringify(loginData)}`);
  }
  const token = loginData.token;
  console.log('   ✅ Citizen authenticated successfully. Bearer token acquired.\n');

  // 2. Submit high-priority complaint report
  const complaintPayload = {
    description:
      'Urgent! Main road junction near City Hospital has an open sewage manhole cover. Two vehicles almost crashed and it is extremely dangerous for night traffic.',
    location_text: 'City Hospital Main Junction, Ward 12',
    latitude: 17.4486,
    longitude: 78.3908
  };

  console.log('2. Sending POST /api/complaints?sync=true with simulated high-priority report...');
  console.log('   Report Description:', complaintPayload.description);
  console.log('   Location:', complaintPayload.location_text);

  const postRes = await fetch(`${BASE_URL}/api/complaints?sync=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(complaintPayload)
  });

  const postData = await postRes.json();
  console.log(`\n   HTTP Status:       ${postRes.status}`);
  console.log(`   Response Success:  ${postData.success}`);
  console.log(`   Complaint ID:      ${postData.data?.id}`);
  console.log(`   Initial Status:    ${postData.data?.status}`);

  if (postRes.status !== 201 && postRes.status !== 200) {
    throw new Error(`Failed to create complaint: ${JSON.stringify(postData)}`);
  }
  const complaintId = postData.data.id;

  // 3. Allow Gemini background analysis to process
  console.log('\n3. Waiting for Gemini Intake & Triage Agent background analysis (6 seconds)...');
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // 4. Fetch enriched complaint details
  console.log(`4. Fetching enriched complaint via GET /api/complaints/${complaintId}...`);
  const detailRes = await fetch(`${BASE_URL}/api/complaints/${complaintId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const detailData = await detailRes.json();

  if (!detailData.success) {
    throw new Error(`Failed to fetch complaint details: ${JSON.stringify(detailData)}`);
  }

  const complaint = detailData.data;

  // 5. Verification checks
  console.log('\n====================================================');
  console.log('📊 VERIFICATION RESULTS');
  console.log('====================================================');

  // Check 1: Saved in DB
  const isSavedInDb = Boolean(complaint && complaint.id === complaintId);
  console.log(`[Check 1] HTTP 201/200 & Saved in Supabase:    ${isSavedInDb ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`          DB Record ID: ${complaint.id}`);
  console.log(`          Status:       ${complaint.status}`);

  // Check 2: Priority is CRITICAL or HIGH
  const isPriorityValid = ['CRITICAL', 'HIGH'].includes(complaint.priority?.toUpperCase());
  console.log(
    `[Check 2] Priority is CRITICAL or HIGH:         ${isPriorityValid ? 'PASSED ✅' : 'FAILED ❌'}`
  );
  console.log(`          Assigned Priority: ${complaint.priority}`);
  console.log(`          AI Summary:        "${complaint.title}"`);
  console.log(`          Category:          ${complaint.category}`);

  // Check 3 & 4: Audit log & Suggested Department
  const auditLogs = complaint.auditLogs || [];
  const intakeAudit =
    [...auditLogs].reverse().find(
      (a) => a.agent_name === 'IntakeAndTriageAgent' && a.output_payload?.suggestedDepartment
    ) || auditLogs.find((a) => a.agent_name === 'IntakeAndTriageAgent');

  let isAuditFound = Boolean(intakeAudit);
  let isDeptValid = false;
  let auditOutput = intakeAudit?.output_payload || {};

  if (isAuditFound) {
    console.log(`[Check 3] Record Inserted in agent_audit_logs:  PASSED ✅`);
    console.log(`          Audit ID:     ${intakeAudit.id}`);
    console.log(`          Agent:        ${intakeAudit.agent_name}`);

    isDeptValid = auditOutput.suggestedDepartment === 'Water Supply & Sewerage Board';
    console.log(
      `[Check 4] Suggested Department is Water/Sewerage: ${isDeptValid ? 'PASSED ✅' : 'FAILED ❌'}`
    );
    console.log(`          Suggested Department: "${auditOutput.suggestedDepartment}"`);
    console.log(`          Severity Score:       ${auditOutput.severityScore}/10`);
    console.log(`          AI Reasoning:         "${auditOutput.reasoning}"`);
  } else {
    console.log(`[Check 3] Record Inserted in agent_audit_logs:  FAILED ❌ (No audit entry found)`);
    console.log(`[Check 4] Suggested Department:                 SKIPPED (No audit payload)`);
  }

  console.log('====================================================');

  const allPassed = isSavedInDb && isPriorityValid && isAuditFound && isDeptValid;
  if (allPassed) {
    console.log('🎉 ALL 4 TEST REQUIREMENTS PASSED SUCCESSFULLY!');
  } else {
    console.log('⚠️ ONE OR MORE CHECKS DID NOT MEET THE EXACT CRITERIA.');
  }
  console.log('====================================================\n');
}

runIntakeTest().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
