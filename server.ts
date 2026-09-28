import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import nodemailer, { type Transporter } from "nodemailer";
import { createServer as createViteServer } from "vite";
import {
  connectMongo,
  getMongoStatus,
  saveUserToMongo,
  deleteUserFromMongo,
  saveSessionToMongo,
  deleteSessionFromMongo,
  saveProductToMongo,
  deleteProductFromMongo,
  saveOrderToMongo,
  saveWishlistToMongo,
  deleteWishlistFromMongo,
  saveFeedbackToMongo,
  savePasswordResetToMongo,
  deletePasswordResetFromMongo,
} from "./mongo";

const PORT = 3000;
const COOKIE_NAME = "veeraa_session";
const SESSION_DAYS = 30;

// Setup directories
const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, "db.json");

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  password_hash: string;
  created_at: string;
}

export interface Session {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  metal: string;
  price: number;
  image_url: string;
  description: string;
  images: string[];
  sweat_proof: boolean;
  daily_wear: boolean;
  anti_tarnish: boolean;
  stock: number;
  is_new: boolean;
  created_at: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  qty: number;
  image_url: string;
}

export interface Shipping {
  full_name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string | null;
  user_email: string;
  user_name: string;
  items: OrderItem[];
  shipping: Shipping;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string;
  created_at: string;
}

export interface WishlistRecord {
  user_id: string;
  product_id: string;
  created_at: string;
}

export interface Feedback {
  id: string;
  name: string;
  email: string;
  rating: number;
  message: string;
  created_at: string;
}

export interface PasswordReset {
  token: string;
  email: string;
  created_at: string;
  expires_at: string;
}

// Database state
export interface Database {
  users: User[];
  sessions: Session[];
  products: Product[];
  orders: Order[];
  wishlists: WishlistRecord[];
  feedback: Feedback[];
  password_resets: PasswordReset[];
}

// Password helpers
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, digest] = stored.split("$");
    if (!salt || !digest) return false;
    const check = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(digest, "hex"));
  } catch {
    return false;
  }
}

// Seed data
const IMG: Record<string, string> = {
  earring_gold: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/77dce56680815c6255e823df74c302877ae7e40715880577d667f6e9afc6c39b.jpeg",
  earring_silver: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/d4dade1158f49bad4477226b5f980a73290b3ebe069ab8e36ba21ac9cfca4206.jpeg",
  chain_gold: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/713f6ff63d6ad4454c6818ab3274c52e82603f47638b308fe217ef287738a190.jpeg",
  chain_silver: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/ea0e98202e4491cb84feffebbb85ef69fffef974f6de09a89e2882ec3b887f7c.jpeg",
  ring_gold: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/0a805a0ab5d74534e9bfb6d7a82ce9f6a61978cef48b5b11957a634789615312.jpeg",
  ring_silver: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/df27d08dd30dc45c8b6f54125da70d11625c79bdfd1d69bda721c8675235b319.jpeg",
  bracelet_gold: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/a26110b60697423666f2ad530967a5c2a18afb967d03a382a91b8689cb9aa927.jpeg",
  bracelet_silver: "https://static.prod-images.emergentagent.com/jobs/c0d76ea6-ce25-4ebe-8c53-680e184e132e/images/189ef64dccab614987bf916ba3045e2f5e59a21e3a33b6ed258faaf2d8fb2a42.jpeg",
};

