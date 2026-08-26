import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Search,
  ArrowRightLeft,
  GraduationCap,
  Clock,
  Send,
  X,
  HelpCircle,
  Sparkles,
  FilterX,
  CheckCheck,
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
  timeSlot?: string;
  room?: string;
  prerequisites?: string[];
  isAllocated?: boolean;
}

type Toast = { id: number; message: string; type: "success" | "error" | "info" };

export default function StudentAllocationPage() {
  const { user, token } = useAuth();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [enrolled, setEnrolled] = useState<Offering[]>([]);
  const [draft, setDraft] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [dropCandidate, setDropCandidate] = useState<Offering | null>(null);
  const [swapCandidate, setSwapCandidate] = useState<Offering | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: Toast["type"] = "success") => {
    const t = { id: Date.now() + Math.random(), message, type };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 3500);
  };

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const [offRes, myRes] = await Promise.all([
        fetch("/api/student/offerings", { headers }),
        fetch("/api/student/my-courses", { headers }),
      ]);

      if (offRes.ok) {
        const offData = await offRes.json();
        setOfferings(offData);
      }
      if (myRes.ok) {
        const myData = await myRes.json();
        setEnrolled(myData);
        setDraft(myData);
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

  // Calculate total credit hours
  const parseCreditHours = (creditStr: string) => {
    const match = creditStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 3;
  };

  const totalCredits = draft.reduce((sum, item) => sum + parseCreditHours(item.credit), 0);

  // Smart Filter offerings
  const filteredOfferings = offerings.filter((o) => {
    const query = search.trim().toLowerCase();
    const matchSearch =
      !query ||
      o.courseCode.toLowerCase().includes(query) ||
      o.courseTitle.toLowerCase().includes(query) ||
      (o.faculty && o.faculty.toLowerCase().includes(query)) ||
      (o.programme && o.programme.toLowerCase().includes(query));

    const matchSem = semesterFilter === "all" || String(o.semester) === semesterFilter;
    return matchSearch && matchSem;
  });

  // Action: Auto-enroll recommended courses
  const handleAutoEnrollRecommended = () => {
    const recommended = offerings.filter(
      (o) => String(o.semester) === "1" && !draft.some((d) => d.courseCode === o.courseCode)
    ).slice(0, 4);

    if (!recommended.length) {
      addToast("Recommended courses are already in your draft plan.", "info");
      return;
    }

    setDraft((prev) => [...prev, ...recommended]);
    addToast(`Added ${recommended.length} recommended Semester 1 courses to your plan!`, "success");
  };

  // Action: Enroll
  const handleEnroll = (offering: Offering) => {
    // 1. Credit Hour Cap Check (Max 18 CH)
    const newCH = parseCreditHours(offering.credit);
    if (totalCredits + newCH > 18) {
      addToast(`Credit hour limit exceeded (Max: 18 CH). Current: ${totalCredits} CH`, "error");
      return;
    }

    // 2. Already enrolled check
    if (draft.some((d) => d.id === offering.id || d.courseCode === offering.courseCode)) {
      addToast(`You are already enrolled in ${offering.courseCode}`, "info");
      return;
    }

    // 3. Time Slot Collision Guard
    if (offering.timeSlot) {
      const collision = draft.find((d) => d.timeSlot === offering.timeSlot);
      if (collision) {
        addToast(`Time conflict detected with ${collision.courseCode} (${offering.timeSlot})`, "error");
        return;
      }
    }

    // 4. Seats Available Check
    if (offering.availableSeats <= 0) {
      addToast(`Section ${offering.section} of ${offering.courseCode} is FULL.`, "error");
      return;
    }

    // Move to draft & update local available seats
    setDraft((prev) => [...prev, offering]);
    setOfferings((prev) =>
      prev.map((o) =>
        o.id === offering.id ? { ...o, availableSeats: o.availableSeats - 1, enrolled: o.enrolled + 1 } : o
      )
    );

    addToast(`Added ${offering.courseCode} (Sec ${offering.section}) to registration plan`, "success");
  };

  // Action: Drop (Confirm Modal)
  const confirmDrop = () => {
    if (!dropCandidate) return;
    setDraft((prev) => prev.filter((d) => d.id !== dropCandidate.id));
    setOfferings((prev) =>
      prev.map((o) =>
        o.id === dropCandidate.id ? { ...o, availableSeats: o.availableSeats + 1, enrolled: Math.max(0, o.enrolled - 1) } : o
      )
    );
    addToast(`Dropped ${dropCandidate.courseCode} from registration plan`, "info");
    setDropCandidate(null);
  };

  // Action: Section Swap
  const handleSwap = (currentOffering: Offering, newSectionOffering: Offering) => {
    setDraft((prev) => prev.map((d) => (d.id === currentOffering.id ? newSectionOffering : d)));
    addToast(`Switched ${currentOffering.courseCode} to Section ${newSectionOffering.section}`, "success");
    setSwapCandidate(null);
  };

  // Action: Submit Registration Plan
  const handleSubmitPlan = async () => {
    if (totalCredits < 12) {
      addToast("Minimum 12 Credit Hours required for full-time registration plan.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Submit each course in draft
      for (const item of draft) {
        await fetch("/api/student/allocate", {
          method: "POST",
          headers,
          body: JSON.stringify({ offeringId: item.id }),
        });
      }

      setEnrolled(draft);
      addToast("Registration Plan Submitted! Status: Pending HOD Final Approval", "success");
    } catch {
      addToast("Submission error. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in pb-12">
      {/* Toast Alert Messages */}
      <div className="fixed bottom-24 right-6 z-[999] flex flex-col gap-2 min-w-[300px]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-extrabold shadow-2xl animate-in slide-in-from-right ${
              t.type === "success"
                ? "bg-[#dcebe5] border-[#bcd8cb] text-[#28695e]"
                : t.type === "error"
                ? "bg-[#fff5f3] border-[#e9beb8] text-[#a8493f]"
                : "bg-white border-gray-200 text-gray-800"
            }`}
          >
            {t.type === "success" && <CheckCircle2 size={16} />}
            {t.type === "error" && <AlertTriangle size={16} />}
            {t.message}
          </div>
        ))}
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl border border-[hsl(var(--primary))]/20 bg-gradient-to-r from-[#eef6f2] via-white to-[#e8f3ee] p-6 lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#bcd8cb]/40 px-3 py-1 text-xs font-bold text-[#28695e]">
              <Sparkles size={13} /> Official Student Registration Portal
            </div>
            <h1 className="mt-2 text-2xl font-black text-gray-900 md:text-3xl">
              Course Selection & Registration
            </h1>
            <p className="mt-1 text-xs text-gray-600">
              Welcome, <strong>{user?.name || "Student"}</strong> ({user?.studentId || "FA22-BCS-001"}) · {user?.programme || "BSCS"} Semester {user?.semester || "1"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAutoEnrollRecommended}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#bcd8cb] bg-white px-3.5 py-2 text-xs font-extrabold text-[#28695e] shadow-sm hover:bg-[#eef6f2]"
            >
              <CheckCheck size={14} /> Quick Select Recommended Courses
            </button>
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <span className="block text-[10px] font-extrabold uppercase text-gray-400">Allocated Courses</span>
              <span className="font-mono text-xl font-black text-gray-900">{draft.length} Courses</span>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <span className="block text-[10px] font-extrabold uppercase text-gray-400">Total Credit Hours</span>
              <span className={`font-mono text-xl font-black ${totalCredits > 18 ? "text-red-600" : "text-[#28695e]"}`}>
                {totalCredits} / 18 CH
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 1: My Registration Draft (Enrolled Courses) ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">My Registered Course Draft</h2>
            <p className="text-xs text-gray-500">Live active selection draft for current term.</p>
          </div>
          <span className="rounded-full bg-[#dcebe5] px-3 py-1 text-xs font-extrabold text-[#28695e]">
            {draft.length > 0 ? `${draft.length} Courses Drafted` : "Empty Selection"}
          </span>
        </div>

        {draft.length ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 font-mono text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Course Title</th>
                  <th className="px-4 py-3">Sec</th>
                  <th className="px-4 py-3">Credit</th>
                  <th className="px-4 py-3">Time Slot</th>
                  <th className="px-4 py-3">Theory Instructor</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {draft.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-bold text-[#28695e]">{item.courseCode}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{item.courseTitle}</td>
                    <td className="px-4 py-3 font-mono">Sec {item.section}</td>
                    <td className="px-4 py-3 font-mono">{item.credit}</td>
                    <td className="px-4 py-3 font-mono text-gray-600">
                      <Clock size={12} className="inline mr-1 text-gray-400" />
                      {item.timeSlot || "Mon 08:30-10:00"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{item.faculty || "Unassigned"}</td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button
                        onClick={() => setSwapCandidate(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-100"
                      >
                        <ArrowRightLeft size={12} /> Swap Sec
                      </button>
                      <button
                        onClick={() => setDropCandidate(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 size={12} /> Drop
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <BookOpen size={32} className="text-gray-300 mb-2" />
            <p className="font-bold text-gray-600">No courses in registration draft yet.</p>
            <p className="text-xs text-gray-400 mt-1">Click <strong>"+ Enroll"</strong> on any course offering below to build your schedule.</p>
          </div>
        )}
      </div>

      {/* ── Section 2: Available Course Offerings ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">Available Section Offerings</h2>
            <p className="text-xs text-gray-500">Official Computer Science section offerings across all terms.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
              <Search size={14} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search course or instructor..."
                className="bg-transparent outline-none placeholder:text-gray-400"
              />
            </label>
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-bold outline-none"
            >
              <option value="all">All Semesters</option>
              <option value="1">Sem 1</option>
              <option value="2">Sem 2</option>
              <option value="3">Sem 3</option>
              <option value="4">Sem 4</option>
            </select>
            {(search || semesterFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setSemesterFilter("all"); }}
                className="inline-flex items-center gap-1 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
              >
                <FilterX size={13} /> Reset
              </button>
            )}
          </div>
        </div>

        {filteredOfferings.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 font-mono text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Course Title</th>
                  <th className="px-4 py-3">Sem & Sec</th>
                  <th className="px-4 py-3">Credit</th>
                  <th className="px-4 py-3">Instructor</th>
                  <th className="px-4 py-3">Time & Room</th>
                  <th className="px-4 py-3">Seats Available</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-medium">
                {filteredOfferings.map((item) => {
                  const isDrafted = draft.some((d) => d.id === item.id);
                  const isSameCourseEnrolled = draft.some((d) => d.courseCode === item.courseCode);
                  const isFull = item.availableSeats <= 0;
                  const hasPrereq = item.prerequisites && item.prerequisites.length > 0;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-[#28695e]">
                        {item.courseCode}
                        {hasPrereq && (
                          <span title={`Prerequisites: ${item.prerequisites?.join(", ")}`} className="ml-1 inline-block cursor-help text-amber-600">
                            <HelpCircle size={12} className="inline" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-gray-900 max-w-[180px]">
                        {item.courseTitle}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-gray-600">Sem {item.semester} — Sec {item.section}</td>
                      <td className="px-4 py-3.5 font-mono">{item.credit}</td>
                      <td className="px-4 py-3.5 text-gray-700">{item.faculty || "Unassigned"}</td>
                      <td className="px-4 py-3.5 font-mono text-gray-500">
                        {item.timeSlot || "Mon 08:30-10:00"} · {item.room || "LH-01"}
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isFull ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-800"}`}>
                          {item.availableSeats} / {item.capacity}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {isDrafted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#28695e]">
                            <CheckCircle2 size={13} /> Enrolled
                          </span>
                        ) : isFull ? (
                          <span className="rounded-lg bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-400">
                            FULL
                          </span>
                        ) : isSameCourseEnrolled ? (
                          <button
                            onClick={() => handleEnroll(item)}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                          >
                            Switch Sec
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEnroll(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#28695e] px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:bg-[#205249] transition-all"
                          >
                            <Plus size={13} /> Enroll
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 text-center bg-gray-50">
            <FilterX size={36} className="text-gray-400 mb-2" />
            <p className="font-extrabold text-sm text-gray-800">No courses match "{search}" {semesterFilter !== "all" ? `in Sem ${semesterFilter}` : ""}</p>
            <p className="text-xs text-gray-500 mt-1">Try clearing your search query or semester filter to view available section offerings.</p>
            <button
              onClick={() => { setSearch(""); setSemesterFilter("all"); }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#28695e] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#1e4e46]"
            >
              Clear Search Filters & Show All {offerings.length} Courses
            </button>
          </div>
        )}
      </div>

      {/* ── Section 3: Sticky Registration Submission Bar ── */}
      <div className="sticky bottom-4 z-40 rounded-2xl border border-gray-300 bg-gray-900/95 px-6 py-4 text-white backdrop-blur shadow-2xl flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Registration Summary</p>
          <p className="text-sm font-extrabold text-white">
            {draft.length} Courses Selected · <span className="text-[#64d1be] font-mono">{totalCredits} CH</span> (Min: 12 CH / Max: 18 CH)
          </p>
        </div>
        <button
          onClick={handleSubmitPlan}
          disabled={isSubmitting || totalCredits < 12}
          className="inline-flex items-center gap-2 rounded-xl bg-[#28695e] px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-[#1e4e46] disabled:opacity-40 transition-all"
        >
          <Send size={14} />
          {isSubmitting ? "Submitting..." : "Submit Registration Plan"}
        </button>
      </div>

      {/* Drop Confirmation Modal */}
      {dropCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-extrabold text-base text-gray-900">Confirm Drop Course</h3>
            <p className="mt-2 text-xs text-gray-600">
              Are you sure you want to drop <strong>{dropCandidate.courseCode} - {dropCandidate.courseTitle}</strong> from your registration draft?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setDropCandidate(null)} className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700">Cancel</button>
              <button onClick={confirmDrop} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700">Drop Course</button>
            </div>
          </div>
        </div>
      )}

      {/* Swap Section Modal */}
      {swapCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-base text-gray-900">Swap Section for {swapCandidate.courseCode}</h3>
              <button onClick={() => setSwapCandidate(null)}><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Select an alternative available section:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {offerings
                .filter((o) => o.courseCode === swapCandidate.courseCode && o.id !== swapCandidate.id)
                .map((sec) => (
                  <div
                    key={sec.id}
                    onClick={() => handleSwap(swapCandidate, sec)}
                    className="flex items-center justify-between rounded-xl border border-gray-200 p-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-xs">Section {sec.section}</p>
                      <p className="text-[11px] text-gray-500">{sec.timeSlot || "Mon 08:30-10:00"} · {sec.faculty || "Unassigned"}</p>
                    </div>
                    <span className="text-xs font-extrabold text-[#28695e]">Select Sec {sec.section}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
