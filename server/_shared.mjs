import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import https from "node:https";

function supabaseFetch(input, init = {}) {
  const edgeIp = process.env.SUPABASE_EDGE_IP;
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!edgeIp || url.hostname !== new URL(process.env.SUPABASE_URL).hostname) return fetch(input, init);

  return new Promise((resolve, reject) => {
    const sourceHeaders = init.headers || (input instanceof Request ? input.headers : undefined);
    const headers = Object.fromEntries(new Headers(sourceHeaders).entries());
    const request = https.request(url, {
      method: init.method || (input instanceof Request ? input.method : "GET"),
      headers,
      servername: url.hostname,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [{ address: edgeIp, family: 4 }])
        : callback(null, edgeIp, 4),
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode || 500,
        statusText: response.statusMessage,
        headers: response.headers,
      })));
    });
    request.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(new Error("Request aborted"));
      else init.signal.addEventListener("abort", () => request.destroy(new Error("Request aborted")), { once: true });
    }
    const body = init.body;
    if (body !== undefined && body !== null) request.write(body);
    request.end();
  });
}

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: supabaseFetch } });
}

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", ...headers }
});

export function cookieToken(request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map(v => v.trim()).find(v => v.startsWith("thit_session="))?.slice(13) || "";
}

export async function requireUser(request) {
  const token = cookieToken(request);
  if (!token) return null;
  const { data, error } = await db().from("sessions").select("username, role, expires_at").eq("token", token).maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { username: data.username, role: data.role };
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function newToken() { return crypto.randomBytes(48).toString("hex"); }

export const sessionCookie = (token, maxAge = 604800) =>
  `thit_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export function camelExpense(r) { return { id:r.id, amount:r.amount, date:r.date, paymentMethod:r.payment_method, paidBy:r.paid_by, category:r.category, note:r.note }; }
export function camelOrder(r) { return { id:r.id, customer:r.customer, company:r.company, date:r.date, timberType:r.timber_type, quantityTons:r.quantity_tons, soldTons:r.sold_tons, unitPrice:r.unit_price, paidAmount:r.paid_amount, status:r.status }; }
export function camelTimber(r) { return { id:r.id, name:r.name, wholePrice:r.whole_price, sawnPrice:r.sawn_price, stockTons:r.stock_tons }; }
