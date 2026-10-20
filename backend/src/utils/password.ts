// ==========================================
// FILE: backend/src/utils/password.ts
// PURPOSE: Hashing and verifying passwords.
// ==========================================
import bcrypt from "bcryptjs";
import { env } from "../config/env";

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
// ==========================================
// END OF FILE: backend/src/utils/password.ts
// LOCATION: backend/src/utils/password.ts
// LAST UPDATED: October 19, 2026
// ==========================================