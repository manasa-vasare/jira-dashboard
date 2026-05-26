const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const auth = Buffer.from(
  `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`
).toString("base64");

app.get("/tasks", async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/3/issue`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );

    res.json(response.data.issues);
  } catch (error) {
    console.log(error.response?.data || error.message);
    res.status(500).send("Error fetching Jira tasks");
  }
});

// Get currently authenticated Jira user profile details
app.get("/myself", async (req, res) => {
  try {
    const response = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/api/2/myself`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Myself Fetch Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch myself info", details: error.response?.data || error.message });
  }
});

// Create new issue in Jira project dynamically resolved from active board issues
app.post("/tasks", async (req, res) => {
  const { summary, description, statusName, priorityName, assigneeId, reporterId, dueDate, issueTypeName } = req.body;
  try {
    // 1. Fetch active issues to extract project key automatically
    const boardIssuesRes = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/3/issue`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    );
    const issues = boardIssuesRes.data.issues;
    if (!issues || issues.length === 0) {
      return res.status(400).json({ error: "Cannot determine project key because active board issues list is empty." });
    }
    const projectKey = issues[0].fields.project.key;

    // 2. Construct the issue fields payload
    const fields = {
      project: { key: projectKey },
      summary: summary,
      issuetype: { name: issueTypeName || "Task" }
    };

    if (description !== undefined) fields.description = description;
    if (dueDate) fields.duedate = dueDate;
    if (priorityName) fields.priority = { name: priorityName };
    if (assigneeId) fields.assignee = { accountId: assigneeId };
    if (reporterId) fields.reporter = { accountId: reporterId };

    // 3. Post to Jira Create Issue endpoint
    const createRes = await axios.post(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue`,
      { fields },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    const newIssueKey = createRes.data.key;
    const newIssueId = createRes.data.id;

    // 4. Transition the issue if it is created in a column other than Backlog
    if (statusName && statusName !== "Backlog") {
      try {
        const transitionsRes = await axios.get(
          `${process.env.JIRA_DOMAIN}/rest/api/3/issue/${newIssueKey}/transitions`,
          {
            headers: {
              Authorization: `Basic ${auth}`,
              Accept: "application/json",
            }
          }
        );
        const transitions = transitionsRes.data.transitions;
        const transition = transitions.find(t => 
          t.name.toLowerCase() === statusName.toLowerCase() ||
          t.to.name.toLowerCase() === statusName.toLowerCase()
        );
        if (transition) {
          await axios.post(
            `${process.env.JIRA_DOMAIN}/rest/api/3/issue/${newIssueKey}/transitions`,
            { transition: { id: transition.id } },
            {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
                "Content-Type": "application/json"
              }
            }
          );
        }
      } catch (transitionErr) {
        console.error("Transition error during creation:", transitionErr.message);
      }
    }

    // 5. Check if the board has an active sprint, and if so, associate the new issue to it immediately
    try {
      const sprintsRes = await axios.get(
        `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/3/sprint?state=active`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          }
        }
      );
      const activeSprints = sprintsRes.data.values;
      if (activeSprints && activeSprints.length > 0) {
        const activeSprintId = activeSprints[0].id;
        await axios.post(
          `${process.env.JIRA_DOMAIN}/rest/agile/1.0/sprint/${activeSprintId}/issue`,
          { issues: [newIssueKey] },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              Accept: "application/json",
              "Content-Type": "application/json"
            }
          }
        );
        console.log(`Associated new issue ${newIssueKey} to active sprint ID ${activeSprintId}`);
      }
    } catch (sprintErr) {
      console.warn("Sprint association warning:", sprintErr.response?.data || sprintErr.message);
    }

    res.json({ success: true, key: newIssueKey, id: newIssueId });
  } catch (error) {
    console.error("Create Issue Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create issue in Jira", details: error.response?.data || error.message });
  }
});

