import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET || "cs-allocation-secret-key-2025";

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: "STUDENT" | "ADMIN";
  studentId?: string | null;
  programme?: string | null;
  semester?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
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

export function requireRole(role: "STUDENT" | "ADMIN") {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: `Access denied. Requires ${role} role.` });
      return;
    }
    next();
  };
}
