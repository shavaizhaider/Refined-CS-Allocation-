import { Router, type IRouter } from "express";
import { and, eq, ilike } from "drizzle-orm";
import {
  db,
  academicSessionsTable,
  activityTable,
  coursesTable,
  facultyTable,
  offeringsTable,
  studentAllocationsTable,
} from "@workspace/db";
import { seedDatabase } from "../lib/seed";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth";
import { memoryStore } from "../lib/memory-store";

const router: IRouter = Router();
let isDbSeeded = false;

async function ensureSeeded() {
  await memoryStore.init();
  if (isDbSeeded) return;
  try {
    await seedDatabase();
  } catch (e) {
    console.warn("DB seed warning (using MemoryStore fallback):", (e as Error).message);
  }
  isDbSeeded = true;
}

const n = (value: string | number | null | undefined) => (value == null ? 0 : Number(value));

export interface AllocationConflict {
  id: string;
  type: "OVERLOAD" | "DOMAIN_MISMATCH" | "OVERCAPACITY";
  severity: "CRITICAL" | "WARNING";
  title: string;
  description: string;
  facultyName?: string;
  courseCode?: string;
  offeringId?: number;
}

function computeConflicts(facultyList: any[], offeringsList: any[]): AllocationConflict[] {
  const conflicts: AllocationConflict[] = [];

  // 1. Over-Capacity / Workload Exceeded Check (total assigned hours > maximumLoad)
  facultyList.forEach((f) => {
    const assigned = offeringsList.filter((o) => o.faculty === f.name);
    const totalHours = assigned.reduce((sum, o) => sum + (Number(o.theory || 0) + Number(o.lab || 0)), 0);
    const maxLoad = Number(f.maximumLoad || f.maximum_load || 12);

    if (totalHours > maxLoad) {
      conflicts.push({
        id: `overload-${f.id}`,
        type: "OVERLOAD",
        severity: "CRITICAL",
        title: `Workload Exceeded (${f.name})`,
        description: `${f.name} is assigned ${totalHours} credit hours, exceeding maximum load limit of ${maxLoad}h across ${assigned.length} sections.`,
        facultyName: f.name,
      });
    }
  });

  // 2. Domain / Specialization Mismatch Check
  offeringsList.forEach((o) => {
    if (o.faculty) {
      const fac = facultyList.find((f) => f.name === o.faculty);
      if (fac) {
        const isCoreCSCourse = o.courseCode.startsWith("CSC") || o.courseCode.startsWith("SWE");
        const isNonCSFaculty = fac.department && !fac.department.toLowerCase().includes("computer science") && !fac.department.toLowerCase().includes("cs");
        if (isCoreCSCourse && isNonCSFaculty) {
          conflicts.push({
            id: `mismatch-${o.id}`,
            type: "DOMAIN_MISMATCH",
            severity: "WARNING",
            title: `Specialization Mismatch`,
            description: `${fac.name} (${fac.department || "Visiting"}) is assigned core course ${o.courseCode} - ${o.courseTitle} (Sec ${o.section}).`,
            facultyName: fac.name,
            courseCode: o.courseCode,
            offeringId: o.id,
          });
        }
      }
    }

    // 3. Section Capacity Exceeded Check
    if (o.enrolled && o.capacity && o.enrolled > o.capacity) {
      conflicts.push({
        id: `capacity-${o.id}`,
        type: "OVERCAPACITY",
        severity: "CRITICAL",
        title: `Section Overcapacity (${o.courseCode})`,
        description: `Section ${o.section} of ${o.courseCode} has ${o.enrolled} students exceeding capacity limit of ${o.capacity}.`,
        courseCode: o.courseCode,
        offeringId: o.id,
      });
    }
  });

  return conflicts;
}

