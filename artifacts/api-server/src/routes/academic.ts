import { Router, type IRouter } from "express";
import { and, eq, ilike, sql } from "drizzle-orm";
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

const router: IRouter = Router();
let isDbSeeded = false;

async function ensureSeeded() {
  if (isDbSeeded) return;
  await seedDatabase();
  isDbSeeded = true;
}

const n = (value: string | number | null | undefined) => (value == null ? 0 : Number(value));

// ----------------------------------------------------
// Dashboard & Analytics
// ----------------------------------------------------
router.get("/dashboard", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const [sessions, faculty, courses, offerings, activity] = await Promise.all([
    db.select().from(academicSessionsTable).orderBy(academicSessionsTable.id),
    db.select().from(facultyTable),
    db.select().from(coursesTable),
    db.select().from(offeringsTable),
    db.select().from(activityTable).orderBy(activityTable.timestamp),
  ]);

  const allocated = offerings.filter((o) => o.faculty).length;
  const programmes = ["BSCS", "BSSE", "MSCS"].map((programme) => {
    const rows = offerings.filter((o) => o.programme === programme);
    return {
      programme,
      allocated: rows.filter((o) => o.faculty).length,
      total: rows.length,
      workload: rows.reduce((sum, o) => sum + n(o.projectedWorkload), 0),
    };
  });

  const workload = {
    underloaded: faculty.filter((f) => f.status === "Underloaded").length,
    balanced: faculty.filter((f) => f.status === "Balanced").length,
    nearMaximum: faculty.filter((f) => f.status === "Near Maximum").length,
    overloaded: faculty.filter((f) => f.status === "Overloaded").length,
  };

  res.json({
    session: sessions[0] || null,
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
    conflicts: offerings.filter((o) => o.status === "Conflict").length,
    activity: activity.slice(-10).reverse(),
  });
});

// ----------------------------------------------------
// Academic Sessions
// ----------------------------------------------------
router.get("/sessions", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const sessions = await db.select().from(academicSessionsTable);
  res.json(sessions);
});

router.post("/sessions", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const { code, label, term, year } = req.body;
  if (!code || !label || !term || !year) {
    res.status(400).json({ error: "Missing required session fields" });
    return;
  }
  const [row] = await db.insert(academicSessionsTable).values({ code, label, term, year: Number(year) }).returning();
  res.status(201).json(row);
});

router.post("/sessions/:id/approve", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const id = Number(req.params.id);
  const [row] = await db
    .update(academicSessionsTable)
    .set({ status: "Approved" })
    .where(eq(academicSessionsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(row);
});

// ----------------------------------------------------
// Course Catalogue
// ----------------------------------------------------
router.get("/courses", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { search, programme } = req.query;
  const filters = [];
  if (search && typeof search === "string") {
    filters.push(ilike(coursesTable.title, `%${search}%`));
  }
  if (programme && typeof programme === "string") {
    filters.push(eq(coursesTable.programme, programme));
  }

  const rows = await db
    .select()
    .from(coursesTable)
    .where(filters.length ? and(...filters) : undefined);

  res.json(rows.map((r) => ({ ...r, theory: n(r.theory), lab: n(r.lab) })));
});

router.post("/courses", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  const { code, title, programme, semester, credit, theory, lab, category } = req.body;
  if (!code || !title || !programme) {
    res.status(400).json({ error: "Course code, title, and programme are required" });
    return;
  }

  const [row] = await db
    .insert(coursesTable)
    .values({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      programme,
      semester: String(semester || "1"),
      credit: credit || "3(3,0)",
      theory: String(theory || 3),
      lab: String(lab || 0),
      category: category || "Core",
    })
    .returning();

  res.status(201).json({ ...row, theory: n(row.theory), lab: n(row.lab) });
});

// ----------------------------------------------------
// Faculty & Workload
// ----------------------------------------------------
router.get("/faculty", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { search, type } = req.query;
  let rows = await db.select().from(facultyTable);
  if (search && typeof search === "string") {
    rows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  }
  if (type && typeof type === "string") {
    rows = rows.filter((r) => r.type === type);
  }
  res.json(rows.map((r) => ({ ...r, currentLoad: n(r.currentLoad), maximumLoad: n(r.maximumLoad) })));
});