const SEED_PRODUCTS = [
  {
    id: "prod-aura-gold-hoops",
    name: "Aura Gold Hoops",
    category: "earrings",
    metal: "gold",
    price: 899,
    image_url: IMG.earring_gold,
    description: "Featherlight 18k gold plated hoops that sit close to the ear. Sweat proof and tarnish resistant, they stay bright through workdays, workouts and long evenings.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: true,
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: "prod-mira-silver-drops",
    name: "Mira Silver Drops",
    category: "earrings",
    metal: "silver",
    price: 1299,
    image_url: IMG.earring_silver,
    description: "925 sterling silver thread drops with a single bezel stone. Gentle on sensitive ears and light enough to forget you are wearing them.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: true,
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  },
  {
    id: "prod-rope-gold-chain",
    name: "Rope Gold Chain",
    category: "chains",
    metal: "gold",
    price: 1599,
    image_url: IMG.chain_gold,
    description: "A finely twisted rope chain in 18k gold plating. Layer it or wear it alone - the anti-tarnish finish keeps its warm glow through daily wear.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: true,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "prod-luna-silver-box",
    name: "Luna Silver Box Chain",
    category: "chains",
    metal: "silver",
    price: 1449,
    image_url: IMG.chain_silver,
    description: "Crisp 925 silver box chain with a secure lobster clasp. Sweat proof and water resistant, made for everyday elegance.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: false,
    created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    id: "prod-stack-gold-ring",
    name: "Stack Gold Ring Set",
    category: "rings",
    metal: "gold",
    price: 1099,
    image_url: IMG.ring_gold,
    description: "A set of slim gold plated stacking bands with pave detail. Mix and match, or wear the full stack for a quiet statement.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: true,
    created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
  },
  {
    id: "prod-oxidised-silver-band",
    name: "Oxidised Silver Band",
    category: "rings",
    metal: "silver",
    price: 799,
    image_url: IMG.ring_silver,
    description: "Hand finished oxidised 925 silver band with a hammered texture. Rugged, unisex and built for daily wear.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "prod-ciara-gold-bracelet",
    name: "Ciara Gold Bracelet",
    category: "bracelets",
    metal: "gold",
    price: 1349,
    image_url: IMG.bracelet_gold,
    description: "Chunky oval link bracelet in 18k gold plating with an adjustable clasp. Sweat proof, so it never leaves your wrist.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: true,
    created_at: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
  },
  {
    id: "prod-serene-silver-cuff",
    name: "Serene Silver Cuff",
    category: "bracelets",
    metal: "silver",
    price: 1699,
    image_url: IMG.bracelet_silver,
    description: "A smooth, solid 925 silver open cuff. Slips on easily and holds its polish with the anti-tarnish coating.",
    images: [],
    sweat_proof: true,
    daily_wear: true,
    anti_tarnish: true,
    stock: 25,
    is_new: false,
    created_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
  },
];

function initDb(): Database {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as Database;
      if (data.products && data.users) {
        return data;
      }
    } catch {
      // fallback to initial seed
    }
  }

  const initialDb: Database = {
    users: [
      {
        id: "usr-admin",
        name: "Veeraa Admin",
        email: "admin@veeraa.com",
        role: "admin",
        password_hash: hashPassword("Admin@123"),
        created_at: new Date().toISOString(),
      },
      {
        id: "usr-customer",
        name: "Priya Customer",
        email: "customer@veeraa.com",
        role: "customer",
        password_hash: hashPassword("Customer@123"),
        created_at: new Date().toISOString(),
      },
    ],
    sessions: [],
    products: SEED_PRODUCTS,
    orders: [],
    wishlists: [],
    feedback: [],
    password_resets: [],
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), "utf-8");
  return initialDb;
}

export let db = initDb();

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database to disk:", err);
  }
}

// Multer for image upload
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Authentication middleware
function getSessionUser(req: Request): User | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;

  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveDb();
    return null;
  }

  return db.users.find((u) => u.id === session.user_id) || null;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ detail: "Not signed in" });
    return;
  }
  (req as any).user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ detail: "Not signed in" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ detail: "Admin only" });
    return;
  }
  (req as any).user = user;
  next();
}

