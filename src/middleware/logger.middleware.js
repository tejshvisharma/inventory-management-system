// ── ANSI color codes ──────────────────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  blue: "\x1b[34m",
};

// ── Method colors ─────────────────────────────────────────────────────────────
const METHOD_COLOR = {
  GET: COLORS.cyan,
  POST: COLORS.green,
  PATCH: COLORS.yellow,
  PUT: COLORS.yellow,
  DELETE: COLORS.red,
};

// ── Status code → color ───────────────────────────────────────────────────────
function getStatusColor(status) {
  if (status >= 500) return COLORS.red;
  if (status >= 400) return COLORS.red;
  if (status >= 300) return COLORS.yellow;
  if (status >= 200) return COLORS.green;
  return COLORS.white;
}

// ── Shorten MongoDB ObjectIds in URL ──────────────────────────────────────────
// /subtasks/697bc142.../tasks/69b1a47e... → /subtasks/:id/tasks/:id
function shortenIds(url) {
  return url
    .replace(/\/[a-f0-9]{24}/gi, "/:id") // MongoDB ObjectId (24 hex chars)
    .replace(/\/[a-f0-9-]{36}/gi, "/:id"); // UUID (36 chars with dashes)
}

// ── HH:MM:SS only ─────────────────────────────────────────────────────────────
function formatTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ── The middleware ─────────────────────────────────────────────────────────────
export default function devLogger(req, res, next) {
  // Skip entirely in production
  if (process.env.NODE_ENV === "production") return next();

  // Skip OPTIONS preflight — pure noise
  if (req.method === "OPTIONS") return next();

  const start = Date.now();
  const time = formatTime();
  const path = shortenIds(req.url);
  const methodColor = METHOD_COLOR[req.method] ?? COLORS.white;

  // Log AFTER response is sent so we capture real status + duration
  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusColor = getStatusColor(res.statusCode);

    // Color the duration based on how slow it is
    let durationStr;
    if (duration > 1000) {
      durationStr = `${COLORS.red}${duration}ms${COLORS.reset}`; // slow
    } else if (duration > 300) {
      durationStr = `${COLORS.yellow}${duration}ms${COLORS.reset}`; // medium
    } else {
      durationStr = `${COLORS.dim}${duration}ms${COLORS.reset}`; // fast
    }

    console.log(
      `${COLORS.dim}${time}${COLORS.reset}  ` +
        `${methodColor}${req.method.padEnd(6)}${COLORS.reset}` +
        `${statusColor}${res.statusCode}${COLORS.reset}  ` +
        `${COLORS.white}${path}${COLORS.reset}  ` +
        durationStr,
    );
  });

  next();
}