router.get("/workload", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const [faculty, offerings] = await Promise.all([
    db.select().from(facultyTable),
    db.select().from(offeringsTable),
  ]);

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
      total: assigned.reduce((s, o) => s + n(o.projectedWorkload), 0),
    };
  });

  res.json(rows);
});

// ----------------------------------------------------
// Course Offerings (Admin View)
// ----------------------------------------------------
router.get("/offerings", async (req, res): Promise<void> => {
  await ensureSeeded();
  const { programme, status } = req.query;
  let rows = await db.select().from(offeringsTable);

  if (programme && typeof programme === "string") {
    rows = rows.filter((r) => r.programme === programme);
  }
  if (status && typeof status === "string") {
    rows = rows.filter((r) => r.status === status);
  }

  res.json(
    rows.map((r) => ({
      ...r,
      theory: n(r.theory),
      lab: n(r.lab),
      projectedWorkload: n(r.projectedWorkload),
      availableSeats: Math.max(0, r.capacity - r.enrolled),
    }))
  );
});

router.patch("/allocations/:id", authenticate, requireRole("ADMIN"), async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const id = Number(req.params.id);
  const { faculty: facultyName } = req.body;

  const [row] = await db
    .update(offeringsTable)
    .set({ faculty: facultyName, status: facultyName ? "Allocated" : "Unallocated" })
    .where(eq(offeringsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Offering not found" });
    return;
  }

  await db.insert(activityTable).values({
    user: req.user?.name || "HOD",
    action: "Updated offering allocation",
    detail: `${row.courseCode} ${row.programme} Sec ${row.section} → ${facultyName || "Unassigned"}`,
  });

  res.json({
    ...row,
    theory: n(row.theory),
    lab: n(row.lab),
    projectedWorkload: n(row.projectedWorkload),
    availableSeats: Math.max(0, row.capacity - row.enrolled),
  });
});

// ----------------------------------------------------
// Student Course Allocation System
// ----------------------------------------------------
router.get("/student/offerings", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const studentId = req.user!.id;
  const userProgramme = req.user!.programme || "BSCS";

  const offerings = await db
    .select()
    .from(offeringsTable)
    .where(eq(offeringsTable.programme, userProgramme));

  const myAllocations = await db
    .select()
    .from(studentAllocationsTable)
    .where(eq(studentAllocationsTable.studentId, studentId));

  const allocatedOfferingIds = new Set(myAllocations.map((a) => a.offeringId));

  res.json(
    offerings.map((o) => ({
      ...o,
      theory: n(o.theory),
      lab: n(o.lab),
      availableSeats: Math.max(0, o.capacity - o.enrolled),
      isAllocated: allocatedOfferingIds.has(o.id),
    }))
  );
});

router.get("/student/my-courses", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const studentId = req.user!.id;

  const allocations = await db
    .select()
    .from(studentAllocationsTable)
    .where(eq(studentAllocationsTable.studentId, studentId));

  if (!allocations.length) {
    res.json([]);
    return;
  }

  const offeringIds = allocations.map((a) => a.offeringId);

  const offerings = await db.select().from(offeringsTable);
  const myOfferings = offerings.filter((o) => offeringIds.includes(o.id));

  res.json(
    myOfferings.map((o) => ({
      ...o,
      theory: n(o.theory),
      lab: n(o.lab),
      availableSeats: Math.max(0, o.capacity - o.enrolled),
    }))
  );
});

