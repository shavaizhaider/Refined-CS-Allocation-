import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { authenticate, JWT_SECRET, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    studentId: user.studentId,
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

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [newUser] = await db
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

  const payload = {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    role: newUser.role,
    studentId: newUser.studentId,
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
