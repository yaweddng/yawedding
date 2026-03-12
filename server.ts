import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import dns from "dns";
import webpush from "web-push";
import multer from "multer";
import crypto from "crypto";
import db from "./src/db.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Encryption key for files (in production, use an env variable)
const ENCRYPTION_KEY = crypto.scryptSync(process.env.FILE_ENCRYPTION_KEY || 'default-secret-key-change-me', 'salt', 32);
const IV_LENGTH = 16;

const uploadDir = path.join(__dirname, "storage/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

import { WebSocketServer, WebSocket } from 'ws';

async function startServer() {
  const app = express();
  const PORT = 3000;

  const clients = new Map<string, WebSocket>();

  const broadcastToUser = (userId: string, data: any) => {
    const ws = clients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  app.use(express.json());

  // API Routes
  const SERVICES_PATH = path.join(__dirname, "src/data/services.json");
  const BLOGS_PATH = path.join(__dirname, "src/data/blogs.json");
  const SETTINGS_PATH = path.join(__dirname, "src/data/settings.json");
  const RATINGS_PATH = path.join(__dirname, "src/data/ratings.json");
  const PACKAGE_STEPS_PATH = path.join(__dirname, "src/data/package_steps.json");
  const PROMOS_PATH = path.join(__dirname, "src/data/promos.json");
  const PAGES_PATH = path.join(__dirname, "src/data/pages.json");
  const MEDIA_PATH = path.join(__dirname, "src/data/media.json");
  const BOOKING_FORMS_PATH = path.join(__dirname, "src/data/booking_forms.json");
  const PACKAGES_DATA_PATH = path.join(__dirname, "src/data/packages.json");
  const PARTNERSHIPS_PATH = path.join(__dirname, "src/data/partnerships.json");
  const DEVELOPMENT_PATH = path.join(__dirname, "src/data/development.json");
  const WIDGET_PRO_PATH = path.join(__dirname, "src/data/widget_pro.json");
  const CONTAINERS_PATH = path.join(__dirname, "src/data/containers.json");
  const STANDARD_WIDGETS_PATH = path.join(__dirname, "src/data/standard_widgets.json");
  const EMAIL_TEMPLATES_PATH = path.join(__dirname, "src/data/email_templates.json");
  const PDF_TEMPLATES_PATH = path.join(__dirname, "src/data/pdf_templates.json");
  const THEME_BUILDER_PATH = path.join(__dirname, "src/data/theme_builder.json");
  const CUSTOM_POST_TYPES_PATH = path.join(__dirname, "src/data/custom_post_types.json");
  const USERS_PATH = path.join(__dirname, "src/data/users.json");
  const USER_SITES_PATH = path.join(__dirname, "src/data/user_sites.json");
  const ADMIN_SECURITY_PATH = path.join(__dirname, "src/data/admin_security.json");
  const BLOCKED_IPS_PATH = path.join(__dirname, "src/data/blocked_ips.json");
  const REDIRECTIONS_PATH = path.join(__dirname, "src/data/redirections.json");

  // Multi-tenant Middleware: Detect site by Host header
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    const platformDomain = "platform.com"; // Replace with actual platform domain
    
    // Skip for API and static assets
    if (req.path.startsWith("/api") || req.path.includes(".")) {
      return next();
    }

    // If it's a custom domain (not platform domain and not localhost)
    if (host && !host.includes(platformDomain) && !host.includes("localhost") && !host.includes(".run.app")) {
      const sitesData = JSON.parse(fs.readFileSync(USER_SITES_PATH, "utf-8"));
      const site = sitesData.sites.find((s: any) => s.customDomain === host && s.dnsVerified);
      
      if (site) {
        // We can attach site info to request or handle it in frontend
        // For SPA, we usually serve index.html and let frontend handle it
        // But we might want to inject site info
      }
    }
    next();
  });

  // Blocked IP Middleware
  const ensureFile = (filePath: string, defaultData: any) => {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
  };

  ensureFile(USERS_PATH, { users: [] });
  ensureFile(USER_SITES_PATH, { sites: [] });
  ensureFile(ADMIN_SECURITY_PATH, {
    slug: "/admin-portal-access",
    securityQuestions: [
      { q: "Who is Owner", a: "Jakariya" },
      { q: "Who is Developer", a: "Jaek" },
      { q: "What is Security Code", a: "82725" }
    ],
    allowedGeos: ["Sylhet, Bangladesh", "Dubai, UAE"],
    adminCredentials: {
      username: "admin@ya.com",
      password: "ya-admin-2024"
    }
  });
  ensureFile(BLOCKED_IPS_PATH, { blocked: [] });
  ensureFile(REDIRECTIONS_PATH, { redirections: [] });

  // Ensure Master Admin exists in DB
  try {
    const securityData = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));
    const adminEmail = securityData.adminCredentials.username;
    const adminPassword = securityData.adminCredentials.password;
    const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.prepare(`
        INSERT INTO users (id, email, password, name, username, role, is_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('admin', adminEmail, hashedPassword, 'Master Admin', 'admin', 'admin', 1);
      console.log("Master Admin created in database.");
    }
  } catch (e) {
    console.error("Failed to ensure Master Admin:", e);
  }

  // VAPID Keys for Push Notifications
  let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || ""
  };

  if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
    const keys = webpush.generateVAPIDKeys();
    vapidKeys = keys;
    console.log("Generated new VAPID keys:", keys);
  }

  webpush.setVapidDetails(
    "mailto:admin@ya.tsameemevents.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // Redirections Middleware
  app.use((req, res, next) => {
    try {
      if (fs.existsSync(REDIRECTIONS_PATH)) {
        const data = JSON.parse(fs.readFileSync(REDIRECTIONS_PATH, "utf-8"));
        const redirections = data.redirections || [];
        const path = req.path;
        
        const redirection = redirections.find((r: any) => r.from === path && r.status === 'Active');
        
        if (redirection) {
          // Increment hit count
          redirection.hits = (redirection.hits || 0) + 1;
          fs.writeFileSync(REDIRECTIONS_PATH, JSON.stringify({ redirections }, null, 2));
          
          if (redirection.type === 'shortcode') {
            return res.redirect(redirection.to);
          } else {
            const statusCode = parseInt(redirection.type) || 301;
            return res.redirect(statusCode, redirection.to);
          }
        }
      }
    } catch (e) {
      console.error('Redirection error:', e);
    }
    next();
  });

  app.get("/api/theme-builder", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(THEME_BUILDER_PATH, "utf-8"));
      res.json(data.templates);
    } catch (e) {
      res.json([]);
    }
  });

  // Dynamic PWA Manifest
  app.get("/manifest.json", (req, res) => {
    const host = req.headers.host || "";
    const platformDomain = "platform.com";
    
    let manifest = {
      name: "YA Wedding | Luxury Wedding Planning",
      short_name: "YA Wedding",
      description: "YA Wedding is Dubai's premier luxury wedding planner, specializing in traditional Emarati, Indian, and Western weddings. Experience seamless planning, premium decor, and unforgettable celebrations with our all-in-one wedding management platform.",
      start_url: "/",
      display: "standalone",
      background_color: "#0a0a0a",
      theme_color: "#00c896",
      icons: [
        {
          src: "/favicon.svg",
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any maskable"
        },
        {
          src: "/favicon.svg",
          sizes: "512x512",
          type: "image/svg+xml",
          purpose: "any maskable"
        }
      ],
      shortcuts: [
        {
          name: "Book a Service",
          short_name: "Book",
          description: "Book our premium wedding services",
          url: "/services",
          icons: [{ src: "/favicon.svg", sizes: "192x192" }]
        },
        {
          name: "Package Builder",
          short_name: "Builder",
          description: "Build your custom wedding package",
          url: "/package-builder",
          icons: [{ src: "/favicon.svg", sizes: "192x192" }]
        },
        {
          name: "Contact Us",
          short_name: "Contact",
          description: "Get in touch with our team",
          url: "/contact",
          icons: [{ src: "/favicon.svg", sizes: "192x192" }]
        }
      ]
    };

    // Multi-tenant manifest override
    if (host && !host.includes(platformDomain) && !host.includes("localhost") && !host.includes(".run.app")) {
      try {
        const sitesData = JSON.parse(fs.readFileSync(USER_SITES_PATH, "utf-8"));
        const site = sitesData.sites.find((s: any) => s.customDomain === host && s.dnsVerified);
        if (site) {
          manifest.name = site.title || manifest.name;
          manifest.short_name = site.title?.split(' ')[0] || manifest.short_name;
          // You could also add custom icons here if stored in site config
        }
      } catch (e) {}
    }

    res.json(manifest);
  });

  app.post("/api/theme-builder", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { templates } = req.body;
    fs.writeFileSync(THEME_BUILDER_PATH, JSON.stringify({ templates }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/custom-post-types", (req, res) => {
    try {
      if (!fs.existsSync(CUSTOM_POST_TYPES_PATH)) {
        fs.writeFileSync(CUSTOM_POST_TYPES_PATH, JSON.stringify({ postTypes: [] }, null, 2));
      }
      const data = JSON.parse(fs.readFileSync(CUSTOM_POST_TYPES_PATH, "utf-8"));
      res.json(data.postTypes);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/custom-post-types", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { postTypes } = req.body;
    fs.writeFileSync(CUSTOM_POST_TYPES_PATH, JSON.stringify({ postTypes }, null, 2));
    res.json({ success: true });
  });

  // Installation API
  app.get("/api/install/check", (req, res) => {
    const installed = db.prepare("SELECT value FROM settings WHERE key = 'installed'").get();
    res.json({ installed: !!installed });
  });

  app.post("/api/install", async (req, res) => {
    const { adminEmail, adminPassword, siteTitle } = req.body;
    
    const installed = db.prepare("SELECT value FROM settings WHERE key = 'installed'").get();
    if (installed) return res.status(400).json({ error: "Platform already installed" });

    try {
      // Create Master Admin
      const adminId = 'admin';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      db.prepare(`
        INSERT OR REPLACE INTO users (id, email, password, name, username, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminId, adminEmail, hashedPassword, 'Master Admin', 'admin', 'admin');

      // Create Default Site
      const siteId = 'default';
      db.prepare(`
        INSERT OR REPLACE INTO sites (id, user_id, title, subdomain)
        VALUES (?, ?, ?, ?)
      `).run(siteId, adminId, siteTitle, 'admin');

      // Mark as installed
      db.prepare("INSERT INTO settings (key, value) VALUES ('installed', 'true')").run();

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Installation failed" });
    }
  });
  // Helper for generating OTP
  const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

  // Helper to get SMTP settings
  const getSMTPSettings = () => {
    let settings = {
      smtpHost: process.env.SMTP_HOST || "smtp.example.com",
      smtpPort: process.env.SMTP_PORT || "587",
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
      fromEmail: process.env.FROM_EMAIL || "noreply@example.com"
    };

    try {
      if (fs.existsSync(DEVELOPMENT_PATH)) {
        const fileData = JSON.parse(fs.readFileSync(DEVELOPMENT_PATH, "utf-8"));
        if (fileData.smtpHost) settings.smtpHost = fileData.smtpHost;
        if (fileData.smtpPort) settings.smtpPort = fileData.smtpPort.toString();
        if (fileData.smtpUser) settings.smtpUser = fileData.smtpUser;
        if (fileData.smtpPass) settings.smtpPass = fileData.smtpPass;
        if (fileData.fromEmail) settings.fromEmail = fileData.fromEmail;
        if (fileData.adminEmail) settings.adminEmail = fileData.adminEmail;
      }
    } catch (e) {
      console.error("Failed to load SMTP settings from file:", e);
    }
    return settings;
  };

  // Helper for sending OTP Email
  const sendOTPEmail = async (email: string, otp: string, type: 'verification' | 'reset', name?: string) => {
    const settings = getSMTPSettings();
    
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort),
      secure: settings.smtpPort === "465",
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false }
    });

    const brandColor = "#00C896";
    const subject = type === 'verification' ? "Verify Your Account - YA Wedding" : "Reset Your Password - YA Wedding";
    const title = type === 'verification' ? "Account Verification" : "Password Reset";
    const message = type === 'verification' 
      ? `Welcome to YA Wedding, ${name || 'there'}! Use the code below to verify your account.`
      : `We received a request to reset your password. Use the code below to proceed.`;

    const html = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #0B0F14; color: #FFFFFF; padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; width: 60px; height: 60px; background-color: ${brandColor}; color: #141414; border-radius: 12px; line-height: 60px; font-size: 24px; font-weight: bold;">YA</div>
        </div>
        <h2 style="text-align: center; color: ${brandColor}; font-size: 24px; margin-bottom: 20px;">${title}</h2>
        <p style="text-align: center; color: #9CA3AF; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">${message}</p>
        <div style="background-color: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; text-align: center; margin-bottom: 30px;">
          <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: ${brandColor};">${otp}</span>
        </div>
        <p style="text-align: center; color: #9CA3AF; font-size: 12px;">This code will expire in 15 minutes. If you didn't request this, please ignore this email.</p>
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
          <p style="color: ${brandColor}; font-weight: bold; margin: 0;">YA WEDDING DUBAI</p>
          <p style="color: #4B5563; font-size: 10px; margin-top: 5px;">Luxury Event Planning & Design</p>
        </div>
      </div>
    `;

    try {
      console.log(`Attempting to send OTP email to ${email}...`);
      await transporter.sendMail({
        from: `"YA Wedding" <${settings.fromEmail}>`,
        to: email,
        subject,
        html
      });
      console.log(`OTP email sent successfully to ${email}`);
      return true;
    } catch (e) {
      console.error("Failed to send OTP email:", e);
      return false;
    }
  };

  const sendWelcomeEmail = async (email: string, name: string) => {
    const settings = getSMTPSettings();

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort),
      secure: settings.smtpPort === "465",
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false }
    });

    const brandColor = "#00C896";
    const html = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #0B0F14; color: #FFFFFF; padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; width: 60px; height: 60px; background-color: ${brandColor}; color: #141414; border-radius: 12px; line-height: 60px; font-size: 24px; font-weight: bold;">YA</div>
        </div>
        <h2 style="text-align: center; color: ${brandColor}; font-size: 24px; margin-bottom: 20px;">Welcome to YA Wedding!</h2>
        <p style="text-align: center; color: #9CA3AF; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
          Hello ${name}, your account has been successfully created and verified. 
          We are excited to have you on our luxury event planning platform.
        </p>
        <div style="text-align: center; margin-bottom: 30px;">
          <a href="${process.env.APP_URL || 'https://ya.tsameemevents.com'}/login" style="background-color: ${brandColor}; color: #141414; padding: 16px 35px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Login to Your Account</a>
        </div>
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
          <p style="color: ${brandColor}; font-weight: bold; margin: 0;">YA WEDDING DUBAI</p>
          <p style="color: #4B5563; font-size: 10px; margin-top: 5px;">Luxury Event Planning & Design</p>
        </div>
      </div>
    `;

    try {
      console.log(`Attempting to send welcome email to ${email}...`);
      await transporter.sendMail({
        from: `"YA Wedding" <${settings.fromEmail}>`,
        to: email,
        subject: "Welcome to YA Wedding!",
        html
      });
      console.log(`Welcome email sent successfully to ${email}`);
      return true;
    } catch (e) {
      console.error("Failed to send welcome email:", e);
      return false;
    }
  };

  const sendEmail = async (email: string, subject: string, html: string) => {
    const settings = getSMTPSettings();

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: parseInt(settings.smtpPort),
      secure: settings.smtpPort === "465",
      auth: { user: settings.smtpUser, pass: settings.smtpPass },
      tls: { rejectUnauthorized: false }
    });

    const brandColor = "#00C896";
    const fullHtml = `
      <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background-color: #0B0F14; color: #FFFFFF; padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; width: 60px; height: 60px; background-color: ${brandColor}; color: #141414; border-radius: 12px; line-height: 60px; font-size: 24px; font-weight: bold;">YA</div>
        </div>
        <div style="color: #FFFFFF; font-size: 16px; line-height: 1.6;">
          ${html}
        </div>
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
          <p style="color: ${brandColor}; font-weight: bold; margin: 0;">YA WEDDING DUBAI</p>
          <p style="color: #4B5563; font-size: 10px; margin-top: 5px;">Luxury Event Planning & Design</p>
        </div>
      </div>
    `;

    try {
      console.log(`Attempting to send generic email to ${email} with subject: ${subject}...`);
      await transporter.sendMail({
        from: `"YA Wedding" <${settings.fromEmail}>`,
        to: email,
        subject,
        html: fullHtml
      });
      console.log(`Generic email sent successfully to ${email}`);
      return true;
    } catch (e) {
      console.error("Failed to send email:", e);
      return false;
    }
  };

  const sendUnreadNotificationEmail = async (email: string, count: number) => {
    const subject = "You have unread messages!";
    const html = `
      <h2 style="color: #00C896; font-size: 24px; margin-bottom: 20px;">You have unread messages!</h2>
      <p style="color: #9CA3AF; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
        You have ${count} unread message${count > 1 ? 's' : ''} waiting for you in your YA Wedding inbox.
      </p>
      <div style="text-align: center; margin-bottom: 30px;">
        <a href="${process.env.APP_URL || 'https://ya.tsameemevents.com'}/inbox" style="background-color: #00C896; color: #141414; padding: 16px 35px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">View Messages</a>
      </div>
    `;

    return await sendEmail(email, subject, html);
  };

  // 30-day file cleanup task (runs daily)
  setInterval(() => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const oldFiles = db.prepare(`
        SELECT file_url FROM messages 
        WHERE created_at < ? AND file_url IS NOT NULL
      `).all(thirtyDaysAgo);

      oldFiles.forEach((msg: any) => {
        if (msg.file_url) {
          const filename = msg.file_url.split('/').pop();
          const filePath = path.join(uploadDir, filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      });

      db.prepare(`
        UPDATE messages 
        SET file_url = NULL, content = '[File automatically deleted after 30 days]' 
        WHERE created_at < ? AND file_url IS NOT NULL
      `).run(thirtyDaysAgo);
    } catch (e) {
      console.error("File cleanup task failed:", e);
    }
  }, 24 * 60 * 60 * 1000);

  // Background task for unread messages (every minute)
  setInterval(async () => {
    try {
      // Find unread messages older than 10 minutes that haven't been notified yet
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const unreadMessages = db.prepare(`
        SELECT m.*, u.email, u.name 
        FROM messages m
        JOIN users u ON m.receiver_id = u.id
        WHERE m.is_read = 0 
        AND m.created_at < ?
        AND (m.notified = 0 OR m.notified IS NULL)
      `).all(tenMinutesAgo);

      if (unreadMessages.length > 0) {
        // Group by user to send one email per user
        const userGroups: any = {};
        unreadMessages.forEach((m: any) => {
          if (!userGroups[m.receiver_id]) {
            userGroups[m.receiver_id] = { email: m.email, count: 0, ids: [] };
          }
          userGroups[m.receiver_id].count++;
          userGroups[m.receiver_id].ids.push(m.id);
        });

        for (const userId in userGroups) {
          const group = userGroups[userId];
          await sendUnreadNotificationEmail(group.email, group.count);
          
          // Mark as notified
          const placeholders = group.ids.map(() => '?').join(',');
          db.prepare(`UPDATE messages SET notified = 1 WHERE id IN (${placeholders})`).run(...group.ids);
        }
      }
    } catch (e) {
      console.error("Unread message background task failed:", e);
    }
  }, 60000);

  app.post("/api/auth/register-customer", async (req, res) => {
    const { email, password, name, username } = req.body;
    
    try {
      const existingUser = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(email, username);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const userId = Math.random().toString(36).substr(2, 9);
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = generateOTP();
      const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO users (id, email, password, name, username, role, is_verified, otp_code, otp_expiry)
        VALUES (?, ?, ?, ?, ?, 'customer', 0, ?, ?)
      `).run(userId, email, hashedPassword, name, username, otp, expiry);

      await sendOTPEmail(email, otp, 'verification', name);

      res.json({ success: true, message: "OTP sent to your email", userId });
    } catch (e) {
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name, username } = req.body;
    
    try {
      const existingUser = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(email, username);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }

      const userId = Math.random().toString(36).substr(2, 9);
      const hashedPassword = await bcrypt.hash(password, 10);
      const otp = generateOTP();
      const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO users (id, email, password, name, username, role, is_verified, otp_code, otp_expiry)
        VALUES (?, ?, ?, ?, ?, 'partner', 0, ?, ?)
      `).run(userId, email, hashedPassword, name, username, otp, expiry);

      const siteId = Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO sites (id, user_id, title, subdomain)
        VALUES (?, ?, ?, ?)
      `).run(siteId, userId, `${name}'s Site`, username);

      await sendOTPEmail(email, otp, 'verification', name);

      res.json({ success: true, message: "OTP sent to your email", userId });
    } catch (e) {
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    const { email, otp } = req.body;
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.otp_code !== otp) return res.status(400).json({ error: "Invalid OTP" });
      if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ error: "OTP expired" });

      db.prepare("UPDATE users SET is_verified = 1, otp_code = NULL, otp_expiry = NULL WHERE id = ?").run(user.id);
      
      // Send Welcome Email
      await sendWelcomeEmail(user.email, user.name || user.username);

      // Add welcome message from admin in chat
      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();
      const adminId = admin ? admin.id : 'admin';
      
      const welcomeMsgId = Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO messages (id, sender_id, receiver_id, content)
        VALUES (?, ?, ?, ?)
      `).run(welcomeMsgId, adminId, user.id, "Welcome to YA Wedding! I'm your admin assistant. How can I help you today?");

      res.json({ 
        success: true, 
        token: `user-token-${user.id}`, 
        user: { id: user.id, email: user.email, name: user.name, role: user.role } 
      });
    } catch (e) {
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return res.status(404).json({ error: "User not found" });

      const otp = generateOTP();
      const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare("UPDATE users SET otp_code = ?, otp_expiry = ? WHERE id = ?").run(otp, expiry, user.id);

      await sendOTPEmail(email, otp, 'reset', user.name);
      res.json({ success: true, message: "Reset OTP sent to your email" });
    } catch (e) {
      res.status(500).json({ error: "Failed to process request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
      const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.otp_code !== otp) return res.status(400).json({ error: "Invalid OTP" });
      if (new Date(user.otp_expiry) < new Date()) return res.status(400).json({ error: "OTP expired" });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password = ?, otp_code = NULL, otp_expiry = NULL WHERE id = ?").run(hashedPassword, user.id);

      res.json({ success: true, message: "Password reset successful" });
    } catch (e) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    
    // Check for Master Admin first
    if (email === 'admin@ya.com' && password === 'ya-admin-2024') {
      return res.json({ 
        success: true, 
        token: 'ya-admin-secret', 
        user: { id: 'admin', email: 'admin@ya.com', name: 'Master Admin', role: 'admin' } 
      });
    }

    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.is_verified && user.role !== 'admin') {
      return res.status(403).json({ error: "Account not verified", needsVerification: true });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ 
      success: true, 
      token: `user-token-${user.id}`, 
      user: { id: user.id, email: user.email, name: user.name, role: user.role } 
    });
  });

  // Messages Endpoints
  app.post("/api/users/:id/preferences", (req, res) => {
    const { calls_enabled } = req.body;
    try {
      db.prepare("UPDATE users SET calls_enabled = ? WHERE id = ?").run(calls_enabled ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  app.post("/api/admin/users/:id/block-features", (req, res) => {
    const { blocked_features } = req.body; // Array of strings e.g. ['calls', 'files']
    try {
      db.prepare("UPDATE users SET blocked_features = ? WHERE id = ?").run(JSON.stringify(blocked_features), req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update blocked features" });
    }
  });

  app.get("/api/users/:id", (req, res) => {
    try {
      const user = db.prepare("SELECT id, name, username, email, role, calls_enabled, blocked_features FROM users WHERE id = ?").get(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Calls Endpoints
  app.get("/api/calls/active", (req, res) => {
    const { userId } = req.query;
    try {
      const call = db.prepare("SELECT * FROM active_calls WHERE (caller_id = ? OR receiver_id = ?) AND status = 'calling' ORDER BY id DESC LIMIT 1").get(userId, userId);
      res.json({ call });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch active call" });
    }
  });

  app.post("/api/calls", (req, res) => {
    const { caller_id, receiver_id, type } = req.body;
    try {
      const id = Date.now().toString();
      db.prepare("INSERT INTO active_calls (id, caller_id, receiver_id, type, status) VALUES (?, ?, ?, ?, 'calling')").run(id, caller_id, receiver_id, type);
      
      // Trigger push notification for receiver
      const subscriptions = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(receiver_id);
      const payload = JSON.stringify({
        title: "Incoming Call",
        body: `You have an incoming ${type} call`,
        data: { url: `/inbox` }
      });
      subscriptions.forEach((sub: any) => {
        webpush.sendNotification(JSON.parse(sub.subscription), payload).catch(e => console.error("Failed to send push notification:", e));
      });
      
      res.json({ success: true, callId: id });
    } catch (e) {
      res.status(500).json({ error: "Failed to start call" });
    }
  });

  app.put("/api/calls/:id", (req, res) => {
    const { status, duration } = req.body;
    try {
      if (status === 'ended' || status === 'rejected' || status === 'missed') {
        db.prepare("UPDATE active_calls SET status = ?, ended_at = CURRENT_TIMESTAMP, duration = ? WHERE id = ?").run(status, duration || 0, req.params.id);
        
        // Log to messages
        const call = db.prepare("SELECT * FROM active_calls WHERE id = ?").get(req.params.id);
        if (call) {
          let content = '';
          if (status === 'ended') {
            const h = Math.floor(duration / 3600).toString().padStart(2, '0');
            const m = Math.floor((duration % 3600) / 60).toString().padStart(2, '0');
            const s = (duration % 60).toString().padStart(2, '0');
            content = `📞 ${call.type === 'video' ? 'Video' : 'Audio'} call ended. Duration: ${h}:${m}:${s}`;
          } else if (status === 'rejected') {
            content = `📞 ${call.type === 'video' ? 'Video' : 'Audio'} call declined.`;
          } else if (status === 'missed') {
            content = `📞 Missed ${call.type === 'video' ? 'Video' : 'Audio'} call.`;
          }
          
          if (content) {
            const msgId = Date.now().toString();
            db.prepare("INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)").run(msgId, call.caller_id, call.receiver_id, content);
            
            // Broadcast to both
            const msgData = {
              type: 'chat-message',
              payload: {
                id: msgId,
                sender_id: call.caller_id,
                receiver_id: call.receiver_id,
                content,
                created_at: new Date().toISOString(),
                is_read: 0
              }
            };
            broadcastToUser(call.caller_id, msgData);
            broadcastToUser(call.receiver_id, msgData);
          }
        }
      } else {
        db.prepare("UPDATE active_calls SET status = ? WHERE id = ?").run(status, req.params.id);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update call" });
    }
  });

  app.get("/api/calls/incoming/:userId", (req, res) => {
    try {
      const call = db.prepare(`
        SELECT c.*, u.name as caller_name, u.username as caller_username, u.role as caller_role 
        FROM active_calls c 
        JOIN users u ON c.caller_id = u.id 
        WHERE c.receiver_id = ? AND c.status = 'calling'
      `).get(req.params.userId);
      res.json(call || null);
    } catch (e) {
      res.status(500).json({ error: "Failed to check incoming calls" });
    }
  });

  app.get("/api/calls/active/:userId", (req, res) => {
    try {
      const call = db.prepare(`
        SELECT c.*, 
          u1.name as caller_name, u1.username as caller_username, u1.role as caller_role,
          u2.name as receiver_name, u2.username as receiver_username, u2.role as receiver_role
        FROM active_calls c 
        JOIN users u1 ON c.caller_id = u1.id 
        JOIN users u2 ON c.receiver_id = u2.id 
        WHERE (c.caller_id = ? OR c.receiver_id = ?) AND c.status IN ('calling', 'connected')
      `).get(req.params.userId, req.params.userId);
      res.json(call || null);
    } catch (e) {
      res.status(500).json({ error: "Failed to check active calls" });
    }
  });

  app.get("/api/admin/calls/active", (req, res) => {
    try {
      const calls = db.prepare(`
        SELECT c.*, 
          u1.name as caller_name, u1.username as caller_username, u1.role as caller_role,
          u2.name as receiver_name, u2.username as receiver_username, u2.role as receiver_role
        FROM active_calls c 
        JOIN users u1 ON c.caller_id = u1.id 
        JOIN users u2 ON c.receiver_id = u2.id 
        WHERE c.status IN ('calling', 'connected')
      `).all();
      res.json(calls);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch active calls" });
    }
  });

  app.delete("/api/admin/calls/:id", (req, res) => {
    try {
      db.prepare("UPDATE active_calls SET status = 'terminated', ended_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to terminate call" });
    }
  });

  app.get("/api/messages/conversations", (req, res) => {
    const currentUserId = req.query.userId as string;
    const currentUserRole = req.query.role as string;

    try {
      // Base query to get users and their last message with the current user
      let query = `
        SELECT 
          u.id, u.name, u.username, u.email, u.role,
          m.content as last_message,
          m.created_at as last_message_at,
          (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count
        FROM users u
        LEFT JOIN (
          SELECT m1.*
          FROM messages m1
          INNER JOIN (
            SELECT 
              CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as contact_id,
              MAX(created_at) as max_created_at
            FROM messages
            WHERE sender_id = ? OR receiver_id = ?
            GROUP BY contact_id
          ) m2 ON (CASE WHEN m1.sender_id = ? THEN m1.receiver_id ELSE m1.sender_id END) = m2.contact_id 
            AND m1.created_at = m2.max_created_at
        ) m ON u.id = (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END)
        WHERE u.id != ?
      `;

      if (currentUserRole === 'customer') {
        query += " AND (u.role = 'admin' OR u.role = 'partner')";
      } else if (currentUserRole === 'partner') {
        query += " AND (u.role = 'admin' OR u.role = 'customer')";
      }

      query += " ORDER BY (CASE WHEN m.created_at IS NULL THEN 1 ELSE 0 END), m.created_at DESC, u.name ASC";

      const users = db.prepare(query).all(
        currentUserId, // for unread_count
        currentUserId, currentUserId, currentUserId, // for inner join m2
        currentUserId, // for inner join m1 contact_id
        currentUserId, // for outer join m contact_id
        currentUserId  // for u.id != ?
      );
      
      res.json(users);
    } catch (e) {
      console.error("Failed to fetch conversations:", e);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/messages/search", (req, res) => {
    const { q, role, userId } = req.query;
    try {
      let query = "SELECT id, name, username, email, role FROM users WHERE (name LIKE ? OR username LIKE ?) AND id != ?";
      let params: any[] = [`%${q}%`, `%${q}%`, userId];

      if (role === 'customer') {
        query += " AND (role = 'admin' OR role = 'partner')";
      } else if (role === 'partner') {
        query += " AND (role = 'admin' OR role = 'customer')";
      }
      // Admin can search everyone

      query += " ORDER BY (CASE WHEN role = 'admin' THEN 0 ELSE 1 END), name ASC LIMIT 10";
      
      const users = db.prepare(query).all(...params);
      res.json(users);
    } catch (e) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/messages/:otherUserId", (req, res) => {
    const { otherUserId } = req.params;
    const currentUserId = req.query.userId as string; // Passed from frontend for simplicity

    try {
      const messages = db.prepare(`
        SELECT * FROM messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at ASC
      `).all(currentUserId, otherUserId, otherUserId, currentUserId);
      
      // Mark as read
      db.prepare(`
        UPDATE messages SET is_read = 1 
        WHERE receiver_id = ? AND sender_id = ? AND is_read = 0
      `).run(currentUserId, otherUserId);

      res.json(messages);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/upload", upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const blockedExtensions = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.vbs', '.js', '.jar', '.scr', '.pif'];
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (blockedExtensions.includes(ext)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "File type not allowed for security reasons." });
      }

      // Encrypt file
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      const input = fs.readFileSync(req.file.path);
      const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
      
      // Save encrypted file with IV prepended
      fs.writeFileSync(req.file.path + '.enc', Buffer.concat([iv, encrypted]));
      fs.unlinkSync(req.file.path); // Remove unencrypted file

      const fileUrl = `/api/files/${path.basename(req.file.path)}.enc`;
      
      res.json({ 
        url: fileUrl,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size
      });
    } catch (e) {
      console.error("Upload error:", e);
      res.status(500).json({ error: "File upload failed" });
    }
  });

  app.get("/api/files/:filename", (req, res) => {
    try {
      const filePath = path.join(uploadDir, req.params.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).send("File not found");
      }

      const fileData = fs.readFileSync(filePath);
      const iv = fileData.slice(0, IV_LENGTH);
      const encryptedText = fileData.slice(IV_LENGTH);
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);

      // Determine content type from original name or DB (simplified here)
      res.setHeader('Content-Disposition', `inline; filename="${req.params.filename.replace('.enc', '')}"`);
      res.send(decrypted);
    } catch (e) {
      console.error("Download error:", e);
      res.status(500).send("Failed to decrypt file");
    }
  });

  app.delete("/api/admin/messages/:id", (req, res) => {
    try {
      const msg = db.prepare("SELECT file_url FROM messages WHERE id = ?").get(req.params.id);
      if (msg && msg.file_url) {
        const filename = msg.file_url.split('/').pop();
        const filePath = path.join(uploadDir, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      db.prepare("DELETE FROM messages WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.post("/api/messages", (req, res) => {
    const { sender_id, receiver_id, content, file_url, file_name, file_type, file_size } = req.body;
    try {
      const id = Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO messages (id, sender_id, receiver_id, content, file_url, file_name, file_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, sender_id, receiver_id, content, file_url || null, file_name || null, file_type || null, file_size || null);
      
      const newMessage = db.prepare("SELECT * FROM messages WHERE id = ?").get(id);
      
      // Broadcast via WebSocket
      broadcastToUser(receiver_id, {
        type: 'chat-message',
        payload: newMessage
      });

      // Trigger push notification for receiver
      const subscriptions = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(receiver_id);
      const sender = db.prepare("SELECT name FROM users WHERE id = ?").get(sender_id);
      
      subscriptions.forEach((sub: any) => {
        try {
          const payload = JSON.stringify({
            title: `New message from ${sender?.name || 'User'}`,
            body: content.length > 50 ? content.substring(0, 47) + '...' : content,
            icon: '/favicon.svg',
            data: { url: '/inbox' }
          });
          webpush.sendNotification(JSON.parse(sub.subscription), payload);
        } catch (e) {
          console.error("Failed to send push notification:", e);
        }
      });

      res.json(newMessage);
    } catch (e) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/push/subscribe", (req, res) => {
    const { userId, subscription } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    
    // Check if subscription already exists for this user
    const existing = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ? AND subscription = ?").get(userId, JSON.stringify(subscription));
    if (!existing) {
      db.prepare("INSERT INTO push_subscriptions (id, user_id, subscription) VALUES (?, ?, ?)").run(id, userId, JSON.stringify(subscription));
    }
    
    res.json({ success: true });
  });

  app.get("/api/push/key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post("/api/admin/send-notification", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { title, body, targetRole } = req.body;
    
    let users;
    if (targetRole === 'all') {
      users = db.prepare("SELECT id FROM users").all();
    } else {
      users = db.prepare("SELECT id FROM users WHERE role = ?").all(targetRole);
    }

    users.forEach((user: any) => {
      const subscriptions = db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(user.id);
      subscriptions.forEach((sub: any) => {
        try {
          const payload = JSON.stringify({
            title,
            body,
            icon: '/favicon.svg',
            data: { url: '/' }
          });
          webpush.sendNotification(JSON.parse(sub.subscription), payload);
        } catch (e) {
          console.error("Failed to send admin push notification:", e);
        }
      });
    });

    res.json({ success: true });
  });

  app.post("/api/messages/mark-read", (req, res) => {
    const { userId, otherUserId } = req.body;
    try {
      db.prepare("UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0").run(otherUserId, userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  app.get("/api/messages/unread/:userId", (req, res) => {
    const { userId } = req.params;
    try {
      const count = db.prepare("SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0").get(userId) as { count: number };
      res.json({ unread: count.count });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  // Admin Security Endpoints
  app.get("/api/admin/security/config", (req, res) => {
    const config = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));
    // Only return the slug and questions (not answers or credentials)
    res.json({
      slug: config.slug,
      questions: config.securityQuestions.map((q: any) => q.q)
    });
  });

  const loginAttempts: Record<string, number> = {};

  app.post("/api/admin/security/verify", (req, res) => {
    const { answers, geo } = req.body;
    const config = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Verify Q&A
    const isQAValid = config.securityQuestions.every((q: any, idx: number) => {
      return answers[idx]?.toLowerCase() === q.a.toLowerCase();
    });

    // Verify Geo
    const isGeoValid = config.allowedGeos.some((allowed: string) => {
      return geo?.toLowerCase().includes(allowed.toLowerCase().split(',')[0].trim().toLowerCase());
    });

    if (!isQAValid || !isGeoValid) {
      loginAttempts[clientIp as string] = (loginAttempts[clientIp as string] || 0) + 1;
      if (loginAttempts[clientIp as string] >= 3) {
        const blockedData = JSON.parse(fs.readFileSync(BLOCKED_IPS_PATH, "utf-8"));
        blockedData.blocked.push(clientIp);
        fs.writeFileSync(BLOCKED_IPS_PATH, JSON.stringify(blockedData, null, 2));
        return res.status(403).json({ error: "Too many failed attempts. Access blocked." });
      }
      return res.status(401).json({ error: "Security verification failed." });
    }

    res.json({ success: true });
  });

  app.post("/api/admin/security/login", (req, res) => {
    const { username, password } = req.body;
    const config = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));

    if (username === config.adminCredentials.username && password === config.adminCredentials.password) {
      return res.json({ 
        success: true, 
        token: 'ya-admin-secret', 
        user: { id: 'admin', email: config.adminCredentials.username, name: 'Master Admin', role: 'admin' } 
      });
    }

    res.status(401).json({ error: "Invalid credentials" });
  });

  // Admin Security Management (Protected)
  app.get("/api/admin/security/full-config", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const config = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));
    res.json(config);
  });

  app.post("/api/admin/security/update", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { currentPassword, newConfig } = req.body;
    const config = JSON.parse(fs.readFileSync(ADMIN_SECURITY_PATH, "utf-8"));

    if (currentPassword !== config.adminCredentials.password) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    fs.writeFileSync(ADMIN_SECURITY_PATH, JSON.stringify(newConfig, null, 2));
    res.json({ success: true });
  });

  app.get("/api/admin/conversations", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const conversations = db.prepare(`
      SELECT c.*, u1.username as user1_username, u2.username as user2_username
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      ORDER BY c.updated_at DESC
    `).all();
    res.json(conversations);
  });

  app.get("/api/admin/conversations/:id/messages", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const messages = db.prepare(`
      SELECT m.*, u.username as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `).all(req.params.id);
    res.json(messages);
  });

  app.post("/api/admin/conversations/:id/block", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { userId } = req.body;
    const conversationId = req.params.id;
    
    // For simplicity, we can just delete the conversation to block them from talking,
    // or we could add a blocked_users table. Let's add a blocked column to conversations if it doesn't exist.
    // Actually, a simple way is to delete the conversation for now, or add a system message.
    // Let's implement a blocked_by column in conversations or just delete it.
    // For now, let's just delete the conversation to prevent further messages.
    try {
      db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(conversationId);
      db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // User Management Endpoints (Admin Only)
  app.get("/api/admin/users", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const users = db.prepare("SELECT * FROM users").all();
    res.json(users);
  });

  app.post("/api/admin/users/add", async (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { username, email, password, role, status } = req.body;
    try {
      const existingUser = db.prepare("SELECT * FROM users WHERE email = ? OR username = ?").get(email, username);
      if (existingUser) {
        return res.status(400).json({ error: "Username or email already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = crypto.randomUUID();
      const isVerified = status === 'verified' ? 1 : 0;
      
      db.prepare(`
        INSERT INTO users (id, username, email, password, role, is_verified)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, username, email, hashedPassword, role, isVerified);

      const newUser = db.prepare("SELECT * FROM users WHERE id = ?").get(id);

      // Send email
      const resetLink = `https://ya.tsameemevents.com/login?email=${encodeURIComponent(email)}`;
      const emailHtml = `
        <h2>Welcome to YA Wedding!</h2>
        <p>Your account has been created by an administrator.</p>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${password}</p>
        <p><strong>Role:</strong> ${role}</p>
        <p>You can log in here: <a href="${resetLink}">Login</a></p>
      `;
      
      await sendEmail(email, "Your YA Wedding Account", emailHtml);

      res.json(newUser);
    } catch (error: any) {
      console.error("Error adding user:", error);
      res.status(500).json({ error: "Failed to add user" });
    }
  });

  app.post("/api/admin/users/send-email", async (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { userId, action } = req.body;
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let subject = "";
      let html = "";
      const loginLink = `https://ya.tsameemevents.com/login?email=${encodeURIComponent(user.email)}`;

      switch (action) {
        case 'reset_password':
          subject = "Password Reset / Setup Link";
          html = `
            <h2>Password Reset</h2>
            <p>Hello ${user.username || user.name},</p>
            <p>You can set up or reset your password using the link below:</p>
            <p><a href="${loginLink}">Set/Reset Password</a></p>
          `;
          break;
        case 'account_terminated':
          subject = "Account Terminated";
          html = `
            <h2>Account Terminated</h2>
            <p>Hello ${user.username || user.name},</p>
            <p>Your account on YA Wedding has been terminated.</p>
            <p>If you believe this is an error, please contact support.</p>
          `;
          break;
        case 'account_verified':
          subject = "Account Verified";
          html = `
            <h2>Account Verified</h2>
            <p>Hello ${user.username || user.name},</p>
            <p>Your account on YA Wedding has been successfully verified!</p>
            <p>You can now log in and access all features.</p>
            <p><a href="${loginLink}">Login to your account</a></p>
          `;
          break;
        case 'status_changed':
          subject = "Account Status Changed";
          html = `
            <h2>Account Status Changed</h2>
            <p>Hello ${user.username || user.name},</p>
            <p>Your account status or role has been updated by an administrator.</p>
            <p>Please log in to see the changes.</p>
            <p><a href="${loginLink}">Login to your account</a></p>
          `;
          break;
        default:
          return res.status(400).json({ error: "Invalid action" });
      }

      await sendEmail(user.email, subject, html);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  app.post("/api/admin/users/update", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { userId, updates } = req.body;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(updates), userId];
    
    try {
      db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  app.post("/api/admin/users/delete", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { userId } = req.body;
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    res.json({ success: true });
  });

  // User Dashboard APIs (Multi-tenant)
  const getUserIdFromToken = (authHeader: string | undefined) => {
    if (!authHeader) return null;
    if (authHeader === "Bearer ya-admin-secret") return "admin";
    if (authHeader.startsWith("Bearer user-token-")) return authHeader.replace("Bearer user-token-", "");
    return null;
  };

  app.get("/api/user/site", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const site = db.prepare("SELECT * FROM sites WHERE user_id = ?").get(userId);
    res.json(site || null);
  });

  app.post("/api/user/site/verify-domain", async (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Domain is required" });

    try {
      // Real DNS check
      let isVerified = false;
      const targetCname = "sites.platform.com";
      const targetA = "76.76.21.21";

      try {
        const cnames = await dns.promises.resolveCname(domain);
        if (cnames.includes(targetCname)) isVerified = true;
      } catch (e) {}

      if (!isVerified) {
        try {
          const addresses = await dns.promises.resolve4(domain);
          if (addresses.includes(targetA)) isVerified = true;
        } catch (e) {}
      }
      
      db.prepare(`
        UPDATE sites 
        SET custom_domain = ?, dns_verified = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ?
      `).run(domain, isVerified ? 1 : 0, userId);
      
      res.json({ success: true, verified: isVerified });
    } catch (e) {
      res.status(500).json({ error: "Verification failed" });
    }
  });

  app.post("/api/user/site/provision-ssl", async (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Domain is required" });

    try {
      // In a real production environment, this would trigger a process to:
      // 1. Request a certificate from Let's Encrypt (e.g., via ACME protocol)
      // 2. Update the load balancer or reverse proxy configuration
      // 3. Reload the proxy to apply the new certificate
      
      // Simulation: SSL provisioning
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work
      
      db.prepare(`
        UPDATE sites 
        SET ssl_enabled = 1, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ? AND custom_domain = ?
      `).run(userId, domain);
      
      res.json({ success: true, message: "SSL certificate provisioned successfully" });
    } catch (e) {
      res.status(500).json({ error: "SSL provisioning failed" });
    }
  });

  app.get("/api/site-lookup", (req, res) => {
    const host = req.query.host as string;
    if (!host) return res.status(400).json({ error: "Host is required" });

    // Check custom domain first
    let site: any = db.prepare("SELECT * FROM sites WHERE custom_domain = ? AND dns_verified = 1").get(host);
    
    // Check subdomain if not custom domain
    if (!site && host.includes(".platform.com")) {
      const subdomain = host.split(".")[0];
      site = db.prepare("SELECT * FROM sites WHERE subdomain = ?").get(subdomain);
    }

    if (site) {
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(site.user_id);
      res.json({ 
        siteId: site.id, 
        username: user?.username,
        title: site.title,
        themeConfig: site.theme_config ? JSON.parse(site.theme_config) : {}
      });
    } else {
      res.status(404).json({ error: "Site not found" });
    }
  });

  app.post("/api/user/site", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const updates = req.body;
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(updates), userId];

    try {
      db.prepare(`UPDATE sites SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(...values);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Update failed" });
    }
  });

  const STORAGE_PATH = path.join(__dirname, "storage/users");

  // Ensure user storage exists
  const ensureUserStorage = (userId: string) => {
    const userPath = path.join(STORAGE_PATH, userId);
    const folders = ["uploads", "media", "assets", "theme", "pages", "posts", "widgets"];
    folders.forEach(f => {
      const folderPath = path.join(userPath, f);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
    });
    
    // Ensure default files
    const pagesFile = path.join(userPath, "pages/data.json");
    if (!fs.existsSync(pagesFile)) fs.writeFileSync(pagesFile, JSON.stringify({ pages: [] }, null, 2));
    
    const postsFile = path.join(userPath, "posts/data.json");
    if (!fs.existsSync(postsFile)) fs.writeFileSync(postsFile, JSON.stringify({ posts: [] }, null, 2));
    
    const widgetsFile = path.join(userPath, "widgets/data.json");
    if (!fs.existsSync(widgetsFile)) fs.writeFileSync(widgetsFile, JSON.stringify({ widgets: [] }, null, 2));
    
    const themeFile = path.join(userPath, "theme/data.json");
    if (!fs.existsSync(themeFile)) fs.writeFileSync(themeFile, JSON.stringify({ theme: {} }, null, 2));
  };

  app.get("/api/page/:id", (req, res) => {
    const { id } = req.params;
    const type = req.query.type as string || 'page';
    const userId = getUserIdFromToken(req.headers.authorization);
    
    let item: any = null;
    
    if (userId) {
      ensureUserStorage(userId);
      const filePath = path.join(STORAGE_PATH, userId, type === 'blog' ? "posts/data.json" : "pages/data.json");
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = type === 'blog' ? data.posts : data.pages;
      item = items.find((p: any) => p.id === id);
    } else {
      const filePath = type === 'blog' ? BLOGS_PATH : PAGES_PATH;
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = type === 'blog' ? data.blogs : data.pages;
      item = items.find((p: any) => p.id === id);
    }
    
    if (!item) return res.status(404).json({ error: `${type} not found` });
    res.json(item);
  });

  app.post("/api/page/save", (req, res) => {
    const { id, visualLayout, title, slug, widgets, type = 'page' } = req.body;
    const userId = getUserIdFromToken(req.headers.authorization);
    
    if (userId) {
      ensureUserStorage(userId);
      const filePath = path.join(STORAGE_PATH, userId, type === 'blog' ? "posts/data.json" : "pages/data.json");
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = type === 'blog' ? data.posts : data.pages;
      const index = items.findIndex((p: any) => p.id === id);
      
      const itemData = { id, visualLayout, title, slug, widgets, updatedAt: new Date().toISOString() };
      
      if (index !== -1) {
        items[index] = { ...items[index], ...itemData };
      } else {
        items.push({ ...itemData, createdAt: new Date().toISOString() });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      res.json({ success: true });
    } else {
      if (req.headers.authorization !== "Bearer ya-admin-secret") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const filePath = type === 'blog' ? BLOGS_PATH : PAGES_PATH;
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const items = type === 'blog' ? data.blogs : data.pages;
      const index = items.findIndex((p: any) => p.id === id);
      
      const itemData = { id, visualLayout, title, slug, widgets, updatedAt: new Date().toISOString() };
      
      if (index !== -1) {
        items[index] = { ...items[index], ...itemData };
      } else {
        items.push({ ...itemData, createdAt: new Date().toISOString() });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      res.json({ success: true });
    }
  });

  app.post("/api/page/publish", (req, res) => {
    const { id, published } = req.body;
    const userId = getUserIdFromToken(req.headers.authorization);
    
    if (userId) {
      ensureUserStorage(userId);
      const pagesPath = path.join(STORAGE_PATH, userId, "pages/data.json");
      const data = JSON.parse(fs.readFileSync(pagesPath, "utf-8"));
      const index = data.pages.findIndex((p: any) => p.id === id);
      
      if (index !== -1) {
        data.pages[index].published = published;
        fs.writeFileSync(pagesPath, JSON.stringify(data, null, 2));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Page not found" });
      }
    } else {
      if (req.headers.authorization !== "Bearer ya-admin-secret") {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const data = JSON.parse(fs.readFileSync(PAGES_PATH, "utf-8"));
      const index = data.pages.findIndex((p: any) => p.id === id);
      
      if (index !== -1) {
        data.pages[index].published = published;
        fs.writeFileSync(PAGES_PATH, JSON.stringify(data, null, 2));
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Page not found" });
      }
    }
  });

  app.get("/api/components", (req, res) => {
    const components = [
      { type: 'section', label: 'Section', icon: 'Layout' },
      { type: 'column', label: 'Column', icon: 'Columns' },
      { type: 'heading', label: 'Heading', icon: 'Type' },
      { type: 'text', label: 'Text Block', icon: 'AlignLeft' },
      { type: 'image', label: 'Image', icon: 'Image' },
      { type: 'button', label: 'Button', icon: 'Square' },
      { type: 'form', label: 'Form', icon: 'ClipboardList' },
      { type: 'slider', label: 'Slider', icon: 'GalleryHorizontal' },
      { type: 'gallery', label: 'Gallery', icon: 'Grid' },
      { type: 'card', label: 'Card', icon: 'CreditCard' },
      { type: 'video', label: 'Video', icon: 'Video' },
      { type: 'map', label: 'Map', icon: 'Map' },
      { type: 'review_widget', label: 'Reviews', icon: 'Star' },
      { type: 'cta_block', label: 'CTA Block', icon: 'Megaphone' }
    ];
    res.json(components);
  });

  // Simple media upload simulation
  app.post("/api/media/upload", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    
    // In a real app, use multer to handle file uploads
    // For this demo, we'll just simulate a successful upload
    const { name, type, size } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    const url = `https://picsum.photos/seed/${id}/800/600`; // Simulated URL
    
    const mediaItem = {
      id,
      url,
      name: name || "Uploaded File",
      type: type || "image",
      size: size || 0,
      createdAt: new Date().toISOString()
    };
    
    // Store in global media for now or user media
    try {
      const data = JSON.parse(fs.readFileSync(MEDIA_PATH, "utf-8"));
      data.media.push(mediaItem);
      fs.writeFileSync(MEDIA_PATH, JSON.stringify(data, null, 2));
    } catch (e) {}
    
    res.json(mediaItem);
  });

  app.get("/api/user/pages", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, userId, "pages/data.json"), "utf-8"));
    res.json(data.pages);
  });

  app.post("/api/user/pages", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const { pages } = req.body;
    fs.writeFileSync(path.join(STORAGE_PATH, userId, "pages/data.json"), JSON.stringify({ pages }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/user/blogs", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, userId, "posts/data.json"), "utf-8"));
    res.json(data.posts);
  });

  app.post("/api/user/blogs", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const { posts } = req.body;
    fs.writeFileSync(path.join(STORAGE_PATH, userId, "posts/data.json"), JSON.stringify({ posts }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/user/widgets", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, userId, "widgets/data.json"), "utf-8"));
    res.json(data.widgets);
  });

  app.post("/api/user/widgets", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const { widgets } = req.body;
    fs.writeFileSync(path.join(STORAGE_PATH, userId, "widgets/data.json"), JSON.stringify({ widgets }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/user/theme", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, userId, "theme/data.json"), "utf-8"));
    res.json(data.theme);
  });

  app.post("/api/user/theme", (req, res) => {
    const userId = getUserIdFromToken(req.headers.authorization);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    ensureUserStorage(userId);
    const { theme } = req.body;
    fs.writeFileSync(path.join(STORAGE_PATH, userId, "theme/data.json"), JSON.stringify({ theme }, null, 2));
    res.json({ success: true });
  });

  // Public User Site APIs
  app.get("/api/public/user/:username/pages", (req, res) => {
    const { username } = req.params;
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(404).json({ error: "User not found" });

    ensureUserStorage(user.id);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, user.id, "pages/data.json"), "utf-8"));
    res.json(data.pages.filter((p: any) => p.published));
  });

  app.get("/api/public/user/:username/theme", (req, res) => {
    const { username } = req.params;
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) return res.status(404).json({ error: "User not found" });

    ensureUserStorage(user.id);
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_PATH, user.id, "theme/data.json"), "utf-8"));
    res.json(data.theme);
  });

  app.get("/api/pages", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(PAGES_PATH, "utf-8"));
      res.json(data.pages);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/pages", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { pages } = req.body;
    fs.writeFileSync(PAGES_PATH, JSON.stringify({ pages }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/package-steps", (req, res) => {
    const data = JSON.parse(fs.readFileSync(PACKAGE_STEPS_PATH, "utf-8"));
    res.json(data);
  });

  app.post("/api/package-steps", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    fs.writeFileSync(PACKAGE_STEPS_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  app.get("/api/settings", (req, res) => {
    const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    res.json(data);
  });

  app.post("/api/settings", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  app.get("/sitemap.xml", (req, res) => {
    const services = JSON.parse(fs.readFileSync(SERVICES_PATH, "utf-8")).services;
    const blogs = JSON.parse(fs.readFileSync(BLOGS_PATH, "utf-8")).blogs;
    const promos = JSON.parse(fs.readFileSync(PROMOS_PATH, "utf-8")).promos;
    const packages = JSON.parse(fs.readFileSync(PACKAGES_DATA_PATH, "utf-8")).packages;
    const baseUrl = "https://ya.tsameemevents.com";

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>
  <url><loc>${baseUrl}/services</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/gallery</loc><priority>0.7</priority></url>
  <url><loc>${baseUrl}/blog</loc><priority>0.7</priority></url>
  <url><loc>${baseUrl}/contact</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/about</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/faq</loc><priority>0.7</priority></url>
  <url><loc>${baseUrl}/discounts</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/package-builder</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/packages</loc><priority>0.8</priority></url>
  <url><loc>${baseUrl}/search</loc><priority>0.6</priority></url>`;

    services.forEach((s: any) => {
      sitemap += `\n  <url><loc>${baseUrl}/services/${s.id}</loc><priority>0.9</priority></url>`;
    });

    blogs.forEach((b: any) => {
      sitemap += `\n  <url><loc>${baseUrl}/blog/${b.id}</loc><priority>0.6</priority></url>`;
    });

    promos.forEach((p: any) => {
      sitemap += `\n  <url><loc>${baseUrl}/discounts#${p.id}</loc><priority>0.6</priority></url>`;
    });

    packages.forEach((pkg: any) => {
      sitemap += `\n  <url><loc>${baseUrl}/packages#${pkg.id}</loc><priority>0.7</priority></url>`;
    });

    sitemap += "\n</urlset>";
    res.header("Content-Type", "application/xml");
    res.send(sitemap);
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send("User-agent: *\nAllow: /\nSitemap: https://ya.tsameemevents.com/sitemap.xml");
  });

  app.get("/api/services", (req, res) => {
    const data = JSON.parse(fs.readFileSync(SERVICES_PATH, "utf-8"));
    res.json(data.services);
  });

  app.post("/api/services", (req, res) => {
    // Simple Auth check (in a real app, use a proper token)
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { services } = req.body;
    fs.writeFileSync(SERVICES_PATH, JSON.stringify({ services }, null, 2));
    res.json({ success: true });
  });

  app.post("/api/report-missing-name", (req, res) => {
    const { name, email, details } = req.body;
    console.log(`Missing Name Reported: ${name} (by ${email || 'anonymous'})`);
    // In a real app, you would save this to a database or send an email
    res.json({ success: true });
  });

  app.get("/api/blogs", (req, res) => {
    const data = JSON.parse(fs.readFileSync(BLOGS_PATH, "utf-8"));
    res.json(data.blogs);
  });

  app.post("/api/bookings", async (req, res) => {
    const booking = req.body;
    const inquiryType = booking.inquiryType || (booking.isCustomForm ? 'Package Builder' : 'Event Package');
    console.log(`New ${inquiryType} Received:`, booking);

    // Load Development Settings
    let devSettings = {
      smtpHost: process.env.SMTP_HOST || "smtp.example.com",
      smtpPort: process.env.SMTP_PORT || "587",
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
      fromEmail: process.env.FROM_EMAIL || "noreply@example.com"
    };

    try {
      if (fs.existsSync(DEVELOPMENT_PATH)) {
        const fileData = JSON.parse(fs.readFileSync(DEVELOPMENT_PATH, "utf-8"));
        // Only override if value is not empty
        if (fileData.smtpHost) devSettings.smtpHost = fileData.smtpHost;
        if (fileData.smtpPort) devSettings.smtpPort = fileData.smtpPort;
        if (fileData.smtpUser) devSettings.smtpUser = fileData.smtpUser;
        if (fileData.smtpPass) devSettings.smtpPass = fileData.smtpPass;
        if (fileData.adminEmail) devSettings.adminEmail = fileData.adminEmail;
        if (fileData.fromEmail) devSettings.fromEmail = fileData.fromEmail;
      }
    } catch (e) {
      console.error("Error loading development settings:", e);
    }

    // Email Configuration
    const transporter = nodemailer.createTransport({
      host: devSettings.smtpHost,
      port: parseInt(devSettings.smtpPort),
      secure: devSettings.smtpPort === "465",
      auth: {
        user: devSettings.smtpUser,
        pass: devSettings.smtpPass,
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      },
      // Add connection timeout
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    const adminEmail = devSettings.adminEmail;
    const fromEmail = devSettings.fromEmail;

    // Respond to the client immediately
    res.json({ success: true, message: "Inquiry received. Processing notifications..." });

    // Handle email sending in the background
    (async () => {
      if (!devSettings.smtpUser || !devSettings.smtpPass) {
        console.warn("SMTP credentials missing. Skipping email notifications.");
        return;
      }

      const sendWithRetry = async (mailOptions: any, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await transporter.sendMail(mailOptions);
          } catch (error: any) {
            const isLastRetry = i === maxRetries - 1;
            const isRetryable = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ESOCKET';
            
            if (isLastRetry || !isRetryable) {
              throw error;
            }
            
            console.warn(`Email sending failed (attempt ${i + 1}/${maxRetries}), retrying in 2s...`, error.message);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      };

      try {
        const emailTemplate = (() => {
          try {
            const data = JSON.parse(fs.readFileSync(EMAIL_TEMPLATES_PATH, "utf-8"));
            return data.templates[0]; // Use first template as default for now
          } catch (e) {
            return null;
          }
        })();

        const brandColor = emailTemplate?.header.textColor || "#00C896";
        const darkBg = emailTemplate?.header.bgColor || "#0B0F14";
        const bodyBg = emailTemplate?.body.bgColor || "#FFFFFF";
        const bodyText = emailTemplate?.body.textColor || "#141414";
        const mutedText = "#9CA3AF";

        // Prepare all input values for the admin email
        const allFieldsHtml = Object.entries(booking)
          .filter(([key]) => !['inquiryType', 'pageLocation', 'geotag', 'isCustomForm'].includes(key))
          .map(([key, value]) => `
            <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.05);">
              <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 4px; font-weight: bold;">${key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span style="color: ${bodyText}; font-size: 14px; font-family: 'Inter', sans-serif;">${typeof value === 'object' ? JSON.stringify(value) : value}</span>
            </div>
          `)
          .join('');

        const emailHeader = `
          <div style="background-color: ${darkBg}; padding: 50px 20px; text-align: center; border-bottom: 2px solid ${brandColor};">
            <div style="display: inline-block; width: 60px; height: 60px; background-color: ${emailTemplate?.header.centerIcon.bgColor || brandColor}; color: ${emailTemplate?.header.centerIcon.textColor || '#141414'}; border-radius: 12px; line-height: 60px; font-size: 24px; font-weight: bold; margin-bottom: 20px;">
              ${emailTemplate?.header.centerIcon.text || 'YA'}
            </div>
            <div style="color: ${emailTemplate?.header.contactInfo.color || brandColor}; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: bold;">
              ${emailTemplate?.header.contactInfo.whatsapp ? `<span>${emailTemplate.header.contactInfo.whatsapp}</span> &nbsp; ● &nbsp; ` : ''}
              ${emailTemplate?.header.contactInfo.email ? `<span>${emailTemplate.header.contactInfo.email}</span> &nbsp; ● &nbsp; ` : ''}
              ${emailTemplate?.header.contactInfo.website ? `<span>${emailTemplate.header.contactInfo.website}</span>` : ''}
            </div>
          </div>
        `;

        const emailFooter = `
          <div style="background-color: ${emailTemplate?.footer.bgColor || darkBg}; padding: 40px 20px; text-align: center; border-top: 1px solid rgba(0,0,0,0.05); margin-top: 0;">
            <div style="margin-bottom: 20px;">
              ${(emailTemplate?.footer.links || []).map((link: any, i: number) => link.show ? `
                <a href="${link.url}" style="color: ${link.color || brandColor}; text-decoration: none; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">${link.label}</a>
                ${i < (emailTemplate?.footer.links.length - 1) ? '<span style="color: rgba(0,0,0,0.1); margin: 0 10px;">●</span>' : ''}
              ` : '').join('')}
            </div>
            <p style="color: ${emailTemplate?.footer.platformName.color || brandColor}; font-size: 18px; font-weight: bold; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 2px;">${emailTemplate?.footer.platformName.text || 'YA WEDDING'}</p>
            <p style="color: ${emailTemplate?.footer.shortDescription.color || mutedText}; font-size: 11px; margin-bottom: 20px; font-family: 'Inter', sans-serif; max-width: 300px; margin-left: auto; margin-right: auto;">${emailTemplate?.footer.shortDescription.text || 'Luxury Event Planning & Design'}</p>
            <p style="color: ${emailTemplate?.footer.copyright.color || emailTemplate?.footer.textColor || mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.5;">${emailTemplate?.footer.copyright.text || '&copy; 2026 YA Wedding Dubai. All rights reserved.'}</p>
          </div>
        `;

        const commonStyles = `
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Germania+One&display=swap" rel="stylesheet">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Germania+One&display=swap');
            body { font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: ${darkBg}; color: ${bodyText}; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
            .container { max-width: 600px; margin: 0 auto; background-color: ${bodyBg}; }
            .content { padding: 50px 40px; position: relative; overflow: hidden; }
            .overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: ${emailTemplate?.body.overlayIcon.opacity || 0.05}; font-size: 300px; color: ${emailTemplate?.body.overlayIcon.color || bodyText}; pointer-events: none; z-index: 0; }
            .card { background-color: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05); border-radius: 24px; padding: 30px; margin-bottom: 30px; position: relative; z-index: 1; }
            h2, h3 { font-family: 'Inter', Helvetica, Arial, sans-serif; font-weight: 700; }
            .btn { display: inline-block; background-color: ${brandColor}; color: ${emailTemplate?.header.bgColor || '#141414'}; padding: 16px 35px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 10px; }
          </style>
        `;

        // 1. Send Email to Admin
        await sendWithRetry({
          from: `"YA Wedding Admin" <${fromEmail}>`,
          to: adminEmail,
          subject: `[${inquiryType}] New Submission: ${booking.name || "Unknown"}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>${commonStyles}</head>
            <body>
              <div class="container">
                ${emailHeader}
                <div class="content">
                  ${emailTemplate?.body.overlayIcon.show ? `<div class="overlay">✉</div>` : ''}
                  <div style="position: relative; z-index: 1; text-align: center;">
                    <h2 style="color: ${bodyText}; font-size: 32px; margin-bottom: 10px;">
                      <span style="font-weight: 300;">${emailTemplate?.body.title.part1 || 'New'}</span>
                      <span style="display: block; font-weight: 900; font-size: 48px; color: ${emailTemplate?.body.title.color || brandColor};">${emailTemplate?.body.title.part2 || 'Submission'}</span>
                    </h2>
                    <p style="color: ${emailTemplate?.body.subheading.color || mutedText}; font-size: 14px; margin-bottom: 30px; font-style: italic;">${emailTemplate?.body.subheading.text || `New ${inquiryType} received.`}</p>
                    
                    <div style="margin-bottom: 30px;">
                      ${(emailTemplate?.cta.buttons || []).map((btn: any) => btn.show ? `
                        <a href="${btn.url}" class="btn" style="background-color: ${btn.bgColor || brandColor}; color: ${btn.textColor || '#141414'};">${btn.text}</a>
                      ` : '').join('')}
                    </div>
                  </div>

                  <div class="card">
                    <h3 style="color: ${brandColor}; font-size: 18px; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">Submission Details</h3>
                    ${allFieldsHtml}
                  </div>

                  <div class="card" style="background-color: rgba(0,200,150,0.05); border-color: ${brandColor}33;">
                    <h3 style="color: ${brandColor}; font-size: 16px; margin-top: 0; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px;">Tracking Metadata</h3>
                    <div style="margin-bottom: 10px;">
                      <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; display: block;">Page Location</span>
                      <a href="${booking.pageLocation || '#'}" style="color: ${brandColor}; font-size: 13px; text-decoration: none;">${booking.pageLocation || 'N/A'}</a>
                    </div>
                    <div>
                      <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; display: block;">Customer Geotag</span>
                      <span style="color: ${bodyText}; font-size: 13px;">${booking.geotag || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
                ${emailFooter}
              </div>
            </body>
            </html>
          `,
        });

        // 2. Send Confirmation Email to Client
        if (booking.email) {
          await sendWithRetry({
            from: `"YA Wedding" <${fromEmail}>`,
            to: booking.email,
            subject: `We've Received Your ${inquiryType} - YA Wedding`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>${commonStyles}</head>
              <body>
                <div class="container">
                  ${emailHeader}
                  <div class="content" style="text-align: center;">
                    <h2 style="color: ${bodyText}; font-size: 36px; margin-bottom: 15px;">
                      <span style="font-weight: 300;">Thank You,</span>
                      <span style="display: block; font-weight: 900; font-size: 48px; color: ${emailTemplate?.body.title.color || brandColor};">${booking.name}!</span>
                    </h2>
                    <p style="color: ${emailTemplate?.body.subheading.color || mutedText}; font-size: 16px; line-height: 1.6; margin-bottom: 40px;">
                      Your inquiry regarding <strong>${inquiryType}</strong> has been received. Our luxury event specialists are already reviewing your details.
                    </p>
                    
                    <div class="card" style="text-align: left;">
                      <h3 style="color: ${brandColor}; font-size: 18px; margin-top: 0; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">Your Details</h3>
                      <div style="margin-bottom: 15px;">
                        <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Event Date</span>
                        <span style="color: ${bodyText}; font-size: 15px; font-weight: bold;">${booking.date || 'To be confirmed'}</span>
                      </div>
                      <div style="margin-bottom: 15px;">
                        <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Location</span>
                        <span style="color: ${bodyText}; font-size: 15px; font-weight: bold;">${booking.location || 'To be confirmed'}</span>
                      </div>
                      ${booking.finalPrice ? `
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.05);">
                          <span style="color: ${mutedText}; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">Estimated Investment</span>
                          <span style="color: ${brandColor}; font-size: 24px; font-weight: bold;">AED ${booking.finalPrice.toLocaleString()}</span>
                        </div>
                      ` : ''}
                    </div>

                    <div style="margin-top: 40px;">
                      <p style="color: ${bodyText}; font-weight: bold; margin-bottom: 10px;">What's Next?</p>
                      <p style="color: ${mutedText}; font-size: 14px; line-height: 1.6; margin-bottom: 30px;">
                        One of our senior planners will reach out to you within 24 hours for a personalized consultation.
                      </p>
                      ${(emailTemplate?.cta.buttons || []).map((btn: any) => btn.show ? `
                        <a href="${btn.url}" class="btn" style="background-color: ${btn.bgColor || brandColor}; color: ${btn.textColor || '#141414'};">${btn.text}</a>
                      ` : '').join('')}
                    </div>
                  </div>
                  ${emailFooter}
                </div>
              </body>
              </html>
            `,
          });
        }
        console.log(`Notification emails for ${inquiryType} sent successfully.`);
      } catch (error) {
        console.error("Error sending emails in background:", error);
      }
    })();
  });

  app.post("/api/blogs", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { blogs } = req.body;
    fs.writeFileSync(BLOGS_PATH, JSON.stringify({ blogs }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/promos", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(PROMOS_PATH, "utf-8"));
      res.json(data.promos);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/promos", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { promos } = req.body;
    fs.writeFileSync(PROMOS_PATH, JSON.stringify({ promos }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/media", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(MEDIA_PATH, "utf-8"));
      res.json(data);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/media", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    fs.writeFileSync(MEDIA_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  app.get("/api/booking-forms", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(BOOKING_FORMS_PATH, "utf-8"));
      res.json(data.forms);
    } catch (e) {
      res.json([]);
    }
  });

  app.get("/api/packages", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(PACKAGES_DATA_PATH, "utf-8"));
      res.json(data.packages);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/booking-forms", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { forms } = req.body;
    fs.writeFileSync(BOOKING_FORMS_PATH, JSON.stringify({ forms }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/ratings", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(RATINGS_PATH, "utf-8"));
      if (req.headers.authorization === "Bearer ya-admin-secret") {
        res.json(data.ratings);
      } else {
        res.json(data.ratings.filter((r: any) => r.status === 'approved'));
      }
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/ratings", (req, res) => {
    const rating = {
      id: Math.random().toString(36).substr(2, 9),
      ...req.body,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    const data = JSON.parse(fs.readFileSync(RATINGS_PATH, "utf-8"));
    data.ratings.push(rating);
    fs.writeFileSync(RATINGS_PATH, JSON.stringify(data, null, 2));
    
    res.json({ success: true, message: "Rating submitted for approval." });
  });

  app.post("/api/admin/ratings", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { ratings } = req.body;
    fs.writeFileSync(RATINGS_PATH, JSON.stringify({ ratings }, null, 2));
    res.json({ success: true });
  });

  app.get("/api/partnerships", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const data = JSON.parse(fs.readFileSync(PARTNERSHIPS_PATH, "utf-8"));
      res.json(data.applications);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/partnerships", (req, res) => {
    try {
      const application = {
        id: Math.random().toString(36).substr(2, 9),
        ...req.body,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      const data = JSON.parse(fs.readFileSync(PARTNERSHIPS_PATH, "utf-8"));
      data.applications.push(application);
      fs.writeFileSync(PARTNERSHIPS_PATH, JSON.stringify(data, null, 2));
      res.json({ success: true, message: "Application submitted successfully." });
    } catch (e) {
      res.status(500).json({ error: "Failed to submit application" });
    }
  });

  app.delete("/api/partnerships/:id", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const { id } = req.params;
      const data = JSON.parse(fs.readFileSync(PARTNERSHIPS_PATH, "utf-8"));
      data.applications = data.applications.filter((a: any) => a.id !== id);
      fs.writeFileSync(PARTNERSHIPS_PATH, JSON.stringify(data, null, 2));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete application" });
    }
  });

  app.get("/api/development", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      if (fs.existsSync(DEVELOPMENT_PATH)) {
        const data = JSON.parse(fs.readFileSync(DEVELOPMENT_PATH, "utf-8"));
        res.json(data);
      } else {
        res.json({});
      }
    } catch (e) {
      res.json({});
    }
  });

  app.post("/api/development", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    fs.writeFileSync(DEVELOPMENT_PATH, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  // Widget Pro API
  app.get("/api/widget-pro", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(WIDGET_PRO_PATH, "utf-8"));
      res.json(data.items);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/widget-pro", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { items } = req.body;
    fs.writeFileSync(WIDGET_PRO_PATH, JSON.stringify({ items }, null, 2));
    res.json({ success: true });
  });

  // Containers API
  app.get("/api/containers", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(CONTAINERS_PATH, "utf-8"));
      res.json(data.containers);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/containers", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { containers } = req.body;
    fs.writeFileSync(CONTAINERS_PATH, JSON.stringify({ containers }, null, 2));
    res.json({ success: true });
  });

  // Standard Widgets API
  app.get("/api/standard-widgets", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(STANDARD_WIDGETS_PATH, "utf-8"));
      res.json(data.widgets);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/standard-widgets", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { widgets } = req.body;
    fs.writeFileSync(STANDARD_WIDGETS_PATH, JSON.stringify({ widgets }, null, 2));
    res.json({ success: true });
  });

  // Email Templates API
  app.get("/api/email-templates", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(EMAIL_TEMPLATES_PATH, "utf-8"));
      res.json(data.templates);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/email-templates", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { templates } = req.body;
    fs.writeFileSync(EMAIL_TEMPLATES_PATH, JSON.stringify({ templates }, null, 2));
    res.json({ success: true });
  });

  // PDF Templates API
  app.get("/api/pdf-templates", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(PDF_TEMPLATES_PATH, "utf-8"));
      res.json(data.templates);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/pdf-templates", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { templates } = req.body;
    fs.writeFileSync(PDF_TEMPLATES_PATH, JSON.stringify({ templates }, null, 2));
    res.json({ success: true });
  });

  // Redirections API
  app.get("/api/redirections", (req, res) => {
    try {
      const data = JSON.parse(fs.readFileSync(REDIRECTIONS_PATH, "utf-8"));
      res.json(data.redirections);
    } catch (e) {
      res.json([]);
    }
  });

  app.post("/api/redirections", (req, res) => {
    if (req.headers.authorization !== "Bearer ya-admin-secret") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { redirections } = req.body;
    fs.writeFileSync(REDIRECTIONS_PATH, JSON.stringify({ redirections }, null, 2));
    res.json({ success: true });
  });

  const injectSEO = (html: string, url: string) => {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      let title = settings.siteName || "YA Wedding";
      let description = settings.siteDescription || "Luxury Wedding Planner Dubai";
      let image = settings.siteLogo || "https://tsameemevents.com/wp-content/uploads/luxury-outdoor-wedding-reception-sunset-lakeview.webp";

      if (url.startsWith('/services/')) {
        const id = url.split('/')[2];
        const services = JSON.parse(fs.readFileSync(SERVICES_PATH, "utf-8")).services;
        const service = services.find((s: any) => s.id === id);
        if (service) {
          title = `${service.name} | ${settings.siteName}`;
          description = service.seoDescription || service.description;
          image = service.image || image;
        }
      } else if (url.startsWith('/blog/')) {
        const id = url.split('/')[2];
        const blogs = JSON.parse(fs.readFileSync(BLOGS_PATH, "utf-8")).blogs;
        const blog = blogs.find((b: any) => b.id === id);
        if (blog) {
          title = `${blog.title} | ${settings.siteName}`;
          description = blog.excerpt;
          image = blog.image || image;
        }
      } else {
        const slug = url === '/' ? 'home' : url.split('/')[1];
        const pages = JSON.parse(fs.readFileSync(PAGES_PATH, "utf-8"))?.pages || [];
        const page = pages.find((p: any) => p.slug === slug);
        if (page) {
          title = `${page.title} | ${settings.siteName}`;
          description = page.description || description;
        }
      }

      const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
      `;

      let newHtml = html.replace(/<title>.*?<\/title>/, '');
      newHtml = newHtml.replace(/<meta name="description".*?>/, '');
      return newHtml.replace('</head>', `${metaTags}</head>`);
    } catch (e) {
      console.error("SEO Injection Error:", e);
      return html;
    }
  };

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.path;
      if (url.startsWith('/api/') || url.includes('.')) {
        return next();
      }

      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        template = injectSEO(template, url);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, "dist"), { index: false }));
    app.use("*", (req, res, next) => {
      const url = req.path;
      if (url.startsWith('/api/') || url.includes('.')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.join(__dirname, "dist/index.html"), "utf-8");
        template = injectSEO(template, url);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        res.sendFile(path.join(__dirname, "dist/index.html"));
      }
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      clients.set(userId, ws);
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          // Handle signaling
          if (['offer', 'answer', 'ice-candidate'].includes(data.type)) {
            const targetWs = clients.get(data.targetUserId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: data.type,
                payload: data.payload,
                fromUserId: userId
              }));
            }
          }
        } catch (e) {
          console.error('WebSocket message error:', e);
        }
      });

      ws.on('close', () => {
        clients.delete(userId);
      });
    }
  });
}

startServer();
