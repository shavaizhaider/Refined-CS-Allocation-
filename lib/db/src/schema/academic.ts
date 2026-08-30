import { createInsertSchema } from "drizzle-zod";
import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("STUDENT"), // "STUDENT" | "ADMIN" | "FACULTY"
  studentId: text("student_id"),
  programme: text("programme"),
  semester: text("semester"),
  resetToken: text("reset_token"),
  resetTokenExpires: timestamp("reset_token_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const academicSessionsTable = pgTable("academic_sessions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  term: text("term").notNull(),
  year: integer("year").notNull(),
  status: text("status").notNull().default("Allocation in Progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const facultyTable = pgTable("faculty", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  initials: text("initials").notNull(),
  designation: text("designation").notNull(),
  type: text("type").notNull(), // "Permanent" | "Visiting"
  programme: text("programme").notNull().default("BSCS"),
  department: text("department").notNull().default("Computer Science"),
  expertise: text("expertise").notNull().default("Computer Science"),
  currentLoad: numeric("current_load").notNull().default("0"),
  maximumLoad: numeric("maximum_load").notNull().default("12"),
  status: text("status").notNull().default("Balanced"),
});

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  programme: text("programme").notNull(),
  semester: text("semester").notNull(),
  credit: text("credit").notNull(),
  theory: numeric("theory").notNull().default("0"),
  lab: numeric("lab").notNull().default("0"),
  category: text("category").notNull().default("Core"),
  status: text("status").notNull().default("Active"),
});

export const offeringsTable = pgTable("course_offerings", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id"),
  courseCode: text("course_code").notNull(),
  courseTitle: text("course_title").notNull(),
  programme: text("programme").notNull(),
  semester: text("semester").notNull(),
  section: text("section").notNull(),
  credit: text("credit").notNull(),
  theory: numeric("theory").notNull().default("0"),
  lab: numeric("lab").notNull().default("0"),
  facultyId: integer("faculty_id"),
  faculty: text("faculty"),
  labFacultyId: integer("lab_faculty_id"),
  labFaculty: text("lab_faculty"),
  previousFaculty: text("previous_faculty"),
  capacity: integer("capacity").notNull().default(40),
  enrolled: integer("enrolled").notNull().default(0),
  projectedWorkload: numeric("projected_workload").notNull().default("0"),
  status: text("status").notNull().default("Unallocated"),
});

export const studentAllocationsTable = pgTable(
  "student_allocations",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    offeringId: integer("offering_id").notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("student_offering_idx").on(table.studentId, table.offeringId),
  ]
);

export const activityTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  user: text("user").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export const insertAcademicSessionSchema = createInsertSchema(academicSessionsTable).omit({ id: true, createdAt: true });
export const insertFacultySchema = createInsertSchema(facultyTable).omit({ id: true });
export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true });
export const insertOfferingSchema = createInsertSchema(offeringsTable).omit({ id: true });
export const insertStudentAllocationSchema = createInsertSchema(studentAllocationsTable).omit({ id: true, allocatedAt: true });
export const insertActivitySchema = createInsertSchema(activityTable).omit({ id: true, timestamp: true });

export type User = typeof usersTable.$inferSelect;
export type Faculty = typeof facultyTable.$inferSelect;
export type Course = typeof coursesTable.$inferSelect;
export type CourseOffering = typeof offeringsTable.$inferSelect;
export type StudentAllocation = typeof studentAllocationsTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertAcademicSession = z.infer<typeof insertAcademicSessionSchema>;
export type InsertCourse = z.infer<typeof insertCourseSchema>;