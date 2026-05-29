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

// ApniLeap Hub & Spoke Configurations
const SPOKES = {
  "3": { name: "KLE Spoke", key: "AK", live: true, boardId: 111 },
  "101": { name: "COEP Spoke", key: "AK", live: true, boardId: 112 },
  "102": { name: "MMCOEP Spoke", key: "AK", live: true, boardId: 113 },
  "103": { name: "RIT Spoke", key: "AK", live: true, boardId: 114 },
};

const LIVE_BOARD_IDS = Object.values(SPOKES).filter(s => s.live).map(s => s.boardId);

const CAMPUS_LABELS = {
  "3": "kle-spoke",
  "101": "coep-spoke",
  "102": "mmcoep-spoke",
  "103": "rit-spoke"
};

let mockTasksStore = {
  "3": [],
  "101": [],
  "102": [],
  "103": []
};

const CAMPUS_TEAM_MEMBERS = {
  "3": [ // KLE Spoke
    { accountId: "mock-kle-1", displayName: "Rahul Sharma (Student Developer)", emailAddress: "rahul@kle.edu", email: "rahul@kle.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=12" } },
    { accountId: "mock-kle-2", displayName: "Priya Patel (Student Developer)", emailAddress: "priya@kle.edu", email: "priya@kle.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=47" } },
    { accountId: "mock-kle-3", displayName: "Prof. Deshpande (Faculty Mentor)", emailAddress: "mentor@kle.edu", email: "mentor@kle.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=63" } }
  ],
  "101": [ // COEP Spoke
    { accountId: "mock-coep-1", displayName: "Sneha Joshi (Student Developer)", emailAddress: "sneha@coep.edu", email: "sneha@coep.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=35" } },
    { accountId: "mock-coep-2", displayName: "Amit Waghmare (Student Developer)", emailAddress: "amit@coep.edu", email: "amit@coep.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=11" } }
  ],
  "102": [ // MMCOEP Spoke
    { accountId: "mock-mmcoep-1", displayName: "Nikhil Rane (Student Developer)", emailAddress: "nikhil@mmcoep.edu", email: "nikhil@mmcoep.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=33" } },
    { accountId: "mock-mmcoep-2", displayName: "Sayali Deshmukh (Student Developer)", emailAddress: "sayali@mmcoep.edu", email: "sayali@mmcoep.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=49" } }
  ],
  "103": [ // RIT Spoke
    { accountId: "mock-rit-1", displayName: "Tejas Shinde (Student Developer)", emailAddress: "tejas@rit.edu", email: "tejas@rit.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=15" } },
    { accountId: "mock-rit-2", displayName: "Priti Patil (Student Developer)", emailAddress: "priti@rit.edu", email: "priti@rit.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=45" } }
  ]
};

let jiraSimulatedAssigneeStore = {};

const MOCK_ASSIGNEES = [
  { accountId: "mock-1", displayName: "Manasa Vasare (Coordinator)", emailAddress: "coordinator@kle.edu", email: "coordinator@kle.edu", avatarUrls: { "48x48": "https://i.pravatar.cc/150?img=32" } },
  ...CAMPUS_TEAM_MEMBERS["3"],
  ...CAMPUS_TEAM_MEMBERS["101"],
  ...CAMPUS_TEAM_MEMBERS["102"],
  ...CAMPUS_TEAM_MEMBERS["103"],
];

function initMockData() {
  console.log("Pre-populating mock tasks for accepted multi-college B2B projects...");
  
  const b2bPreloads = [
    {
      boardId: "3", // KLE
      epicKey: "AK-12",
      company: "NVIDIA",
      title: "Edge AI Smart Agriculture System",
      description: "Build an AI-based system using Jetson Nano for precision agriculture monitoring, soil health inspection, and pest detection on crops.",
      proposedDueDate: "2026-08-25",
      taskStatuses: ["Done", "In Progress", "Backlog"] // 1 done, 1 in progress, 1 backlog = 33% progress!
    },
    {
      boardId: "101", // COEP
      epicKey: "AK-15",
      company: "NVIDIA",
      title: "Edge AI Smart Agriculture System",
      description: "Build an AI-based system using Jetson Nano for precision agriculture monitoring, soil health inspection, and pest detection on crops.",
      proposedDueDate: "2026-09-10",
      taskStatuses: ["Done", "Done", "Backlog"] // 2 done, 0 in progress, 1 backlog = 67% progress!
    },
    {
      boardId: "101", // COEP
      epicKey: "AK-21",
      company: "Intel",
      title: "Automotive VLSI Controller Chip",
      description: "Design and verify a micro-controller unit (MCU) for dashboard telemetry and advanced sensor fusion in electric vehicles.",
      proposedDueDate: "2026-10-15",
      taskStatuses: ["Backlog", "Backlog", "Backlog"] // 0% progress!
    },
    {
      boardId: "3", // KLE
      epicKey: "AK-22",
      company: "Intel",
      title: "Automotive VLSI Controller Chip",
      description: "Design and verify a micro-controller unit (MCU) for dashboard telemetry and advanced sensor fusion in electric vehicles.",
      proposedDueDate: "2026-09-05",
      taskStatuses: ["Done", "Done", "Done"] // 100% progress!
    }
  ];

  b2bPreloads.forEach(preload => {
    const spoke = SPOKES[preload.boardId];
    if (!spoke) return;

    if (!mockTasksStore[preload.boardId]) {
      mockTasksStore[preload.boardId] = [];
    }

    const spokeTasks = mockTasksStore[preload.boardId];
    
    // Create Epic
    const epicSummary = `[${preload.company}] ${preload.title}`;
    const descriptionText = `${preload.description}\n\nSponsor: ${preload.company}`;
    
    const newEpic = {
      id: `mock-${preload.boardId}-epic-preload-${preload.epicKey}`,
      key: preload.epicKey,
      fields: {
        summary: epicSummary,
        description: descriptionText,
        status: { name: preload.taskStatuses.every(s => s === "Done") ? "Done" : "In Progress" },
        priority: { name: "High" },
        issuetype: { name: "Epic" },
        created: new Date().toISOString(),
        dueDate: preload.proposedDueDate,
        flagged: false,
        timetracking: null,
        subtasks: [],
        labels: ["B2B-Sponsor", spoke.boardId === 75 ? "kle-spoke" : spoke.boardId === 76 ? "coep-spoke" : spoke.boardId === 77 ? "mmcoep-spoke" : "rit-spoke"],
        parent: null
      }
    };
    spokeTasks.push(newEpic);

    // Create 3 child tasks
    const standardTasks = [
      `Phase 1: Lab Infrastructure Setup & Hardware Procurement`,
      `Phase 2: Faculty Upskilling & Student Cohort Selection`,
      `Phase 3: Development, Industry Mentorship & Evaluation`
    ];

    const finalDue = new Date(preload.proposedDueDate);
    const start = new Date("2026-05-27");
    const diffMs = finalDue.getTime() - start.getTime();
    const t1DueDate = new Date(start.getTime() + Math.round(diffMs * 0.3)).toISOString().split("T")[0];
    const t2DueDate = new Date(start.getTime() + Math.round(diffMs * 0.6)).toISOString().split("T")[0];
    const t3DueDate = finalDue.toISOString().split("T")[0];
    const taskDueDates = [t1DueDate, t2DueDate, t3DueDate];

    standardTasks.forEach((taskSummary, idx) => {
      const childKey = `${preload.epicKey}-${idx + 1}`;
      const statusVal = preload.taskStatuses[idx] || "Backlog";
      const newChild = {
        id: `mock-${preload.boardId}-child-preload-${childKey}`,
        key: childKey,
        fields: {
          summary: taskSummary,
          description: `Automated child task created under Epic ${preload.epicKey} representing company project assigned to ${spoke.name}.`,
          status: { name: statusVal },
          priority: { name: "Medium" },
          issuetype: { name: "Task" },
          created: new Date().toISOString(),
          dueDate: taskDueDates[idx],
          flagged: false,
          timetracking: { timeSpentSeconds: statusVal === "Done" ? 36000 : 0, originalEstimateSeconds: 36000, remainingEstimateSeconds: statusVal === "Done" ? 0 : 36000 },
          subtasks: [],
          labels: ["B2B-Task", spoke.boardId === 75 ? "kle-spoke" : spoke.boardId === 76 ? "coep-spoke" : spoke.boardId === 77 ? "mmcoep-spoke" : "rit-spoke"],
          parent: {
            id: newEpic.id,
            key: preload.epicKey,
            summary: epicSummary,
            issueType: "Epic"
          }
        }
      };
      newChild.fields.status.name = statusVal; // Explicit assignment
      spokeTasks.push(newChild);
    });
  });

  console.log("Mock B2B Epic and task hierarchies successfully pre-populated!");
}

