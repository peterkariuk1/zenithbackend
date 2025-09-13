import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({ origin: "https://zenithfrontend.vercel.app" }));


const FUSION_URL = "https://intl.fusionsolar.huawei.com/thirdData";

let sessions = {};

app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const response = await axios.post(
            `${FUSION_URL}/login`,
            {
                userName: username,
                systemCode: password,
            },
            {
                headers: { "Content-Type": "application/json" },
            }
        );

        // ✅ Grab set-cookie and xsrf-token from headers
        const cookies = response.headers["set-cookie"];
        const xsrfToken = response.headers["xsrf-token"];

        if (!cookies || !xsrfToken) {
            return res
                .status(401)
                .json({ success: false, error: "No session cookies returned" });
        }

        // Save cookies + xsrf-token in memory
        sessions[username] = {
            cookies,
            xsrf: xsrfToken,
        };

        // ✅ Send token back to frontend
        const data = res.json({ success: true, token: xsrfToken });
        console.log("Login response:", data);
    } catch (err) {
        console.error("Fusion login error:", err.response?.data || err.message);
        res.status(401).json({ success: false, error: "Login failed" });
    }
});




app.get("/plants/:username", async (req, res) => {
    const session = sessions[req.params.username];
    if (!session) return res.status(401).json({ error: "Not logged in" });

    try {
        const response = await axios.post(
            `${FUSION_URL}/getStationList`,
            { pageNo: 1, pageSize: 50 },
            {
                headers: {
                    "Content-Type": "application/json",
                    Cookie: session.cookies.join("; "),
                    "XSRF-TOKEN": session.xsrf,
                },
            }
        );

        res.json(response.data);
    } catch (err) {
        console.error("Error fetching plants:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to fetch plants" });
    }
});

// fetch realtime KPI for plants
// fetch realtime KPI for one or more plants
app.get("/plant-data/:username/:stationCodes", async (req, res) => {
    const session = sessions[req.params.username];
    if (!session) return res.status(401).json({ error: "Not logged in" });

    try {
        const response = await axios.post(
            `${FUSION_URL}/getStationRealKpi`,
            { stationCodes: req.params.stationCodes }, // e.g. "NE=51186913,NE=511907913"
            {
                headers: {
                    "Content-Type": "application/json",
                    Cookie: session.cookies.join("; "),
                    "XSRF-TOKEN": session.xsrf,
                },
            }
        );

        res.json(response.data);
        console.log(response.data);

    } catch (err) {
        console.error("Error fetching plant data:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to fetch plant data" });
    }
});






const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
