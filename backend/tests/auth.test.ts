// ==========================================
// FILE: backend/tests/auth.test.ts
// PURPOSE: Sign-up, login, token rotation and theft detection, password reset, email verification.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, makeEmailToken, resetDb } from "./helpers";

beforeEach(resetDb);

const creds = { email: "Alice@Test.dev", password: "Passw0rdTest", fullName: "Alice Tester" };
const register = () => api().post("/api/v1/auth/register").send(creds);
const login = (password: string) => api().post("/api/v1/auth/login").send({ email: "alice@test.dev", password });
const refresh = (refreshToken: string) => api().post("/api/v1/auth/refresh").send({ refreshToken });

describe("registration and login", () => {
  it("registers, normalises the email, and rejects duplicates and weak passwords", async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe("alice@test.dev");
    expect(res.body.data.user.role).toBe("USER");
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();

    expect((await register()).status).toBe(409);
    expect((await api().post("/api/v1/auth/register").send({ ...creds, email: "bob@test.dev", password: "short" })).status).toBe(400);
  });

  it("stores only a hash of the refresh token", async () => {
    const res = await register();
    const raw = res.body.data.refreshToken as string;

    const stored = await prisma.refreshToken.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].token).not.toBe(raw);
  });

  it("logs in with the right password only, with the same answer for a wrong password and an unknown email", async () => {
    await register();

    const wrong = await login("WrongPassw0rd");
    const unknown = await api().post("/api/v1/auth/login").send({ email: "nobody@test.dev", password: "Passw0rdTest" });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect((await login("Passw0rdTest")).status).toBe(200);
  });

  it("blocks a disabled account from logging in and from using a token it already holds", async () => {
    const reg = await register();
    await prisma.user.update({ where: { email: "alice@test.dev" }, data: { isActive: false } });

    expect((await login("Passw0rdTest")).status).toBe(403);
    const me = await api().get("/api/v1/users/me").set("Authorization", `Bearer ${reg.body.data.accessToken}`);
    expect(me.status).toBe(401);
  });
});

describe("refresh tokens", () => {
  it("rotates on every use, and a reused old token signs the whole session out", async () => {
    const reg = await register();
    const first = reg.body.data.refreshToken as string;

    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);
    const second = rotated.body.data.refreshToken as string;
    expect(second).not.toBe(first);

    // Someone presents the old token again: it was probably stolen.
    expect((await refresh(first)).status).toBe(401);
    // ...so the newer token is cut off as well.
    expect((await refresh(second)).status).toBe(401);
  });

  it("logout ends the session", async () => {
    const reg = await register();
    const token = reg.body.data.refreshToken as string;

    expect((await api().post("/api/v1/auth/logout").send({ refreshToken: token })).status).toBe(200);
    expect((await refresh(token)).status).toBe(401);
  });
});

describe("password reset", () => {
  it("never reveals whether an email is registered", async () => {
    await register();

    const known = await api().post("/api/v1/auth/forgot-password").send({ email: "alice@test.dev" });
    const unknown = await api().post("/api/v1/auth/forgot-password").send({ email: "ghost@test.dev" });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it("changes the password, signs out every device, and works only once", async () => {
    const reg = await register();
    const userId = reg.body.data.user.id as string;
    const oldRefresh = reg.body.data.refreshToken as string;
    const token = await makeEmailToken(userId, "RESET_PASSWORD");

    const done = await api().post("/api/v1/auth/reset-password").send({ token, password: "NewPassw0rd1" });
    expect(done.status).toBe(200);

    expect((await login("Passw0rdTest")).status).toBe(401);
    expect((await login("NewPassw0rd1")).status).toBe(200);
    expect((await refresh(oldRefresh)).status).toBe(401);

    const reused = await api().post("/api/v1/auth/reset-password").send({ token, password: "AnotherPassw0rd2" });
    expect(reused.status).toBe(400);
  });

  it("rejects a token that does not exist", async () => {
    const res = await api().post("/api/v1/auth/reset-password").send({ token: "x".repeat(32), password: "NewPassw0rd1" });
    expect(res.status).toBe(400);
  });
});

describe("email verification", () => {
  it("verifies the account with a valid link, once", async () => {
    const reg = await register();
    const userId = reg.body.data.user.id as string;
    const token = await makeEmailToken(userId, "VERIFY_EMAIL");

    expect((await api().post("/api/v1/auth/verify-email").send({ token })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBe(true);
    expect((await api().post("/api/v1/auth/verify-email").send({ token })).status).toBe(400);
  });

  it("does not accept a reset token as a verification token", async () => {
    const reg = await register();
    const token = await makeEmailToken(reg.body.data.user.id, "RESET_PASSWORD");

    expect((await api().post("/api/v1/auth/verify-email").send({ token })).status).toBe(400);
  });
});

describe("changing your password", () => {
  it("answers 400, not 401, for a wrong current password, and signs out other devices on success", async () => {
    const reg = await register();
    const auth = { Authorization: `Bearer ${reg.body.data.accessToken}` };
    const otherDevice = await login("Passw0rdTest");

    const wrong = await api().post("/api/v1/auth/change-password").set(auth).send({ currentPassword: "Nope12345", newPassword: "NewPassw0rd1" });
    expect(wrong.status).toBe(400);

    const ok = await api().post("/api/v1/auth/change-password").set(auth).send({ currentPassword: "Passw0rdTest", newPassword: "NewPassw0rd1" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.refreshToken).toBeTruthy();

    expect((await refresh(otherDevice.body.data.refreshToken)).status).toBe(401);
  });
});
// ==========================================
// END OF FILE: backend/tests/auth.test.ts
// ==========================================