// Update fields of an issue in Jira
app.put("/tasks/:key", async (req, res) => {
  const { key } = req.params;
  const { summary, description, dueDate, assignee, reporter, priority } = req.body;

  const fields = {};
  if (summary !== undefined) fields.summary = summary;
  if (description !== undefined) fields.description = description;
  if (dueDate !== undefined) fields.duedate = dueDate === "" ? null : dueDate;
  if (priority !== undefined) fields.priority = priority ? { name: priority } : null;
  if (assignee !== undefined) fields.assignee = assignee ? { accountId: assignee } : null;
  if (reporter !== undefined) fields.reporter = reporter ? { accountId: reporter } : null;

  try {
    await axios.put(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}`,
      { fields },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, message: `Updated issue ${key} successfully` });
  } catch (error) {
    console.error("Update Issue Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update issue in Jira", details: error.response?.data || error.message });
  }
});

// Transition an issue status in Jira
app.post("/tasks/:key/transition", async (req, res) => {
  const { key } = req.params;
  const { statusName } = req.body;

  try {
    // 1. Retrieve the list of available transitions for the issue
    const transitionsRes = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/api/3/issue/${key}/transitions`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        }
      }
    );
    const transitions = transitionsRes.data.transitions;

    // 2. Match the transition destination status name
    const transition = transitions.find(t => 
      t.name.toLowerCase() === statusName.toLowerCase() ||
      t.to.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!transition) {
      return res.status(400).json({ error: `No active transition workflow path found to status: ${statusName}` });
    }

    // 3. Post transition execution
    await axios.post(
      `${process.env.JIRA_DOMAIN}/rest/api/3/issue/${key}/transitions`,
      { transition: { id: transition.id } },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    res.json({ success: true, message: `Transitioned issue ${key} to ${statusName} successfully.` });
  } catch (error) {
    console.error("Transition Issue Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to transition issue status in Jira", details: error.response?.data || error.message });
  }
});

// Delete an issue from Jira
app.delete("/tasks/:key", async (req, res) => {
  const { key } = req.params;
  try {
    await axios.delete(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        }
      }
    );
    res.json({ success: true, message: `Deleted issue ${key} from Jira successfully.` });
  } catch (error) {
    console.error("Delete Issue Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to delete issue in Jira", details: error.response?.data || error.message });
  }
});

const nodemailer = require("nodemailer");

