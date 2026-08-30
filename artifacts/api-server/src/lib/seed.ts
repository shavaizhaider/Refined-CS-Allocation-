import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import {
  db,
  usersTable,
  academicSessionsTable,
  facultyTable,
  coursesTable,
  offeringsTable,
  activityTable,
} from "@workspace/db";

async function ensureSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      student_id TEXT,
      programme TEXT,
      semester TEXT,
      reset_token TEXT,
      reset_token_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS academic_sessions (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      term TEXT NOT NULL,
      year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Allocation in Progress',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS faculty (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      initials TEXT NOT NULL,
      designation TEXT NOT NULL,
      type TEXT NOT NULL,
      programme TEXT NOT NULL DEFAULT 'BSCS',
      department TEXT NOT NULL DEFAULT 'Computer Science',
      expertise TEXT NOT NULL DEFAULT 'Computer Science',
      current_load NUMERIC NOT NULL DEFAULT 0,
      maximum_load NUMERIC NOT NULL DEFAULT 12,
      status TEXT NOT NULL DEFAULT 'Balanced'
    );

    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      programme TEXT NOT NULL,
      semester TEXT NOT NULL,
      credit TEXT NOT NULL,
      theory NUMERIC NOT NULL DEFAULT 0,
      lab NUMERIC NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'Core',
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS course_offerings (
      id SERIAL PRIMARY KEY,
      course_id INTEGER,
      course_code TEXT NOT NULL,
      course_title TEXT NOT NULL,
      programme TEXT NOT NULL,
      semester TEXT NOT NULL,
      section TEXT NOT NULL,
      credit TEXT NOT NULL,
      theory NUMERIC NOT NULL DEFAULT 0,
      lab NUMERIC NOT NULL DEFAULT 0,
      faculty_id INTEGER,
      faculty TEXT,
      lab_faculty_id INTEGER,
      lab_faculty TEXT,
      previous_faculty TEXT,
      capacity INTEGER NOT NULL DEFAULT 40,
      enrolled INTEGER NOT NULL DEFAULT 0,
      projected_workload NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Unallocated'
    );

    CREATE TABLE IF NOT EXISTS student_allocations (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      offering_id INTEGER NOT NULL,
      allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT student_offering_idx UNIQUE (student_id, offering_id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      "user" TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await db.execute(sql.raw(ddl));
}

export async function seedDatabase() {
  try {
    await ensureSchema();
    const existingUsers = await db.select().from(usersTable).limit(1);

    if (!existingUsers.length) {
      const hashedAdminPassword = await bcrypt.hash("admin123", 10);
      const hashedStudentPassword = await bcrypt.hash("student123", 10);

      await db.insert(usersTable).values([
        {
          email: "admin@cui.edu.pk",
          passwordHash: hashedAdminPassword,
          name: "Dr. M. Rehan Ashraf (HOD)",
          role: "ADMIN",
          studentId: null,
          programme: "BSCS",
          semester: null,
        },
        {
          email: "student@cui.edu.pk",
          passwordHash: hashedStudentPassword,
          name: "Ali Ahmad",
          role: "STUDENT",
          studentId: "FA22-BCS-001",
          programme: "BSCS",
          semester: "1",
        },
        {
          email: "student2@cui.edu.pk",
          passwordHash: hashedStudentPassword,
          name: "Zara Khan",
          role: "STUDENT",
          studentId: "FA22-BCS-002",
          programme: "BSCS",
          semester: "3",
        },
      ]);
    }

    const existingSessions = await db.select().from(academicSessionsTable).limit(1);
    if (!existingSessions.length) {
      await db.insert(academicSessionsTable).values({
        code: "FA25",
        label: "Fall 2025 Cycle",
        term: "Fall",
        year: 2025,
        status: "Allocation in Progress",
      });
    }

    const dataPath = path.resolve(process.cwd(), "../../scripts/parsed_real_data.json");
    let realData: { faculty: any[]; courses: any[]; offerings: any[] } = { faculty: [], courses: [], offerings: [] };

    if (fs.existsSync(dataPath)) {
      realData = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
    }

    const existingFaculty = await db.select().from(facultyTable).limit(1);
    if (!existingFaculty.length && realData.faculty.length) {
      for (const f of realData.faculty) {
        await db.insert(facultyTable).values(f).onConflictDoNothing();
      }
    }

    const existingCourses = await db.select().from(coursesTable).limit(1);
    if (!existingCourses.length && realData.courses.length) {
      for (const c of realData.courses) {
        await db.insert(coursesTable).values(c).onConflictDoNothing();
      }
    }

    const existingOfferings = await db.select().from(offeringsTable).limit(1);
    if (!existingOfferings.length && realData.offerings.length) {
      const allFaculty = await db.select().from(facultyTable);
      const facMap = new Map(allFaculty.map((f) => [f.name.toLowerCase(), f]));

      const offeringsToInsert = realData.offerings.map((o) => {
        const fac = o.faculty ? facMap.get(o.faculty.toLowerCase()) : null;
        const labFac = o.labFaculty ? facMap.get(o.labFaculty.toLowerCase()) : null;
        return {
          ...o,
          facultyId: fac ? fac.id : null,
          labFacultyId: labFac ? labFac.id : null,
          projectedWorkload: String(Number(o.theory || 0) + Number(o.lab || 0)),
        };
      });

      for (const off of offeringsToInsert) {
        await db.insert(offeringsTable).values(off);
      }

      await db.insert(activityTable).values({
        user: "System Importer",
        action: "Real Data Imported",
        detail: `Imported ${realData.faculty.length} faculty, ${realData.courses.length} courses, and ${realData.offerings.length} course offerings from FA25 Excel file.`,
      });
    }
  } catch (err) {
    console.error("Error during database seeding:", err);
  }
}
