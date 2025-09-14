import express from "express";
import axios from "axios";
import https from "https";
import dns from "dns";
import cors from "cors";
import { lookup } from "dns/promises"; // 👈 async DNS resolution

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://zenithfrontend.vercel.app", credentials: true }));

// -------------------- DNS + FUSION CONFIG ----------------
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const FUSION_HOST = "intl.fusionsolar.huawei.com";
const FALLBACK_IP = "119.8.160.213"; // 👈 replace if Huawei rotates

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  servername: FUSION_HOST, // 👈 ensure SNI matches cert
});

const fusionAxios = axios.create({
  httpsAgent,
  timeout: 10000,
  withCredentials: true,
});

// -------------------- UNIVERSAL POST WRAPPER --------------------
async function fusionPost(path, data = {}, session = null) {
  const headers = {
    "Content-Type": "application/json",
    Host: FUSION_HOST,
  };

  if (session) {
    headers.Cookie = session.cookies.join("; ");
    headers["xsrf-token"] = session.xsrf;
  }

  // Step 1: Try to resolve DNS
  let targetIP;
  try {
    const resolved = await lookup(FUSION_HOST);
    targetIP = resolved.address;
    console.log(`🌐 DNS resolved ${FUSION_HOST} → ${targetIP}`);
  } catch (dnsErr) {
    console.warn(`⚠️ DNS resolution failed for ${FUSION_HOST}, using fallback ${FALLBACK_IP}`);
    targetIP = FALLBACK_IP;
  }

  const url = `https://${targetIP}/thirdData${path}`;

  console.log("➡️ Fusion POST", {
    url,
    headers,
    data,
    sessionActive: !!session,
  });

  try {
    const res = await fusionAxios.post(url, JSON.stringify(data), { headers });
    console.log(`✅ Fusion POST success [${path}]`, {
      status: res.status,
      keys: Object.keys(res.data || {}),
    });
    return res;
  } catch (err) {
    console.error(`❌ Fusion POST failed [${path}]`, {
      message: err.message,
      code: err.code,
      response: err.response?.data,
      status: err.response?.status,
    });
    throw err;
  }
}

// -------------------- SESSION STORE --------------------
let sessions = {};

// -------------------- ROUTES --------------------

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log(`🔑 Login attempt for user: ${username}`);
  try {
    const response = await fusionPost("/login", { userName: username, systemCode: password });

    const cookies = response.headers["set-cookie"];
    const xsrfToken = response.headers["xsrf-token"];

    console.log("🔐 Login response headers:", {
      cookies: cookies?.length,
      xsrfToken: xsrfToken ? "present" : "missing",
    });

    if (!cookies || !xsrfToken) {
      return res.status(401).json({ success: false, error: "No session cookies returned" });
    }

    sessions[username] = { cookies, xsrf: xsrfToken };
    res.json({ success: true, token: xsrfToken });
  } catch (err) {
    console.error("❌ Fusion login error:", err.response?.data || err.message);
    res.status(401).json({ success: false, error: "Login failed" });
  }
});

// Plant list
app.get("/plants/:username", async (req, res) => {
  const session = sessions[req.params.username];
  if (!session) return res.status(401).json({ error: "Not logged in" });

  console.log(`🌱 Fetching plants for ${req.params.username}`);
  try {
    const response = await fusionPost("/getStationList", { pageNo: 1, pageSize: 50 }, session);
    res.json(response.data);
  } catch (err) {
    console.error("❌ Error fetching plants:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch plants" });
  }
});

// Plant real-time KPI
app.get("/plant-data/:username/:stationCodes", async (req, res) => {
  const session = sessions[req.params.username];
  if (!session) return res.status(401).json({ error: "Not logged in" });

  console.log(`📊 Fetching plant data for ${req.params.stationCodes}`);
  try {
    const response = await fusionPost(
      "/getStationRealKpi",
      { stationCodes: req.params.stationCodes },
      session
    );
    res.json(response.data);
  } catch (err) {
    console.error("❌ Error fetching plant data:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch plant data" });
  }
});

// -------------------- DEPLOY --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