router.post("/student/allocate", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const studentId = req.user!.id;
  const { offeringId } = req.body;

  if (!offeringId) {
    res.status(400).json({ error: "Offering ID is required" });
    return;
  }

  const id = Number(offeringId);

  try {
    const result = await db.transaction(async (tx) => {
      const [offering] = await tx.select().from(offeringsTable).where(eq(offeringsTable.id, id));

      if (!offering) {
        throw new Error("NOT_FOUND: Offering does not exist");
      }

      const [existingAlloc] = await tx
        .select()
        .from(studentAllocationsTable)
        .where(
          and(
            eq(studentAllocationsTable.studentId, studentId),
            eq(studentAllocationsTable.offeringId, id)
          )
        );

      if (existingAlloc) {
        throw new Error("DUPLICATE: You have already allocated this course section");
      }

      const studentAllocs = await tx
        .select()
        .from(studentAllocationsTable)
        .where(eq(studentAllocationsTable.studentId, studentId));

      if (studentAllocs.length) {
        const studentOfferingIds = studentAllocs.map((a) => a.offeringId);
        const currentOfferings = await tx.select().from(offeringsTable);
        const allocatedCourseCodes = new Set(
          currentOfferings.filter((o) => studentOfferingIds.includes(o.id)).map((o) => o.courseCode)
        );

        if (allocatedCourseCodes.has(offering.courseCode)) {
          throw new Error(`DUPLICATE_CODE: You are already allocated to a section of ${offering.courseCode}`);
        }
      }

      if (offering.enrolled >= offering.capacity) {
        throw new Error("FULL: This course section is at maximum capacity");
      }

      const [allocation] = await tx
        .insert(studentAllocationsTable)
        .values({
          studentId,
          offeringId: id,
        })
        .returning();

      await tx
        .update(offeringsTable)
        .set({ enrolled: sql`${offeringsTable.enrolled} + 1` })
        .where(eq(offeringsTable.id, id));

      await tx.insert(activityTable).values({
        user: req.user!.name,
        action: "Allocated Course",
        detail: `${req.user!.name} (${req.user!.studentId || "Student"}) allocated ${offering.courseCode} Sec ${offering.section}`,
      });

      return { allocation, offering };
    });

    res.status(201).json({
      message: "Course allocated successfully",
      allocation: result.allocation,
      offering: result.offering,
    });
  } catch (err: any) {
    const errorMsg = err.message || "Failed to allocate course";
    if (errorMsg.startsWith("NOT_FOUND")) {
      res.status(404).json({ error: "Offering not found" });
    } else if (errorMsg.startsWith("DUPLICATE") || errorMsg.startsWith("DUPLICATE_CODE")) {
      res.status(400).json({ error: errorMsg.split(": ")[1] || "Already allocated" });
    } else if (errorMsg.startsWith("FULL")) {
      res.status(400).json({ error: "Course section is full" });
    } else {
      res.status(500).json({ error: "Database transaction failed during allocation" });
    }
  }
});

router.delete("/student/allocate/:offeringId", authenticate, async (req: AuthRequest, res): Promise<void> => {
  await ensureSeeded();
  const studentId = req.user!.id;
  const offeringId = Number(req.params.offeringId);

  try {
    await db.transaction(async (tx) => {
      const [allocation] = await tx
        .select()
        .from(studentAllocationsTable)
        .where(
          and(
            eq(studentAllocationsTable.studentId, studentId),
            eq(studentAllocationsTable.offeringId, offeringId)
          )
        );

      if (!allocation) {
        throw new Error("NOT_FOUND");
      }

      const [offering] = await tx.select().from(offeringsTable).where(eq(offeringsTable.id, offeringId));

      await tx
        .delete(studentAllocationsTable)
        .where(eq(studentAllocationsTable.id, allocation.id));

      if (offering) {
        await tx
          .update(offeringsTable)
          .set({ enrolled: sql`GREATEST(0, ${offeringsTable.enrolled} - 1)` })
          .where(eq(offeringsTable.id, offeringId));

        await tx.insert(activityTable).values({
          user: req.user!.name,
          action: "Dropped Course",
          detail: `${req.user!.name} dropped ${offering.courseCode} Sec ${offering.section}`,
        });
      }
    });

    res.json({ message: "Course dropped successfully" });
  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      res.status(404).json({ error: "Allocation record not found" });
    } else {
      res.status(500).json({ error: "Failed to drop course allocation" });
    }
  }
});

// ----------------------------------------------------
// Audit Activity Log
// ----------------------------------------------------
router.get("/activity", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const logs = await db.select().from(activityTable).orderBy(activityTable.timestamp);
  res.json(logs.reverse());
});

export default router;