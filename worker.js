/**
 * Cloudflare Worker
 * Routes For Future LLM implamentation:
 *   GET  /              → HTML form
 *   POST /submit        → save response to KV
 *   GET  /response.json → download the full JSON log
 *  - Mac
 */

const SUBJECTS = ["Math", "ELA", "Science", "Social Studies"];

// ─── HTML Form ────────────────────────────────────────────────────────────────

function renderForm(message = "") {
  const optionTags = SUBJECTS.map(
    (s) => `<option value="${s}">${s}</option>`
  ).join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Student Help Form</title>
</head>
<body>
  <h1>Student Help Request</h1>

  ${message ? `<p><strong>${message}</strong></p>` : ""}

  <form method="POST" action="/submit">
    <label for="subject">Subject you are struggling with:</label><br />
    <select id="subject" name="subject" required>
      <option value="" disabled selected>-- Select a subject --</option>
      ${optionTags}
    </select>
    <br /><br />

    <label for="email">School email address:</label><br />
    <input
      type="email"
      id="email"
      name="email"
      placeholder="you@school.edu"
      required
    /><br /><br />

    <label for="issue">Topic and challenges you are facing:</label><br />
    <textarea
      id="issue"
      name="issue"
      rows="6"
      cols="50"
      placeholder="Describe the topic and what you are finding difficult..."
      required
    ></textarea>
    <br /><br />

    <button type="submit">Submit</button>
  </form>

  <br />
  <a href="/response.json">View / Download response.json</a>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the local-part of an email (everything before the @). */
function extractName(email) {
  return email.split("@")[0];
}

/** Load the current log object from KV, defaulting to empty subject arrays. */
async function loadLog(kv) {
  const raw = await kv.get("responses");
  if (raw) return JSON.parse(raw);

  return {
    Math: [],
    ELA: [],
    Science: [],
    "Social Studies": [],
  };
}

/** Save the log object back to KV. */
async function saveLog(kv, log) {
  await kv.put("responses", JSON.stringify(log, null, 2));
}

// ─── Request Router ───────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {

    // ── Guard: KV binding must exist ─────────────────────────────────────────
    if (!env.RESPONSES) {
      return new Response(
        [
          'Configuration error: KV namespace binding "RESPONSES" is not set.',
          "",
          "Add the following to your wrangler.toml and redeploy:",
          "",
          "  [[kv_namespaces]]",
          '  binding = "RESPONSES"',
          '  id      = "<your-kv-namespace-id>"',
          "",
          "Create the namespace first with:",
          "  npx wrangler kv:namespace create RESPONSES",
        ].join("\n"),
        {
          status: 500,
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
        }
      );
    }

    const url = new URL(request.url);
    const { pathname } = url;

    // ── GET / → serve the form ───────────────────────────────────────────────
    if (request.method === "GET" && pathname === "/") {
      return new Response(renderForm(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ── POST /submit → validate & log the response ───────────────────────────
    if (request.method === "POST" && pathname === "/submit") {
      let formData;
      try {
        formData = await request.formData();
      } catch {
        return new Response("Bad request: could not parse form data.", {
          status: 400,
        });
      }

      const subject = (formData.get("subject") || "").trim();
      const email   = (formData.get("email")   || "").trim().toLowerCase();
      const issue   = (formData.get("issue")    || "").trim();

      if (!subject || !email || !issue) {
        return new Response(
          renderForm("All fields are required. Please fill in every field."),
          { status: 400, headers: { "Content-Type": "text/html;charset=UTF-8" } }
        );
      }

      if (!SUBJECTS.includes(subject)) {
        return new Response(
          renderForm("Invalid subject selected."),
          { status: 400, headers: { "Content-Type": "text/html;charset=UTF-8" } }
        );
      }

      const entry = {
        email,
        nameExtracted: extractName(email),
        issueLogged: issue,
      };

      const log = await loadLog(env.RESPONSES);
      log[subject].push(entry);
      await saveLog(env.RESPONSES, log);

      return new Response(
        renderForm(`Response logged under "${subject}". Thank you!`),
        { headers: { "Content-Type": "text/html;charset=UTF-8" } }
      );
    }

    // ── GET /response.json → download the full log ───────────────────────────
    if (request.method === "GET" && pathname === "/response.json") {
      const log = await loadLog(env.RESPONSES);
      return new Response(JSON.stringify(log, null, 2), {
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "Content-Disposition": 'attachment; filename="response.json"',
        },
      });
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    return new Response("Not found.", { status: 404 });
  },
};