function generateOrderNumber(): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VRA${yy}${mm}${dd}${rand}`;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Email provider detection and sending
function getEmailProviderInfo(): { provider: "resend" | "smtp" | "gmail" | "emergent" | "none"; configured: boolean } {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return { provider: "gmail", configured: true };
  if (process.env.RESEND_API_KEY) return { provider: "resend", configured: true };
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return { provider: "smtp", configured: true };
  if (process.env.EMERGENT_EMAIL_KEY) return { provider: "emergent", configured: true };
  return { provider: "none", configured: false };
}

async function sendTransactionalEmail(payload: { to: string; subject: string; html: string }) {
  const fromName = process.env.EMAIL_FROM_NAME || "Veeraa";
  const { provider, configured } = getEmailProviderInfo();

  if (!configured) {
    console.log(`[Email (Local Preview)] Provider not configured. Email to ${payload.to}: "${payload.subject}"`);
    return;
  }

  try {
    // 1. RESEND (Free 3,000 emails/month)
    if (provider === "resend") {
      const fromEmail = process.env.EMAIL_FROM || `${fromName} <onboarding@resend.dev>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn("[Email] Resend API error:", res.status, errText);
      } else {
        console.log(`[Email] Successfully sent email to ${payload.to} via Resend.`);
      }
      return;
    }

    // 2. GMAIL / NODEMAILER SMTP (Free with Gmail App Password or any free SMTP)
    if (provider === "gmail" || provider === "smtp") {
      let transporter: Transporter;

      if (provider === "gmail") {
        transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        });
      } else {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      }

      const defaultFrom =
        provider === "gmail"
          ? `"${fromName}" <${process.env.GMAIL_USER}>`
          : `"${fromName}" <${process.env.SMTP_USER}>`;

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || defaultFrom,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });

      console.log(`[Email] Successfully sent email to ${payload.to} via ${provider.toUpperCase()}.`);
      return;
    }

    // 3. EMERGENT EMAIL (Legacy fallback)
    if (provider === "emergent") {
      const res = await fetch("https://integrations.emergentagent.com/api/v1/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Email-Key": process.env.EMERGENT_EMAIL_KEY || "",
        },
        body: JSON.stringify({
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          from_name: fromName,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn("[Email] Emergent service error:", res.status, errText);
      } else {
        console.log(`[Email] Successfully sent email to ${payload.to} via Emergent.`);
      }
      return;
    }
  } catch (err: any) {
    console.warn(`[Email] Failed to send email to ${payload.to} via ${provider}:`, err.message || err);
  }
}

