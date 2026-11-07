import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prismaDir = path.resolve(process.cwd(), 'prisma');
if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

const dbPath = path.resolve(prismaDir, 'dev.db');

// Resolve a valid file URL that physically exists or can be created on this filesystem
let resolvedDbUrl = process.env.DATABASE_URL;
if (!resolvedDbUrl || resolvedDbUrl.startsWith('file:')) {
  if (resolvedDbUrl && resolvedDbUrl.startsWith('file:')) {
    const rawPath = resolvedDbUrl.replace(/^file:/, '');
    const dir = path.dirname(rawPath);
    // If the path is not absolute or its parent directory does not exist on the current host, use local dbPath
    if (!path.isAbsolute(rawPath) || !fs.existsSync(dir)) {
      resolvedDbUrl = `file:${dbPath}`;
    }
  } else {
    resolvedDbUrl = `file:${dbPath}`;
  }
}

process.env.DATABASE_URL = resolvedDbUrl;

const globalForPrisma = global as unknown as { prisma: PrismaClient; dbInitialized: boolean };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: resolvedDbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Ensures SQLite database is healthy, WAL mode is enabled, and auto-recovers if corrupted
 */
export async function ensureDbReady(): Promise<boolean> {
  if (globalForPrisma.dbInitialized) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    try {
      await prisma.user.count();
      globalForPrisma.dbInitialized = true;
      return true;
    } catch (error) {
      console.error('Production database readiness check failed');
      return false;
    }
  }

  try {
    // 1. Enable WAL mode & busy timeout for corruption prevention and concurrent safety
    try {
      await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
      await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
      await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    } catch (_) {}

    // 2. Test query to ensure tables exist and db file is not malformed
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('🌱 Database is empty, seeding initial data...');
      const { seedDatabase } = await import('./seed');
      await seedDatabase();
    }

    globalForPrisma.dbInitialized = true;
    console.log('✅ SQLite database is connected and healthy (WAL enabled)');
    return true;
  } catch (error: any) {
    const errorMsg = String(error?.message || error);
    console.warn('⚠️ SQLite health check failed:', errorMsg);

    // If malformed disk image or missing tables or schema not pushed, auto-recover
    console.log('🔄 Repairing database and re-seeding...');
    try {
      await prisma.$disconnect();

      // Remove corrupted db files if malformed
      if (errorMsg.includes('malformed') || errorMsg.includes('SqliteError')) {
        const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
        for (const f of files) {
          if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch (_) {}
          }
        }
      }

      // Push schema
      execSync(`npx prisma db push --skip-generate`, {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
        stdio: 'pipe',
      });

      // Reconnect and configure WAL
      await prisma.$connect();
      try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
      } catch (_) {}

      // Seed initial data
      const { seedDatabase } = await import('./seed');
      await seedDatabase();

      globalForPrisma.dbInitialized = true;
      console.log('✅ Database successfully recovered, initialized and seeded.');
      return true;
    } catch (recoveryErr) {
      console.error('❌ Failed to auto-recover database:', recoveryErr);
      return false;
    }

    return false;
  }
}

export default prisma;


