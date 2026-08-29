import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

export interface MemoryUser {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  role: "ADMIN" | "STUDENT";
  studentId: string | null;
  programme: string | null;
  semester: string | null;
  createdAt: Date;
}

export interface MemoryFaculty {
  id: number;
  name: string;
  initials: string;
  designation: string;
  type: string;
  programme: string;
  department: string;
  expertise: string;
  currentLoad: string;
  maximumLoad: string;
  status: string;
  email?: string;
  phone?: string;
  bioNotes?: string;
}

export interface MemoryCourse {
  id: number;
  code: string;
  title: string;
  programme: string;
  semester: string;
  credit: string;
  theory: string;
  lab: string;
  category: string;
  domain: string;
  prerequisites: string[];
  coRequisites: string[];
  status: string;
}

export interface MemoryOffering {
  id: number;
  courseId: number | null;
  courseCode: string;
  courseTitle: string;
  programme: string;
  semester: string;
  section: string;
  credit: string;
  theory: string;
  lab: string;
  facultyId: number | null;
  faculty: string | null;
  labFacultyId: number | null;
  labFaculty: string | null;
  previousFaculty: string | null;
  capacity: number;
  enrolled: number;
  timeSlot: string;
  room: string;
  projectedWorkload: string;
  status: string;
}

export interface MemorySession {
  id: number;
  code: string;
  label: string;
  term: string;
  year: number;
  status: string;
  locked: boolean;
  createdAt: Date;
}

export interface MemoryActivity {
  id: number;
  user: string;
  action: string;
  detail: string;
  timestamp: Date;
}

export interface MemoryAllocation {
  id: number;
  studentId: number;
  offeringId: number;
  allocatedAt: Date;
}

class MemoryStore {
  users: MemoryUser[] = [];
  faculty: MemoryFaculty[] = [];
  courses: MemoryCourse[] = [];
  offerings: MemoryOffering[] = [];
  sessions: MemorySession[] = [];
  activity: MemoryActivity[] = [];
  allocations: MemoryAllocation[] = [];
  private initialized = false;

  async init() {
    if (this.initialized) return;

    const hashedAdminPassword = await bcrypt.hash("admin123", 10);
    const hashedStudentPassword = await bcrypt.hash("student123", 10);
    const hashedUserPassword = await bcrypt.hash("123456", 10);

    this.users = [
      {
        id: 1,
        email: "admin@cui.edu.pk",
        passwordHash: hashedAdminPassword,
        name: "Dr. M. Rehan Ashraf (HOD)",
        role: "ADMIN",
        studentId: null,
        programme: "BSCS",
        semester: null,
        createdAt: new Date(),
      },
      {
        id: 2,
        email: "student@cui.edu.pk",
        passwordHash: hashedStudentPassword,
        name: "Ali Ahmad",
        role: "STUDENT",
        studentId: "FA22-BCS-001",
        programme: "BSCS",
        semester: "1",
        createdAt: new Date(),
      },
      {
        id: 3,
        email: "f2025-0109@bnu.edu.pk",
        passwordHash: hashedUserPassword,
        name: "Student User",
        role: "STUDENT",
        studentId: "FA25-BNU-0109",
        programme: "BSCS",
        semester: "1",
        createdAt: new Date(),
      },
    ];

    this.sessions = [
      {
        id: 1,
        code: "FA25",
        label: "Fall 2025 Cycle",
        term: "Fall",
        year: 2025,
        status: "Active Cycle",
        locked: false,
        createdAt: new Date(),
      },
      {
        id: 2,
        code: "SP26",
        label: "Spring 2026 Cycle",
        term: "Spring",
        year: 2026,
        status: "Draft",
        locked: false,
        createdAt: new Date(),
      },
      {
        id: 3,
        code: "FA24",
        label: "Fall 2024 Cycle",
        term: "Fall",
        year: 2024,
        status: "Archived",
        locked: true,
        createdAt: new Date(),
      },
    ];

    // Load real Excel data
    try {
      const dataPath = path.resolve(process.cwd(), "scripts/parsed_real_data.json");
      const altDataPath = path.resolve(process.cwd(), "../../scripts/parsed_real_data.json");
      const targetPath = fs.existsSync(dataPath) ? dataPath : fs.existsSync(altDataPath) ? altDataPath : null;

      if (targetPath) {
        const raw = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
        
        const domains = ["Software Engineering", "AI & Data Science", "Computer Networks", "Cyber Security", "Humanities & Math"];
        const timeSlots = ["Mon 08:30-10:00", "Mon 10:00-11:30", "Tue 08:30-10:00", "Wed 11:30-13:00", "Thu 13:00-14:30", "Fri 09:00-10:30"];
        const rooms = ["CS Lab 1", "CS Lab 2", "LH-01", "LH-02", "LH-04", "Auditorium"];

        this.faculty = (raw.faculty || []).map((f: any, idx: number) => ({
          id: idx + 1,
          department: idx % 6 === 0 ? "Humanities" : "Computer Science",
          expertise: idx % 3 === 0 ? "Software Engineering" : idx % 3 === 1 ? "AI & Data Science" : "Computer Networks",
          currentLoad: "0",
          maximumLoad: f.maximumLoad || "12",
          status: "Balanced",
          ...f,
        }));

        this.courses = (raw.courses || []).map((c: any, idx: number) => {
          const isAdvanced = Number(c.semester || "1") >= 3;
          return {
            id: idx + 1,
            theory: String(c.theory || 0),
            lab: String(c.lab || 0),
            category: c.category || "Core",
            domain: domains[idx % domains.length],
            prerequisites: isAdvanced ? ["CSC101"] : [],
            coRequisites: c.lab > 0 ? [`${c.code}-LAB`] : [],
            status: "Active",
            ...c,
          };
        });

        this.offerings = (raw.offerings || []).map((o: any, idx: number) => ({
          id: idx + 1,
          courseId: null,
          facultyId: null,
          labFacultyId: null,
          capacity: 40,
          enrolled: Math.min(40, idx % 5 === 0 ? 40 : (idx * 7) % 35),
          timeSlot: timeSlots[idx % timeSlots.length],
          room: rooms[idx % rooms.length],
          status: o.faculty ? "Allocated" : "Unallocated",
          projectedWorkload: String(Number(o.theory || 0) + Number(o.lab || 0)),
          ...o,
        }));
      }
    } catch (e) {
      console.warn("MemoryStore: Could not load real data JSON", e);
    }

    this.activity = [
      {
        id: 1,
        user: "System Importer",
        action: "Real Data Ready",
        detail: `Loaded ${this.faculty.length} faculty and ${this.offerings.length} section offerings.`,
        timestamp: new Date(),
      },
    ];

    this.initialized = true;
  }
}

export const memoryStore = new MemoryStore();