initMockData();

app.get("/spokes", (req, res) => {
  res.json(Object.values(SPOKES));
});

// GET /spokes/:boardId/members - Combined Live JIRA + Simulated Spoke Members
app.get("/spokes/:boardId/members", async (req, res) => {
  const { boardId } = req.params;
  let members = [];

  // 1. Fetch live JIRA assignable users
  try {
    const response = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/api/2/user/assignable/search?project=AK`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
        timeout: 4000
      }
    );
    members = response.data.map(u => ({
      accountId: u.accountId,
      displayName: u.displayName,
      emailAddress: u.emailAddress || "",
      avatarUrl: u.avatarUrls?.["48x48"] || "https://i.pravatar.cc/150"
    }));
  } catch (err) {
    console.warn("Failed to retrieve live assignable JIRA users:", err.message);
  }

  // 2. Load campus-specific simulated members
  const simulated = CAMPUS_TEAM_MEMBERS[boardId] || [];
  const normalizedSimulated = simulated.map(u => ({
    accountId: u.accountId,
    displayName: u.displayName,
    emailAddress: u.emailAddress,
    avatarUrl: u.avatarUrls?.["48x48"] || "https://i.pravatar.cc/150",
    isSimulated: true
  }));

  res.json([...members, ...normalizedSimulated]);
});

app.get("/tasks", async (req, res) => {
  const boardId = req.query.boardId || "3";
  const spoke = SPOKES[boardId];

  if (spoke && spoke.live) {
    try {
      const response = await axios.get(
        `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        }
      );

      let issues = response.data.issues || [];

      // Auto-Labeling Isolation for newly provisioned Agile boards
      if (LIVE_BOARD_IDS.includes(spoke.boardId)) {
        issues = issues.filter(issue => {
          const labels = issue.fields?.labels || [];
          if (boardId === "3") {
            // KLE Spoke: Show issues labeled "kle-spoke" OR issues that don't have other campus labels (preserving historic untagged)
            return labels.includes("kle-spoke") || (!labels.includes("rit-spoke") && !labels.includes("coep-spoke") && !labels.includes("mmcoep-spoke"));
          } else if (boardId === "101") {
            // COEP Spoke: Show ONLY issues labeled "coep-spoke"
            return labels.includes("coep-spoke");
          } else if (boardId === "102") {
            // MMCOEP Spoke: Show ONLY issues labeled "mmcoep-spoke"
            return labels.includes("mmcoep-spoke");
          } else if (boardId === "103") {
            // RIT Spoke: Show ONLY issues labeled "rit-spoke"
            return labels.includes("rit-spoke");
          }
          return true;
        });
      }

      // Overlay simulated assignees from store if present
      issues = issues.map(issue => {
        const simulatedAssignee = jiraSimulatedAssigneeStore[issue.key];
        if (simulatedAssignee) {
          return {
            ...issue,
            fields: {
              ...issue.fields,
              assignee: {
                accountId: simulatedAssignee.accountId,
                displayName: simulatedAssignee.displayName,
                avatarUrls: { "48x48": simulatedAssignee.avatarUrl },
                emailAddress: simulatedAssignee.emailAddress || ""
              }
            }
          };
        }
        return issue;
      });

      res.json(issues);
    } catch (error) {
      console.error(`Jira Fetch Error for board ${spoke.boardId} (${spoke.name}):`, error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch Jira tasks", details: error.response?.data || error.message });
    }
  } else {
    // Return backend in-memory mock data
    res.json(mockTasksStore[boardId] || []);
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
  const { summary, description, statusName, priorityName, assigneeId, reporterId, dueDate, issueTypeName, boardId } = req.body;
  const targetBoardId = boardId || "3";
  const spoke = SPOKES[targetBoardId];

  if (spoke && !spoke.live) {
    try {
      const issues = mockTasksStore[targetBoardId] || [];
      const prefix = spoke.key;
      const newIndex = issues.length + 1;
      const newKey = `${prefix}-${newIndex}`;
      const newId = `${targetBoardId}-task-${newIndex}`;

      const newIssue = {
        id: newId,
        key: newKey,
        fields: {
          summary,
          description: description || "",
          status: { name: statusName || "Backlog" },
          priority: { name: priorityName || "Medium" },
          issuetype: { name: issueTypeName || "Task" },
          assignee: assigneeId ? MOCK_ASSIGNEES.find(a => a.accountId === assigneeId) || { accountId: assigneeId, displayName: "Team Member", avatarUrls: { "48x48": "https://i.pravatar.cc/150" } } : null,
          reporter: reporterId ? MOCK_ASSIGNEES.find(a => a.accountId === reporterId) || { accountId: reporterId, displayName: "Reporter" } : null,
          created: new Date().toISOString(),
          duedate: dueDate || null,
          customfield_10021: null,
          subtasks: [],
          issuelinks: [],
          labels: []
        }
      };

      issues.push(newIssue);
      mockTasksStore[targetBoardId] = issues;

      // Handle custom transitions if needed (e.g. if status is Done or In Progress on creation)
      // Transition already handled above in memory setup.
      return res.json({ success: true, key: newKey, id: newId });
    } catch (err) {
      console.error("Mock Create Issue Error:", err);
      return res.status(500).json({ error: "Failed to create mock task" });
    }
  }

  // Live Jira API path
  try {
    // 1. Fetch active issues to extract project key automatically
    const boardIssuesRes = await axios.get(
      `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
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
      issuetype: { name: issueTypeName || "Task" },
      labels: LIVE_BOARD_IDS.includes(spoke.boardId) ? [CAMPUS_LABELS[targetBoardId] || "kle-spoke"] : ["manual"]
    };

    if (description !== undefined) fields.description = description;
    if (dueDate) fields.duedate = dueDate;
    if (priorityName) fields.priority = { name: priorityName };
    
    if (assigneeId) {
      if (assigneeId.startsWith("mock-")) {
        fields.assignee = null;
      } else {
        fields.assignee = { accountId: assigneeId };
      }
    }
    
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

    // Overlay mock assignee in store post-creation
    if (assigneeId && assigneeId.startsWith("mock-")) {
      const foundUser = MOCK_ASSIGNEES.find(u => u.accountId === assigneeId);
      if (foundUser) {
        jiraSimulatedAssigneeStore[newIssueKey] = {
          accountId: foundUser.accountId,
          displayName: foundUser.displayName,
          avatarUrl: foundUser.avatarUrls?.["48x48"] || "https://i.pravatar.cc/150",
          emailAddress: foundUser.emailAddress
        };
      }
    }

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
        `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/sprint?state=active`,
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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    if (task) {
      if (summary !== undefined) task.fields.summary = summary;
      if (description !== undefined) task.fields.description = description;
      if (dueDate !== undefined) task.fields.duedate = dueDate === "" ? null : dueDate;
      if (priority !== undefined) task.fields.priority = { name: priority };
      if (assignee !== undefined) {
        task.fields.assignee = assignee ? MOCK_ASSIGNEES.find(a => a.accountId === assignee) || { accountId: assignee, displayName: "Team Member", avatarUrls: { "48x48": "https://i.pravatar.cc/150" } } : null;
      }
      if (reporter !== undefined) {
        task.fields.reporter = reporter ? MOCK_ASSIGNEES.find(a => a.accountId === reporter) || { accountId: reporter, displayName: "Reporter" } : null;
      }
      return res.json({ success: true, message: `Updated mock issue ${key} successfully` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

  const fields = {};
  if (summary !== undefined) fields.summary = summary;
  if (description !== undefined) fields.description = description;
  if (dueDate !== undefined) fields.duedate = dueDate === "" ? null : dueDate;
  if (priority !== undefined) fields.priority = priority ? { name: priority } : null;
  
  if (assignee !== undefined) {
    if (assignee && assignee.startsWith("mock-")) {
      const foundUser = MOCK_ASSIGNEES.find(u => u.accountId === assignee);
      if (foundUser) {
        jiraSimulatedAssigneeStore[key] = {
          accountId: foundUser.accountId,
          displayName: foundUser.displayName,
          avatarUrl: foundUser.avatarUrls?.["48x48"] || "https://i.pravatar.cc/150",
          emailAddress: foundUser.emailAddress
        };
      }
      fields.assignee = null; // Bypass live JIRA mapping validation
    } else {
      delete jiraSimulatedAssigneeStore[key];
      fields.assignee = assignee ? { accountId: assignee } : null;
    }
  }
  
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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    if (task) {
      task.fields.status.name = statusName;
      return res.json({ success: true, message: `Transitioned mock issue ${key} to ${statusName} successfully.` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const index = issues.findIndex(t => t.key === key);
    if (index !== -1) {
      issues.splice(index, 1);
      mockTasksStore[spoke.boardId] = issues;
      return res.json({ success: true, message: `Deleted mock issue ${key} successfully.` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    if (task) {
      task.fields.customfield_10021 = flagged ? [{ value: "Impediment" }] : null;
      return res.json({ success: true, message: `Successfully updated flag for mock issue ${key}` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    if (task) {
      if (!task.fields.worklogs) task.fields.worklogs = [];
      task.fields.worklogs.push({
        id: `mock-wl-${Date.now()}`,
        timeSpent,
        comment: comment || "Logged spent hours via ApniLeap Agile Dashboard",
        created: new Date().toISOString(),
        author: MOCK_ASSIGNEES[0]
      });

      if (!task.fields.timetracking) {
        task.fields.timetracking = { timeSpentSeconds: 0 };
      }
      task.fields.timetracking.timeSpent = timeSpent;
      task.fields.timetracking.timeSpentSeconds = (task.fields.timetracking.timeSpentSeconds || 0) + 7200;
      return res.json({ success: true, message: `Successfully logged ${timeSpent} to mock issue ${key}` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    return res.json(task ? (task.fields.worklogs || []) : []);
  }

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
  const { summary, assigneeId, parentIssueType } = req.body;

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const parentTask = issues.find(t => t.key === key);
    if (parentTask) {
      const isEpic = parentIssueType && parentIssueType.toLowerCase() === "epic";
      const issueTypeName = isEpic ? "Task" : "Sub-task";
      
      const newIndex = issues.length + 1;
      const newKey = `${projectKey}-${newIndex}`;
      const newId = `${spoke.boardId}-task-${newIndex}`;

      const newChild = {
        id: newId,
        key: newKey,
        fields: {
          summary,
          status: { name: "Backlog" },
          priority: { name: "Medium" },
          issuetype: { name: issueTypeName },
          assignee: assigneeId ? MOCK_ASSIGNEES.find(a => a.accountId === assigneeId) || null : null,
          reporter: MOCK_ASSIGNEES[0],
          created: new Date().toISOString(),
          parent: {
            id: parentTask.id,
            key: parentTask.key,
            fields: {
              summary: parentTask.fields.summary,
              issuetype: { name: parentTask.fields.issuetype.name }
            }
          },
          subtasks: [],
          issuelinks: []
        }
      };

      issues.push(newChild);
      mockTasksStore[spoke.boardId] = issues;

      if (!isEpic) {
        if (!parentTask.fields.subtasks) parentTask.fields.subtasks = [];
        parentTask.fields.subtasks.push({
          id: newId,
          key: newKey,
          summary: summary,
          statusName: "Backlog"
        });
      }

      return res.json({ success: true, key: newKey, id: newId });
    } else {
      return res.status(404).json({ error: `Mock parent task ${key} not found` });
    }
  }

  try {
    const isEpic = parentIssueType && parentIssueType.toLowerCase() === "epic";
    const issueTypeName = isEpic ? "Task" : "Sub-task";

    const fields = {
      project: { key: projectKey },
      parent: { key },
      summary,
      issuetype: { name: issueTypeName }
    };

    if (assigneeId) {
      fields.assignee = { accountId: assigneeId };
    }

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

  const projectKey = sourceKey.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    return res.json({ success: true, message: `Successfully linked board issues in mock workspace` });
  }

  let inwardKey, outwardKey;
  if (linkType === "blocks") {
    inwardKey = targetKey;
    outwardKey = sourceKey;
  } else {
    inwardKey = sourceKey;
    outwardKey = targetKey;
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

  const projectKey = key.split("-")[0];
  const spoke = Object.values(SPOKES).find(s => s.key === projectKey);

  if (spoke && !spoke.live) {
    const issues = mockTasksStore[spoke.boardId] || [];
    const task = issues.find(t => t.key === key);
    if (task) {
      task.fields.labels = labels;
      return res.json({ success: true, message: `Successfully updated labels for mock issue ${key}` });
    } else {
      return res.status(404).json({ error: `Mock issue ${key} not found` });
    }
  }

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

// GET /hub/metrics - Dynamic Portfolio Aggregator Endpoint
app.get("/hub/metrics", async (req, res) => {
  try {
    const hubData = {
      spokes: [],
      workstreams: [],
      blockers: []
    };

    // 1. Fetch live issues for each respective Spoke dynamically
    const spokesList = ["3", "101", "102", "103"];
    const allCampusIssues = {};

    for (const boardId of spokesList) {
      const spoke = SPOKES[boardId];
      if (spoke.live) {
        try {
          const response = await axios.get(
            `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
              timeout: 4000
            }
          );
          let issues = response.data.issues || [];
          if (LIVE_BOARD_IDS.includes(spoke.boardId)) {
            issues = issues.filter(issue => {
              const labels = issue.fields?.labels || [];
              if (boardId === "3") {
                // KLE Spoke: Show issues labeled "kle-spoke" OR issues that don't have other campus labels (preserving historic untagged)
                return labels.includes("kle-spoke") || (!labels.includes("rit-spoke") && !labels.includes("coep-spoke") && !labels.includes("mmcoep-spoke"));
              } else if (boardId === "101") {
                // COEP Spoke: Show ONLY issues labeled "coep-spoke"
                return labels.includes("coep-spoke");
              } else if (boardId === "102") {
                // MMCOEP Spoke: Show ONLY issues labeled "mmcoep-spoke"
                return labels.includes("mmcoep-spoke");
              } else if (boardId === "103") {
                // RIT Spoke: Show ONLY issues labeled "rit-spoke"
                return labels.includes("rit-spoke");
              }
              return true;
            });
          }
          allCampusIssues[boardId] = issues;
        } catch (err) {
          console.warn(`Failed to fetch live board ${spoke.boardId} for spoke ${spoke.name} during Hub metrics aggregation.`, err.message);
          allCampusIssues[boardId] = [];
        }
      } else {
        allCampusIssues[boardId] = mockTasksStore[boardId] || [];
      }
    }

    // 2. Identify all unique Epics in the entire active FIP ecosystem
    const epicMetadata = {};
    
    spokesList.forEach(boardId => {
      const issues = allCampusIssues[boardId];
      issues.forEach(issue => {
        const issueType = issue.fields?.issuetype?.name || issue.fields?.issueType || "Task";
        if (issueType === "Epic") {
          const summary = issue.fields?.summary || issue.summary || "Unnamed Epic";
          if (!epicMetadata[summary]) {
            epicMetadata[summary] = {
              name: summary,
              keysMap: {}
            };
          }
          epicMetadata[summary].keysMap[boardId] = issue.key;
        }
      });
    });

    // Check child tasks parent summaries to align missing Epic objects
    spokesList.forEach(boardId => {
      const issues = allCampusIssues[boardId];
      issues.forEach(issue => {
        const parent = issue.fields?.parent || issue.parent;
        if (parent && (parent.issueType === "Epic" || parent.fields?.issuetype?.name === "Epic")) {
          const parentSummary = parent.fields?.summary || parent.summary;
          if (parentSummary && !epicMetadata[parentSummary]) {
            epicMetadata[parentSummary] = {
              name: parentSummary,
              keysMap: {}
            };
          }
          if (parentSummary && parent.key) {
            epicMetadata[parentSummary].keysMap[boardId] = parent.key;
          }
        }
      });
    });

    const epicKeys = Object.keys(epicMetadata);

    // 3. For each Spoke, compute metrics and dynamic Epic progress rates
    spokesList.forEach(boardId => {
      const spoke = SPOKES[boardId];
      const issues = allCampusIssues[boardId];

      let total = 0;
      let done = 0;
      let progress = 0;
      let backlog = 0;
      let blockersCount = 0;

      const epicTaskTotals = {};
      const epicTaskDones = {};

      epicKeys.forEach(summary => {
        epicTaskTotals[summary] = 0;
        epicTaskDones[summary] = 0;
      });

      issues.forEach(issue => {
        const issueType = issue.fields?.issuetype?.name || issue.fields?.issueType || "Task";
        if (issueType === "Epic") return;

        const status = issue.fields?.status?.name || issue.fields?.status || "Backlog";
        total++;
        if (status === "Done") done++;
        else if (status === "In Progress" || status === "To Do") progress++;
        else backlog++;

        const simulatedAssignee = jiraSimulatedAssigneeStore[issue.key];
        const activeAssignee = simulatedAssignee 
          ? {
              displayName: simulatedAssignee.displayName,
              avatarUrl: simulatedAssignee.avatarUrl
            }
          : issue.fields?.assignee ? {
              displayName: issue.fields.assignee.displayName,
              avatarUrl: issue.fields.assignee.avatarUrls?.["48x48"] || issue.fields.assignee.avatarUrl || "https://i.pravatar.cc/150"
            } : null;

        const isFlagged = (issue.fields?.customfield_10021 && issue.fields.customfield_10021.length > 0) || 
                          (issue.fields?.Flagged && issue.fields.Flagged.length > 0) ||
                          issue.fields?.flagged === true;
        if (isFlagged) {
          blockersCount++;
          hubData.blockers.push({
            id: issue.id,
            key: issue.key,
            summary: issue.fields?.summary || issue.summary || "No Summary",
            statusName: status,
            priority: issue.fields?.priority?.name || "Medium",
            spokeName: spoke.name,
            assignee: activeAssignee
          });
        }

        let parentSummary = null;
        if (issue.fields?.parent) {
          parentSummary = issue.fields.parent.fields?.summary || issue.fields.parent.summary;
        } else if (issue.parent) {
          parentSummary = issue.parent.fields?.summary || issue.parent.summary;
        }

        if (parentSummary && epicMetadata[parentSummary]) {
          epicTaskTotals[parentSummary]++;
          if (status === "Done") {
            epicTaskDones[parentSummary]++;
          }
        }
      });

      hubData.spokes.push({
        id: boardId,
        name: spoke.name,
        key: spoke.key,
        total,
        done,
        progress,
        backlog,
        blockersCount,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0
      });

      epicKeys.forEach(summary => {
        const tCount = epicTaskTotals[summary];
        const dCount = epicTaskDones[summary];
        if (tCount > 0) {
          epicMetadata[summary][spoke.name] = Math.round((dCount / tCount) * 100);
        } else {
          epicMetadata[summary][spoke.name] = null;
        }
      });
    });

    epicKeys.forEach(summary => {
      hubData.workstreams.push({
        name: summary,
        KLE: epicMetadata[summary]["KLE Spoke"],
        COEP: epicMetadata[summary]["COEP Spoke"],
        MMCOEP: epicMetadata[summary]["MMCOEP Spoke"],
        RIT: epicMetadata[summary]["RIT Spoke"]
      });
    });

    // 4. Calculate milestone progress for B2B Corporate Projects across all spokes
    hubData.b2bProjects = companyProjectsIntake.map(proj => {
      const enrichedAllocations = (proj.allocations || []).map(alloc => {
        const boardId = alloc.targetCampusId;
        const issues = allCampusIssues[boardId] || [];
        const epicKey = alloc.assignedKey;

        let totalTasks = 0;
        let doneTasks = 0;

        issues.forEach(issue => {
          const issueType = issue.fields?.issuetype?.name || issue.fields?.issueType || "Task";
          if (issueType === "Epic") return;

          const parentKey = issue.fields?.parent?.key || issue.parent?.key;
          const parentSummary = issue.fields?.parent?.fields?.summary || issue.fields?.parent?.summary || issue.parent?.fields?.summary || issue.parent?.summary;
          const expectedSummary = `[${proj.company}] ${proj.title}`;

          const isChild = (epicKey && parentKey === epicKey) || (parentSummary && parentSummary === expectedSummary);
          if (isChild) {
            totalTasks++;
            const status = issue.fields?.status?.name || issue.fields?.status || "Backlog";
            if (status === "Done") doneTasks++;
          }
        });

        return {
          ...alloc,
          totalTasks,
          doneTasks,
          progressPercent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
        };
      });

      return {
        ...proj,
        allocations: enrichedAllocations
      };
    });

    res.json(hubData);
  } catch (error) {
    console.error("Hub Metrics Aggregation Error:", error.message);
    res.status(500).json({ error: "Failed to aggregate Hub metrics" });
  }
});