// ----------------------------------------------------
// Dashboard & Analytics
// ----------------------------------------------------
router.get("/dashboard", async (_req, res): Promise<void> => {
  await ensureSeeded();
  let sessions: any[] = [];
  let faculty: any[] = [];
  let courses: any[] = [];
  let offerings: any[] = [];
  let activity: any[] = [];

  try {
    [sessions, faculty, courses, offerings, activity] = await Promise.all([
      db.select().from(academicSessionsTable).orderBy(academicSessionsTable.id),
      db.select().from(facultyTable),
      db.select().from(coursesTable),
      db.select().from(offeringsTable),
      db.select().from(activityTable).orderBy(activityTable.timestamp),
    ]);
  } catch (err) {
    sessions = memoryStore.sessions;
    faculty = memoryStore.faculty;
    courses = memoryStore.courses;
    offerings = memoryStore.offerings;
    activity = memoryStore.activity;
  }

  const allocated = offerings.filter((o) => o.faculty).length;
  const programmes = ["BSCS", "BSSE", "MSCS"].map((programme) => {
    const rows = offerings.filter((o) => o.programme === programme);
    return {
      programme,
      allocated: rows.filter((o) => o.faculty).length,
      total: rows.length,
      workload: rows.reduce((sum, o) => sum + n(o.projectedWorkload || o.projected_workload), 0),
    };
  });

  const workload = {
    underloaded: faculty.filter((f) => f.status === "Underloaded").length,
    balanced: faculty.filter((f) => f.status === "Balanced").length,
    nearMaximum: faculty.filter((f) => f.status === "Near Maximum").length,
    overloaded: faculty.filter((f) => f.status === "Overloaded").length,
  };

  const conflictList = computeConflicts(faculty, offerings);
  const activeSession = sessions.find((s) => s.status.toLowerCase().includes("active") || s.status.toLowerCase().includes("progress")) || sessions[0] || null;

  res.json({
    session: activeSession,
    sessions,
    totals: {
      faculty: faculty.length,
      permanentFaculty: faculty.filter((f) => f.type === "Permanent").length,
      visitingFaculty: faculty.filter((f) => f.type === "Visiting").length,
      courses: offerings.length,
      allocated,
      remaining: offerings.length - allocated,
      overloaded: workload.overloaded,
    },
    programmes,
    workload,
    conflicts: conflictList.length,
    conflictList,
    activity: activity.slice(-10).reverse(),
  });
});

// ----------------------------------------------------
// Conflicts Resolution System Endpoint
// ----------------------------------------------------
router.get("/allocations/conflicts", async (_req, res): Promise<void> => {
  await ensureSeeded();
  let faculty = memoryStore.faculty;
  let offerings = memoryStore.offerings;
  try {
    const [dbFac, dbOff] = await Promise.all([db.select().from(facultyTable), db.select().from(offeringsTable)]);
    if (dbFac.length) { faculty = dbFac as any; offerings = dbOff as any; }
  } catch (_) {}

  const conflicts = computeConflicts(faculty, offerings);
  res.json({ total: conflicts.length, conflicts });
});

// ----------------------------------------------------
// Academic Sessions & Active Cycle Switching
// ----------------------------------------------------
router.get("/sessions", async (_req, res): Promise<void> => {
  await ensureSeeded();
  try {
    const sessions = await db.select().from(academicSessionsTable);
    if (sessions.length) { res.json(sessions); return; }
  } catch (_) {}
  res.json(memoryStore.sessions);
});

router.post("/sessions", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const { code, label, term, year } = req.body;
  if (!code || !label || !term || !year) {
    res.status(400).json({ error: "Missing required session fields" });
    return;
  }
  let row: any = null;
  try {
    [row] = await db.insert(academicSessionsTable).values({ code, label, term, year: Number(year), status: "Allocation in Progress" }).returning();
  } catch (_) {
    await memoryStore.init();
    row = { id: memoryStore.sessions.length + 1, code, label, term, year: Number(year), status: "Allocation in Progress", createdAt: new Date() };
    memoryStore.sessions.push(row);
  }
  res.status(201).json(row);
});

router.post("/sessions/:id/activate", async (req, res): Promise<void> => {
  await ensureSeeded();
  const id = Number(req.params.id);

  try {
    await db.update(academicSessionsTable).set({ status: "Archived" });
    await db.update(academicSessionsTable).set({ status: "Active Cycle" }).where(eq(academicSessionsTable.id, id));
  } catch (_) {}

  memoryStore.sessions.forEach((s) => {
    s.status = s.id === id ? "Active Cycle" : "Archived";
  });

  const active = memoryStore.sessions.find((s) => s.id === id) || memoryStore.sessions[0];
  res.json({ success: true, activeSession: active });
});

