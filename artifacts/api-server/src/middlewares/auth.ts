import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "cs-allocation-secret-key-2025";

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: "ADMIN" | "FACULTY" | "STUDENT";
  studentId?: string | null;
  programme?: string | null;
  semester?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function normalizeRole(role?: string | null): "ADMIN" | "FACULTY" | "STUDENT" {
  if (!role) return "STUDENT";
  const r = role.trim().toUpperCase().replace(/[\s_\-]/g, "");
  if (r === "ADMIN" || r === "HOD" || r === "HODADMIN" || r.includes("ADMIN") || r.includes("HOD")) return "ADMIN";
  if (r === "FACULTY" || r.includes("TEACHER") || r.includes("PROFESSOR")) return "FACULTY";
  return "STUDENT";
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...allowedRoles: ("ADMIN" | "FACULTY" | "STUDENT")[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const userRole = normalizeRole(req.user.role);
    const normalizedAllowed = allowedRoles.map((r) => normalizeRole(r));

    if (!normalizedAllowed.includes(userRole)) {
      res.status(403).json({
        error: `Access Denied: Your account role (${req.user.role || 'Unspecified'}) is not authorized to perform this action. Requires role: ${allowedRoles.join(", ")}.`,
      });
      return;
    }
    next();
  };
}
