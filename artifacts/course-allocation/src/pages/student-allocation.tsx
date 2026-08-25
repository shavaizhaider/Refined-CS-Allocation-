import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Search,
} from "lucide-react";

interface Offering {
  id: number;
  courseCode: string;
  courseTitle: string;
  programme: string;
  semester: string;
  section: string;
  credit: string;
  theory: number;
  lab: number;
  faculty: string | null;
  labFaculty: string | null;
  capacity: number;
  enrolled: number;
  availableSeats: number;
  isAllocated?: boolean;
}

export default function StudentAllocationPage() {
  const { user, token } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [myCourses, setMyCourses] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchStudentData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [offRes, myRes] = await Promise.all([
        fetch("/api/student/offerings", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/student/my-courses", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (offRes.ok && myRes.ok) {
        const offData = await offRes.json();
        const myData = await myRes.json();
        setOfferings(offData);
        setMyCourses(myData);
      }
    } catch (err) {
      console.error("Error fetching student offerings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, [token]);

  const handleAllocate = async (offeringId: number) => {
    if (!token || actionId) return;
    setErrorMsg("");
    setSuccessMsg("");
    setActionId(offeringId);

    try {
      const res = await fetch("/api/student/allocate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ offeringId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to allocate course");
        return;
      }

      setSuccessMsg(`Successfully allocated ${data.offering.courseCode} Section ${data.offering.section}!`);
      await fetchStudentData();
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setActionId(null);
    }
  };

  const handleDrop = async (offeringId: number) => {
    if (!token || actionId) return;
    setErrorMsg("");
    setSuccessMsg("");
    setActionId(offeringId);

    try {
      const res = await fetch(`/api/student/allocate/${offeringId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Failed to drop course");
        return;
      }

      setSuccessMsg("Course dropped successfully.");
      await fetchStudentData();
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
    } finally {
      setActionId(null);
    }
  };

  const filteredOfferings = offerings.filter((o) => {
    const matchesSearch =
      o.courseCode.toLowerCase().includes(search.toLowerCase()) ||
      o.courseTitle.toLowerCase().includes(search.toLowerCase()) ||
      (o.faculty && o.faculty.toLowerCase().includes(search.toLowerCase()));

    const matchesSem = semesterFilter === "all" || String(o.semester) === semesterFilter;

    return matchesSearch && matchesSem;
  });

  const totalCredits = myCourses.reduce((sum, c) => sum + (c.theory + c.lab), 0);

  return (
    <div className="space-y-8 animate-rise-in">
      <div className="rounded-2xl border border-[#bcd8cb] bg-[#eef6f2] p-6 lg:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-[hsl(var(--primary))] text-white flex items-center justify-center text-xl font-bold">
            {user?.name?.slice(0, 2).toUpperCase() || "ST"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold font-display text-[hsl(var(--foreground))]">
                Welcome, {user?.name || "Student"}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#28695e] text-white uppercase tracking-wider">
                {user?.programme || "BSCS"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-3">
              <span>Student ID: <strong>{user?.studentId || "FA25-BCS-010"}</strong></span>
              <span>•</span>
              <span>Semester: <strong>{user?.semester || "1"}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t md:border-t-0 border-[#bcd8cb] pt-4 md:pt-0">
          <div className="bg-white rounded-xl border border-[#bcd8cb] px-4 py-3 text-center min-w-[120px]">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Allocated Courses
            </span>
            <span className="font-mono text-2xl font-extrabold text-[hsl(var(--primary))]">
              {myCourses.length}
            </span>
          </div>
          <div className="bg-white rounded-xl border border-[#bcd8cb] px-4 py-3 text-center min-w-[120px]">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Total Credit Hours
            </span>
            <span className="font-mono text-2xl font-extrabold text-[#8b681d]">
              {totalCredits} CH
            </span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#fff5f3] border border-[#e9beb8] text-xs font-bold text-[#a8493f] flex items-center gap-3">
          <AlertCircle size={18} />
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-[#dcebe5] border border-[#a2cfc1] text-xs font-bold text-[#28695e] flex items-center gap-3">
          <CheckCircle2 size={18} />
          {successMsg}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[hsl(var(--foreground))]">
              My Allocated Courses ({myCourses.length})
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Courses currently enrolled for Fall 2025 semester.
            </p>
          </div>
        </div>

        {myCourses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
            <BookOpen size={32} className="mx-auto text-[hsl(var(--muted-foreground))] mb-2" />
            <p className="font-bold text-sm">No courses allocated yet</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Select available courses from the catalogue below to allocate your schedule.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {myCourses.map((course) => (
              <div
                key={course.id}
                className="rounded-xl border border-[#bcd8cb] bg-white p-5 shadow-sm space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-[hsl(var(--primary))] bg-[#eef6f2] px-2 py-0.5 rounded">
                      {course.courseCode} — Sec {course.section}
                    </span>
                    <h3 className="font-bold text-sm mt-1.5 text-[hsl(var(--foreground))]">
                      {course.courseTitle}
                    </h3>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                    {course.credit}
                  </span>
                </div>

                <div className="text-xs space-y-1 text-[hsl(var(--muted-foreground))] border-t border-slate-100 pt-3">
                  <p>
                    <strong>Theory Instructor:</strong> {course.faculty || "To be assigned"}
                  </p>
                  {course.lab > 0 && (
                    <p>
                      <strong>Lab Instructor:</strong> {course.labFaculty || "To be assigned"}
                    </p>
                  )}
                  <p>
                    <strong>Semester:</strong> Sem {course.semester} ({course.programme})
                  </p>
                </div>

                <button
                  type="button"
                  disabled={actionId === course.id}
                  onClick={() => handleDrop(course.id)}
                  className="w-full py-2 bg-[#fff5f3] hover:bg-[#f7e3df] text-[#a8493f] border border-[#e9beb8] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {actionId === course.id ? "Dropping..." : "Drop Course"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-[hsl(var(--foreground))]">
              Available Course Offerings
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Real department course offerings for {user?.programme || "BSCS"} Fall 2025.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-xs">
              <Search size={14} className="text-[hsl(var(--muted-foreground))]" />
              <input
                type="text"
                placeholder="Search course or instructor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent outline-none w-44"
              />
            </div>

            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] outline-none"
            >
              <option value="all">All Semesters</option>
              <option value="1">Sem 1</option>
              <option value="2">Sem 2</option>
              <option value="3">Sem 3</option>
              <option value="5">Sem 5</option>
              <option value="7">Sem 7</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs font-bold text-[hsl(var(--muted-foreground))]">
            Loading real course offerings...
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <table className="w-full text-left text-sm min-w-[850px]">
              <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="px-4 py-3">Course Code</th>
                  <th className="px-4 py-3">Course Title</th>
                  <th className="px-4 py-3">Sem & Sec</th>
                  <th className="px-4 py-3">Credit</th>
                  <th className="px-4 py-3">Theory Instructor</th>
                  <th className="px-4 py-3">Lab Instructor</th>
                  <th className="px-4 py-3">Seats Available</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {filteredOfferings.map((offering) => {
                  const isAllocated = offering.isAllocated;
                  const isFull = offering.availableSeats <= 0;

                  return (
                    <tr key={offering.id} className="hover:bg-[hsl(var(--muted))]/40 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-[hsl(var(--primary))]">
                        {offering.courseCode}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-xs">
                        {offering.courseTitle}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">
                        Sem {offering.semester} — Sec {offering.section}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">
                        {offering.credit}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium">
                        {offering.faculty || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium">
                        {offering.labFaculty || (offering.lab > 0 ? <span className="text-slate-400 italic">Unassigned</span> : <span className="text-slate-300">N/A</span>)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full font-bold ${
                            isFull
                              ? "bg-red-100 text-red-700"
                              : offering.availableSeats < 10
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {offering.availableSeats} / {offering.capacity} seats left
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {isAllocated ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#28695e] bg-[#dcebe5] px-3 py-1.5 rounded-lg">
                            <CheckCircle2 size={13} />
                            Allocated
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isFull || actionId === offering.id}
                            onClick={() => handleAllocate(offering.id)}
                            className="px-3.5 py-1.5 bg-[hsl(var(--primary))] text-white text-xs font-bold rounded-lg hover:bg-[#245f58] transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            <Plus size={14} />
                            {actionId === offering.id ? "Allocating..." : isFull ? "Full" : "Allocate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
