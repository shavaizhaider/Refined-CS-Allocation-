import bcrypt from "bcryptjs";

export async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || "admin@cui.edu.pk").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "admin123!";
  const name = process.env.ADMIN_NAME || "Dr. M. Rehan Ashraf (HOD)";

  console.log(`[SEED ADMIN] Starting admin seed flow for: ${email}`);

  // Dynamic import of db and memoryStore
  try {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/cs_allocation";
    }

    const { db, usersTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      console.log(`[SEED ADMIN] Admin user (${email}) already exists in PostgreSQL database.`);
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.insert(usersTable).values({
        email,
        passwordHash,
        name,
        role: "ADMIN",
        programme: "BSCS",
      });
      console.log(`[SEED ADMIN] Created admin account in PostgreSQL database: ${email}`);
    }
  } catch (err) {
    console.warn(`[SEED ADMIN] PostgreSQL DB unavailable or table missing (${(err as Error).message}). Seeding MemoryStore...`);
  }

  try {
    const { memoryStore } = await import("../lib/memory-store.js");
    await memoryStore.init();
    const memExisting = memoryStore.users.find((u) => u.email.toLowerCase() === email);
    if (!memExisting) {
      const passwordHash = await bcrypt.hash(password, 10);
      memoryStore.users.push({
        id: memoryStore.users.length + 1,
        email,
        passwordHash,
        name,
        role: "ADMIN",
        studentId: null,
        programme: "BSCS",
        semester: null,
        createdAt: new Date(),
      });
      console.log(`[SEED ADMIN] Created admin account in MemoryStore: ${email}`);
    } else {
      console.log(`[SEED ADMIN] Admin account (${email}) ready in MemoryStore.`);
    }
  } catch (e) {
    console.error("[SEED ADMIN] MemoryStore error:", e);
  }

  console.log(`[SEED ADMIN] Admin seed flow completed successfully.`);
}

seedAdmin().then(() => process.exit(0)).catch((err) => {
  console.error("[SEED ADMIN] Error seeding admin:", err);
  process.exit(1);
});
