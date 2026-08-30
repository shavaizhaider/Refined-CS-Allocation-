import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate, JWT_SECRET, type AuthRequest } from "../middlewares/auth";
import { memoryStore } from "../lib/memory-store";

const router: IRouter = Router();

// ── Validation Helpers ────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: "Password must contain at least one special symbol (!@#$%^&*...)" };
  }
  return { valid: true };
}

// ── Login Endpoint ─────────────────────────────────────────────────────────────

router.post("/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Invalid email or password" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Invalid email or password" });
    return;
  }

  let user: any = null;

  // Query database first
  try {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    user = dbUser;
  } catch (err) {
    console.warn("DB login lookup fallback to MemoryStore:", (err as Error).message);
    await memoryStore.init();
    user = memoryStore.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  }

  // Generic non-revealing error if user is not found
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // Validate password with bcrypt
  const hash = user.passwordHash || user.password_hash;
  const passwordValid = hash ? await bcrypt.compare(password, hash) : false;

  if (!passwordValid) {
    res.status(401).json({ error: "Invalid email or password" });
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
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ token, user: payload });
});

// ── Register Endpoint ──────────────────────────────────────────────────────────

router.post("/register", async (req, res): Promise<void> => {
  const { email, password, name, role, studentId, programme, semester } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: "Email, password, and name are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Please enter a valid email address format" });
    return;
  }

  const passCheck = validatePassword(password);
  if (!passCheck.valid) {
    res.status(400).json({ error: passCheck.message });
    return;
  }

  const userRole = role === "ADMIN" ? "ADMIN" : role === "FACULTY" ? "FACULTY" : "STUDENT";
  const passwordHash = await bcrypt.hash(password, 10);

  let newUser: any = null;

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (existing) {
      res.status(400).json({ error: "An account with this email address already exists" });
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
    console.warn("DB register fallback to MemoryStore:", (err as Error).message);
    await memoryStore.init();
    if (memoryStore.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(400).json({ error: "An account with this email address already exists" });
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
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ token, user: payload });
});

// ── One-Time Setup First Admin Account Endpoint ───────────────────────────────

router.post("/setup-admin", async (req, res): Promise<void> => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: "Email, password, and name are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Please enter a valid email address format" });
    return;
  }

  const passCheck = validatePassword(password);
  if (!passCheck.valid) {
    res.status(400).json({ error: passCheck.message });
    return;
  }

  // Check if an ADMIN already exists
  try {
    const existingAdmins = await db.select().from(usersTable).where(eq(usersTable.role, "ADMIN"));
    if (existingAdmins.length > 0) {
      res.status(400).json({ error: "Admin setup has already been completed for this system." });
      return;
    }
  } catch (err) {
    await memoryStore.init();
    if (memoryStore.users.some((u) => u.role === "ADMIN")) {
      res.status(400).json({ error: "Admin setup has already been completed for this system." });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let newAdmin: any = null;

  try {
    const [row] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        role: "ADMIN",
        programme: "BSCS",
      })
      .returning();
    newAdmin = row;
  } catch (err) {
    await memoryStore.init();
    const memUser = {
      id: memoryStore.users.length + 1,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: "ADMIN" as const,
      studentId: null,
      programme: "BSCS",
      semester: null,
      createdAt: new Date(),
    };
    memoryStore.users.push(memUser);
    newAdmin = memUser;
  }

  const payload = {
    id: newAdmin.id,
    email: newAdmin.email,
    name: newAdmin.name,
    role: newAdmin.role,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({ message: "Admin account setup successful", token, user: payload });
});

// ── Forgot Password Request ───────────────────────────────────────────────────

router.post("/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: "Please enter a valid email address format" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour token

  let userFound = false;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (user) {
      userFound = true;
      await db
        .update(usersTable)
        .set({ resetToken, resetTokenExpires: expiresAt })
        .where(eq(usersTable.id, user.id));
    }
  } catch (err) {
    await memoryStore.init();
    const memUser = memoryStore.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (memUser) {
      userFound = true;
      memUser.resetToken = resetToken;
      memUser.resetTokenExpires = expiresAt;
    }
  }

  if (userFound) {
    console.log(`\n================================================================`);
    console.log(`[AUTH SYSTEM] PASSWORD RESET REQUESTED`);
    console.log(`User Email : ${normalizedEmail}`);
    console.log(`Reset Token: ${resetToken}`);
    console.log(`Reset Link : http://localhost:3000/login?resetToken=${resetToken}`);
    console.log(`Note: A real email provider (e.g. Resend, SendGrid) should be connected for production email delivery.`);
    console.log(`================================================================\n`);
  }

  // Non-revealing response to avoid email enumeration
  res.json({
    message: "If an account with that email address exists, a password reset link has been generated and logged.",
  });
});

// ── Reset Password Submit ──────────────────────────────────────────────────────

router.post("/reset-password", async (req, res): Promise<void> => {
  const { token, newPassword } = req.body;

  if (!token) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  const passCheck = validatePassword(newPassword);
  if (!passCheck.valid) {
    res.status(400).json({ error: passCheck.message });
    return;
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  let updated = false;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.resetToken, token), gt(usersTable.resetTokenExpires, new Date())));

    if (user) {
      await db
        .update(usersTable)
        .set({ passwordHash: newPasswordHash, resetToken: null, resetTokenExpires: null })
        .where(eq(usersTable.id, user.id));
      updated = true;
    }
  } catch (err) {
    await memoryStore.init();
    const memUser = memoryStore.users.find(
      (u) => u.resetToken === token && u.resetTokenExpires && u.resetTokenExpires > new Date()
    );
    if (memUser) {
      memUser.passwordHash = newPasswordHash;
      memUser.resetToken = null;
      memUser.resetTokenExpires = null;
      updated = true;
    }
  }

  if (!updated) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  res.json({ message: "Password has been reset successfully. Please log in with your new password." });
});

// ── Auth Check & Logout Endpoints ──────────────────────────────────────────────

router.get("/me", authenticate, (req: AuthRequest, res): void => {
  res.json({ user: req.user });
});

router.post("/logout", (_req, res): void => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json({ message: "Logged out successfully" });
});

export default router;

