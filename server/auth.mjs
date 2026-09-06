import { db, json, cookieToken, newToken, safeEqual, sessionCookie, requireUser } from "./_shared.mjs";

export default async (request) => {
  try {
    if (request.method === "GET") {
      const user = await requireUser(request);
      return user ? json({ user }) : json({ user: null }, 401);
    }
    if (request.method === "POST") {
      const { username = "", password = "" } = await request.json();
      const adminOk = safeEqual(username.trim(), process.env.ADMIN_USERNAME || "") && safeEqual(password, process.env.ADMIN_PASSWORD || "");
      const userOk = safeEqual(username.trim(), process.env.USER_USERNAME || "") && safeEqual(password, process.env.USER_PASSWORD || "");
      if (!adminOk && !userOk) return json({ error: "Invalid username or password" }, 401);
      const role = adminOk ? "admin" : "user"; const token = newToken();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const { error } = await db().from("sessions").insert({ token, username: username.trim(), role, expires_at: expiresAt });
      if (error) throw error;
      return json({ user: { username: username.trim(), role } }, 200, { "set-cookie": sessionCookie(token) });
    }
    if (request.method === "DELETE") {
      const token = cookieToken(request); if (token) await db().from("sessions").delete().eq("token", token);
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Authentication error" }, 500); }
};