// ==========================================
// B2B MODERATOR PORTAL DATABASE & ENDPOINTS
// ==========================================

// In-memory Database for B2B Company Projects Intake
let companyProjectsIntake = [
  {
    id: "proj-1",
    company: "NVIDIA",
    logoUrl: "https://logo.clearbit.com/nvidia.com?size=80",
    title: "Edge AI Smart Agriculture System",
    description: "Build an AI-based system using Jetson Nano for precision agriculture monitoring, soil health inspection, and pest detection on crops.",
    budget: "$25,000",
    duration: "6 Months",
    status: "Proposed",
    assignedTo: null,
    targetCampusId: null,
    proposedDueDate: null,
    assignedKey: null,
    dateAdded: "2026-05-20",
    allocations: []
  },
  {
    id: "proj-2",
    company: "Intel",
    logoUrl: "https://logo.clearbit.com/intel.com?size=80",
    title: "Automotive VLSI Controller Chip",
    description: "Design and verify a micro-controller unit (MCU) for dashboard telemetry and advanced sensor fusion in electric vehicles.",
    budget: "$40,000",
    duration: "9 Months",
    status: "Proposed",
    assignedTo: null,
    targetCampusId: null,
    proposedDueDate: null,
    assignedKey: null,
    dateAdded: "2026-05-24",
    allocations: []
  },
  {
    id: "proj-3",
    company: "Google",
    logoUrl: "https://logo.clearbit.com/google.com?size=80",
    title: "Cloud-Native Health Tracking API",
    description: "Develop a secure, high-throughput FHIR-compliant API for sharing electronic medical records seamlessly between clinics and hospitals.",
    budget: "$15,000",
    duration: "4 Months",
    status: "Proposed",
    assignedTo: null,
    targetCampusId: null,
    proposedDueDate: null,
    assignedKey: null,
    dateAdded: "2026-05-26",
    allocations: []
  }
];

