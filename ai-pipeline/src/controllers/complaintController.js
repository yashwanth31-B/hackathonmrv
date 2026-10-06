import { z } from 'zod';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';
import { runIntakeAndTriageAgent } from '../agents/intakeAgent.js';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const createComplaintSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  location_text: z.string().max(500).optional().default(''),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  photo_url: z.string().url('photo_url must be a valid URL').optional().nullable(),
  // imageBase64 accepted for direct upload / mobile capture; not stored directly in DB
  imageBase64: z.string().optional().nullable()
});

// ---------------------------------------------------------------------------
// POST /api/complaints
// ---------------------------------------------------------------------------
export const createComplaint = async (req, res, next) => {
  try {
    // 1. Validate input
    const parsed = createComplaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parsed.error.errors
      });
    }

    const {
      description,
      location_text,
      latitude,
      longitude,
      photo_url,
      imageBase64
    } = parsed.data;

    const citizenId = req.user.id;  // set by authenticate middleware

    // 2. Insert bare complaint (SUBMITTED) — we'll enrich it with agent output next
    const [complaint] = await dbQuery(
      supabaseAdmin
        .from('complaints')
        .insert({
          citizen_id: citizenId,
          title: description.slice(0, 120),  // placeholder title; overwritten by agent
          description,
          location_text: location_text || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          photo_url: photo_url || null,
          status: 'SUBMITTED'
        })
        .select()
    );

    // 3. Run Intake & Triage Agent asynchronously — do not block HTTP response
    //    Update the complaint row with the agent's classification in the background.
    runIntakeAndTriageAgent(description, imageBase64 || null, complaint.id)
      .then(async (agentOutput) => {
        // Map agent output → exact complaint column names
        const update = {
          title: agentOutput.summary || complaint.title,
          category: agentOutput.category || null,
          priority: agentOutput.priority || 'MEDIUM',
          status: 'ANALYZED'
        };

        const { error: updateError } = await supabaseAdmin
          .from('complaints')
          .update(update)
          .eq('id', complaint.id);

        if (updateError) {
          console.error(
            `[complaintController] Agent enrichment update failed for ${complaint.id}:`,
            updateError.message
          );
        } else {
          console.log(
            `[complaintController] Complaint ${complaint.id} enriched → category: ${agentOutput.category}, priority: ${agentOutput.priority}`
          );
        }
      })
      .catch((agentErr) => {
        // Agent failure must not crash the complaint creation; log and move on
        console.error(
          `[complaintController] runIntakeAndTriageAgent failed for ${complaint.id}:`,
          agentErr.message
        );
      });

    // 4. Return the saved complaint immediately (agent runs in background)
    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully. AI analysis is running in the background.',
      data: complaint
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/complaints
// Query params: status, citizen_id, category, page, limit
// ---------------------------------------------------------------------------
export const getComplaints = async (req, res, next) => {
  try {
    const {
      status,
      citizen_id,
      category,
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from('complaints')
      .select(
        `id, title, description, category, priority, status,
         location_text, latitude, longitude, photo_url, created_at,
         citizen_id,
         users!complaints_citizen_id_fkey (id, name, email)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    // Role-based filtering:
    // - CITIZEN can only see their own complaints
    // - OPERATOR / ADMIN / FIELD_TEAM can see all, with optional filters
    if (req.user?.role === 'CITIZEN') {
      query = query.eq('citizen_id', req.user.id);
    } else {
      if (citizen_id) query = query.eq('citizen_id', citizen_id);
    }

    if (status)   query = query.eq('status', status.toUpperCase());
    if (category) query = query.eq('category', category.toUpperCase());

    const { data, error, count } = await query;

    if (error) {
      const err = new Error(error.message);
      err.statusCode = 400;
      throw err;
    }

    return res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      },
      data
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/complaints/:id
// Returns full complaint + cluster + plans + tasks + verifications + audit logs
// ---------------------------------------------------------------------------
export const getComplaintById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch core complaint with citizen info
    const { data: complaint, error: complaintError } = await supabaseAdmin
      .from('complaints')
      .select(
        `id, title, description, category, priority, status,
         location_text, latitude, longitude, photo_url, created_at,
         users!complaints_citizen_id_fkey (id, name, email)`
      )
      .eq('id', id)
      .maybeSingle();

    if (complaintError) throw new Error(complaintError.message);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint with id "${id}" not found.`
      });
    }

    // Role-guard: citizen can only view their own complaint
    if (
      req.user?.role === 'CITIZEN' &&
      complaint.users?.id !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this complaint.'
      });
    }

    // 2. Fetch linked cluster (via complaint_clusters join table)
    const { data: clusterLinks } = await supabaseAdmin
      .from('complaint_clusters')
      .select(`
        cluster_id,
        clusters (
          id, root_cause_title, category, summary, complaint_count, location_summary, created_at
        )
      `)
      .eq('complaint_id', id);

    const clusters = (clusterLinks || [])
      .map((row) => row.clusters)
      .filter(Boolean);

    // 3. Fetch plans + nested tasks
    const { data: plans } = await supabaseAdmin
      .from('plans')
      .select(`
        id, plan_title, estimated_cost, estimated_hours, status, created_at,
        tasks (
          id, step_number, task_name, description, assigned_team, status, due_at
        )
      `)
      .eq('complaint_id', id)
      .order('created_at', { ascending: true });

    // 4. Fetch verifications
    const { data: verifications } = await supabaseAdmin
      .from('verifications')
      .select('id, is_resolved, citizen_feedback, photo_url, verified_at')
      .eq('complaint_id', id)
      .order('verified_at', { ascending: false });

    // 5. Fetch agent audit logs (excluding heavy payloads by default)
    const { data: auditLogs } = await supabaseAdmin
      .from('agent_audit_logs')
      .select('id, agent_name, created_at, output_payload')
      .eq('complaint_id', id)
      .order('created_at', { ascending: true });

    return res.status(200).json({
      success: true,
      data: {
        ...complaint,
        clusters: clusters || [],
        plans: plans || [],
        verifications: verifications || [],
        auditLogs: auditLogs || []
      }
    });
  } catch (error) {
    next(error);
  }
};

export default { createComplaint, getComplaints, getComplaintById };