// SMTP Email Gateway for Task Reminders (Real & Simulated Fallback)
app.post("/tasks/send-reminder", async (req, res) => {
  const { recipient, subject, taskKey, taskSummary, dueDate, message } = req.body;

  if (!recipient || !subject || !message) {
    return res.status(400).json({ success: false, error: "Missing required email headers or body." });
  }

  // Check if real SMTP config exists in the backend .env
  const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  try {
    let transporter;
    let info;
    let isTestAccount = false;

    if (hasSmtpConfig) {
      // Use real user-configured SMTP
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Create a temporary Ethereal test account on the fly
      isTestAccount = true;
      const testAccount = await nodemailer.createTestAccount();
      
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    // Build premium styled HTML notification email template
    const htmlTemplate = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #07090e; padding: 40px; color: #f3f4f6; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background: rgba(17, 24, 39, 0.9); border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
          <!-- Logo Header -->
          <div style="background: linear-gradient(135deg, #6366f1, #a855f7); padding: 30px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -1px; color: white;">ApniLeap JiraPro</h1>
            <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #e0e7ff;">⚠️ Urgent Sprint Deadline Alert</p>
          </div>
          <!-- Body Panel -->
          <div style="padding: 40px 30px; line-height: 1.6;">
            <h2 style="margin-top: 0; color: white; font-size: 18px; font-weight: 700;">Attention Team Member,</h2>
            <p style="font-size: 15px; color: #9ca3af; margin-bottom: 24px;">An active task assigned to you has an approaching target deadline or has fallen overdue. Please review the details below:</p>
            
            <!-- Details Card -->
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; width: 120px; letter-spacing: 0.5px;">Task Key:</td>
                  <td style="padding: 6px 0; font-weight: 700; color: #6366f1; font-family: monospace; font-size: 16px;">${taskKey || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Summary:</td>
                  <td style="padding: 6px 0; color: #f3f4f6; font-size: 14px; font-weight: 600;">${taskSummary || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Due Date:</td>
                  <td style="padding: 6px 0; color: #ef4444; font-size: 14px; font-weight: 700;">⏰ ${dueDate || "N/A"}</td>
                </tr>
              </table>
            </div>

            <!-- Message Block -->
            <div style="border-left: 3px solid #6366f1; padding-left: 16px; margin: 24px 0; font-style: italic; color: #d1d5db; white-space: pre-line;">${message}</div>
          </div>
          <!-- Action Link -->
          <div style="text-align: center; padding: 0 30px 40px 30px;">
            <a href="${process.env.JIRA_DOMAIN}" target="_blank" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);">
              View Issue in Jira Cloud
            </a>
          </div>
          <!-- Footer Panel -->
          <div style="background-color: rgba(255, 255, 255, 0.01); padding: 20px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #6b7280;">
            This alert was triggered from your ApniLeap JiraPro Dashboard Gateway.<br/>
            To use custom domains, configure SMTP environment variables inside the backend .env file.
          </div>
        </div>
      </div>
    `;

    // Send transaction
    info = await transporter.sendMail({
      from: hasSmtpConfig 
        ? `"${process.env.SMTP_FROM_NAME || 'JiraPro Platform'}" <${process.env.SMTP_USER}>` 
        : '"JiraPro Alert Gateway" <no-reply@apnileap.com>',
      to: recipient,
      subject: subject,
      text: message, // Plain text fallback
      html: htmlTemplate // Premium HTML template layout
    });

    console.log("\n");
    console.log("┌────────────────────────────────────────────────────────┐");
    console.log("│ 📧   APNILEAP JIRAPRO OUTGOING EMAIL GATEWAY (SMTP)     │");
    console.log("├────────────────────────────────────────────────────────┤");
    console.log(`│ TO:      \x1b[36m${recipient}\x1b[0m`);
    console.log(`│ FROM:    \x1b[32m${hasSmtpConfig ? process.env.SMTP_USER : "no-reply@apnileap.com"}\x1b[0m`);
    console.log(`│ SUBJECT: \x1b[35m${subject}\x1b[0m`);
    console.log("├────────────────────────────────────────────────────────┤");
    
    let previewUrl = "";
    if (isTestAccount) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`│ PREVIEW: \x1b[33m${previewUrl}\x1b[0m`);
    } else {
      console.log(`│ DISPATCH:\x1b[32m Real SMTP Relay Gateway (${process.env.SMTP_HOST})\x1b[0m`);
    }
    console.log("└────────────────────────────────────────────────────────┘");
    console.log("\n");

    res.json({
      success: true,
      message: isTestAccount 
        ? `Deadline alert reminder simulated! Preview at: ${previewUrl}`
        : `Deadline alert reminder successfully dispatched to ${recipient}!`,
      previewUrl: previewUrl || null,
      dispatchedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("SMTP Gateway Error:", error);
    res.status(500).json({
      success: false,
      error: "Relay Gateway Error",
      message: error.message
    });
  }
});

// Toggle standard Jira issue impediment flag
app.put("/tasks/:key/flag", async (req, res) => {
  const { key } = req.params;
  const { flagged } = req.body;

  const fields = {
    // Standard impediment custom field in Jira Cloud
    customfield_10021: flagged ? [{ value: "Impediment" }] : null
  };

  try {
    await axios.put(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}`,
      { fields },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, message: `Successfully updated flag for issue ${key}` });
  } catch (error) {
    console.error("Flag Issue Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to toggle blocker flag in Jira", details: error.response?.data || error.message });
  }
});

// Post a new worklog spent time entry to Jira
app.post("/tasks/:key/worklog", async (req, res) => {
  const { key } = req.params;
  const { timeSpent, comment } = req.body;

  try {
    await axios.post(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}/worklog`,
      {
        timeSpent,
        comment: comment || "Logged spent hours via ApniLeap Agile Dashboard"
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, message: `Successfully logged ${timeSpent} to issue ${key}` });
  } catch (error) {
    console.error("Post Worklog Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to post worklog in Jira", details: error.response?.data || error.message });
  }
});

// Get all worklog entries of an issue from Jira
app.get("/tasks/:key/worklog", async (req, res) => {
  const { key } = req.params;
  try {
    const response = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}/worklog`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        }
      }
    );
    res.json(response.data.worklogs || []);
  } catch (error) {
    console.error("Get Worklog Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch worklogs from Jira", details: error.response?.data || error.message });
  }
});

// Create a new child subtask under a parent issue inside Jira
app.post("/tasks/:key/subtask", async (req, res) => {
  const { key } = req.params;
  const { summary } = req.body;

  try {
    const projectKey = key.split("-")[0];
    const fields = {
      project: { key: projectKey },
      parent: { key },
      summary,
      issuetype: { name: "Sub-task" }
    };

    const response = await axios.post(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue`,
      { fields },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, key: response.data.key, id: response.data.id });
  } catch (error) {
    console.error("Create Subtask Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create subtask in Jira", details: error.response?.data || error.message });
  }
});

// Create a link relationship between two board issues in Jira
app.post("/tasks/links", async (req, res) => {
  const { linkType, sourceKey, targetKey } = req.body;

  let inwardKey, outwardKey;
  if (linkType === "blocks") {
    inwardKey = targetKey; // target is blocked by source
    outwardKey = sourceKey; // source blocks target
  } else {
    inwardKey = sourceKey; // source is blocked by target
    outwardKey = targetKey; // target blocks source
  }

  try {
    await axios.post(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issueLink`,
      {
        type: { name: "Blocks" },
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey }
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, message: `Successfully linked board issues` });
  } catch (error) {
    console.error("Link Issues Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to link issues in Jira", details: error.response?.data || error.message });
  }
});

// Update custom labels list for a Jira ticket
app.put("/tasks/:key/labels", async (req, res) => {
  const { key } = req.params;
  const { labels } = req.body;

  try {
    await axios.put(
      `${process.env.JIRA_DOMAIN}/rest/api/2/issue/${key}`,
      { fields: { labels } },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ success: true, message: `Successfully updated labels for issue ${key}` });
  } catch (error) {
    console.error("Update Labels Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update labels in Jira", details: error.response?.data || error.message });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});