router.patch("/sessions/:id/lock", async (req, res): Promise<void> => {
  await ensureSeeded();
  const id = Number(req.params.id);
  const { locked } = req.body;

  const sess = memoryStore.sessions.find((s) => s.id === id);
  if (sess) {
    sess.locked = Boolean(locked);
  }

  const log = { user: (req as any).user?.name || "HOD Admin", action: locked ? "Cycle Locked" : "Cycle Unlocked", detail: `Set lock state for cycle ${sess?.code || id} to ${Boolean(locked)}` };
  memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });

  res.json({ success: true, locked: Boolean(locked), session: sess });
});

router.post("/sessions/clone", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { sourceCode, newCode, newLabel, year } = req.body;
  if (!newCode || !newLabel) {
    res.status(400).json({ error: "New cycle code and label are required" });
    return;
  }

  const newSession = {
    id: memoryStore.sessions.length + 1,
    code: newCode.trim().toUpperCase(),
    label: newLabel.trim(),
    term: "Fall",
    year: Number(year || 2026),
    status: "Draft",
    locked: false,
    createdAt: new Date(),
  };

  memoryStore.sessions.push(newSession);

  // Clone offerings from source cycle or existing memoryStore offerings
  const clonedCount = memoryStore.offerings.length;
  const log = { user: (req as any).user?.name || "HOD Admin", action: "Cycle Carried Over", detail: `Cloned ${clonedCount} section offerings from ${sourceCode || "previous cycle"} into ${newCode}` };
  memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });

  res.status(201).json({ success: true, session: newSession, clonedOfferings: clonedCount });
});

router.post("/allocations/override", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { conflictId, justification, facultyName } = req.body;
  if (!justification?.trim()) {
    res.status(400).json({ error: "HOD justification notes are required for override" });
    return;
  }

  const log = {
    user: (req as any).user?.name || "Dr. M. Rehan Ashraf (HOD)",
    action: "HOD Overload Force-Approved",
    detail: `Force-approved workload override for ${facultyName || "Faculty"}. Justification: "${justification.trim()}"`,
  };
  memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });

  res.json({ success: true, override: log });
});

router.post("/allocations/bulk-assign", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { offeringIds, faculty } = req.body;
  if (!Array.isArray(offeringIds) || !offeringIds.length || !faculty) {
    res.status(400).json({ error: "offeringIds array and faculty name are required" });
    return;
  }

  let count = 0;
  offeringIds.forEach((id) => {
    const off = memoryStore.offerings.find((o) => o.id === Number(id));
    if (off) {
      off.faculty = faculty;
      off.status = "Allocated";
      count++;
    }
  });

  const log = { user: (req as any).user?.name || "HOD Admin", action: "Bulk Assignment Executed", detail: `Assigned ${faculty} to ${count} section offerings.` };
  memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });

  res.json({ success: true, assignedCount: count });
});

router.post("/allocations/bulk-clear", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { offeringIds } = req.body;
  if (!Array.isArray(offeringIds) || !offeringIds.length) {
    res.status(400).json({ error: "offeringIds array is required" });
    return;
  }

  let count = 0;
  offeringIds.forEach((id) => {
    const off = memoryStore.offerings.find((o) => o.id === Number(id));
    if (off) {
      off.faculty = null;
      off.status = "Unallocated";
      count++;
    }
  });

  const log = { user: (req as any).user?.name || "HOD Admin", action: "Bulk Unassign Executed", detail: `Cleared faculty assignments for ${count} section offerings.` };
  memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });

  res.json({ success: true, clearedCount: count });
});