// GET: Load incoming company projects with live milestone progress calculated for each allocation
app.get("/moderator/projects", async (req, res) => {
  try {
    const spokesList = ["3", "101", "102", "103"];
    const allCampusIssues = {};

    // Fetch tasks for each spoke (mock or live)
    for (const boardId of spokesList) {
      const spoke = SPOKES[boardId];
      if (spoke.live) {
        try {
          const response = await axios.get(
            `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
              timeout: 2500 // Quick timeout to prevent blocking
            }
          );
          let issues = response.data.issues || [];
          if (LIVE_BOARD_IDS.includes(spoke.boardId)) {
            issues = issues.filter(issue => {
              const labels = issue.fields?.labels || [];
              if (boardId === "3") return labels.includes("kle-spoke") || (!labels.includes("rit-spoke") && !labels.includes("coep-spoke") && !labels.includes("mmcoep-spoke"));
              if (boardId === "101") return labels.includes("coep-spoke");
              if (boardId === "102") return labels.includes("mmcoep-spoke");
              if (boardId === "103") return labels.includes("rit-spoke");
              return true;
            });
          }
          allCampusIssues[boardId] = issues;
        } catch (err) {
          allCampusIssues[boardId] = mockTasksStore[boardId] || [];
        }
      } else {
        allCampusIssues[boardId] = mockTasksStore[boardId] || [];
      }
    }

    const projectsWithProgress = companyProjectsIntake.map(proj => {
      if (proj.allocations && proj.allocations.length > 0) {
        const enrichedAllocations = proj.allocations.map(alloc => {
          const boardId = alloc.targetCampusId;
          const issues = allCampusIssues[boardId] || [];
          const epicKey = alloc.assignedKey;

          let totalTasks = 0;
          let doneTasks = 0;

          issues.forEach(issue => {
            const issueType = issue.fields?.issuetype?.name || issue.fields?.issueType || "Task";
            if (issueType === "Epic") return;

            const parentKey = issue.fields?.parent?.key || issue.parent?.key;
            const parentSummary = issue.fields?.parent?.fields?.summary || issue.fields?.parent?.summary || issue.parent?.fields?.summary || issue.parent?.summary;
            const expectedSummary = `[${proj.company}] ${proj.title}`;

            const isChild = (epicKey && parentKey === epicKey) || (parentSummary && parentSummary === expectedSummary);
            if (isChild) {
              totalTasks++;
              const status = issue.fields?.status?.name || issue.fields?.status || "Backlog";
              if (status === "Done") doneTasks++;
            }
          });

          return {
            ...alloc,
            totalTasks,
            doneTasks,
            progressPercent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
          };
        });

        return {
          ...proj,
          allocations: enrichedAllocations
        };
      }
      return proj;
    });

    res.json(projectsWithProgress);
  } catch (error) {
    console.error("Moderator Projects Load Error:", error);
    res.json(companyProjectsIntake);
  }
});

// POST: Propose a company project to a campus spoke (Awaiting acceptance)
app.post("/moderator/assign", async (req, res) => {
  const { projectId, targetBoardId, dueDate } = req.body;
  const project = companyProjectsIntake.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "Company project not found" });
  }
  const spoke = SPOKES[targetBoardId];
  if (!spoke) {
    return res.status(400).json({ error: "Invalid target campus spoke selected" });
  }

  if (!project.allocations) {
    project.allocations = [];
  }

  // Check if already assigned to this campus
  let allocation = project.allocations.find(a => a.targetCampusId === targetBoardId);
  if (allocation) {
    return res.status(400).json({ error: "This project has already been allocated or proposed to this campus spoke." });
  }

  const proposedDueDate = dueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  project.allocations.push({
    targetCampusId: targetBoardId,
    assignedTo: spoke.name,
    status: "Proposed",
    proposedDueDate: proposedDueDate,
    assignedKey: null
  });

  // Sync to root fields for backwards compatibility
  project.status = "Proposed";
  project.assignedTo = spoke.name;
  project.targetCampusId = targetBoardId;
  project.proposedDueDate = proposedDueDate;
  project.assignedKey = null;

  console.log(`Project ${project.title} successfully proposed to ${spoke.name}. Awaiting coordinator response.`);

  res.json({
    success: true,
    message: `Successfully proposed project to ${spoke.name}! Awaiting coordinator acceptance.`,
    assignedTo: spoke.name,
    status: project.status
  });
});

// POST: Spoke coordinator accepts proposed project (Triggers JIRA Provisioning)
app.post("/spoke/project/:projectId/accept", async (req, res) => {
  const { projectId } = req.params;
  const { targetBoardId } = req.body;
  const project = companyProjectsIntake.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "Proposed project not found" });
  }

  const boardId = targetBoardId || project.targetCampusId;
  const spoke = SPOKES[boardId];
  if (!spoke) {
    return res.status(400).json({ error: "Invalid target campus spoke resolved" });
  }

  if (!project.allocations) project.allocations = [];
  let allocation = project.allocations.find(a => a.targetCampusId === boardId);
  if (!allocation) {
    allocation = {
      targetCampusId: boardId,
      assignedTo: spoke.name,
      status: "Proposed",
      proposedDueDate: project.proposedDueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      assignedKey: null
    };
    project.allocations.push(allocation);
  }

  const dueDate = allocation.proposedDueDate;

  try {
    let createdEpicKey = "";
    const summary = `[${project.company}] ${project.title}`;
    const descriptionText = `${project.description}\n\nSponsor: ${project.company}\nBudget: ${project.budget}\nDuration: ${project.duration}`;

    // Auto-calculate deadlines for 3 standard tasks based on the project final dueDate
    const finalDateStr = dueDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const finalDue = new Date(finalDateStr);
    const start = new Date("2026-05-27");
    const diffMs = finalDue.getTime() - start.getTime();

    const t1Ms = start.getTime() + Math.round(diffMs * 0.3);
    const t2Ms = start.getTime() + Math.round(diffMs * 0.6);
    const t3Ms = finalDue.getTime();

    const t1DueDate = new Date(t1Ms).toISOString().split("T")[0];
    const t2DueDate = new Date(t2Ms).toISOString().split("T")[0];
    const t3DueDate = new Date(t3Ms).toISOString().split("T")[0];

    const standardTasks = [
      `Phase 1: Lab Infrastructure Setup & Hardware Procurement`,
      `Phase 2: Faculty Upskilling & Student Cohort Selection`,
      `Phase 3: Development, Industry Mentorship & Evaluation`
    ];
    const taskDueDates = [t1DueDate, t2DueDate, t3DueDate];

    if (spoke.live) {
      console.log(`Live Provisioning Project to ${spoke.name} on acceptance...`);
      
      const epicBody = {
        fields: {
          project: { key: spoke.key },
          summary: summary,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: descriptionText }]
              }
            ]
          },
          duedate: finalDateStr,
          issuetype: { name: "Epic" },
          labels: LIVE_BOARD_IDS.includes(spoke.boardId) ? [CAMPUS_LABELS[targetBoardId] || "kle-spoke"] : ["epic"]
        }
      };

      const epicRes = await axios.post(
        `${process.env.JIRA_DOMAIN}/rest/api/3/issue`,
        epicBody,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (epicRes.data && epicRes.data.key) {
        createdEpicKey = epicRes.data.key;
        console.log(`Epic Created successfully: ${createdEpicKey}`);

        for (let idx = 0; idx < standardTasks.length; idx++) {
          const taskSummary = standardTasks[idx];
          const taskBody = {
            fields: {
              project: { key: spoke.key },
              summary: taskSummary,
              description: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: `Automated child task created under Epic ${createdEpicKey}.` }]
                  }
                ]
              },
              duedate: taskDueDates[idx],
              issuetype: { name: "Task" },
              parent: { key: createdEpicKey },
              labels: LIVE_BOARD_IDS.includes(spoke.boardId) ? [CAMPUS_LABELS[targetBoardId] || "kle-spoke"] : ["task"]
            }
          };

          await axios.post(
            `${process.env.JIRA_DOMAIN}/rest/api/3/issue`,
            taskBody,
            {
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/json"
              }
            }
          );
        }
      } else {
        throw new Error("Failed to retrieve created Epic key from Jira response");
      }
    } else {
      console.log(`Mock Provisioning Project to simulated spoke ${spoke.name} on acceptance...`);
      
      if (!mockTasksStore[targetBoardId]) {
        mockTasksStore[targetBoardId] = [];
      }

      const spokeTasks = mockTasksStore[targetBoardId];
      const epicIndex = spokeTasks.filter(t => t.fields?.issuetype?.name === "Epic").length + 1;
      createdEpicKey = `${spoke.key}-${epicIndex}`;
      
      const newEpic = {
        id: `mock-${targetBoardId}-epic-${Date.now()}`,
        key: createdEpicKey,
        fields: {
          summary: summary,
          description: descriptionText,
          status: { name: "Backlog" },
          priority: { name: "High" },
          issuetype: { name: "Epic" },
          created: new Date().toISOString(),
          dueDate: finalDateStr,
          flagged: false,
          timetracking: null,
          subtasks: [],
          labels: ["B2B-Sponsor"],
          parent: null
        }
      };

      spokeTasks.push(newEpic);

      standardTasks.forEach((taskSummary, idx) => {
        const childKey = `${spoke.key}-${epicIndex}-${idx + 1}`;
        const newChild = {
          id: `mock-${targetBoardId}-child-${Date.now()}-${idx}`,
          key: childKey,
          fields: {
            summary: taskSummary,
            description: `Automated child task created under Epic ${createdEpicKey} representing company project assigned to ${spoke.name}.`,
            status: { name: "Backlog" },
            priority: { name: "Medium" },
            issuetype: { name: "Task" },
            created: new Date().toISOString(),
            dueDate: taskDueDates[idx],
            flagged: false,
            timetracking: { timeSpentSeconds: 0, originalEstimateSeconds: 36000, remainingEstimateSeconds: 36000 },
            subtasks: [],
            labels: ["B2B-Task"],
            parent: {
              id: newEpic.id,
              key: createdEpicKey,
              summary: summary,
              issueType: "Epic"
            }
          }
        };
        spokeTasks.push(newChild);
      });
    }

    // Update specific allocation status to Active
    if (allocation) {
      allocation.status = "Active";
      allocation.assignedKey = createdEpicKey;
    }

    // Update root fields for fallback compatibility
    project.status = "Active";
    project.assignedTo = spoke.name;
    project.targetCampusId = boardId;
    project.assignedKey = createdEpicKey;

    res.json({
      success: true,
      message: `Successfully accepted and provisioned project to ${spoke.name}!`,
      assignedKey: createdEpicKey,
      assignedTo: spoke.name
    });
  } catch (error) {
    console.error("Assignment Acceptance Error:", error.message);
    res.status(500).json({ error: `Acceptance failed: ${error.response?.data?.errorMessages?.join(", ") || error.message}` });
  }
});

app.post("/spoke/project/:projectId/decline", (req, res) => {
  const { projectId } = req.params;
  const { targetBoardId } = req.body;
  const project = companyProjectsIntake.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: "Proposed project not found" });
  }

  const boardId = targetBoardId || project.targetCampusId;
  const spokeName = SPOKES[boardId]?.name || "Campus";

  // Remove this specific spoke allocation
  if (project.allocations) {
    project.allocations = project.allocations.filter(a => a.targetCampusId !== boardId);
  }

  // Update root fields for backwards compatibility
  if (!project.allocations || project.allocations.length === 0) {
    project.status = "Pending Assignment";
    project.assignedTo = null;
    project.targetCampusId = null;
    project.proposedDueDate = null;
    project.assignedKey = null;
  } else {
    const first = project.allocations[0];
    project.status = first.status;
    project.assignedTo = first.assignedTo;
    project.targetCampusId = first.targetCampusId;
    project.proposedDueDate = first.proposedDueDate;
    project.assignedKey = first.assignedKey;
  }

  console.log(`Project proposal ${project.title} declined by ${spokeName}.`);

  res.json({
    success: true,
    message: `Project proposal successfully declined by ${spokeName}.`,
    status: project.status
  });
});



// ==========================================
// COLLABORATIVE MEETING PORTAL DATA & ROUTES
// ==========================================

let scheduledMeetingsStore = [
  {
    id: "meet-1",
    title: "KLE FIP Campus Sprint Sync",
    campusId: "3",
    date: new Date("2026-05-27").toISOString().split("T")[0],
    time: "14:30",
    link: "https://teams.microsoft.com/l/meetup-join/demo-kle-sync",
    agenda: "Sprint blocker escalation, VLSI laboratory setup progression, and Phase 1 milestone evaluation."
  },
  {
    id: "meet-2",
    title: "Sponsor Executive Review (Intel)",
    campusId: "101",
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    time: "11:00",
    link: "https://zoom.us/j/demo-sponsor-intel",
    agenda: "Ingested Automotive MCU architecture review, budget allocation check, and student delegation status."
  }
];

// GET: Fetch upcoming scheduled meetings
app.get("/meetings", (req, res) => {
  res.json(scheduledMeetingsStore);
});

// POST: Schedule a new meeting
app.post("/meetings", (req, res) => {
  const { title, campusId, date, time, link, agenda } = req.body;
  if (!title || !campusId || !date || !time) {
    return res.status(400).json({ error: "Missing required meeting fields (title, campusId, date, time)" });
  }
  
  const newMeeting = {
    id: `meet-${Date.now()}`,
    title,
    campusId,
    date,
    time,
    link: link || "https://teams.microsoft.com/",
    agenda: agenda || "General campus sync."
  };
  
  scheduledMeetingsStore.push(newMeeting);
  res.json({ success: true, meeting: newMeeting });
});

// POST: Gathers active overdue/blocked tasks and simulates sending warning alert pre-meeting emails
app.post("/meetings/:id/remind", async (req, res) => {
  const { id } = req.params;
  const meeting = scheduledMeetingsStore.find(m => m.id === id);
  if (!meeting) {
    return res.status(404).json({ error: "Sync meeting not found" });
  }

  const spoke = SPOKES[meeting.campusId];
  if (!spoke) {
    return res.status(400).json({ error: "Invalid campus spoke associated with meeting" });
  }

  try {
    let tasks = [];
    if (spoke.live) {
      const response = await axios.get(
        `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
          timeout: 4000
        }
      );
      let issues = response.data.issues || [];
      if (LIVE_BOARD_IDS.includes(spoke.boardId)) {
        issues = issues.filter(issue => {
          const labels = issue.fields?.labels || [];
          if (meeting.campusId === "3") {
            // KLE Spoke: Show issues labeled "kle-spoke" OR issues that don't have other campus labels (preserving historic untagged)
            return labels.includes("kle-spoke") || (!labels.includes("rit-spoke") && !labels.includes("coep-spoke") && !labels.includes("mmcoep-spoke"));
          } else if (meeting.campusId === "101") {
            // COEP Spoke: Show ONLY issues labeled "coep-spoke"
            return labels.includes("coep-spoke");
          } else if (meeting.campusId === "102") {
            // MMCOEP Spoke: Show ONLY issues labeled "mmcoep-spoke"
            return labels.includes("mmcoep-spoke");
          } else if (meeting.campusId === "103") {
            // RIT Spoke: Show ONLY issues labeled "rit-spoke"
            return labels.includes("rit-spoke");
          }
          return true;
        });
      }
      tasks = issues;
    } else {
      tasks = mockTasksStore[meeting.campusId] || [];
    }

    const overdueTasks = [];
    const blockedTasks = [];
    const notifyCoordinators = new Set(["manasa@apnileap.com", "coordinator@" + spoke.key.toLowerCase() + ".edu"]);

    tasks.forEach(t => {
      const issueType = t.fields?.issuetype?.name || t.fields?.issueType || "Task";
      if (issueType === "Epic") return;

      const summary = t.fields?.summary || "Sprint task";
      const status = t.fields?.status?.name || t.fields?.status || "Backlog";
      const simulatedAssignee = jiraSimulatedAssigneeStore[t.key];
      const assigneeName = simulatedAssignee 
        ? simulatedAssignee.displayName 
        : t.fields?.assignee?.displayName || "Unassigned";
      const assigneeEmail = simulatedAssignee
        ? simulatedAssignee.emailAddress
        : t.fields?.assignee?.emailAddress || t.fields?.assignee?.email || null;

      if (assigneeEmail) {
        notifyCoordinators.add(assigneeEmail);
      }

      const isFlagged = (t.fields?.customfield_10021 && t.fields.customfield_10021.length > 0) || 
                        (t.fields?.Flagged && t.fields.Flagged.length > 0) ||
                        t.fields?.flagged === true;
      
      if (isFlagged) {
        blockedTasks.push({ key: t.key, summary, status, assignee: assigneeName });
      }

      const dueDateStr = t.fields?.duedate || t.fields?.dueDate || null;
      if (status !== "Done" && dueDateStr) {
        const today = new Date("2026-05-27");
        const due = new Date(dueDateStr);
        const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        if (dDue.getTime() < dToday.getTime()) {
          overdueTasks.push({ key: t.key, summary, dueDate: dueDateStr, assignee: assigneeName });
        }
      }
    });

    const emailBody = `
      FIP MEETING INVITATION & SPRINT WARNING DIGEST
      ---------------------------------------------------------
      Meeting: ${meeting.title}
      Campus: ${spoke.name}
      Sync Time: ${meeting.date} at ${meeting.time}
      Join Call: ${meeting.link}
      
      Agenda: ${meeting.agenda}
      
      ⚠️ URGENT PRE-MEETING PREPARATION ITEMS:
      We have compiled the active sprint tasks for your campus that are currently blocking progression. Please resolve their statuses or prepare escalations for the sync.
      
      🚨 ACTIVE CAMPUS BLOCKERS (${blockedTasks.length}):
      ${blockedTasks.map(t => `- [${t.key}] ${t.summary} (Status: ${t.statusName || t.status}, Owner: ${t.assignee})`).join("\n") || "None! Excellent team progression."}
      
      ⏰ OVERDUE DEADLINE BREACHES (${overdueTasks.length}):
      ${overdueTasks.map(t => `- [${t.key}] ${t.summary} (Due: ${t.dueDate}, Owner: ${t.assignee})`).join("\n") || "None! All deadlines are currently on-track."}
      
      Please join the Teams link promptly. 
      -- Sent automatically by ApniLeap Moderator
    `;

    console.log(`[SMTP SIMULATOR] Dispatching pre-meeting warning digest to: ${Array.from(notifyCoordinators).join(", ")}`);

    res.json({
      success: true,
      message: `Pre-meeting alerts successfully dispatched to ${notifyCoordinators.size} campus coordinators!`,
      notifiedEmails: Array.from(notifyCoordinators),
      overdueCount: overdueTasks.length,
      blockerCount: blockedTasks.length,
      emailDigest: emailBody
    });
  } catch (error) {
    console.error("Prep Reminder Dispatch Error:", error.message);
    res.status(500).json({ error: `Reminder failed: ${error.message}` });
  }
});

// ==========================================
// AUTOMATED OVERDUE PROJECTS SCAANER
// ==========================================

// POST: Run real-time audit scan of B2B projects and trigger warnings if incomplete/overdue
app.post("/moderator/alerts/check", async (req, res) => {
  const triggeredAlerts = [];

  try {
    for (const project of companyProjectsIntake) {
      if (!project.assignedTo || !project.assignedKey) continue;
      
      const boardId = Object.keys(SPOKES).find(k => SPOKES[k].name === project.assignedTo);
      if (!boardId) continue;
      const spoke = SPOKES[boardId];

      let tasks = [];
      if (spoke.live) {
        try {
          const response = await axios.get(
            `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
              },
              timeout: 4000
            }
          );
          tasks = response.data.issues || [];
        } catch (err) {
          console.warn(`Failed to fetch live tasks for spoke ${spoke.name} during alerts check.`);
          continue;
        }
      } else {
        tasks = mockTasksStore[boardId] || [];
      }

      const projectEpic = tasks.find(t => t.key === project.assignedKey && (t.fields?.issuetype?.name === "Epic" || t.fields?.issueType === "Epic"));
      if (!projectEpic) continue;

      const childTasks = tasks.filter(t => {
        const parentKey = t.fields?.parent?.key || t.parent?.key;
        return parentKey === project.assignedKey;
      });

      const totalChildren = childTasks.length;
      const completedChildren = childTasks.filter(t => {
        const status = t.fields?.status?.name || t.fields?.status || "Backlog";
        return status === "Done";
      }).length;

      const completionRate = totalChildren > 0 ? Math.round((completedChildren / totalChildren) * 100) : 0;
      const isCompleted = totalChildren > 0 && completedChildren === totalChildren;

      const epicDueDate = projectEpic.fields?.duedate || projectEpic.fields?.dueDate || projectEpic.dueDate || null;
      let isBreached = false;
      let daysOverdue = 0;

      if (!isCompleted && epicDueDate) {
        const today = new Date("2026-05-27");
        const due = new Date(epicDueDate);
        const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        
        if (dDue.getTime() < dToday.getTime()) {
          isBreached = true;
          daysOverdue = Math.ceil((dToday.getTime() - dDue.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      if (isBreached) {
        project.status = `Assigned (BREACHED - Incomplete)`;
        
        const warningBody = `
          ⚠️ URGENT DEADLINE BREACH WARNING - INCOMPLETE PROJECT
          ---------------------------------------------------------
          Company Project: ${project.title}
          Sponsoring Partner: ${project.company}
          Assigned Space: ${project.assignedTo} (Jira Key: ${project.assignedKey})
          
          Project Target Deadline was: ${epicDueDate}
          Breach Duration: Overdue by ${daysOverdue} days!
          
          Current Progress Metrics:
          - Overall Completion Rate: ${completionRate}%
          - Total Scope: ${totalChildren} Phase Deliverables
          - Deliverables Completed: ${completedChildren} of ${totalChildren}
          - Deliverables Remaining: ${totalChildren - completedChildren} INCOMPLETE
          
          🚨 URGENT ACTION REQUIRED:
          Your campus has breached the target deadline for this industry-sponsored FIP. Please contact the ApniLeap Moderator immediately or update your sprint task assignments.
          
          -- Dispatched by ApniLeap automated deadline auditor.
        `;

        triggeredAlerts.push({
          projectId: project.id,
          title: project.title,
          company: project.company,
          assignedTo: project.assignedTo,
          epicKey: project.assignedKey,
          dueDate: epicDueDate,
          completionRate,
          daysOverdue,
          emailAlertBody: warningBody
        });
      }
    }

    res.json({
      success: true,
      message: `Audit scan completed! Triggered ${triggeredAlerts.length} overdue campus alerts.`,
      alerts: triggeredAlerts
    });
  } catch (error) {
    console.error("Alerts Scanner Error:", error.message);
    res.status(500).json({ error: `Alerts scan failed: ${error.message}` });
  }
});

async function syncAcceptedProjectsWithJira() {
  console.log("Synchronizing proposed/accepted project states with live Jira...");
  const spokesList = ["3", "101", "102", "103"];
  for (const boardId of spokesList) {
    const spoke = SPOKES[boardId];
    if (!spoke.live) continue;
    try {
      const response = await axios.get(
        `${process.env.JIRA_DOMAIN}/rest/agile/1.0/board/${spoke.boardId}/issue`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
          timeout: 6000
        }
      );
      const issues = response.data.issues || [];
      const epics = issues.filter(t => t.fields?.issuetype?.name === "Epic");
      
      for (const epic of epics) {
        const labels = epic.fields?.labels || [];
        const hasKle = labels.includes("kle-spoke");
        const hasCoep = labels.includes("coep-spoke");
        const hasMmcoep = labels.includes("mmcoep-spoke");
        const hasRit = labels.includes("rit-spoke");
        
        // Match the epic to the correct campus spoke board loop iteration
        if (boardId === "3" && (hasRit || hasCoep || hasMmcoep)) continue;
        if (boardId === "101" && !hasCoep) continue;
        if (boardId === "102" && !hasMmcoep) continue;
        if (boardId === "103" && !hasRit) continue;

        const summary = epic.fields.summary || "";
        const match = summary.match(/^\[(.*?)\]\s*(.*)$/);
        if (match) {
          const company = match[1].trim();
          const title = match[2].trim();
          
          const project = companyProjectsIntake.find(p => 
            p.company.toLowerCase() === company.toLowerCase() &&
            p.title.toLowerCase() === title.toLowerCase()
          );
          
          if (project) {
            project.status = "Active";
            project.assignedTo = spoke.name;
            project.targetCampusId = boardId;
            project.assignedKey = epic.key;
            project.proposedDueDate = epic.fields.duedate || project.proposedDueDate;
            console.log(`Synced accepted project: ${project.title} is Active at ${spoke.name} (Key: ${epic.key})`);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to sync spoke ${spoke.name} with Jira on startup:`, err.message);
    }
  }
}

app.listen(5000, () => {
  console.log("Server running on port 5000");
  syncAcceptedProjectsWithJira();
});