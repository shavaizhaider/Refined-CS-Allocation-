import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  academicSessionsTable,
  facultyTable,
  coursesTable,
  offeringsTable,
  activityTable,
} from "@workspace/db";

export async function seedDatabase() {
  try {
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
