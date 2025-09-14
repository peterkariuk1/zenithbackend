import express from "express";
import axios from "axios";
import https from "https";
import dns from "dns";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://zenithfrontend.vercel.app", credentials: true }));

// -------------------- DNS + FUSION CONFIG --------------------
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const FUSION_HOST = "intl.fusionsolar.huawei.com";
const FUSION_URL = `https://${FUSION_HOST}/thirdData`;
const FUSION_IP = "119.8.160.213"; // 👉 replace with current IP

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

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
    headers["xsrf-token"] = session.xsrf; // 👈 lowercase
  }

  try {
    return await fusionAxios.post(
      `${FUSION_URL}${path}`,
      JSON.stringify(data), // 👈 always stringify
      { headers }
    );
  } catch (err) {
    if (err.code === "ENOTFOUND") {
      console.warn("⚠️ DNS failed, retrying with fallback IP...");
      return await fusionAxios.post(
        `https://${FUSION_IP}/thirdData${path}`,
        JSON.stringify(data),
        { headers }
      );
    }
    throw err;
  }
}

// -------------------- SESSION STORE --------------------
let sessions = {};

// -------------------- ROUTES --------------------

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const response = await fusionPost(
      "/login",
      { userName: username, systemCode: password }
    );

    const cookies = response.headers["set-cookie"];
    const xsrfToken = response.headers["xsrf-token"];

    if (!cookies || !xsrfToken) {
      return res.status(401).json({ success: false, error: "No session cookies returned" });
    }

    sessions[username] = { cookies, xsrf: xsrfToken };
    res.json({ success: true, token: xsrfToken });
  } catch (err) {
    console.error("Fusion login error:", err.response?.data || err.message);
    res.status(401).json({ success: false, error: "Login failed" });
  }
});

// Plant list
app.get("/plants/:username", async (req, res) => {
  const session = sessions[req.params.username];
  if (!session) return res.status(401).json({ error: "Not logged in" });

  try {
    const response = await fusionPost("/getStationList", { pageNo: 1, pageSize: 50 }, session);
    res.json(response.data);
  } catch (err) {
    console.error("Error fetching plants:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch plants" });
  }
});

// Plant real-time KPI
app.get("/plant-data/:username/:stationCodes", async (req, res) => {
  const session = sessions[req.params.username];
  if (!session) return res.status(401).json({ error: "Not logged in" });

  try {
    const response = await fusionPost(
      "/getStationRealKpi",
      { stationCodes: req.params.stationCodes },
      session
    );
    res.json(response.data);
    console.log("Plant Data:", response.data);
  } catch (err) {
    console.error("Error fetching plant data:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch plant data" });
  }
});

// -------------------- DEPLOY --------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
