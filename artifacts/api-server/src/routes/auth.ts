import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate, JWT_SECRET, type AuthRequest } from "../middlewares/auth";
import { memoryStore } from "../lib/memory-store";

const router: IRouter = Router();

router.post("/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  let user: any = null;

  // Try PostgreSQL database query first
  try {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    user = dbUser;
  } catch (err) {
    console.warn("DB login error, falling back to MemoryStore:", (err as Error).message);
    await memoryStore.init();
    user = memoryStore.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  }

  // If user does not exist yet, auto-register as student on the fly for smooth testing
  if (!user) {
    await memoryStore.init();
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: memoryStore.users.length + 1,
      email: normalizedEmail,
      passwordHash,
      name: normalizedEmail.split("@")[0].toUpperCase(),
      role: "STUDENT" as const,
      studentId: `FA25-${normalizedEmail.split("@")[0].toUpperCase()}`,
      programme: "BSCS",
      semester: "1",
      createdAt: new Date(),
    };
    memoryStore.users.push(newUser);
    user = newUser;

    // Try persisting to Postgres if available
    try {
      await db.insert(usersTable).values({
        email: normalizedEmail,
        passwordHash,
        name: newUser.name,
        role: "STUDENT",
        studentId: newUser.studentId,
        programme: "BSCS",
        semester: "1",
      });
    } catch (_) {}
  }

  // Validate password
  const passwordValid = await bcrypt.compare(password, user.passwordHash || user.password_hash);
  if (!passwordValid) {
    res.status(401).json({ error: "Invalid password for this account" });
    return;
  }

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.studentId || user.student_id,
    programme: user.programme,
    semester: user.semester,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ token, user: payload });
});

router.post("/register", async (req, res): Promise<void> => {
  const { email, password, name, role, studentId, programme, semester } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: "Email, password, and name are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters long" });
    return;
  }

  const userRole = role === "ADMIN" ? "ADMIN" : "STUDENT";
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 10);

  let newUser: any = null;

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }

    const [row] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        role: userRole,
        studentId: studentId?.trim() || null,
        programme: programme || "BSCS",
        semester: semester || "1",
      })
      .returning();
    newUser = row;
  } catch (err) {
    console.warn("DB register error, using MemoryStore fallback:", (err as Error).message);
    await memoryStore.init();
    if (memoryStore.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }
    const memUser = {
      id: memoryStore.users.length + 1,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: userRole,
      studentId: studentId?.trim() || null,
      programme: programme || "BSCS",
      semester: semester || "1",
      createdAt: new Date(),
    };
    memoryStore.users.push(memUser);
    newUser = memUser;
  }

  const payload = {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    studentId: newUser.studentId || newUser.student_id,
    programme: newUser.programme,
    semester: newUser.semester,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ token, user: payload });
});

router.get("/me", authenticate, (req: AuthRequest, res): void => {
  res.json({ user: req.user });
});

router.post("/logout", (_req, res): void => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
});

export default router;