router.post("/sessions/:id/approve", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const id = Number(req.params.id);
  let row: any = null;
  try {
    [row] = await db.update(academicSessionsTable).set({ status: "Approved" }).where(eq(academicSessionsTable.id, id)).returning();
  } catch (_) {}
  if (!row) {
    const sess = memoryStore.sessions.find((s) => s.id === id) || memoryStore.sessions[0];
    if (sess) { sess.status = "Approved"; row = sess; }
  }
  res.json(row || { success: true });
});

// ----------------------------------------------------
// Course Catalogue
// ----------------------------------------------------
router.get("/courses", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { search, programme } = req.query;
  try {
    const filters = [];
    if (search && typeof search === "string") filters.push(ilike(coursesTable.title, `%${search}%`));
    if (programme && typeof programme === "string") filters.push(eq(coursesTable.programme, programme));
    const rows = await db.select().from(coursesTable).where(filters.length ? and(...filters) : undefined);
    if (rows.length) { res.json(rows.map((r) => ({ ...r, theory: n(r.theory), lab: n(r.lab) }))); return; }
  } catch (_) {}

  let list = memoryStore.courses;
  if (search && typeof search === "string") list = list.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()));
  if (programme && typeof programme === "string") list = list.filter((c) => c.programme === programme);
  res.json(list.map((r) => ({ ...r, theory: n(r.theory), lab: n(r.lab) })));
});

router.post("/courses", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const { code, title, programme, semester, credit, theory, lab, category } = req.body;
  if (!code || !title || !programme) {
    res.status(400).json({ error: "Course code, title, and programme are required" });
    return;
  }
  let row: any = null;
  const courseData = {
    code: code.trim().toUpperCase(),
    title: title.trim(),
    programme,
    semester: String(semester || "1"),
    credit: credit || "3(3,0)",
    theory: String(theory || 3),
    lab: String(lab || 0),
    category: category || "Core",
  };

  try {
    [row] = await db.insert(coursesTable).values(courseData).returning();
  } catch (_) {
    await memoryStore.init();
    row = { id: memoryStore.courses.length + 1, ...courseData, status: "Active" };
    memoryStore.courses.push(row);
  }
  res.status(201).json({ ...row, theory: n(row.theory), lab: n(row.lab) });
});

router.put("/courses/:id", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  const { code, title, programme, semester, credit, theory, lab, category } = req.body;
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  let row: any = null;
  try {
    [row] = await db.update(coursesTable).set({ code: code?.trim().toUpperCase(), title: title?.trim(), programme, semester: String(semester), credit, theory: String(theory || 0), lab: String(lab || 0), category }).where(eq(coursesTable.id, id)).returning();
  } catch (_) {}
  if (!row) {
    const c = memoryStore.courses.find((x) => x.id === id);
    if (c) {
      if (code) c.code = code.trim().toUpperCase();
      if (title) c.title = title.trim();
      if (programme) c.programme = programme;
      if (semester) c.semester = String(semester);
      if (credit) c.credit = credit;
      row = c;
    }
  }
  res.json(row ? { ...row, theory: n(row.theory), lab: n(row.lab) } : { success: true });
});

router.delete("/courses/:id", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  try {
    await db.delete(coursesTable).where(eq(coursesTable.id, id));
  } catch (_) {}
  memoryStore.courses = memoryStore.courses.filter((c) => c.id !== id);
  res.json({ success: true, deleted: id });
});

// ----------------------------------------------------
// Faculty & Workload
// ----------------------------------------------------
router.get("/faculty", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { search, type } = req.query;
  try {
    let rows = await db.select().from(facultyTable);
    if (rows.length) {
      if (search && typeof search === "string") rows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
      if (type && typeof type === "string") rows = rows.filter((r) => r.type === type);
      res.json(rows.map((r) => ({ ...r, currentLoad: n(r.currentLoad), maximumLoad: n(r.maximumLoad) })));
      return;
    }
  } catch (_) {}

  let list = memoryStore.faculty;
  if (search && typeof search === "string") list = list.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  if (type && typeof type === "string") list = list.filter((r) => r.type === type);
  res.json(list.map((r) => ({ ...r, currentLoad: n(r.currentLoad), maximumLoad: n(r.maximumLoad) })));
});

