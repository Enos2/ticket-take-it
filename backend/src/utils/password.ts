// ==========================================
// FILE: backend/src/utils/password.ts
// PURPOSE: Hashing and verifying passwords.
// ==========================================
import bcrypt from "bcryptjs";
import { env } from "../config/env";

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Used when a login email doesn't exist. Running a real bcrypt compare against a
// throwaway hash keeps response time the same, so attackers can't tell which
// emails are registered by measuring how fast the server answers.
let dummyHash: Promise<string> | null = null;

export async function verifyPasswordTimingSafe(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (hash) return bcrypt.compare(plain, hash);

  dummyHash ??= bcrypt.hash("timing-safe-placeholder", env.BCRYPT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}
// ==========================================
// END OF FILE: backend/src/utils/password.ts
// ==========================================