async function sendOrderConfirmationEmail(order: Order) {
  if (!order.user_email) return;
  const fromName = process.env.EMAIL_FROM_NAME || "Veeraa";
  const rows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0ebe4;color:#44403c">
        ${escapeHtml(item.name)} &times; ${item.qty}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f0ebe4;text-align:right;color:#44403c">
        ₹${Math.round(item.price * item.qty)}
      </td>
    </tr>`
    )
    .join("");

  const html = `
  <table role="presentation" width="100%" style="max-width:540px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
    <tr>
      <td style="padding:32px 24px;background:#ffffff;border-radius:12px;border:1px solid #eee">
        <h1 style="font-size:22px;color:#78350f;margin:0 0 12px">${escapeHtml(fromName)}</h1>
        <p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(order.user_name || "there")},</p>
        <p style="font-size:15px;color:#44403c;line-height:1.5">
          Thank you for shopping with ${escapeHtml(fromName)}! Your order <strong>${escapeHtml(order.order_number)}</strong> is confirmed.
        </p>
        <table role="presentation" width="100%" style="margin:20px 0;border-top:1px solid #e7e0d6;border-collapse:collapse">
          ${rows}
        </table>
        <p style="font-size:17px;color:#78350f;margin:16px 0"><strong>Total: ₹${order.total}</strong></p>
        <p style="font-size:14px;color:#78716c;line-height:1.5">
          Shipping address: ${escapeHtml(order.shipping.full_name)}, ${escapeHtml(order.shipping.address)}, ${escapeHtml(order.shipping.city || "")} - ${escapeHtml(order.shipping.pincode || "")}.
        </p>
        <p style="font-size:14px;color:#78716c;margin-top:20px">
          You can track your parcel anytime from your Veeraa account using your order number.
        </p>
        <p style="font-size:12px;color:#a8a29e;margin-top:28px">
          Sent by ${escapeHtml(fromName)}. Sweat-proof, anti-tarnish everyday fine jewellery.
        </p>
      </td>
    </tr>
  </table>`;

  await sendTransactionalEmail({
    to: order.user_email,
    subject: `Your ${fromName} order ${order.order_number} is confirmed`,
    html,
  });
}

async function sendPasswordResetEmail(email: string, name: string, token: string, baseUrl: string) {
  const fromName = process.env.EMAIL_FROM_NAME || "Veeraa";
  const resetLink = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
  const html = `
  <table role="presentation" width="100%" style="max-width:540px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
    <tr>
      <td style="padding:32px 24px;background:#ffffff;border-radius:12px;border:1px solid #eee">
        <h1 style="font-size:22px;color:#78350f;margin:0 0 12px">${escapeHtml(fromName)}</h1>
        <p style="font-size:16px;margin:0 0 8px">Hi ${escapeHtml(name || "there")},</p>
        <p style="font-size:15px;color:#44403c;line-height:1.5">
          We received a request to reset the password for your ${escapeHtml(fromName)} account.
        </p>
        <div style="margin:24px 0">
          <a href="${resetLink}" style="background:#92400e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block">
            Reset Your Password
          </a>
        </div>
        <p style="font-size:13px;color:#78716c">
          This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
        <p style="font-size:12px;color:#a8a29e;margin-top:28px">
          Sent by ${escapeHtml(fromName)}. We never ask for your password by email.
        </p>
      </td>
    </tr>
  </table>`;

  await sendTransactionalEmail({
    to: email,
    subject: `Reset your ${fromName} password`,
    html,
  });
}

async function startServer() {
  // Initialize MongoDB if MONGO_URL is provided, or continue with local file fallback
  const mongoInit = await connectMongo(db);
  if (mongoInit.connected) {
    db = mongoInit.data;
    saveDb();
  }

  const app = express();

  app.use(cookieParser());
  app.use(express.json());

  // Static serving for uploaded files
  app.use("/api/uploads", express.static(UPLOAD_DIR));

  // =================== AUTH ROUTES ===================

  // Sign up
  app.post("/api/auth/signup", (req: Request, res: Response) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password || password.length < 6) {
      res.status(422).json({ detail: "Name, valid email, and password (min 6 chars) are required" });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (db.users.some((u) => u.email === cleanEmail)) {
      res.status(400).json({ detail: "An account with this email already exists" });
      return;
    }

    const newUser: User = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: cleanEmail,
      role: "customer",
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
    };
    db.users.push(newUser);
    saveUserToMongo(newUser);

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const sessionObj = {
      token,
      user_id: newUser.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };
    db.sessions.push(sessionObj);
    saveSessionToMongo(sessionObj);
    saveDb();

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: "/",
    });

    const { password_hash, ...safeUser } = newUser;
    res.json(safeUser);
  });

  // Log in
  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ detail: "Email and password are required" });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.users.find((u) => u.email === cleanEmail);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: "Invalid email or password" });
      return;
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const sessionObj = {
      token,
      user_id: user.id,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };
    db.sessions.push(sessionObj);
    saveSessionToMongo(sessionObj);
    saveDb();

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
      path: "/",
    });

    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  });

  // Log out
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      db.sessions = db.sessions.filter((s) => s.token !== token);
      deleteSessionFromMongo(token);
      saveDb();
    }
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ ok: true });
  });

  // Get current user
  app.get("/api/auth/me", (req: Request, res: Response) => {
    const user = getSessionUser(req);
    if (!user) {
      res.status(401).json({ detail: "Not signed in" });
      return;
    }
    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  });

  // Update profile name
  app.patch("/api/auth/profile", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      res.status(422).json({ detail: "Name is required" });
      return;
    }
    user.name = String(name).trim();
    saveDb();
    const { password_hash, ...safeUser } = user;
    res.json(safeUser);
  });

  // List all users (admin)
  app.get("/api/auth/users", requireAdmin, (_req: Request, res: Response) => {
    const safeUsers = db.users
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(({ password_hash, ...u }) => u);
    res.json(safeUsers);
  });

  // Set user role (admin)
  app.patch("/api/auth/users/:userId/role", requireAdmin, (req: Request, res: Response) => {
    const admin = (req as any).user as User;
    const { userId } = req.params;
    const { role } = req.body || {};

    if (role !== "customer" && role !== "admin") {
      res.status(422).json({ detail: "Role must be 'customer' or 'admin'" });
      return;
    }

    const target = db.users.find((u) => u.id === userId);
    if (!target) {
      res.status(404).json({ detail: "User not found" });
      return;
    }

    if (target.id === admin.id && role !== "admin") {
      res.status(400).json({ detail: "You cannot change your own admin role" });
      return;
    }

    if (target.role === "admin" && role === "customer") {
      const adminCount = db.users.filter((u) => u.role === "admin").length;
      if (adminCount <= 1) {
        res.status(400).json({ detail: "At least one admin must remain" });
        return;
      }
    }

    target.role = role;
    saveUserToMongo(target);
    saveDb();

    const { password_hash, ...safeUser } = target;
    res.json(safeUser);
  });

  // Forgot password
  app.post("/api/auth/forgot-password", (req: Request, res: Response) => {
    const { email } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const user = db.users.find((u) => u.email === cleanEmail);

    if (user) {
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const prObj = {
        token,
        email: cleanEmail,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      };
      db.password_resets = db.password_resets.filter((r) => r.email !== cleanEmail);
      db.password_resets.push(prObj);
      savePasswordResetToMongo(prObj);
      saveDb();

      const host = req.get("host") || "localhost:3000";
      const proto = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const baseUrl = process.env.APP_URL || `${proto}://${host}`;
      sendPasswordResetEmail(user.email, user.name, token, baseUrl).catch((e) => console.warn(e));

      res.json({
        ok: true,
        message: "Reset link created. In development/demo mode, use the link provided.",
        reset_url: `/reset-password?token=${token}`,
      });
      return;
    }

    res.json({
      ok: true,
      message: "If that email is registered, instructions have been generated.",
    });
  });

  // Reset password
  app.post("/api/auth/reset-password", (req: Request, res: Response) => {
    const { token, password } = req.body || {};
    if (!token || !password || password.length < 6) {
      res.status(422).json({ detail: "Valid token and password (min 6 chars) are required" });
      return;
    }

    const reset = db.password_resets.find((r) => r.token === token);
    if (!reset || new Date(reset.expires_at) < new Date()) {
      res.status(400).json({ detail: "Invalid or expired reset token" });
      return;
    }

    const user = db.users.find((u) => u.email === reset.email);
    if (!user) {
      res.status(404).json({ detail: "User not found" });
      return;
    }

    user.password_hash = hashPassword(password);
    db.password_resets = db.password_resets.filter((r) => r.token !== token);
    saveUserToMongo(user);
    deletePasswordResetFromMongo(token);
    saveDb();

    res.json({ ok: true, message: "Password updated successfully" });
  });

  // =================== PRODUCT ROUTES ===================

  // List products
  app.get("/api/products", (req: Request, res: Response) => {
    const { category, metal, q } = req.query;
    let list = [...db.products];

    if (category && category !== "all") {
      list = list.filter((p) => p.category.toLowerCase() === String(category).toLowerCase());
    }
    if (metal && metal !== "all") {
      list = list.filter((p) => p.metal.toLowerCase() === String(metal).toLowerCase());
    }
    if (q) {
      const query = String(q).toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(list);
  });

  // Get single product
  app.get("/api/products/:id", (req: Request, res: Response) => {
    const product = db.products.find((p) => p.id === req.params.id);
    if (!product) {
      res.status(404).json({ detail: "Product not found" });
      return;
    }
    res.json(product);
  });

  // Create product (admin)
  app.post("/api/products", requireAdmin, (req: Request, res: Response) => {
    const data = req.body || {};
    if (!data.name || !data.category || !data.metal || !data.price) {
      res.status(422).json({ detail: "Name, category, metal, and valid price are required" });
      return;
    }

    const newProduct: Product = {
      id: crypto.randomUUID(),
      name: String(data.name).trim(),
      category: String(data.category).toLowerCase(),
      metal: String(data.metal).toLowerCase(),
      price: Number(data.price),
      image_url: data.image_url || "",
      description: data.description || "",
      images: Array.isArray(data.images) ? data.images : [],
      sweat_proof: data.sweat_proof !== undefined ? Boolean(data.sweat_proof) : true,
      daily_wear: data.daily_wear !== undefined ? Boolean(data.daily_wear) : true,
      anti_tarnish: data.anti_tarnish !== undefined ? Boolean(data.anti_tarnish) : true,
      stock: Number(data.stock ?? 10),
      is_new: Boolean(data.is_new),
      created_at: new Date().toISOString(),
    };

    db.products.unshift(newProduct);
    saveProductToMongo(newProduct);
    saveDb();
    res.json(newProduct);
  });

  // Update product (admin)
  app.put("/api/products/:id", requireAdmin, (req: Request, res: Response) => {
    const index = db.products.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ detail: "Product not found" });
      return;
    }

    const data = req.body || {};
    const existing = db.products[index];
    const updated: Product = {
      ...existing,
      ...data,
      id: existing.id,
      price: data.price !== undefined ? Number(data.price) : existing.price,
      stock: data.stock !== undefined ? Number(data.stock) : existing.stock,
    };

    db.products[index] = updated;
    saveProductToMongo(updated);
    saveDb();
    res.json(updated);
  });

  // Delete product (admin)
  app.delete("/api/products/:id", requireAdmin, (req: Request, res: Response) => {
    const beforeLen = db.products.length;
    db.products = db.products.filter((p) => p.id !== req.params.id);
    if (db.products.length === beforeLen) {
      res.status(404).json({ detail: "Product not found" });
      return;
    }
    deleteProductFromMongo(req.params.id);
    saveDb();
    res.json({ ok: true });
  });

  // =================== ORDER ROUTES ===================

  // Create order
  app.post("/api/orders", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { items, shipping } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(422).json({ detail: "Order must contain at least one item" });
      return;
    }
    if (!shipping || !shipping.full_name || !shipping.phone || !shipping.address) {
      res.status(422).json({ detail: "Complete shipping details are required" });
      return;
    }

    const total = Math.round(
      items.reduce((acc: number, item: OrderItem) => acc + (item.price || 0) * (item.qty || 1), 0)
    );

    const order: Order = {
      id: crypto.randomUUID(),
      order_number: generateOrderNumber(),
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      items: items.map((i: any) => ({
        product_id: i.product_id,
        name: i.name,
        price: Number(i.price),
        qty: Number(i.qty || 1),
        image_url: i.image_url || "",
      })),
      shipping: {
        full_name: String(shipping.full_name).trim(),
        phone: String(shipping.phone).trim(),
        address: String(shipping.address).trim(),
        city: String(shipping.city || "").trim(),
        pincode: String(shipping.pincode || "").trim(),
      },
      total,
      status: "placed",
      payment_status: "pending",
      payment_method: "razorpay_demo",
      created_at: new Date().toISOString(),
    };

    db.orders.unshift(order);
    saveOrderToMongo(order);
    saveDb();
    sendOrderConfirmationEmail(order).catch((e) => console.warn(e));
    res.json(order);
  });

  // Pay order (demo mode)
  app.post("/api/orders/:orderId/pay", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const order = db.orders.find((o) => o.id === req.params.orderId && o.user_id === user.id);
    if (!order) {
      res.status(404).json({ detail: "Order not found" });
      return;
    }

    order.payment_status = "paid";
    saveOrderToMongo(order);
    saveDb();
    sendOrderConfirmationEmail(order).catch((e) => console.warn(e));
    res.json(order);
  });

  // User's own orders
  app.get("/api/orders/mine", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const orders = db.orders
      .filter((o) => o.user_id === user.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(orders);
  });

  // All orders (admin)
  app.get("/api/orders", requireAdmin, (_req: Request, res: Response) => {
    const orders = db.orders
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json(orders);
  });

  // Update order status (admin)
  app.patch("/api/orders/:orderId/status", requireAdmin, (req: Request, res: Response) => {
    const { status } = req.body || {};
    const valid = ["placed", "shipped", "delivered", "cancelled"];
    if (!valid.includes(status)) {
      res.status(422).json({ detail: "Invalid status" });
      return;
    }

    const order = db.orders.find((o) => o.id === req.params.orderId);
    if (!order) {
      res.status(404).json({ detail: "Order not found" });
      return;
    }

    order.status = status;
    saveOrderToMongo(order);
    saveDb();
    res.json(order);
  });

  // Track order by order number
  app.get("/api/track/:orderNumber", (req: Request, res: Response) => {
    const cleanNum = req.params.orderNumber.trim().toUpperCase();
    const order = db.orders.find((o) => o.order_number.toUpperCase() === cleanNum);
    if (!order) {
      res.status(404).json({ detail: "No order found with that number" });
      return;
    }
    res.json(order);
  });

  // Payment configuration info
  app.get("/api/payments/config", (_req: Request, res: Response) => {
    const key = process.env.RAZORPAY_KEY_ID || "";
    res.json({
      provider: "razorpay",
      demo_mode: key === "",
      key_id: key,
    });
  });

  // =================== WISHLIST ROUTES ===================

  // Get wishlist
  app.get("/api/wishlist", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const userProductIds = db.wishlists
      .filter((w) => w.user_id === user.id)
      .map((w) => w.product_id);

    const products = db.products.filter((p) => userProductIds.includes(p.id));
    res.json(products);
  });

  // Add to wishlist
  app.post("/api/wishlist/:productId", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { productId } = req.params;

    const product = db.products.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ detail: "Product not found" });
      return;
    }

    if (!db.wishlists.some((w) => w.user_id === user.id && w.product_id === productId)) {
      const wishRecord: WishlistRecord = {
        user_id: user.id,
        product_id: productId,
        created_at: new Date().toISOString(),
      };
      db.wishlists.push(wishRecord);
      saveWishlistToMongo(wishRecord);
      saveDb();
    }

    res.json(product);
  });

  // Remove from wishlist
  app.delete("/api/wishlist/:productId", requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { productId } = req.params;

    db.wishlists = db.wishlists.filter(
      (w) => !(w.user_id === user.id && w.product_id === productId)
    );
    deleteWishlistFromMongo(user.id, productId);
    saveDb();
    res.json({ ok: true });
  });

  // =================== FEEDBACK ROUTES ===================

  // Submit feedback
  app.post("/api/feedback", (req: Request, res: Response) => {
    const { name, email, rating, message } = req.body || {};
    if (!name || !message || String(message).length < 3) {
      res.status(422).json({ detail: "Name and message (min 3 chars) are required" });
      return;
    }

    const fb: Feedback = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: String(email || "").trim(),
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      message: String(message).trim(),
      created_at: new Date().toISOString(),
    };

    db.feedback.unshift(fb);
    saveFeedbackToMongo(fb);
    saveDb();
    res.json(fb);
  });

  // List feedback (admin)
  app.get("/api/feedback", requireAdmin, (_req: Request, res: Response) => {
    res.json(db.feedback);
  });

  // =================== UPLOAD ROUTES ===================

  app.post("/api/uploads", requireAdmin, upload.single("file") as any, (req: Request, res: Response) => {
    if (!req.file) {
      res.status(422).json({ detail: "No file uploaded" });
      return;
    }
    const filename = req.file.filename;
    res.json({ url: `/api/uploads/${filename}` });
  });

  // Database status
  app.get("/api/db-status", async (_req: Request, res: Response) => {
    const status = await getMongoStatus();
    res.json(status);
  });

  // Email service status
  app.get("/api/email/config", (_req: Request, res: Response) => {
    const info = getEmailProviderInfo();
    res.json({
      ...info,
      from_name: process.env.EMAIL_FROM_NAME || "Veeraa",
      from_email:
        process.env.EMAIL_FROM ||
        (info.provider === "gmail"
          ? process.env.GMAIL_USER
          : info.provider === "resend"
            ? "onboarding@resend.dev"
            : undefined),
    });
  });

  // Health check
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json([
      {
        id: crypto.randomUUID(),
        client_name: "Veeraa API Node Server",
        timestamp: new Date().toISOString(),
      },
    ]);
  });

  // =================== VITE SPA INTEGRATION ===================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Veeraa app server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