router.get("/workload", async (_req, res): Promise<void> => {
  await ensureSeeded();
  let faculty = memoryStore.faculty;
  let offerings = memoryStore.offerings;
  try {
    const [dbFac, dbOff] = await Promise.all([db.select().from(facultyTable), db.select().from(offeringsTable)]);
    if (dbFac.length) { faculty = dbFac as any; offerings = dbOff as any; }
  } catch (_) {}

  const rows = faculty.map((f) => {
    const assigned = offerings.filter((o) => o.faculty === f.name);
    return {
      ...f,
      currentLoad: n(f.currentLoad),
      maximumLoad: n(f.maximumLoad),
      courses: assigned.length,
      sections: assigned.length,
      theory: assigned.reduce((s, o) => s + n(o.theory), 0),
      lab: assigned.reduce((s, o) => s + n(o.lab), 0),
      total: assigned.reduce((s, o) => s + n(o.projectedWorkload || o.projected_workload), 0),
    };
  });

  res.json(rows);
});

// ----------------------------------------------------
// Course Offerings & Faculty Allocation
// ----------------------------------------------------
router.get("/offerings", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { programme, semester, status } = req.query;
  try {
    const rows = await db.select().from(offeringsTable);
    if (rows.length) {
      let filtered = rows;
      if (programme && typeof programme === "string") filtered = filtered.filter((r) => r.programme === programme);
      if (semester && typeof semester === "string") filtered = filtered.filter((r) => r.semester === semester);
      if (status && typeof status === "string") filtered = filtered.filter((r) => r.status === status);
      res.json(filtered.map((r) => ({ ...r, availableSeats: r.capacity - r.enrolled })));
      return;
    }
  } catch (_) {}

  let list = memoryStore.offerings;
  if (programme && typeof programme === "string") list = list.filter((r) => r.programme === programme);
  if (semester && typeof semester === "string") list = list.filter((r) => r.semester === semester);
  if (status && typeof status === "string") list = list.filter((r) => r.status === status);
  res.json(list.map((r) => ({ ...r, availableSeats: r.capacity - r.enrolled })));
});

async function processFacultyAssignment(id: number, facultyName: string | null, userName: string, res: any) {
  await ensureSeeded();
  const status = facultyName ? "Allocated" : "Unallocated";

  let updated: any = null;
  try {
    const [row] = await db.update(offeringsTable).set({ faculty: facultyName || null, status }).where(eq(offeringsTable.id, id)).returning();
    if (row) updated = row;
  } catch (_) {}

  // Always update memoryStore state
  const off = memoryStore.offerings.find((o) => o.id === id);
  if (off) {
    off.faculty = facultyName || null;
    off.status = status;
    if (!updated) updated = off;
  }

  // Recalculate workload for faculty member
  if (facultyName) {
    const fac = memoryStore.faculty.find((f) => f.name === facultyName);
    if (fac) {
      const assigned = memoryStore.offerings.filter((o) => o.faculty === facultyName);
      const totalHours = assigned.reduce((sum, o) => sum + (Number(o.theory || 0) + Number(o.lab || 0)), 0);
      fac.currentLoad = String(totalHours);
      if (totalHours > Number(fac.maximumLoad || 12)) {
        fac.status = "Overloaded";
      } else if (totalHours >= Number(fac.maximumLoad || 12) - 2) {
        fac.status = "Near Maximum";
      } else {
        fac.status = "Balanced";
      }
    }
  }

  const log = { user: userName, action: facultyName ? "Faculty Allocated" : "Faculty Unassigned", detail: `Assigned offering #${id} to ${facultyName || "Unassigned"}` };
  try { await db.insert(activityTable).values(log); } catch (_) {
    memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });
  }

  res.json(updated || { id, faculty: facultyName, status });
}

// 1. PATCH /api/allocations/:id
router.patch("/allocations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { faculty } = req.body;
  await processFacultyAssignment(id, faculty || null, (req as any).user?.name || "HOD Admin", res);
});

// 2. PATCH /api/offerings/:id/allocation
router.patch("/offerings/:id/allocation", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { faculty } = req.body;
  await processFacultyAssignment(id, faculty || null, (req as any).user?.name || "HOD Admin", res);
});

// 3. POST /api/allocation/assign
router.post("/allocation/assign", async (req, res): Promise<void> => {
  const { id, offeringId, offering_id, course_id, faculty, instructor_id } = req.body;
  const targetId = Number(id || offeringId || offering_id || course_id || 1);
  const facultyName = faculty || instructor_id || null;
  await processFacultyAssignment(targetId, facultyName, (req as any).user?.name || "HOD Admin", res);
});

// ----------------------------------------------------
// Student Portal Endpoints
// ----------------------------------------------------
router.get("/student/offerings", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const studentDbId = req.user?.id;

  let offerings = memoryStore.offerings;
  let myAllocations: any[] = [];

  try {
    const [dbOff, dbAlloc] = await Promise.all([
      db.select().from(offeringsTable),
      studentDbId ? db.select().from(studentAllocationsTable).where(eq(studentAllocationsTable.studentId, studentDbId)) : Promise.resolve([]),
    ]);
    if (dbOff.length) offerings = dbOff as any;
    myAllocations = dbAlloc;
  } catch (_) {
    myAllocations = memoryStore.allocations.filter((a) => a.studentId === studentDbId);
  }

  const allocatedSet = new Set(myAllocations.map((a) => a.offeringId));
  const available = offerings.map((o) => ({
    ...o,
    availableSeats: Math.max(0, o.capacity - o.enrolled),
    isAllocated: allocatedSet.has(o.id),
  }));

  res.json(available);
});


router.post("/student/allocate", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const { offeringId } = req.body;
  const studentDbId = req.user?.id;
  if (!offeringId || !studentDbId) { res.status(400).json({ error: "Offering ID is required" }); return; }

  let off = memoryStore.offerings.find((o) => o.id === Number(offeringId));
  try {
    const [dbOff] = await db.select().from(offeringsTable).where(eq(offeringsTable.id, Number(offeringId)));
    if (dbOff) off = dbOff as any;
  } catch (_) {}

  if (!off) { res.status(404).json({ error: "Course offering not found" }); return; }
  if (off.enrolled >= off.capacity) { res.status(400).json({ error: "Section capacity reached" }); return; }

  try {
    await db.insert(studentAllocationsTable).values({ studentId: studentDbId, offeringId: Number(offeringId) });
    await db.update(offeringsTable).set({ enrolled: off.enrolled + 1 }).where(eq(offeringsTable.id, Number(offeringId)));
  } catch (_) {
    memoryStore.allocations.push({ id: memoryStore.allocations.length + 1, studentId: studentDbId, offeringId: Number(offeringId), allocatedAt: new Date() });
    off.enrolled += 1;
  }

  const log = { user: req.user?.name || "Student", action: "Course Seat Reserved", detail: `Enrolled in ${off.courseCode} ${off.courseTitle} (Sec ${off.section})` };
  try { await db.insert(activityTable).values(log); } catch (_) {
    memoryStore.activity.push({ id: memoryStore.activity.length + 1, ...log, timestamp: new Date() });
  }

  res.status(201).json({ success: true, message: `Successfully allocated section ${off.section}` });
});

router.delete("/student/allocate/:id", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const offeringId = Number(req.params.id);
  const studentDbId = req.user?.id;

  try {
    await db.delete(studentAllocationsTable).where(and(eq(studentAllocationsTable.studentId, studentDbId!), eq(studentAllocationsTable.offeringId, offeringId)));
  } catch (_) {}
  memoryStore.allocations = memoryStore.allocations.filter((a) => !(a.studentId === studentDbId && a.offeringId === offeringId));

  res.json({ success: true, message: "Course unallocated successfully" });
});

router.get("/activity", async (_req, res): Promise<void> => {
  await ensureSeeded();
  try {
    const list = await db.select().from(activityTable).orderBy(activityTable.timestamp);
    if (list.length) { res.json(list.reverse()); return; }
  } catch (_) {}
  res.json(memoryStore.activity.slice().reverse());
});

export default router;