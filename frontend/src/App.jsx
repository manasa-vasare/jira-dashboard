import { useEffect, useState, useMemo } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
} from "@hello-pangea/dnd";
import axios from "axios";

// Modern Lucide-style Icon setup using React Icons Fa
import {
  FaTasks,
  FaChartPie,
  FaBell,
  FaSearch,
  FaFilter,
  FaPlus,
  FaTimes,
  FaCheck,
  FaTrashAlt,
  FaSyncAlt,
  FaChevronLeft,
  FaChevronRight,
  FaInfoCircle,
  FaRegLightbulb,
  FaEnvelope,
  FaPaperPlane,
  FaExclamationTriangle,
  FaSun,
  FaMoon,
  FaBriefcase,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaUser
} from "react-icons/fa";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Utility date calculator to evaluate task deadline details
const getDeadlineInfo = (dueDate, statusName) => {
  if (!dueDate) return null;
  if (statusName === "Done") {
    return { text: "Completed", type: "completed" };
  }

  const today = new Date("2026-05-26"); // Project baseline local time context
  const due = new Date(dueDate);

  // Reset hours to evaluate day differences only
  const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffTime = dDue.getTime() - dToday.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Overdue by ${Math.abs(diffDays)}d`, type: "overdue" };
  } else if (diffDays === 0) {
    return { text: "Due Today", type: "soon" };
  } else if (diffDays <= 2) {
    return { text: `Due in ${diffDays}d`, type: "soon" };
  } else {
    return { text: `${diffDays} days left`, type: "on-track" };
  }
};

const SPOKES = {
  "3": { name: "KLE Spoke", key: "AK", live: true },
  "101": { name: "COEP Spoke", key: "AK", live: true },
  "102": { name: "MMCOEP Spoke", key: "AK", live: true },
  "103": { name: "RIT Spoke", key: "AK", live: true }
};

function App() {
  // Authentication & Session States
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("apnileap-auth") === "true";
  });
  const [sessionUser, setSessionUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("apnileap-user")) || null;
    } catch {
      return null;
    }
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Navigation & UI States
  const [activeView, setActiveView] = useState("dashboard"); // "dashboard" or "kanban"
  const [theme, setTheme] = useState(() => localStorage.getItem("app-theme") || "dark");

  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    const auth = localStorage.getItem("apnileap-auth") === "true";
    if (auth) {
      const persona = localStorage.getItem("apnileap-persona") || "moderator";
      return persona === "moderator" ? "hub" : persona;
    }
    return "hub";
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentPersona, setCurrentPersona] = useState(() => {
    return localStorage.getItem("apnileap-persona") || "moderator";
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Connecting to Jira...");
  const [hasError, setHasError] = useState(false);

  const [hubMetrics, setHubMetrics] = useState(null);
  const [isHubLoading, setIsHubLoading] = useState(true);

  // B2B Moderator Project Assignment states
  const [moderatorProjects, setModeratorProjects] = useState([]);
  const [isModeratorLoading, setIsModeratorLoading] = useState(false);
  const [selectedAssignProject, setSelectedAssignProject] = useState(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetCampus, setAssignTargetCampus] = useState("3");
  const [assignDueDate, setAssignDueDate] = useState("2026-08-25");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isRespondingToProject, setIsRespondingToProject] = useState(false);

  // Collaborative Sync Meetings states
  const [meetings, setMeetings] = useState([]);
  const [isMeetingsLoading, setIsMeetingsLoading] = useState(false);

  const currentBoardId = useMemo(() => {
    if (activeWorkspace === "spoke-coep") return "101";
    if (activeWorkspace === "spoke-mmcoep") return "102";
    if (activeWorkspace === "spoke-rit") return "103";
    if (activeWorkspace === "spoke-kle") return "3";
    return "3"; // default playground or fallback
  }, [activeWorkspace]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  // Role-Based Access Control Simulation Guard
  useEffect(() => {
    if (currentPersona !== "moderator") {
      setActiveWorkspace(currentPersona);
      setActiveView("dashboard");
    }
  }, [currentPersona]);


  // Core Data States
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [spokeMembers, setSpokeMembers] = useState([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterAssignee, setFilterAssignee] = useState("All");

  // Modal States & Premium Multi-tab details
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [modalTab, setModalTab] = useState("overview"); // "overview", "subtasks", "worklog", "links"
  const [worklogHistory, setWorklogHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [worklogTimeSpent, setWorklogTimeSpent] = useState("");
  const [worklogComment, setWorklogComment] = useState("");
  const [subtaskInputSummary, setSubtaskInputSummary] = useState("");
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState("");
  const [linkTargetKey, setLinkTargetKey] = useState("");
  const [linkRelationType, setLinkRelationType] = useState("blocks");
  const [labelInputString, setLabelInputString] = useState("");

  // Email Alert States
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [emailTask, setEmailTask] = useState(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailAnimationState, setEmailAnimationState] = useState(""); // "preparing", "sending", "sent"

  // Toast State
  const [toasts, setToasts] = useState([]);

  // Create Task Form State
  const [newSummary, setNewSummary] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIssueType, setNewIssueType] = useState("Task");
  const [newAssignee, setNewAssignee] = useState("");
  const [newReporter, setNewReporter] = useState("");
  const [newPriority, setNewPriority] = useState("Medium");
  const [newStatus, setNewStatus] = useState("Backlog");
  const [newDueDate, setNewDueDate] = useState("");

  // Trigger Toast Notification
  const triggerToast = (message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const mapEmailToPersona = (email) => {
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail.endsWith("@apnileap.com") || cleanEmail === "admin" || cleanEmail === "moderator") {
      return "moderator";
    }
    if (cleanEmail.includes("kle") || cleanEmail.endsWith("@kletech.ac.in")) {
      return "spoke-kle";
    }
    if (cleanEmail.includes("mmcoep")) {
      return "spoke-mmcoep";
    }
    if (cleanEmail.includes("coep")) {
      return "spoke-coep";
    }
    if (cleanEmail.includes("rit")) {
      return "spoke-rit";
    }
    return null;
  };

  const handleLoginSubmit = (e) => {
    if (e) e.preventDefault();
    setLoginError("");

    if (!loginEmail.trim()) {
      setLoginError("Please enter your email address.");
      return;
    }

    const persona = mapEmailToPersona(loginEmail);
    if (!persona) {
      setLoginError("Invalid email address. Please use a recognized administrator or campus spoke domain.");
      return;
    }

    const displayName = loginEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const matchedUser = {
      email: loginEmail,
      displayName: displayName,
      role: persona === "moderator" ? "Central Moderator" : (SPOKES[persona === "spoke-kle" ? "3" : persona === "spoke-coep" ? "101" : persona === "spoke-mmcoep" ? "102" : "103"]?.name || "Campus") + " Coordinator"
    };

    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setIsAuthenticated(true);
      setSessionUser(matchedUser);
      setCurrentPersona(persona);
      setActiveWorkspace(persona === "moderator" ? "hub" : persona);

      localStorage.setItem("apnileap-auth", "true");
      localStorage.setItem("apnileap-user", JSON.stringify(matchedUser));
      localStorage.setItem("apnileap-persona", persona);

      triggerToast(`Logged in successfully as ${matchedUser.displayName}!`);
    }, 700);
  };

  const handleQuickConnect = (email, name, boardId, persona) => {
    setLoginEmail(email);
    setLoginPassword("••••••••");
    setLoginError("");
    setIsLoggingIn(true);

    setTimeout(() => {
      setIsLoggingIn(false);
      const matchedUser = {
        email: email,
        displayName: name,
        role: persona === "moderator" ? "Central Moderator" : (SPOKES[boardId]?.name || "Campus") + " Coordinator"
      };

      setIsAuthenticated(true);
      setSessionUser(matchedUser);
      setCurrentPersona(persona);
      setActiveWorkspace(persona === "moderator" ? "hub" : persona);

      localStorage.setItem("apnileap-auth", "true");
      localStorage.setItem("apnileap-user", JSON.stringify(matchedUser));
      localStorage.setItem("apnileap-persona", persona);

      triggerToast(`Quick Connected as ${matchedUser.displayName}! ⚡`);
    }, 800);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setSessionUser(null);
    setCurrentPersona("moderator");
    setActiveWorkspace("hub");
    setLoginEmail("");
    setLoginPassword("");
    
    localStorage.removeItem("apnileap-auth");
    localStorage.removeItem("apnileap-user");
    localStorage.removeItem("apnileap-persona");
    
    triggerToast("Logged out successfully.");
  };

  const fetchSpokeMembers = async (boardId) => {
    setIsMembersLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/spokes/${boardId}/members`);
      setSpokeMembers(res.data);
    } catch (err) {
      console.error("Failed to retrieve campus team members:", err);
    } finally {
      setIsMembersLoading(false);
    }
  };

  // Fetch Tasks from Real API
  const fetchJiraTasks = async (silent = false, customBoardId = null) => {
    if (!silent) setIsLoading(true);
    setHasError(false);
    try {
      const boardIdToFetch = customBoardId || currentBoardId;
      const response = await axios.get(`http://localhost:5000/tasks?boardId=${boardIdToFetch}`);
      if (Array.isArray(response.data)) {
        // Adapt Jira issues dynamically - pulls exact assignee, reporter, and due date
        const normalized = response.data.map((item) => ({
          id: item.id || `jira-${Date.now()}-${Math.random()}`,
          key: item.key || `JIRA-${item.id}`,
          fields: {
            summary: item.fields?.summary || "No Summary Provided",
            description: item.fields?.description || "No description set in Jira.",
            status: { name: item.fields?.status?.name || "Backlog" },
            priority: { name: item.fields?.priority?.name || "Medium" },
            issueType: item.fields?.issuetype?.name || "Task",
            assignee: item.fields?.assignee ? {
              accountId: item.fields.assignee.accountId,
              displayName: item.fields.assignee.displayName,
              avatarUrl: item.fields.assignee.avatarUrls?.["48x48"] || item.fields.assignee.avatarUrl || "https://i.pravatar.cc/150",
              email: item.fields.assignee.emailAddress || ""
            } : null,
            reporter: item.fields?.reporter ? {
              accountId: item.fields.reporter.accountId,
              displayName: item.fields.reporter.displayName,
              avatarUrl: item.fields.reporter.avatarUrls?.["48x48"] || item.fields.reporter.avatarUrl || "https://i.pravatar.cc/150",
              email: item.fields.reporter.emailAddress || ""
            } : null,
            created: item.fields?.created || new Date().toISOString(),
            dueDate: item.fields?.duedate || item.fields?.dueDate || null,
            flagged: (item.fields?.customfield_10021 && item.fields.customfield_10021.length > 0) || 
                     (item.fields?.Flagged && item.fields.Flagged.length > 0) || 
                     item.fields?.flagged === true || false,
            timetracking: item.fields?.timetracking ? {
              originalEstimate: item.fields.timetracking.originalEstimate || null,
              remainingEstimate: item.fields.timetracking.remainingEstimate || null,
              timeSpent: item.fields.timetracking.timeSpent || null,
              timeSpentSeconds: item.fields.timetracking.timeSpentSeconds || 0,
              originalEstimateSeconds: item.fields.timetracking.originalEstimateSeconds || 0,
              remainingEstimateSeconds: item.fields.timetracking.remainingEstimateSeconds || 0
            } : null,
            subtasks: item.fields?.subtasks ? item.fields.subtasks.map(sub => ({
              id: sub.id,
              key: sub.key,
              summary: sub.fields?.summary || sub.summary || "No Summary",
              statusName: sub.fields?.status?.name || sub.statusName || "Backlog"
            })) : [],
            issuelinks: item.fields?.issuelinks ? item.fields.issuelinks.map(link => {
              const linkedIssue = link.inwardIssue || link.outwardIssue;
              const direction = link.inwardIssue ? "is blocked by" : "blocks";
              return {
                id: link.id,
                type: link.type?.name || "Blocks",
                direction: direction,
                key: linkedIssue?.key,
                summary: linkedIssue?.fields?.summary || "No Summary",
                statusName: linkedIssue?.fields?.status?.name || "Backlog"
              };
            }) : [],
            labels: item.fields?.labels || [],
            parent: item.fields?.parent ? {
              id: item.fields.parent.id,
              key: item.fields.parent.key,
              summary: item.fields.parent.fields?.summary || "",
              issueType: item.fields.parent.fields?.issuetype?.name || ""
            } : null
          }
        }));
        setTasks(normalized);
        setConnectionStatus(currentBoardId === "3" ? "Connected to Jira Cloud" : `Connected to Spoke (${currentBoardId})`);
        if (!silent) {
          triggerToast("Successfully synchronized with Live Jira API!");
        }
        return normalized;
      } else {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      console.error("API Fetch Error:", error);
      setConnectionStatus("Offline - Connection Failed");
      setHasError(true);
      if (!silent) {
        triggerToast("Failed to connect to Jira backend. Make sure server is started.", "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Aggregated Hub Metrics for ApniLeap
  const fetchHubMetrics = async (silent = false) => {
    if (!silent) setIsHubLoading(true);
    setHasError(false);
    try {
      const response = await axios.get("http://localhost:5000/hub/metrics");
      setHubMetrics(response.data);
      setConnectionStatus("Connected to Jira Cloud (HUB)");
    } catch (error) {
      console.error("Hub Fetch Error:", error);
      setConnectionStatus("Offline - Connection Failed");
      setHasError(true);
      if (!silent) {
        triggerToast("Failed to aggregate Hub portfolio analytics. Make sure server is started.", "error");
      }
    } finally {
      setIsHubLoading(false);
    }
  };

  // Fetch incoming B2B projects for Moderator Intake
  const fetchModeratorProjects = async (silent = false) => {
    if (!silent) setIsModeratorLoading(true);
    setHasError(false);
    try {
      const response = await axios.get("http://localhost:5000/moderator/projects");
      setModeratorProjects(response.data);
      setConnectionStatus("Connected to Ingestion Portal");
    } catch (error) {
      console.error("Moderator Projects Fetch Error:", error);
      setConnectionStatus("Offline - Connection Failed");
      setHasError(true);
      if (!silent) {
        triggerToast("Failed to fetch moderator projects. Make sure server is started.", "error");
      }
    } finally {
      setIsModeratorLoading(false);
    }
  };

  // Fetch upcoming scheduled FIP sync meetings
  const fetchMeetings = async (silent = false) => {
    if (!silent) setIsMeetingsLoading(true);
    try {
      const response = await axios.get("http://localhost:5000/meetings");
      setMeetings(response.data);
    } catch (error) {
      console.error("Meetings Fetch Error:", error);
      if (!silent) {
        triggerToast("Failed to retrieve scheduled FIP sync meetings.", "error");
      }
    } finally {
      setIsMeetingsLoading(false);
    }
  };

  // Trigger project proposal assignment (Moderator)
  const handleAssignProject = async (e) => {
    e.preventDefault();
    if (!selectedAssignProject) return;

    setIsProvisioning(true);
    try {
      const response = await axios.post("http://localhost:5000/moderator/assign", {
        projectId: selectedAssignProject.id,
        targetBoardId: assignTargetCampus,
        dueDate: assignDueDate
      });

      if (response.data && response.data.success) {
        triggerToast(`Success! Proposal sent to ${response.data.assignedTo}. Awaiting coordinator review.`);
        setIsAssignModalOpen(false);
        fetchModeratorProjects(false);
      }
    } catch (error) {
      console.error("Assignment Error:", error);
      triggerToast(error.response?.data?.error || "Failed to propose project assignment.", "error");
    } finally {
      setIsProvisioning(false);
    }
  };

  // Spoke Coordinator accepts B2B Project assignment (Spoke)
  const handleAcceptProject = async (projectId) => {
    setIsRespondingToProject(true);
    try {
      const res = await axios.post(`http://localhost:5000/spoke/project/${projectId}/accept`, { targetBoardId: currentBoardId });
      if (res.data && res.data.success) {
        triggerToast("🎉 Project accepted! Jira workspace successfully provisioned with 3 standard Phase tasks!");
        fetchModeratorProjects(false);
        fetchJiraTasks(false); // Refresh Jira board immediately
      }
    } catch (err) {
      console.error("Acceptance Error:", err);
      triggerToast(err.response?.data?.error || "Failed to accept project assignment.", "error");
    } finally {
      setIsRespondingToProject(false);
    }
  };

  // Spoke Coordinator declines B2B Project assignment (Spoke)
  const handleDeclineProject = async (projectId) => {
    setIsRespondingToProject(true);
    try {
      const res = await axios.post(`http://localhost:5000/spoke/project/${projectId}/decline`, { targetBoardId: currentBoardId });
      if (res.data && res.data.success) {
        triggerToast("Proposal declined. Project returned to the Moderator assignment pool.");
        fetchModeratorProjects(false);
      }
    } catch (err) {
      console.error("Decline Error:", err);
      triggerToast(err.response?.data?.error || "Failed to decline project assignment.", "error");
    } finally {
      setIsRespondingToProject(false);
    }
  };

  // Re-fetch issues or hub metrics whenever activeWorkspace or currentBoardId changes
  useEffect(() => {
    fetchMeetings(true); // Fetch meetings silently to check for banner alerts
    if (activeWorkspace === "hub") {
      fetchHubMetrics(false);
    } else if (activeWorkspace === "moderator") {
      fetchModeratorProjects(false);
    } else if (activeWorkspace === "meetings") {
      fetchMeetings(false);
    } else {
      fetchJiraTasks(false);
      fetchSpokeMembers(currentBoardId);
      fetchModeratorProjects(true); // Fetch moderator projects silently to check for proposed B2B assignments
    }
  }, [activeWorkspace, currentBoardId]);

  // On component mount, automatically fetch active session user profile
  useEffect(() => {
    const fetchMyself = async () => {
      try {
        const res = await axios.get("http://localhost:5000/myself");
        setCurrentUser(res.data);
      } catch (err) {
        console.error("Failed to retrieve myself context:", err);
      }
    };
    fetchMyself();
  }, []);

  // Background Auto-Polling: silently refetches based on active view mode
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMeetings(true);
      if (activeWorkspace === "hub") {
        fetchHubMetrics(true);
      } else if (activeWorkspace === "moderator") {
        fetchModeratorProjects(true);
      } else if (activeWorkspace === "meetings") {
        fetchMeetings(true);
      } else {
        fetchJiraTasks(true);
        fetchSpokeMembers(currentBoardId);
      }
    }, 10000); // 10s auto-polling

    return () => clearInterval(interval);
  }, [activeWorkspace, currentBoardId]);

  // Dynamically extract all unique assignees and reporters present in active task lists (Live + Mock)
  // Ensures real Jira users are editable and filterable seamlessly.
  const activeAssignees = useMemo(() => {
    const list = [];
    if (currentUser && currentUser.accountId) {
      list.push({
        accountId: currentUser.accountId,
        name: currentUser.displayName,
        avatar: currentUser.avatarUrls?.["48x48"] || "https://i.pravatar.cc/150",
        email: currentUser.emailAddress || ""
      });
    }
    tasks.forEach(t => {
      if (t.fields.assignee) {
        const exists = list.some(m => m.accountId === t.fields.assignee.accountId);
        if (!exists) {
          list.push({
            accountId: t.fields.assignee.accountId,
            name: t.fields.assignee.displayName,
            avatar: t.fields.assignee.avatarUrl || "https://i.pravatar.cc/150",
            email: t.fields.assignee.email || ""
          });
        }
      }
      if (t.fields.reporter) {
        const exists = list.some(m => m.accountId === t.fields.reporter.accountId);
        if (!exists) {
          list.push({
            accountId: t.fields.reporter.accountId,
            name: t.fields.reporter.displayName,
            avatar: t.fields.reporter.avatarUrl || "https://i.pravatar.cc/150",
            email: t.fields.reporter.email || ""
          });
        }
      }
    });
    return list;
  }, [tasks, currentUser]);

  // Handle Search and Filter logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const summaryMatch = task.fields.summary
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());
      
      const keyMatch = task.key
        ?.toLowerCase()
        .includes(searchQuery.toLowerCase());
      
      const textMatch = summaryMatch || keyMatch;

      const priorityMatch =
        filterPriority === "All" ||
        task.fields.priority?.name === filterPriority;

      const assigneeMatch =
        filterAssignee === "All" ||
        (filterAssignee === "Unassigned" && !task.fields.assignee) ||
        task.fields.assignee?.displayName === filterAssignee;

      return textMatch && priorityMatch && assigneeMatch;
    });
  }, [tasks, searchQuery, filterPriority, filterAssignee]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const backlog = filteredTasks.filter(t => t.fields.status.name === "Backlog").length;
    const progress = filteredTasks.filter(t => t.fields.status.name === "In Progress").length;
    const done = filteredTasks.filter(t => t.fields.status.name === "Done").length;
    
    // Priorities
    const high = filteredTasks.filter(t => t.fields.priority.name === "High").length;
    const medium = filteredTasks.filter(t => t.fields.priority.name === "Medium").length;
    const low = filteredTasks.filter(t => t.fields.priority.name === "Low").length;

    // Overdue counts (not Done, and deadline was before today May 26, 2026)
    const overdue = filteredTasks.filter(t => {
      if (t.fields.status.name === "Done" || !t.fields.dueDate) return false;
      const today = new Date("2026-05-26");
      const due = new Date(t.fields.dueDate);
      const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const dDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      return dDue.getTime() < dToday.getTime();
    }).length;

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    return { total, backlog, progress, done, high, medium, low, overdue, completionRate };
  }, [filteredTasks]);

  // Recharts Chart Formats
  const statusPieData = [
    { name: "Backlog", value: metrics.backlog, color: "#f59e0b" },
    { name: "In Progress", value: metrics.progress, color: "#3b82f6" },
    { name: "Done", value: metrics.done, color: "#10b981" },
  ].filter(d => d.value > 0);

  const priorityBarData = [
    { name: "High Priority", count: metrics.high, fill: "#ef4444" },
    { name: "Medium Priority", count: metrics.medium, fill: "#f97316" },
    { name: "Low Priority", count: metrics.low, fill: "#22c55e" },
  ];

  // Assignee task loading aggregates
  const assigneeWorkloadData = useMemo(() => {
    const counts = {};
    filteredTasks.forEach(t => {
      const name = t.fields.assignee?.displayName || "Unassigned";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({
      name,
      tasks: count,
    }));
  }, [filteredTasks]);

  const todayMeetingsForSpoke = useMemo(() => {
    if (activeWorkspace === "hub" || activeWorkspace === "moderator" || activeWorkspace === "meetings" || activeWorkspace === "playground") return [];
    const campusId = currentBoardId;
    const todayStr = "2026-05-27";
    return meetings.filter(m => m.campusId === campusId && m.date === todayStr);
  }, [meetings, activeWorkspace, currentBoardId]);

  const todayConflictsForSpoke = useMemo(() => {
    const timeCounts = {};
    todayMeetingsForSpoke.forEach(m => {
      timeCounts[m.time] = (timeCounts[m.time] || 0) + 1;
    });
    return todayMeetingsForSpoke.filter(m => timeCounts[m.time] > 1);
  }, [todayMeetingsForSpoke]);

  const proposedProjectsForSpoke = useMemo(() => {
    if (activeWorkspace === "hub" || activeWorkspace === "moderator" || activeWorkspace === "meetings" || activeWorkspace === "playground") return [];
    const campusId = currentBoardId;
    const spoke = SPOKES[campusId];
    if (!spoke) return [];
    return moderatorProjects.filter(p => {
      if (p.allocations && p.allocations.length > 0) {
        return p.allocations.some(a => a.targetCampusId === campusId && a.status === "Proposed");
      }
      return p.status === "Proposed" && p.targetCampusId === campusId;
    });
  }, [moderatorProjects, activeWorkspace, currentBoardId]);

  const acceptedProjectsForSpoke = useMemo(() => {
    if (activeWorkspace === "hub" || activeWorkspace === "moderator" || activeWorkspace === "meetings" || activeWorkspace === "playground") return [];
    const campusId = currentBoardId;
    return moderatorProjects.filter(p => {
      if (p.allocations && p.allocations.length > 0) {
        return p.allocations.some(a => a.targetCampusId === campusId && a.status === "Active");
      }
      return p.status === "Active" && p.targetCampusId === campusId;
    });
  }, [moderatorProjects, activeWorkspace, currentBoardId]);

  // Dynamically resolve child checklist issues for both Epic and Standard parent tasks
  const currentTaskChildren = useMemo(() => {
    if (!selectedTask) return [];
    
    // For Epic, find all tasks that list this Epic as their parent in our state
    if (selectedTask.fields.issueType === "Epic") {
      return tasks.filter(t => t.fields.parent?.key === selectedTask.key).map(t => ({
        id: t.id,
        key: t.key,
        summary: t.fields.summary,
        statusName: t.fields.status.name,
        assignee: t.fields.assignee
      }));
    }
    
    // For standard issues, look for children in the task list OR fall back to fields.subtasks
    const childrenFromList = tasks.filter(t => t.fields.parent?.key === selectedTask.key).map(t => ({
      id: t.id,
      key: t.key,
      summary: t.fields.summary,
      statusName: t.fields.status.name,
      assignee: t.fields.assignee
    }));
    
    if (childrenFromList.length > 0) {
      return childrenFromList;
    }
    
    return (selectedTask.fields.subtasks || []).map(sub => {
      // Try to resolve assignee/full info from list
      const resolved = tasks.find(t => t.key === sub.key);
      return {
        id: sub.id,
        key: sub.key,
        summary: sub.summary,
        statusName: resolved ? resolved.fields.status.name : sub.statusName,
        assignee: resolved ? resolved.fields.assignee : null
      };
    });
  }, [selectedTask, tasks]);

  // Drag and Drop DragEnd Action
  const onDragEnd = (result) => {
    if (currentPersona === "moderator") {
      triggerToast("Access Denied: Moderators have read-only progress tracking permission on spoke boards.", "error");
      return;
    }
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return;

    // Map column ID to actual status name
    const statusMap = {
      "col-backlog": "Backlog",
      "col-progress": "In Progress",
      "col-done": "Done",
    };
    
    const newStatus = statusMap[destination.droppableId];
    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;
    
    const taskKey = task.key;
    
    // 1. Optimistic update in state
    setTasks(prevTasks => {
      return prevTasks.map(t => {
        if (t.id === draggableId) {
          return {
            ...t,
            fields: {
              ...t.fields,
              status: { name: newStatus }
            }
          };
        }
        return t;
      });
    });
    
    triggerToast(`Transitioning ${taskKey} to ${newStatus} in Jira...`);
    
    // 2. Perform live API status transition
    axios.post(`http://localhost:5000/tasks/${taskKey}/transition`, { statusName: newStatus })
      .then(() => {
        triggerToast(`Successfully transitioned ${taskKey} to ${newStatus} in Jira!`);
      })
      .catch(err => {
        console.error("Transition API Error:", err);
        triggerToast(`Failed to transition issue ${taskKey} in Jira. Reverting...`, "error");
        fetchJiraTasks(true); // Silent fetch to revert back to true Jira state
      });
  };

  // Create Task Action inside Jira Project
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newSummary.trim()) {
      triggerToast("Please enter a task summary title", "warning");
      return;
    }

    const assignedUser = spokeMembers.find(m => m.displayName === newAssignee);
    const assignedReporterUser = spokeMembers.find(m => m.displayName === newReporter);

    const payload = {
      summary: newSummary,
      description: newDescription || "No description provided.",
      statusName: newStatus,
      priorityName: newPriority,
      assigneeId: assignedUser ? assignedUser.accountId : null,
      reporterId: assignedReporterUser ? assignedReporterUser.accountId : null,
      dueDate: newDueDate || null,
      issueTypeName: newIssueType,
      boardId: currentBoardId
    };

    setIsLoading(true);
    try {
      const res = await axios.post("http://localhost:5000/tasks", payload);
      triggerToast(`Created task ${res.data.key} in Jira successfully!`);
      
      // Reset Form
      setNewSummary("");
      setNewDescription("");
      setNewIssueType("Task");
      setNewAssignee("");
      setNewReporter("");
      setNewPriority("Medium");
      setNewStatus("Backlog");
      setNewDueDate("");
      setIsCreateOpen(false);
      
      // Silent fetch from Jira to update board
      await fetchJiraTasks(true);
    } catch (err) {
      console.error("Create issue error:", err);
      triggerToast("Failed to create issue in Jira.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Update Task fields inside Modal with live PUT to Jira
  const handleUpdateTaskDetail = async (updatedTask, changedField) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    setSelectedTask(updatedTask);

    try {
      if (changedField === "status") {
        triggerToast(`Transitioning ${updatedTask.key} to ${updatedTask.fields.status.name} in Jira...`);
        await axios.post(`http://localhost:5000/tasks/${updatedTask.key}/transition`, { statusName: updatedTask.fields.status.name });
        triggerToast(`Successfully transitioned ${updatedTask.key} to ${updatedTask.fields.status.name} in Jira!`);
      } else {
        const payload = {};
        if (changedField === "summary") payload.summary = updatedTask.fields.summary;
        if (changedField === "description") payload.description = updatedTask.fields.description;
        if (changedField === "dueDate") payload.dueDate = updatedTask.fields.dueDate;
        if (changedField === "assignee") payload.assignee = updatedTask.fields.assignee?.accountId || null;
        if (changedField === "reporter") payload.reporter = updatedTask.fields.reporter?.accountId || null;
        if (changedField === "priority") payload.priority = updatedTask.fields.priority?.name || null;

        triggerToast(`Saving ${changedField} updates for ${updatedTask.key} in Jira...`);
        await axios.put(`http://localhost:5000/tasks/${updatedTask.key}`, payload);
        triggerToast(`Successfully saved ${changedField} for ${updatedTask.key} in Jira!`);
      }
    } catch (err) {
      console.error("Update Issue API Error:", err);
      triggerToast(`Failed to update ${changedField} in Jira. Reverting...`, "error");
      fetchJiraTasks(true); // Silent reload to revert state
    }
  };

  // Toggle standard Jira issue impediment flag
  const handleToggleBlockerFlag = async (task) => {
    const nextFlagged = !task.fields.flagged;
    
    // 1. Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          fields: {
            ...t.fields,
            flagged: nextFlagged
          }
        };
      }
      return t;
    }));
    
    if (selectedTask && selectedTask.id === task.id) {
      setSelectedTask(prev => ({
        ...prev,
        fields: {
          ...prev.fields,
          flagged: nextFlagged
        }
      }));
    }

    try {
      triggerToast(nextFlagged ? `Flagging issue ${task.key} as BLOCKED...` : `Clearing blocker flag for ${task.key}...`, "warning");
      await axios.put(`http://localhost:5000/tasks/${task.key}/flag`, { flagged: nextFlagged });
      triggerToast(nextFlagged ? `Issue ${task.key} is now flagged as blocked!` : `Successfully cleared blocker flag for ${task.key}!`);
      await fetchJiraTasks(true);
    } catch (err) {
      console.error(err);
      triggerToast("Failed to update blocker status in Jira. Reverting...", "error");
      await fetchJiraTasks(true);
    }
  };

  // Log spent time on a task in Jira
  const handleLogWorkSpent = async (taskKey, timeSpentString, logComment) => {
    if (!timeSpentString.trim()) {
      triggerToast("Please specify time spent (e.g. 1h 30m, 45m)", "warning");
      return;
    }
    
    setIsLoading(true);
    try {
      triggerToast(`Logging ${timeSpentString} spent time to issue ${taskKey} in Jira...`);
      await axios.post(`http://localhost:5000/tasks/${taskKey}/worklog`, { timeSpent: timeSpentString, comment: logComment });
      triggerToast(`Successfully logged ${timeSpentString} to issue ${taskKey}!`);
      
      setWorklogTimeSpent("");
      setWorklogComment("");
      
      // Refetch worklogs immediately for the modal history
      const logsRes = await axios.get(`http://localhost:5000/tasks/${taskKey}/worklog`);
      setWorklogHistory(logsRes.data || []);
      
      await fetchJiraTasks(true);
      
      // Update selectedTask details with new timetracking metrics
      const updatedParent = tasks.find(t => t.key === taskKey);
      if (updatedParent) {
        setSelectedTask(updatedParent);
      }
    } catch (err) {
      console.error(err);
      triggerToast("Failed to log work in Jira.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Retrieve worklogs list for detail modal history
  const fetchWorklogHistory = async (taskKey) => {
    setIsHistoryLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/tasks/${taskKey}/worklog`);
      setWorklogHistory(res.data || []);
    } catch (err) {
      console.error("Fetch worklogs error:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Create a child subtask inside Jira parent issue
  const handleCreateSubtask = async (parentKey, subtaskSummary, assigneeId = null, parentIssueType = null) => {
    if (!subtaskSummary.trim()) {
      triggerToast("Please enter a task summary", "warning");
      return;
    }
    
    setIsLoading(true);
    try {
      const isEpic = parentIssueType && parentIssueType.toLowerCase() === "epic";
      const label = isEpic ? "child task" : "child subtask";
      triggerToast(`Creating ${label} under ${parentKey} in Jira...`);
      
      await axios.post(`http://localhost:5000/tasks/${parentKey}/subtask`, {
        summary: subtaskSummary,
        assigneeId: assigneeId || null,
        parentIssueType: parentIssueType || null
      });
      triggerToast(`Created ${label} successfully!`);
      
      setSubtaskInputSummary("");
      setSubtaskAssigneeId("");
      
      // Fetch fresh board tasks
      const latestTasks = await fetchJiraTasks(true);
      
      // Refresh the selected task modal view to include the new subtask
      if (Array.isArray(latestTasks)) {
        const updatedParent = latestTasks.find(t => t.key === parentKey);
        if (updatedParent) {
          setSelectedTask(updatedParent);
        }
      }
    } catch (err) {
      console.error(err);
      triggerToast("Failed to create child task in Jira.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Link two tickets on the board in Jira
  const handleLinkIssues = async (sourceKey, targetKey, relationType) => {
    if (!targetKey) {
      triggerToast("Please select a target issue to link with", "warning");
      return;
    }
    
    setIsLoading(true);
    try {
      triggerToast(`Linking issue ${sourceKey} to ${targetKey} in Jira...`);
      await axios.post(`http://localhost:5000/tasks/links`, { linkType: relationType, sourceKey, targetKey });
      triggerToast(`Issues successfully linked in Jira!`);
      
      setLinkTargetKey("");
      
      await fetchJiraTasks(true);
      
      // Refresh selected task inside modal view to reflect links
      const updatedParent = tasks.find(t => t.key === sourceKey);
      if (updatedParent) {
        setSelectedTask(updatedParent);
      }
    } catch (err) {
      console.error(err);
      triggerToast("Failed to link issues in Jira.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Update Custom labels string array in Jira
  const handleUpdateLabels = async (taskKey, newLabelsArray) => {
    try {
      // 1. Optimistic update
      setTasks(prev => prev.map(t => {
        if (t.key === taskKey) {
          return { ...t, fields: { ...t.fields, labels: newLabelsArray } };
        }
        return t;
      }));
      
      if (selectedTask && selectedTask.key === taskKey) {
        setSelectedTask(prev => ({
          ...prev,
          fields: { ...prev.fields, labels: newLabelsArray }
        }));
      }

      await axios.put(`http://localhost:5000/tasks/${taskKey}/labels`, { labels: newLabelsArray });
      triggerToast(`Saved tags for ${taskKey} in Jira!`);
    } catch (err) {
      console.error(err);
      triggerToast("Failed to save labels in Jira.", "error");
      await fetchJiraTasks(true);
    }
  };

  // Delete Task Action from Jira
  const handleDeleteTask = async (taskId, taskKey) => {
    setIsLoading(true);
    try {
      triggerToast(`Deleting issue ${taskKey} from Jira...`, "warning");
      await axios.delete(`http://localhost:5000/tasks/${taskKey}`);
      triggerToast(`Permanently deleted issue ${taskKey} from Jira!`, "warning");
      setSelectedTask(null);
      await fetchJiraTasks(true);
    } catch (err) {
      console.error("Delete Task API Error:", err);
      const jiraErr = err.response?.data?.details?.errorMessages?.[0] || err.response?.data?.message || null;
      if (jiraErr) {
        triggerToast(`Jira Error: ${jiraErr}`, "error");
      } else {
        triggerToast(`Failed to delete issue ${taskKey} in Jira.`, "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Open Email Composer Modal with Real Sender Profile Signature
  const handleOpenEmailComposer = (task) => {
    const assigneeName = task.fields.assignee?.displayName || "Team Member";
    // Check if the task assignee has a real email address fetched from Jira, or leave empty for editing!
    const assigneeEmail = task.fields.assignee?.email || "";
    
    setEmailTask(task);
    setEmailRecipient(assigneeEmail);
    setEmailSubject(`[URGENT REMINDER] Upcoming deadline for task ${task.key}`);
    
    const senderName = currentUser?.displayName || "Jira Administrator";
    const bodyText = `Hi ${assigneeName},\n\nThis is a friendly reminder that task ${task.key} ("${task.fields.summary}") has an active due date of ${task.fields.dueDate || "N/A"} and is currently in status "${task.fields.status?.name}".\n\nPlease update the status or notify us if any adjustment is needed.\n\nBest regards,\n${senderName} (Jira Dashboard)`;
    
    setEmailBody(bodyText);
    setSelectedTask(null); // Close detail modal
    setIsEmailOpen(true);
    setEmailAnimationState("preparing");
  };

  // Trigger outbound email dispatcher (with envelope fly animation)
  const handleSendReminderEmail = (e) => {
    e.preventDefault();
    setIsSendingEmail(true);
    setEmailAnimationState("sending");

    const payload = {
      recipient: emailRecipient,
      subject: emailSubject,
      taskKey: emailTask?.key || "APNI-REMINDER",
      taskSummary: emailTask?.fields?.summary || "",
      dueDate: emailTask?.fields?.dueDate || "",
      message: emailBody
    };

    // Duration of envelope flight animation: 2.2 seconds
    setTimeout(() => {
      axios.post("http://localhost:5000/tasks/send-reminder", payload)
        .then(res => {
          triggerToast(res.data.message || `Dispatched alert successfully to ${emailRecipient}!`);
          if (res.data.previewUrl) {
            triggerToast("SMTP Preview opening in a new tab...");
            window.open(res.data.previewUrl, "_blank");
          }
        })
        .catch(err => {
          console.error(err);
          triggerToast("Relay Failed. Make sure SMTP server settings or backend is running.", "error");
        })
        .finally(() => {
          setIsSendingEmail(false);
          setIsEmailOpen(false);
          setEmailAnimationState("sent");
        });
    }, 2200);
  };

  // Helper styles for drag and drop column states
  const getColumnStyle = (isDraggingOver) => ({
    background: isDraggingOver ? "rgba(99, 102, 241, 0.08)" : "rgba(11, 15, 26, 0.4)",
    border: isDraggingOver ? "1.5px dashed var(--primary)" : "1.5px solid var(--border-glass)",
    borderRadius: "14px",
    padding: "16px",
    minHeight: "550px",
    transition: "var(--transition-smooth)",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "14px"
  });

  if (!isAuthenticated) {
    const recognizedPersona = mapEmailToPersona(loginEmail);

    return (
      <div style={{
        display: "flex",
        minHeight: "100vh",
        width: "100vw",
        background: "var(--bg-main)",
        fontFamily: "var(--font-sans)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* Floating background blur bubbles that change color by theme */}
        <div className="float-bg-1" style={{
          position: "absolute",
          top: "5%",
          right: "10%",
          width: "400px",
          height: "400px",
          background: "var(--primary-glow)",
          borderRadius: "50%",
          filter: "blur(90px)",
          pointerEvents: "none",
          zIndex: 1
        }} />
        <div className="float-bg-2" style={{
          position: "absolute",
          bottom: "5%",
          left: "5%",
          width: "400px",
          height: "400px",
          background: "rgba(34, 211, 238, 0.1)",
          borderRadius: "50%",
          filter: "blur(90px)",
          pointerEvents: "none",
          zIndex: 1
        }} />

        {/* Global theme selection toggle overlay */}
        <div style={{
          position: "absolute",
          top: "24px",
          right: "24px",
          display: "flex",
          alignItems: "center",
          background: "var(--bg-card)",
          border: "1px solid var(--border-glass)",
          padding: "4px",
          borderRadius: "99px",
          boxShadow: "var(--shadow-premium)",
          zIndex: 100
        }}>
          {[
            { name: "dark", label: "Dark", icon: <FaMoon size={12} /> },
            { name: "light", label: "Light", icon: <FaSun size={12} /> }
          ].map(t => (
            <button
              key={t.name}
              type="button"
              onClick={() => setTheme(t.name)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "99px",
                background: theme === t.name ? "linear-gradient(135deg, var(--primary), var(--secondary))" : "transparent",
                color: theme === t.name ? "var(--text-primary-btn)" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
                fontWeight: "700",
                fontSize: "11px",
                transition: "var(--transition-smooth)"
              }}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Major full screen split layout container */}
        <div style={{
          width: "100%",
          minHeight: "100vh",
          display: "flex",
          zIndex: 2,
          position: "relative"
        }}>
          
          {/* Left panel: Overlapping radial gradient 3D spheres & Welcome details */}
          <div style={{
            flex: "1 1 60%",
            maxWidth: "60%",
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.85), rgba(8, 145, 178, 0.9))",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px",
            borderRight: "1px solid var(--border-glass)"
          }}>
            {/* Embedded overlapping gradient 3D Spheres */}
            <div className="login-sphere sphere-1" style={{ top: "-60px", left: "-60px" }} />
            <div className="login-sphere sphere-2" style={{ bottom: "-80px", right: "-40px" }} />
            <div className="login-sphere sphere-3" style={{ top: "35%", left: "30%" }} />
            
            {/* Branding Orb Logo */}
            <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                background: "white",
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "900",
                color: "#0d9488",
                fontSize: "18px",
                boxShadow: "0 4px 15px rgba(0, 0, 0, 0.15)"
              }}>
                AL
              </div>
              <span style={{ fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px", color: "white" }}>
                ApniLeap <span style={{ opacity: 0.85, fontWeight: "400" }}>Hub</span>
              </span>
            </div>

            {/* Core welcome text matching reference picture layout */}
            <div style={{ position: "relative", zIndex: 10, margin: "auto 0" }}>
              <h1 style={{
                fontSize: "44px",
                fontWeight: "900",
                color: "white",
                lineHeight: "1.1",
                letterSpacing: "-1px",
                margin: "0 0 10px 0"
              }}>
                WELCOME
              </h1>
              <h2 style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "rgba(255, 255, 255, 0.9)",
                textTransform: "uppercase",
                letterSpacing: "2px",
                marginBottom: "20px"
              }}>
                Campus Governance Portal
              </h2>
              <p style={{
                fontSize: "13.5px",
                color: "rgba(255, 255, 255, 0.8)",
                lineHeight: "1.6",
                fontWeight: "400",
                maxWidth: "340px",
                margin: "0 0 30px 0"
              }}>
                A robust multi-tenant Agile collaboration suite powered by live Jira Cloud. Experience absolute campus workspace isolation with central Moderator ingestion pathways.
              </p>

              {/* Quick Connect demo panel inside left visual panel */}
              <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.15)", paddingTop: "20px", maxWidth: "420px" }}>
                <span style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "900",
                  color: "rgba(255, 255, 255, 0.7)",
                  textTransform: "uppercase",
                  letterSpacing: "1.2px",
                  marginBottom: "12px"
                }}>
                  ⚡ Quick Demo Connect
                </span>
                
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px"
                }}>
                  <button
                    type="button"
                    onClick={() => handleQuickConnect("admin@apnileap.com", "Central Admin", "hub", "moderator")}
                    style={{
                      gridColumn: "span 2",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.12)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      color: "white",
                      fontWeight: "700",
                      fontSize: "12px",
                      cursor: "pointer",
                      transition: "var(--transition-smooth)"
                    }}
                    title="Connect as Central Moderator Admin"
                  >
                    👑 Central Moderator Admin
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickConnect("coordinator@kle.edu", "KLE Coordinator", "3", "spoke-kle")}
                    style={{
                      padding: "9px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "white",
                      fontWeight: "600",
                      fontSize: "11.5px",
                      cursor: "pointer",
                      transition: "var(--transition-smooth)"
                    }}
                  >
                    🏢 KLE Spoke (Live)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickConnect("coordinator@coep.edu", "COEP Coordinator", "101", "spoke-coep")}
                    style={{
                      padding: "9px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "white",
                      fontWeight: "600",
                      fontSize: "11.5px",
                      cursor: "pointer",
                      transition: "var(--transition-smooth)"
                    }}
                  >
                    🏢 COEP Spoke
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickConnect("coordinator@mmcoep.edu", "MMCOEP Coordinator", "102", "spoke-mmcoep")}
                    style={{
                      padding: "9px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "white",
                      fontWeight: "600",
                      fontSize: "11.5px",
                      cursor: "pointer",
                      transition: "var(--transition-smooth)"
                    }}
                  >
                    🏢 MMCOEP Spoke
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickConnect("coordinator@rit.edu", "RIT Coordinator", "103", "spoke-rit")}
                    style={{
                      padding: "9px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "white",
                      fontWeight: "600",
                      fontSize: "11.5px",
                      cursor: "pointer",
                      transition: "var(--transition-smooth)"
                    }}
                  >
                    🏢 RIT Spoke
                  </button>
                </div>
              </div>
            </div>

            {/* Footer trademark or copyright */}
            <div style={{ position: "relative", zIndex: 10 }}>
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.6)", fontWeight: "500" }}>
                Powered by Jira Cloud API Integration
              </span>
            </div>
          </div>

          {/* Right panel: Modern Sign In form with icons and show password */}
          <div style={{
            flex: "1 1 40%",
            maxWidth: "40%",
            padding: "60px 80px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "var(--bg-main)",
            position: "relative",
            minHeight: "100vh"
          }}>
            <div style={{ maxWidth: "450px", width: "100%", margin: "0 auto" }}>
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-main)", marginBottom: "6px", letterSpacing: "-0.5px" }}>
                  Sign In
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Enter your campus spoke or administrative email to connect.
                </p>
              </div>

            <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {loginError && (
                <div style={{
                  padding: "11px 14px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  color: "#ef4444",
                  fontSize: "12.5px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}>
                  ⚠️ {loginError}
                </div>
              )}

              {/* Email Input Field */}
              <div>
                <label style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px"
                }}>
                  Email Address
                </label>
                <div style={{ position: "relative" }}>
                  <FaEnvelope style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-dim)",
                    fontSize: "14px"
                  }} />
                  <input
                    type="text"
                    placeholder="coordinator@kle.edu or admin@apnileap.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px 12px 42px",
                      borderRadius: "10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-glass)",
                      color: "var(--text-main)",
                      outline: "none",
                      fontSize: "14px",
                      transition: "var(--transition-smooth)"
                    }}
                  />
                </div>
                
                {/* Dynamic Persona Indicator badge */}
                {recognizedPersona && (
                  <div style={{
                    marginTop: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    background: recognizedPersona === "moderator" ? "rgba(251, 146, 60, 0.12)" : "rgba(45, 212, 191, 0.12)",
                    border: recognizedPersona === "moderator" ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid rgba(45, 212, 191, 0.2)",
                    color: recognizedPersona === "moderator" ? "var(--accent)" : "var(--primary)",
                    fontSize: "11.5px",
                    fontWeight: "700",
                    animation: "slideIn 0.2s ease-out"
                  }}>
                    {recognizedPersona === "moderator" ? "👑 Central Moderator (Admin)" : `🏢 ${recognizedPersona.replace("spoke-", "").toUpperCase()} Spoke Coordinator`}
                  </div>
                )}
              </div>

              {/* Password Input Field */}
              <div>
                <label style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "800",
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px"
                }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <FaLock style={{
                    position: "absolute",
                    left: "14px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-dim)",
                    fontSize: "14px"
                  }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 65px 12px 42px",
                      borderRadius: "10px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-glass)",
                      color: "var(--text-main)",
                      outline: "none",
                      fontSize: "14px",
                      transition: "var(--transition-smooth)"
                    }}
                  />
                  {/* SHOW / HIDE Password button */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: "11px",
                      fontWeight: "800",
                      cursor: "pointer",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      outline: "none",
                      padding: "4px"
                    }}
                  >
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              {/* Remember me & Forgot Password */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input type="checkbox" style={{ accentColor: "var(--primary)" }} />
                  <span>Remember me</span>
                </label>
                <a href="#forgot" onClick={(e) => { e.preventDefault(); triggerToast("Password recovery is handled by your local campus AD server.", "info"); }} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: "600" }}>
                  Forgot Password?
                </a>
              </div>

              {/* Submit Sign In button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                style={{
                  marginTop: "10px",
                  padding: "13px 20px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                  color: "var(--text-primary-btn)",
                  border: "none",
                  fontWeight: "800",
                  fontSize: "14.5px",
                  cursor: isLoggingIn ? "not-allowed" : "pointer",
                  boxShadow: "0 6px 15px var(--primary-glow)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  opacity: isLoggingIn ? 0.8 : 1,
                  transition: "var(--transition-smooth)"
                }}
              >
                {isLoggingIn ? (
                  <>
                    <FaSyncAlt className="pulse-glow" style={{ animation: "pulseGlow 1.5s infinite linear" }} />
                    <span>Connecting to Live Jira Hub...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <span>🚀</span>
                  </>
                )}
              </button>
            </form>
            </div> {/* Closing the maxWidth wrapper */}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-main)" }}>
      
      {/* Visual Animation Keyframes Injection */}
      <style>{`
        @keyframes envelopeSlide {
          0% { transform: translateY(50px) scale(0.8); opacity: 0; }
          20% { transform: translateY(0) scale(1); opacity: 1; }
          80% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-300px) scale(0.3) rotate(15deg); opacity: 0; }
        }
        @keyframes paperInsert {
          0% { transform: translateY(0); opacity: 1; }
          40% { transform: translateY(24px); opacity: 0.8; }
          50%, 100% { transform: translateY(40px); opacity: 0; }
        }
        @keyframes pulseWarning {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        .overdue-badge-blink {
          animation: pulseWarning 1.5s infinite ease-in-out;
          background: var(--priority-high-bg) !important;
          border-color: var(--priority-high-border) !important;
          color: var(--priority-high-text) !important;
        }
        @keyframes blockedBorderGlow {
          0%, 100% { border-color: rgba(249, 115, 22, 0.35); box-shadow: 0 0 4px rgba(249, 115, 22, 0.15); }
          50% { border-color: rgba(249, 115, 22, 0.95); box-shadow: 0 0 12px rgba(249, 115, 22, 0.35); }
        }
        .kanban-card-blocked {
          animation: blockedBorderGlow 2s infinite ease-in-out !important;
          border-style: dashed !important;
          border-width: 1.5px !important;
        }
      `}</style>

      {/* SIDEBAR COMPONENT */}
      <aside
        style={{
          width: isSidebarCollapsed ? "80px" : "280px",
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-glass)",
          display: "flex",
          flexDirection: "column",
          padding: "24px 16px",
          transition: "var(--transition-smooth)",
          zIndex: 10,
        }}
      >
        {/* Sidebar Header / Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
          {!isSidebarCollapsed && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                color: "white",
                fontSize: "18px"
              }}>
                DB
              </div>
              <span style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "-0.5px" }}>
                Dashboard
              </span>
            </div>
          )}
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: isSidebarCollapsed ? "center" : "auto",
              margin: isSidebarCollapsed ? "0 auto" : "0"
            }}
          >
            {isSidebarCollapsed ? <FaChevronRight size={18} /> : <FaChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, overflowY: "auto", paddingRight: "4px" }}>
          
          {/* Multi-Tenant Persona Access Controller (Admin Only) */}
          {!isSidebarCollapsed && sessionUser && sessionUser.role === "Central Moderator" && (
            <div className="glass-panel" style={{
              padding: "12px 14px",
              marginBottom: "12px",
              background: theme === "dark" ? "rgba(255, 255, 255, 0.02)" : "rgba(13, 148, 136, 0.03)",
              border: "1px solid var(--border-glass)",
              borderRadius: "12px",
              marginTop: "4px"
            }}>
              <label style={{
                display: "block",
                fontSize: "9px",
                fontWeight: "900",
                color: "var(--text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                marginBottom: "8px"
              }}>
                👤 Active Profile Role
              </label>
              <select
                value={currentPersona}
                onChange={(e) => {
                  const newPersona = e.target.value;
                  setCurrentPersona(newPersona);
                  const name = newPersona === "moderator" ? "Central Moderator" : SPOKES[newPersona.replace("spoke-", "")]?.name;
                  triggerToast(`Switched Profile: Active permissions set to ${name}`);
                }}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-main)",
                  borderRadius: "8px",
                  padding: "8px 10px",
                  fontSize: "12.5px",
                  fontWeight: "700",
                  width: "100%",
                  outline: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)"
                }}
              >
                <option value="moderator">👑 Central Moderator (Full)</option>
                <option value="spoke-kle">🏢 KLE Coordinator (Private)</option>
                <option value="spoke-coep">🏢 COEP Coordinator (Private)</option>
                <option value="spoke-mmcoep">🏢 MMCOEP Coordinator (Private)</option>
                <option value="spoke-rit">🏢 RIT Coordinator (Private)</option>
              </select>
            </div>
          )}

          {/* Section 1: ACTIVE VIEW MODE (Hidden if viewing Hub or Moderator) */}
          {activeWorkspace !== "hub" && activeWorkspace !== "moderator" && activeWorkspace !== "meetings" && (
            <>
              <div style={{ fontSize: "9px", fontWeight: "850", textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "1px", paddingLeft: "12px", marginTop: "8px", marginBottom: "4px" }}>
                {!isSidebarCollapsed && "View Mode"}
              </div>
              <SidebarNavItem
                active={activeView === "dashboard"}
                icon={<FaChartPie size={16} />}
                label="Analytics Dashboard"
                collapsed={isSidebarCollapsed}
                onClick={() => setActiveView("dashboard")}
              />
              <SidebarNavItem
                active={activeView === "kanban"}
                icon={<FaTasks size={16} />}
                label="Kanban Board"
                collapsed={isSidebarCollapsed}
                onClick={() => setActiveView("kanban")}
              />
              <hr style={{ border: "none", borderTop: "1px solid var(--border-glass)", margin: "8px 0" }} />
            </>
          )}



          {/* Section 3: APNILEAP SUITE */}
          <div style={{ fontSize: "9px", fontWeight: "850", textTransform: "uppercase", color: "var(--text-dim)", letterSpacing: "1px", paddingLeft: "12px", marginTop: "4px", marginBottom: "4px" }}>
            {!isSidebarCollapsed && "ApniLeap Portfolio"}
          </div>
          
          {currentPersona === "moderator" && (
            <>
              <SidebarNavItem
                active={activeWorkspace === "hub"}
                icon={<span style={{ fontSize: "16px" }}>🌐</span>}
                label="Executive HUB"
                collapsed={isSidebarCollapsed}
                onClick={() => setActiveWorkspace("hub")}
              />
              <SidebarNavItem
                active={activeWorkspace === "moderator"}
                icon={<FaBriefcase size={16} style={{ color: "var(--accent)" }} />}
                label="Moderator Portal"
                collapsed={isSidebarCollapsed}
                onClick={() => setActiveWorkspace("moderator")}
              />
              <SidebarNavItem
                active={activeWorkspace === "meetings"}
                icon={<span style={{ fontSize: "16px" }}>📅</span>}
                label="Meetings & Syncs"
                collapsed={isSidebarCollapsed}
                onClick={() => setActiveWorkspace("meetings")}
              />
            </>
          )}

          {/* Spoke Campuses list: Restricted to active Persona if locked */}
          {(currentPersona === "moderator" || currentPersona === "spoke-kle") && (
            <SidebarNavItem
              active={activeWorkspace === "spoke-kle"}
              icon={<span style={{ fontWeight: "800", color: "var(--primary)" }}>🏢</span>}
              label="KLE Spoke (Live)"
              collapsed={isSidebarCollapsed}
              onClick={() => {
                setActiveWorkspace("spoke-kle");
                setActiveView("dashboard");
              }}
            />
          )}
          {(currentPersona === "moderator" || currentPersona === "spoke-coep") && (
            <SidebarNavItem
              active={activeWorkspace === "spoke-coep"}
              icon={<span style={{ fontWeight: "800", color: "var(--secondary)" }}>🏢</span>}
              label="COEP Spoke (Live)"
              collapsed={isSidebarCollapsed}
              onClick={() => {
                setActiveWorkspace("spoke-coep");
                setActiveView("dashboard");
              }}
            />
          )}
          {(currentPersona === "moderator" || currentPersona === "spoke-mmcoep") && (
            <SidebarNavItem
              active={activeWorkspace === "spoke-mmcoep"}
              icon={<span style={{ fontWeight: "800", color: "var(--accent)" }}>🏢</span>}
              label="MMCOEP Spoke (Live)"
              collapsed={isSidebarCollapsed}
              onClick={() => {
                setActiveWorkspace("spoke-mmcoep");
                setActiveView("dashboard");
              }}
            />
          )}
          {(currentPersona === "moderator" || currentPersona === "spoke-rit") && (
            <SidebarNavItem
              active={activeWorkspace === "spoke-rit"}
              icon={<span style={{ fontWeight: "800", color: "var(--primary)" }}>🏢</span>}
              label="RIT Spoke (Live)"
              collapsed={isSidebarCollapsed}
              onClick={() => {
                setActiveWorkspace("spoke-rit");
                setActiveView("dashboard");
              }}
            />
          )}
          
          <hr style={{ border: "none", borderTop: "1px solid var(--border-glass)", margin: "12px 0" }} />

          {/* Connection Status Indicator */}
          {!isSidebarCollapsed && (
            <div className="glass-panel" style={{ padding: "12px 14px", fontSize: "11px", border: "1px solid rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: hasError ? "#ef4444" : "#10b981",
                  display: "inline-block"
                }} className={hasError ? "" : "pulse-glow"}></span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{connectionStatus}</span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "10px", lineHeight: "1.3" }}>
                {hasError 
                  ? "Jira API server offline. Check logs."
                  : "Live tracking active. Background auto-polling enabled."}
              </p>
            </div>
          )}
        </nav>

        {/* Sidebar Footer User Detail */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "16px",
          borderTop: "1px solid var(--border-glass)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
            <img
              src={currentUser?.avatarUrls?.["48x48"] || "https://i.pravatar.cc/100?img=64"}
              alt="Logged user profile"
              style={{ width: "36px", height: "36px", borderRadius: "50%", border: "2px solid var(--primary)" }}
            />
            {!isSidebarCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontWeight: "600", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {sessionUser?.displayName || currentUser?.displayName || "Jira Administrator"}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                  {sessionUser?.role || "Active Session"}
                </span>
              </div>
            )}
          </div>
          {!isSidebarCollapsed && (
            <button
              onClick={handleLogout}
              title="Log Out"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "#f87171",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
            >
              <FaTimes size={12} />
            </button>
          )}
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main style={{ flex: 1, padding: "30px 40px", display: "flex", flexDirection: "column", gap: "30px", overflowY: "auto" }}>
        
        {/* HEADER & NAV BAR */}
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px"
        }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.5px", margin: "0" }}>
              {activeWorkspace === "hub"
                ? "ApniLeap Executive HUB Portfolio"
                : activeWorkspace === "moderator"
                ? "Moderator Project Assignment"
                : activeWorkspace === "meetings"
                ? "📅 FIP Sync Meetings & Collaboration"
                : activeView === "dashboard"
                ? `${activeWorkspace === "playground" ? "Playground" : SPOKES[currentBoardId]?.name || "Spoke"} Analytics Dashboard`
                : `${activeWorkspace === "playground" ? "Playground" : SPOKES[currentBoardId]?.name || "Spoke"} Active Sprint Kanban`}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
              {activeWorkspace === "hub"
                ? "Consolidated FIP outcomes progress, cross-college blocker escalations, and standard workstream status tracker."
                : activeWorkspace === "moderator"
                ? "Intake projects from industry partners and automatically provision them directly to campus spaces."
                : activeWorkspace === "meetings"
                ? "Schedule campus sprint syncs, manage agendas, and auto-dispatch pre-meeting overdue warning digests."
                : activeView === "dashboard" 
                ? "Key performance metrics, sprint load status, priorities summary and deadline risks." 
                : "Drag issues across columns to transition status, update fields, or track work progression."
              }
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Global theme selection toggle bar */}
            <div style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-glass)",
              padding: "4px",
              borderRadius: "99px",
              boxShadow: "var(--shadow-premium)"
            }}>
              {[
                { name: "dark", label: "Dark", icon: <FaMoon size={11} /> },
                { name: "light", label: "Light", icon: <FaSun size={11} /> }
              ].map(t => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setTheme(t.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "5px 11px",
                    borderRadius: "99px",
                    background: theme === t.name ? "linear-gradient(135deg, var(--primary), var(--secondary))" : "transparent",
                    color: theme === t.name ? "var(--text-primary-btn)" : "var(--text-muted)",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "10.5px",
                    transition: "var(--transition-smooth)"
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Live Refresh button */}
            <button
              onClick={() => activeWorkspace === "hub" ? fetchHubMetrics(false) : activeWorkspace === "moderator" ? fetchModeratorProjects(false) : fetchJiraTasks(false)}
              className="btn-secondary"
              disabled={isLoading || (activeWorkspace === "hub" && isHubLoading) || (activeWorkspace === "moderator" && isModeratorLoading)}
              style={{ padding: "10px" }}
              title="Refetch Data"
            >
              <FaSyncAlt size={14} className={isLoading || (activeWorkspace === "hub" && isHubLoading) || (activeWorkspace === "moderator" && isModeratorLoading) ? "pulse-glow" : ""} />
            </button>

            {activeWorkspace !== "hub" && activeWorkspace !== "moderator" && activeWorkspace !== "meetings" && currentPersona !== "moderator" && (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="btn-primary"
              >
                <FaPlus size={12} />
                <span>New Issue</span>
              </button>
            )}

            <div style={{ position: "relative", cursor: "pointer" }}>
              <div style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-glass)",
                padding: "10px",
                borderRadius: "10px",
                color: "var(--text-main)"
              }}>
                <FaBell size={16} />
              </div>
              {activeWorkspace === "hub" ? (
                hubMetrics?.blockers?.length > 0 && (
                  <span style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: "10px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>{hubMetrics.blockers.length}</span>
                )
              ) : (
                metrics.overdue > 0 && (
                  <span style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: "10px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>{metrics.overdue}</span>
                )
              )}
            </div>
          </div>
        </header>

        {/* SEARCH & DYNAMIC FILTER BAR */}
        {activeWorkspace !== "hub" && activeWorkspace !== "moderator" && (
          <section className="glass-panel" style={{
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px"
          }}>
            {/* Search Input */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
              <FaSearch color="var(--text-dim)" size={14} />
              <input
                type="text"
                placeholder="Search by Key or Summary..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-main)",
                  outline: "none",
                  fontSize: "14px",
                  width: "100%"
                }}
              />
              {searchQuery && (
                <FaTimes
                  color="var(--text-muted)"
                  onClick={() => setSearchQuery("")}
                  style={{ cursor: "pointer" }}
                  size={12}
                />
              )}
            </div>

            {/* Filter Dropdowns */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              {/* Priority Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FaFilter size={12} color="var(--text-muted)" />
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Priority:</span>
                <select
                  className="form-select"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  style={{ padding: "6px 28px 6px 12px", width: "110px", height: "34px", fontSize: "13px" }}
                >
                  <option value="All">All</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Assignee Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FaFilter size={12} color="var(--text-muted)" />
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Assignee:</span>
                <select
                  className="form-select"
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  style={{ padding: "6px 28px 6px 12px", width: "140px", height: "34px", fontSize: "13px" }}
                >
                  <option value="All">All</option>
                  <option value="Unassigned">Unassigned</option>
                  {activeAssignees.map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Reset Filters indicator */}
              {(searchQuery || filterPriority !== "All" || filterAssignee !== "All") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterPriority("All");
                    setFilterAssignee("All");
                    triggerToast("Filters cleared");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: "12px",
                    cursor: "pointer",
                    fontWeight: "600",
                    textDecoration: "underline"
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          </section>
        )}

        {/* LOADING SHIMMER STATE */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", gap: "16px" }}>
            <div style={{
              width: "48px",
              height: "48px",
              border: "4px solid rgba(99, 102, 241, 0.1)",
              borderTopColor: "var(--primary)",
              borderRadius: "50%",
            }} className="pulse-glow"></div>
            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Synchronizing live data from board...</p>
          </div>
        ) : hasError ? (
          <div className="glass-panel" style={{
            padding: "50px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            borderColor: "rgba(239, 68, 68, 0.2)"
          }}>
            <FaExclamationTriangle size={48} color="#ef4444" className="pulse-glow" style={{ borderRadius: "50%" }} />
            <h2 style={{ fontSize: "20px", fontWeight: "700" }}>Jira Backend Connection Failed</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: "450px", lineHeight: "1.6" }}>
              The dashboard was unable to fetch tasks because the local Express server is not running on port 5000. 
            </p>
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 24px", borderRadius: "8px", fontFamily: "monospace", fontSize: "13px", color: "var(--text-main)", border: "1px solid var(--border-glass)" }}>
              cd backend<br/>
              npm start
            </div>
            <button
              onClick={() => activeWorkspace === "hub" ? fetchHubMetrics(false) : fetchJiraTasks(false)}
              className="btn-primary"
              style={{ marginTop: "10px" }}
            >
              <FaSyncAlt size={12} />
              <span>Retry Sync</span>
            </button>
          </div>
        ) : activeWorkspace === "hub" ? (
          <HubDashboardView
            metrics={hubMetrics}
            loading={isHubLoading}
            onRefresh={() => fetchHubMetrics(false)}
            moderatorProjects={moderatorProjects}
          />
        ) : activeWorkspace === "moderator" ? (
          <ModeratorDashboardView
            projects={moderatorProjects}
            loading={isModeratorLoading}
            onRefresh={() => fetchModeratorProjects(false)}
            onAssignClick={(proj) => {
              setSelectedAssignProject(proj);
              setIsAssignModalOpen(true);
            }}
          />
        ) : activeWorkspace === "meetings" ? (
          <MeetingsPortalView
            meetings={meetings}
            loading={isMeetingsLoading}
            onRefresh={() => fetchMeetings(false)}
            spokes={Object.entries(SPOKES).map(([id, spoke]) => ({ id, ...spoke }))}
            triggerToast={triggerToast}
            moderatorProjects={moderatorProjects}
          />
        ) : (
          <>
            {/* Proposed B2B Project Decision Banner (Multi-tenant Coordinator Review Privilege) */}
            {proposedProjectsForSpoke.map((proj) => (
              <div key={proj.id} className="glass-panel pulse-glow" style={{
                background: theme === "dark"
                  ? "linear-gradient(135deg, rgba(45, 212, 191, 0.1), rgba(249, 115, 22, 0.1))"
                  : "linear-gradient(135deg, rgba(13, 148, 136, 0.05), rgba(249, 115, 22, 0.05))",
                border: "1.5px dashed var(--border-glow)",
                padding: "22px 26px",
                borderRadius: "16px",
                marginBottom: "25px",
                display: "flex",
                flexDirection: "column",
                gap: "16px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "28px" }}>🎉</span>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "850", color: "var(--text-main)" }}>
                        New Corporate Project Proposed!
                      </h4>
                      <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                        Your institution has been nominated by the Moderator for a premium company program.
                      </p>
                    </div>
                  </div>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "900",
                    background: "rgba(249, 115, 22, 0.15)",
                    border: "1px solid rgba(249, 115, 22, 0.3)",
                    color: "var(--accent)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    textTransform: "uppercase"
                  }}>
                    Awaiting Spoke Decision
                  </span>
                </div>

                <div style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-glass)",
                  padding: "16px",
                  borderRadius: "12px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "16px",
                  alignItems: "center"
                }}>
                  {proj.logoUrl && (
                    <img
                      src={proj.logoUrl}
                      alt={proj.company}
                      style={{ width: "48px", height: "48px", borderRadius: "8px", objectFit: "contain", background: "white", padding: "4px", border: "1px solid var(--border-glass)" }}
                    />
                  )}
                  <div>
                    <h5 style={{ margin: 0, fontSize: "15.5px", fontWeight: "800", color: "var(--text-main)" }}>
                      {proj.title} <span style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: "500" }}>by {proj.company}</span>
                    </h5>
                    <p style={{ margin: "6px 0 0 0", fontSize: "13.5px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                      {proj.description}
                    </p>
                    <div style={{ display: "flex", gap: "20px", marginTop: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12.5px", color: "var(--text-main)" }}>
                        💰 <strong>Budget:</strong> {proj.budget}
                      </span>
                      <span style={{ fontSize: "12.5px", color: "var(--text-main)" }}>
                        ⏱️ <strong>Duration:</strong> {proj.duration}
                      </span>
                      <span style={{ fontSize: "12.5px", color: "var(--text-main)" }}>
                        📅 <strong>Proposed Deadline:</strong> <em>{proj.proposedDueDate}</em>
                      </span>
                    </div>
                  </div>
                </div>

                {currentPersona === "moderator" ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-glass)", paddingTop: "14px", marginTop: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "13.5px", fontStyle: "italic", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-glass)", padding: "10px 18px", borderRadius: "8px" }}>
                      <span>ℹ️</span>
                      <span>Accepting or declining proposals is restricted to Spoke Coordinators. (Read-Only Mode)</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", borderTop: "1px solid var(--border-glass)", paddingTop: "14px", marginTop: "4px" }}>
                    <button
                      onClick={() => handleDeclineProject(proj.id)}
                      disabled={isRespondingToProject}
                      className="btn-secondary"
                      style={{
                        padding: "8px 18px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                        color: "#f87171",
                        cursor: "pointer"
                      }}
                    >
                      ❌ Decline Proposal
                    </button>
                    <button
                      onClick={() => handleAcceptProject(proj.id)}
                      disabled={isRespondingToProject}
                      className="btn-primary"
                      style={{
                        padding: "8px 18px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, var(--primary), var(--secondary))",
                        boxShadow: "0 4px 12px rgba(45, 212, 191, 0.2)",
                        cursor: "pointer"
                      }}
                    >
                      🚀 Accept Project & Provision Jira Board
                    </button>
                  </div>
                )}
              </div>
            ))}

            {todayMeetingsForSpoke.length > 0 && (
              <div className="glass-panel" style={{
                background: todayConflictsForSpoke.length > 0
                  ? (theme === "dark"
                    ? "linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(251, 146, 60, 0.12))"
                    : "linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(251, 146, 60, 0.05))")
                  : (theme === "dark"
                    ? "linear-gradient(135deg, rgba(13, 148, 136, 0.15), rgba(8, 145, 178, 0.15))"
                    : "linear-gradient(135deg, rgba(13, 148, 136, 0.06), rgba(8, 145, 178, 0.06))"),
                border: todayConflictsForSpoke.length > 0
                  ? "1.5px solid rgba(239, 68, 68, 0.35)"
                  : "1.5px solid var(--border-glass)",
                boxShadow: todayConflictsForSpoke.length > 0
                  ? "var(--shadow-premium), 0 0 25px rgba(239, 68, 68, 0.12)"
                  : "var(--shadow-premium), 0 0 25px rgba(13, 148, 136, 0.08)",
                padding: "20px 24px",
                borderRadius: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                marginBottom: "25px",
                animation: todayConflictsForSpoke.length > 0 ? "pulse-glow 3s infinite alternate" : "pulse-glow 5s infinite alternate"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-glass)", paddingBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "24px" }}>📅</span>
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "850", color: "var(--text-main)" }}>
                      Today's FIP Sprint Syncs Scheduled ({todayMeetingsForSpoke.length})
                    </h4>
                  </div>
                  {todayConflictsForSpoke.length > 0 && (
                    <span style={{
                      fontSize: "11px",
                      fontWeight: "800",
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.3)",
                      color: theme === "dark" ? "#fca5a5" : "#b91c1c",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    }} className="pulse-glow">
                      ⚠️ OVERLAP CONFLICT
                    </span>
                  )}
                </div>

                {todayConflictsForSpoke.length > 0 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    background: theme === "dark" ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.05)",
                    border: "1px solid rgba(239, 68, 68, 0.25)",
                    borderRadius: "8px",
                    color: theme === "dark" ? "#fca5a5" : "#b91c1c",
                    fontSize: "12.5px",
                    fontWeight: "600",
                    lineHeight: "1.4"
                  }}>
                    <span>⚠️</span>
                    <span>
                      <strong>Schedule Conflict:</strong> Multiple meetings are scheduled at the same time today. Please coordinate to resolve the conflict.
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {todayMeetingsForSpoke.map((meet) => {
                    const hasConflict = todayConflictsForSpoke.some(c => c.id === meet.id);
                    return (
                      <div key={meet.id} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                        padding: "14px 18px",
                        background: hasConflict
                          ? (theme === "dark" ? "rgba(239, 68, 68, 0.06)" : "rgba(239, 68, 68, 0.04)")
                          : (theme === "dark" ? "rgba(45, 212, 191, 0.03)" : "rgba(13, 148, 136, 0.03)"),
                        border: hasConflict
                          ? "1px solid rgba(239, 68, 68, 0.3)"
                          : "1px solid var(--border-glass)",
                        borderRadius: "12px",
                        boxShadow: hasConflict ? "0 0 10px rgba(239, 68, 68, 0.05)" : "none",
                        transition: "var(--transition-smooth)"
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: "280px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{
                              fontSize: "11px",
                              fontWeight: "800",
                              background: hasConflict ? "rgba(239, 68, 68, 0.12)" : "var(--primary-glow)",
                              color: hasConflict ? (theme === "dark" ? "#fca5a5" : "#b91c1c") : "var(--primary)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontFamily: "var(--mono)"
                            }}>
                              ⏰ {meet.time}
                            </span>
                            {hasConflict && (
                              <span style={{
                                fontSize: "10px",
                                fontWeight: "800",
                                background: "rgba(239, 68, 68, 0.1)",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                color: theme === "dark" ? "#fca5a5" : "#dc2626",
                                padding: "2px 6px",
                                borderRadius: "4px"
                              }} className="pulse-glow">
                                ⚠️ Time Conflict
                              </span>
                            )}
                            <strong style={{ fontSize: "14.5px", color: "var(--text-main)" }}>{meet.title}</strong>
                          </div>
                          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                            Agenda: <em>{meet.agenda}</em>
                          </p>
                        </div>
                        <a
                          href={meet.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary"
                          style={{
                            padding: "8px 16px",
                            fontSize: "12px",
                            borderRadius: "8px",
                            background: hasConflict
                              ? "linear-gradient(135deg, #ef4444, var(--accent))"
                              : "linear-gradient(135deg, var(--primary), var(--secondary))",
                            color: "var(--text-primary-btn)",
                            textDecoration: "none",
                            fontWeight: "750",
                            boxShadow: hasConflict
                              ? "0 4px 12px rgba(239, 68, 68, 0.2)"
                              : "0 4px 12px rgba(45, 212, 191, 0.15)"
                          }}
                        >
                          Join Meeting 🚀
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 1. DASHBOARD VIEW */}
            {activeView === "dashboard" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
                
                {/* KPI Cards Row */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "20px"
                }}>
                  <DashboardCard
                    title="Total Scoped Issues"
                    value={metrics.total}
                    subtitle="Matching active filters"
                    glow={true}
                  />
                  <DashboardCard
                    title="Deadline Alerts"
                    value={metrics.overdue}
                    subtitle="Active overdue tickets"
                    themeColor="var(--status-backlog-text)"
                    pulse={metrics.overdue > 0}
                    alert={metrics.overdue > 0}
                  />
                  <DashboardCard
                    title="In Progress"
                    value={metrics.progress}
                    subtitle="Actively building"
                    themeColor="var(--status-progress-text)"
                    pulse={metrics.progress > 0}
                  />
                  <DashboardCard
                    title="Done"
                    value={metrics.done}
                    subtitle="Shipped items"
                    themeColor="var(--status-done-text)"
                  />
                  <DashboardCard
                    title="Completion Rate"
                    value={`${metrics.completionRate}%`}
                    subtitle="Of total scoped tasks"
                    progress={metrics.completionRate}
                  />
                </div>

                {/* Accepted Ingested B2B Projects Panel */}
                {acceptedProjectsForSpoke.length > 0 && (
                  <div className="glass-panel" style={{
                    background: "linear-gradient(135deg, rgba(45, 212, 191, 0.04), rgba(34, 211, 238, 0.02))",
                    border: "1px solid var(--border-glass)",
                    padding: "20px 24px",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--border-glass)", paddingBottom: "12px" }}>
                      <span style={{ fontSize: "20px" }}>💼</span>
                      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "850", color: "var(--text-main)", letterSpacing: "-0.2px" }}>
                        Active Corporate Projects Accepted by {SPOKES[currentBoardId]?.name || "Our Campus"} Spoke
                      </h3>
                    </div>

                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px"
                    }}>
                      {acceptedProjectsForSpoke.map((proj) => {
                        // Calculate days left relative to baseline May 26, 2026
                        const today = new Date("2026-05-26");
                        const due = new Date(proj.proposedDueDate);
                        const diffTime = due.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        
                        let daysText = "";
                        let daysClassColor = "var(--primary)";
                        let daysBgColor = "var(--primary-glow)";
                        
                        if (diffDays < 0) {
                          daysText = `Overdue by ${Math.abs(diffDays)}d`;
                          daysClassColor = "#ef4444";
                          daysBgColor = "rgba(239, 68, 68, 0.1)";
                        } else if (diffDays === 0) {
                          daysText = "Due Today!";
                          daysClassColor = "var(--accent)";
                          daysBgColor = "rgba(251, 146, 60, 0.15)";
                        } else if (diffDays <= 7) {
                          daysText = `Only ${diffDays}d left! ⏰`;
                          daysClassColor = "var(--accent)";
                          daysBgColor = "rgba(251, 146, 60, 0.12)";
                        } else {
                          daysText = `${diffDays} days left`;
                          daysClassColor = "var(--primary)";
                          daysBgColor = "var(--primary-glow)";
                        }

                        const expectedSummary = `[${proj.company}] ${proj.title}`;
                        const epicKey = proj.allocations ? proj.allocations.find(a => a.targetCampusId === currentBoardId)?.assignedKey : proj.assignedKey;
                        const projTasks = tasks.filter(t => {
                          const parentKey = t.fields?.parent?.key || t.parent?.key;
                          const parentSummary = t.fields?.parent?.fields?.summary || t.fields?.parent?.summary || t.parent?.fields?.summary || t.parent?.summary;
                          return (epicKey && parentKey === epicKey) || (parentSummary && parentSummary === expectedSummary);
                        });
                        
                        const totalT = projTasks.length;
                        const doneT = projTasks.filter(t => (t.fields?.status?.name || t.fields?.status || "") === "Done").length;
                        const progressPct = totalT > 0 ? Math.round((doneT / totalT) * 100) : 0;

                        return (
                          <div key={proj.id} style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            padding: "20px",
                            background: "rgba(255, 255, 255, 0.015)",
                            border: "1px solid var(--border-glass)",
                            borderRadius: "14px",
                            transition: "var(--transition-smooth)"
                          }}>
                            {/* Top Info Row */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: "16px"
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: "1 1 60%" }}>
                                {proj.logoUrl && (
                                  <img
                                    src={proj.logoUrl}
                                    alt={proj.company}
                                    style={{
                                      width: "42px",
                                      height: "42px",
                                      borderRadius: "8px",
                                      objectFit: "contain",
                                      background: "white",
                                      padding: "3px",
                                      border: "1px solid var(--border-glass)"
                                    }}
                                  />
                                )}
                                <div>
                                  <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "var(--text-main)" }}>
                                    {proj.title}
                                  </h4>
                                  <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                                    {proj.description}
                                  </p>
                                  <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap", fontSize: "11.5px", color: "var(--text-dim)" }}>
                                    <span>Jira Epic: <strong style={{ color: "var(--text-main)", fontFamily: "var(--mono)" }}>{epicKey || "Epic Provisioned"}</strong></span>
                                    <span>💰 Budget: <strong style={{ color: "var(--text-main)" }}>{proj.budget}</strong></span>
                                    <span>📅 Ingested: <strong style={{ color: "var(--text-main)" }}>{proj.dateAdded}</strong></span>
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                                <span style={{
                                  fontSize: "11px",
                                  fontWeight: "800",
                                  background: daysBgColor,
                                  color: daysClassColor,
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  border: `1px solid ${daysClassColor}30`,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px"
                                }}>
                                  {daysText}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                                  Target: <strong>{proj.proposedDueDate}</strong>
                                </span>
                              </div>
                            </div>

                            {/* Milestone Progress Bar Row */}
                            <div style={{
                              background: "rgba(255, 255, 255, 0.005)",
                              border: "1px solid var(--border-glass)",
                              borderRadius: "10px",
                              padding: "12px 16px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                                <span style={{ fontWeight: "750", color: "var(--text-muted)" }}>🏢 Project Milestone Completion</span>
                                <strong style={{ color: "var(--primary)", fontFamily: "var(--mono)" }}>{progressPct}% ({doneT} of {totalT} Phases Done)</strong>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{ flex: 1, height: "8px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--border-glass)" }}>
                                  <div style={{
                                    width: `${progressPct}%`,
                                    height: "100%",
                                    background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                                    borderRadius: "4px",
                                    boxShadow: "0 0 8px var(--primary)",
                                    transition: "width 0.5s cubic-bezier(0.1, 0.8, 0.1, 1)"
                                  }}></div>
                                </div>
                              </div>

                              {/* Accordion Detail list for Standard Phases */}
                              {totalT > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", borderTop: "1px solid var(--border-glass)", paddingTop: "10px" }}>
                                  <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                                    Standard FIP Milestone Deliverables
                                  </div>
                                  {projTasks.map(t => {
                                    const tStatus = t.fields?.status?.name || t.fields?.status || "Backlog";
                                    const tDue = t.fields?.dueDate || t.dueDate || "N/A";
                                    const isTDone = tStatus === "Done";
                                    
                                    return (
                                      <div key={t.id} style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        fontSize: "12px",
                                        padding: "4px 8px",
                                        background: "rgba(255,255,255,0.005)",
                                        border: "1px solid var(--border-glass)",
                                        borderRadius: "6px"
                                      }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                                          <span style={{ color: isTDone ? "#2dd4bf" : "var(--text-muted)", fontSize: "12px" }}>
                                            {isTDone ? "🟢" : "🔘"}
                                          </span>
                                          <span style={{
                                            color: isTDone ? "var(--text-dim)" : "var(--text-main)",
                                            textDecoration: isTDone ? "line-through" : "none",
                                            fontWeight: isTDone ? "400" : "600",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap"
                                          }}>
                                            {t.fields?.summary || t.summary}
                                          </span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", shrink: 0 }}>
                                          <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>⏰ {tDue}</span>
                                          <span style={{
                                            fontSize: "9px",
                                            fontWeight: "900",
                                            background: isTDone 
                                              ? "rgba(45, 212, 191, 0.08)" 
                                              : (tStatus === "In Progress" ? "rgba(251, 146, 60, 0.08)" : "rgba(255, 255, 255, 0.02)"),
                                            border: isTDone 
                                              ? "1px solid rgba(45, 212, 191, 0.2)" 
                                              : (tStatus === "In Progress" ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid var(--border-glass)"),
                                            color: isTDone ? "#2dd4bf" : (tStatus === "In Progress" ? "var(--accent)" : "var(--text-muted)"),
                                            padding: "1px 5px",
                                            borderRadius: "3px",
                                            textTransform: "uppercase"
                                          }}>{tStatus}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Analytical Charts Grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                  gap: "24px"
                }}>
                  {/* Status distribution chart */}
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "350px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>Status Distribution</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {statusPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusPieData}
                              cx="50%"
                              cy="45%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {statusPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-glass)", borderRadius: "8px", color: "var(--text-main)" }}
                            />
                            <Legend verticalAlign="bottom" height={36} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyStateMessage text="No status data available matching filters." />
                      )}
                    </div>
                  </div>

                  {/* Priority chart */}
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "350px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>Priority Breakdown</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {metrics.total > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={priorityBarData} margin={{ bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                            <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-glass)", borderRadius: "8px", color: "var(--text-main)" }}
                              cursor={{ fill: "rgba(255,255,255,0.02)" }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {priorityBarData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyStateMessage text="No priority metrics available." />
                      )}
                    </div>
                  </div>

                  {/* Assignee chart */}
                  <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "350px", gridColumn: "span 1" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "16px" }}>Team Workload Distribution</h3>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      {assigneeWorkloadData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={assigneeWorkloadData} layout="vertical" margin={{ left: 20, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis type="number" stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                            <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={12} width={100} />
                            <Tooltip
                              contentStyle={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-glass)", borderRadius: "8px", color: "var(--text-main)" }}
                              cursor={{ fill: "rgba(255,255,255,0.02)" }}
                            />
                            <Bar dataKey="tasks" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyStateMessage text="No active work items assigned." />
                      )}
                    </div>
                  </div>
                </div>

                {/* Recent Task List Component */}
                <div className="glass-panel" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <h3 style={{ fontSize: "18px", fontWeight: "700" }}>Scope Overview ({filteredTasks.length})</h3>
                    <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Click any row to manage task details</span>
                  </div>

                  {filteredTasks.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {filteredTasks.map(t => {
                        const deadline = getDeadlineInfo(t.fields.dueDate, t.fields.status?.name);
                        return (
                          <div
                            key={t.id}
                            onClick={() => setSelectedTask(t)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "16px 20px",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid var(--border-glass)",
                              borderRadius: "12px",
                              cursor: "pointer",
                              transition: "var(--transition-smooth)"
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                              e.currentTarget.style.borderColor = "var(--border-glow)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                              e.currentTarget.style.borderColor = "var(--border-glass)";
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: 0 }}>
                              <span style={{
                                fontFamily: "var(--mono)",
                                fontSize: "13px",
                                color: "var(--primary)",
                                fontWeight: "600",
                                background: "rgba(99, 102, 241, 0.1)",
                                padding: "4px 8px",
                                borderRadius: "6px"
                              }}>
                                {t.key}
                              </span>
                              <span style={{
                                fontWeight: "600",
                                fontSize: "14px",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                color: "var(--text-main)"
                              }}>
                                {t.fields.summary}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                              {/* Deadline Badge */}
                              {deadline && (
                                <span className={deadline.type === "overdue" ? "overdue-badge-blink" : ""} style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  padding: "3px 8px",
                                  borderRadius: "4px",
                                  backgroundColor:
                                    deadline.type === "overdue" ? "var(--priority-high-bg)" :
                                    deadline.type === "soon" ? "var(--priority-medium-bg)" : "rgba(255, 255, 255, 0.04)",
                                  color:
                                    deadline.type === "overdue" ? "var(--priority-high-text)" :
                                    deadline.type === "soon" ? "var(--priority-medium-text)" : "var(--text-muted)",
                                  border: "1px solid",
                                  borderColor:
                                    deadline.type === "overdue" ? "var(--priority-high-border)" :
                                    deadline.type === "soon" ? "var(--priority-medium-border)" : "var(--border-glass)",
                                }}>
                                  {deadline.text}
                                </span>
                              )}

                              {/* Priority Badge */}
                              <Badge priority={t.fields.priority?.name} />

                              {/* Status Badge */}
                              <Badge status={t.fields.status?.name} />

                              {/* Assignee Avatar */}
                              {t.fields.assignee ? (
                                <img
                                  src={t.fields.assignee.avatarUrl}
                                  alt={t.fields.assignee.displayName}
                                  style={{ width: "24px", height: "24px", borderRadius: "50%" }}
                                  title={t.fields.assignee.displayName}
                                />
                              ) : (
                                <div style={{
                                  width: "24px",
                                  height: "24px",
                                  borderRadius: "50%",
                                  border: "1px dashed var(--text-dim)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--text-dim)",
                                  fontSize: "10px"
                                }} title="Unassigned">
                                  ?
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyStateMessage text="No tasks found matching current search queries or filters." showIcon={true} />
                  )}
                </div>
              </div>
            )}

            {/* 2. DRAGGABLE KANBAN BOARD VIEW */}
            {activeView === "kanban" && (
              <div className="fade-in" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                
                {/* DragDrop Board Container */}
                <DragDropContext onDragEnd={onDragEnd}>
                  <div style={{ display: "flex", gap: "20px", flex: 1, minHeight: "600px", alignItems: "stretch", overflowX: "auto" }}>
                    
                    {/* Column 1: Backlog */}
                    <Droppable droppableId="col-backlog">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={getColumnStyle(snapshot.isDraggingOver)}
                        >
                          <ColumnHeader
                            title="Backlog"
                            count={filteredTasks.filter(t => t.fields.status.name === "Backlog").length}
                            color="var(--status-backlog-text)"
                            bgColor="var(--status-backlog-bg)"
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", flex: 1 }}>
                            {filteredTasks
                              .filter(t => t.fields.status.name === "Backlog")
                              .map((task, idx) => (
                                <DraggableCard key={task.id} task={task} index={idx} onClick={() => setSelectedTask(task)} />
                              ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>

                    {/* Column 2: In Progress */}
                    <Droppable droppableId="col-progress">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={getColumnStyle(snapshot.isDraggingOver)}
                        >
                          <ColumnHeader
                            title="In Progress"
                            count={filteredTasks.filter(t => t.fields.status.name === "In Progress").length}
                            color="var(--status-progress-text)"
                            bgColor="var(--status-progress-bg)"
                            pulse={true}
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", flex: 1 }}>
                            {filteredTasks
                              .filter(t => t.fields.status.name === "In Progress")
                              .map((task, idx) => (
                                <DraggableCard key={task.id} task={task} index={idx} onClick={() => setSelectedTask(task)} />
                              ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>

                    {/* Column 3: Done */}
                    <Droppable droppableId="col-done">
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={getColumnStyle(snapshot.isDraggingOver)}
                        >
                          <ColumnHeader
                            title="Done"
                            count={filteredTasks.filter(t => t.fields.status.name === "Done").length}
                            color="var(--status-done-text)"
                            bgColor="var(--status-done-bg)"
                          />
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", flex: 1 }}>
                            {filteredTasks
                              .filter(t => t.fields.status.name === "Done")
                              .map((task, idx) => (
                                <DraggableCard key={task.id} task={task} index={idx} onClick={() => setSelectedTask(task)} />
                              ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>

                  </div>
                </DragDropContext>
              </div>
            )}
          </>
        )}
      </main>

      {/* TOAST SYSTEM CONTAINER */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="toast"
            style={{
              borderLeftColor:
                toast.type === "warning" ? "#f59e0b" :
                toast.type === "error" ? "#ef4444" : "var(--primary)"
            }}
          >
            {toast.type === "error" ? <FaExclamationTriangle color="#ef4444" /> : toast.type === "warning" ? <FaInfoCircle color="#f59e0b" /> : <FaCheck color="var(--primary)" />}
            <span style={{ fontSize: "13px", fontWeight: "500" }}>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* 🚀 MODAL 1: NEW TASK CREATION */}
      {isCreateOpen && (
        <div style={modalBackdropStyle}>
          <div className="glass-panel" style={{
            width: "550px",
            padding: "30px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
            animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)" }}>Create New Sprint Issue</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <FaTimes size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={modalLabelStyle}>Task Summary / Title *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g., Implement dark mode toggles and cookie storage"
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                />
              </div>

              <div>
                <label style={modalLabelStyle}>Description</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: "80px", resize: "vertical", fontFamily: "inherit" }}
                  placeholder="Write clear steps or requirements..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              <div>
                <label style={modalLabelStyle}>Issue Type *</label>
                <select
                  required
                  className="form-select"
                  value={newIssueType}
                  onChange={(e) => setNewIssueType(e.target.value)}
                >
                  <option value="Task">📋 Task</option>
                  <option value="Story">📖 Story</option>
                  <option value="Bug">🐛 Bug</option>
                  <option value="Epic">👑 Epic</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                <div>
                  <label style={modalLabelStyle}>Assignee</label>
                  <select
                    className="form-select"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {spokeMembers.map(m => (
                      <option key={m.accountId} value={m.displayName}>{m.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={modalLabelStyle}>Reporter</label>
                  <select
                    className="form-select"
                    value={newReporter}
                    onChange={(e) => setNewReporter(e.target.value)}
                  >
                    <option value="">Unreported</option>
                    {spokeMembers.map(m => (
                      <option key={m.accountId} value={m.displayName}>{m.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={modalLabelStyle}>Priority</label>
                  <select
                    className="form-select"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div>
                  <label style={modalLabelStyle}>Column Status</label>
                  <select
                    className="form-select"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="Backlog">Backlog</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                  </select>
                </div>

                <div>
                  <label style={modalLabelStyle}>Due Date Deadline</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Create Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📝 MODAL 2: TASK DETAIL AND EDITOR */}
      {selectedTask && (
        <div style={modalBackdropStyle}>
          <div className="glass-panel" style={{
            width: "600px",
            padding: "32px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
            animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{
                  fontFamily: "var(--mono)",
                  color: "var(--primary)",
                  fontSize: "14px",
                  fontWeight: "700",
                  background: "rgba(45, 212, 191, 0.08)",
                  padding: "6px 12px",
                  borderRadius: "6px"
                }}>
                  {selectedTask.key}
                </span>
                {selectedTask.fields.issueType && (
                  <span style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor:
                      selectedTask.fields.issueType === "Epic" ? "rgba(168, 85, 247, 0.12)" :
                      selectedTask.fields.issueType === "Bug" ? "rgba(239, 68, 68, 0.12)" :
                      selectedTask.fields.issueType === "Story" ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)",
                    color:
                      selectedTask.fields.issueType === "Epic" ? "#c084fc" :
                      selectedTask.fields.issueType === "Bug" ? "#f87171" :
                      selectedTask.fields.issueType === "Story" ? "#34d399" : "#60a5fa",
                    border: "1px solid",
                    borderColor:
                      selectedTask.fields.issueType === "Epic" ? "rgba(168, 85, 247, 0.25)" :
                      selectedTask.fields.issueType === "Bug" ? "rgba(239, 68, 68, 0.25)" :
                      selectedTask.fields.issueType === "Story" ? "rgba(16, 185, 129, 0.25)" : "rgba(59, 130, 246, 0.25)"
                  }}>
                    {selectedTask.fields.issueType === "Epic" ? "👑 Epic" :
                     selectedTask.fields.issueType === "Bug" ? "🐛 Bug" :
                     selectedTask.fields.issueType === "Story" ? "📖 Story" : "📋 Task"}
                  </span>
                )}
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {currentPersona !== "moderator" && (
                  <button
                    onClick={() => handleDeleteTask(selectedTask.id, selectedTask.key)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(239, 68, 68, 0.8)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                      fontWeight: "600"
                    }}
                    title="Delete ticket permanently"
                  >
                    <FaTrashAlt size={14} />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedTask(null);
                    setModalTab("overview");
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  <FaTimes size={20} />
                </button>
              </div>
            </div>

            {/* Tab Navigation header */}
            <div style={{ display: "flex", gap: "6px", borderBottom: "1px solid var(--border-glass)", paddingBottom: "10px", marginBottom: "18px" }}>
              {["overview", "subtasks", "worklog", "links"].map(tabName => (
                <button
                  key={tabName}
                  type="button"
                  onClick={() => {
                    setModalTab(tabName);
                    if (tabName === "worklog") {
                      fetchWorklogHistory(selectedTask.key);
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid transparent",
                    background: modalTab === tabName ? "rgba(45, 212, 191, 0.08)" : "transparent",
                    color: modalTab === tabName ? "var(--primary)" : "var(--text-muted)",
                    borderColor: modalTab === tabName ? "rgba(45, 212, 191, 0.15)" : "transparent",
                    fontWeight: "700",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.2px",
                    cursor: "pointer",
                    transition: "var(--transition-smooth)"
                  }}
                >
                  {tabName === "overview" && "📋 General"}
                  {tabName === "subtasks" && (selectedTask.fields.issueType === "Epic" ? `👑 Epic Tasks (${currentTaskChildren.length})` : `☑️ Subtasks (${currentTaskChildren.length})`)}
                  {tabName === "worklog" && "⏱️ Worklogs"}
                  {tabName === "links" && "🏷️ Links & Tags"}
                </button>
              ))}
            </div>

            {/* Scrollable Tab Panel Container */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px", paddingBottom: "10px" }}>
              
              {/* TAB 1: OVERVIEW PANEL */}
              {modalTab === "overview" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  
                  {/* Blocker Flag impediment toggle Switch */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: selectedTask.fields.flagged ? "rgba(251, 146, 60, 0.08)" : "rgba(255,255,255,0.01)",
                    border: "1px solid",
                    borderColor: selectedTask.fields.flagged ? "var(--accent)" : "var(--border-glass)",
                    borderRadius: "10px",
                    transition: "var(--transition-smooth)"
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "13.5px", fontWeight: "700", color: selectedTask.fields.flagged ? "var(--accent)" : "var(--text-main)" }}>
                        ⚠️ Blocker Flag Impediment
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {selectedTask.fields.flagged ? "🚨 Card flashing active on Kanban board." : "Flag issue as blocked by a dependency."}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={currentPersona === "moderator"}
                      onClick={() => handleToggleBlockerFlag(selectedTask)}
                      className="btn-secondary"
                      style={{
                        borderColor: selectedTask.fields.flagged ? "var(--accent)" : "var(--border-glass)",
                        color: selectedTask.fields.flagged ? "var(--accent)" : "var(--text-main)",
                        padding: "6px 14px",
                        fontSize: "12px",
                        fontWeight: "700",
                        opacity: currentPersona === "moderator" ? 0.6 : 1,
                        cursor: currentPersona === "moderator" ? "not-allowed" : "pointer"
                      }}
                    >
                      {selectedTask.fields.flagged ? "🚨 Blocked" : "Flag Blocker"}
                    </button>
                  </div>

                  {/* Editable Title/Summary */}
                  <div>
                    <label style={modalLabelStyle}>Task Summary</label>
                    <input
                      type="text"
                      readOnly={currentPersona === "moderator"}
                      className="form-input"
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        background: "rgba(0,0,0,0.15)",
                        border: "1.5px solid var(--border-glass)",
                        color: "var(--text-main)",
                        cursor: currentPersona === "moderator" ? "default" : "text"
                      }}
                      onBlur={(e) => {
                        if (currentPersona === "moderator") return;
                        if (e.target.value.trim() && e.target.value !== selectedTask.fields.summary) {
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              summary: e.target.value
                            }
                          }, "summary");
                        }
                      }}
                      defaultValue={selectedTask.fields.summary}
                    />
                  </div>

                  {/* Description Area */}
                  <div>
                    <label style={modalLabelStyle}>Detailed Description</label>
                    <textarea
                      readOnly={currentPersona === "moderator"}
                      className="form-input"
                      style={{
                        minHeight: "100px",
                        fontSize: "13.5px",
                        lineHeight: "1.6",
                        background: "rgba(0,0,0,0.15)",
                        resize: currentPersona === "moderator" ? "none" : "vertical",
                        cursor: currentPersona === "moderator" ? "default" : "text"
                      }}
                      defaultValue={selectedTask.fields.description || ""}
                      onBlur={(e) => {
                        if (currentPersona === "moderator") return;
                        if (e.target.value !== selectedTask.fields.description) {
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              description: e.target.value
                            }
                          }, "description");
                        }
                      }}
                    />
                  </div>

                  {/* Fields Selection panel */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "12px",
                    padding: "14px",
                    background: "rgba(255, 255, 255, 0.01)",
                    border: "1px solid var(--border-glass)",
                    borderRadius: "12px"
                  }}>
                    {/* Status */}
                    <div>
                      <label style={modalLabelStyle}>Status</label>
                      <select
                        className="form-select"
                        disabled={currentPersona === "moderator"}
                        value={selectedTask.fields.status?.name}
                        onChange={(e) => {
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              status: { name: e.target.value }
                            }
                          }, "status");
                        }}
                        style={{ height: "36px", padding: "6px 12px", fontSize: "13px", cursor: currentPersona === "moderator" ? "not-allowed" : "pointer" }}
                      >
                        <option value="Backlog">Backlog</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                      </select>
                    </div>

                    {/* Priority */}
                    <div>
                      <label style={modalLabelStyle}>Priority</label>
                      <select
                        className="form-select"
                        disabled={currentPersona === "moderator"}
                        value={selectedTask.fields.priority?.name}
                        onChange={(e) => {
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              priority: { name: e.target.value }
                            }
                          }, "priority");
                        }}
                        style={{ height: "36px", padding: "6px 12px", fontSize: "13px", cursor: currentPersona === "moderator" ? "not-allowed" : "pointer" }}
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>

                    {/* Assignee */}
                    <div>
                      <label style={modalLabelStyle}>Assignee</label>
                      <select
                        className="form-select"
                        disabled={currentPersona === "moderator"}
                        value={selectedTask.fields.assignee?.displayName || ""}
                        onChange={(e) => {
                          const foundUser = spokeMembers.find(m => m.displayName === e.target.value);
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              assignee: foundUser ? {
                                accountId: foundUser.accountId,
                                displayName: foundUser.displayName,
                                avatarUrl: foundUser.avatarUrl
                              } : null
                            }
                          }, "assignee");
                        }}
                        style={{ height: "36px", padding: "6px 12px", fontSize: "13px", cursor: currentPersona === "moderator" ? "not-allowed" : "pointer" }}
                      >
                        <option value="">Unassigned</option>
                        {spokeMembers.map(m => (
                          <option key={m.accountId} value={m.displayName}>{m.displayName}</option>
                        ))}
                      </select>
                    </div>

                    {/* Reporter */}
                    <div>
                      <label style={modalLabelStyle}>Reporter</label>
                      <select
                        className="form-select"
                        disabled={currentPersona === "moderator"}
                        value={selectedTask.fields.reporter?.displayName || ""}
                        onChange={(e) => {
                          const foundUser = activeAssignees.find(m => m.name === e.target.value);
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              reporter: foundUser ? {
                                accountId: foundUser.accountId,
                                displayName: foundUser.name,
                                avatarUrl: foundUser.avatar
                              } : null
                            }
                          }, "reporter");
                        }}
                        style={{ height: "36px", padding: "6px 12px", fontSize: "13px", cursor: currentPersona === "moderator" ? "not-allowed" : "pointer" }}
                      >
                        <option value="">Unreported</option>
                        {activeAssignees.map(m => (
                          <option key={m.accountId} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 📅 Due Date & Email reminder alerts */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    padding: "16px",
                    background: "rgba(45, 212, 191, 0.03)",
                    border: "1px solid rgba(45, 212, 191, 0.15)",
                    borderRadius: "12px",
                    gap: "16px",
                    alignItems: "center"
                  }}>
                    <div>
                      <label style={modalLabelStyle}>📅 Target Due Date</label>
                      <input
                        type="date"
                        disabled={currentPersona === "moderator"}
                        className="form-input"
                        style={{ height: "36px", padding: "6px 12px", fontSize: "13px", cursor: currentPersona === "moderator" ? "not-allowed" : "pointer" }}
                        value={selectedTask.fields.dueDate || ""}
                        onChange={(e) => {
                          handleUpdateTaskDetail({
                            ...selectedTask,
                            fields: {
                              ...selectedTask.fields,
                              dueDate: e.target.value
                            }
                          }, "dueDate");
                        }}
                      />
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn-primary pulse-glow"
                        disabled={!selectedTask.fields.assignee || currentPersona === "moderator"}
                        style={{
                          height: "36px",
                          background: "linear-gradient(135deg, var(--accent), var(--secondary))",
                          boxShadow: "0 4px 15px rgba(251, 146, 60, 0.2)",
                          opacity: (selectedTask.fields.assignee && currentPersona !== "moderator") ? 1 : 0.5,
                          cursor: (selectedTask.fields.assignee && currentPersona !== "moderator") ? "pointer" : "not-allowed",
                          color: "#020609",
                          fontWeight: "700"
                        }}
                        onClick={() => handleOpenEmailComposer(selectedTask)}
                        title={currentPersona === "moderator" ? "Moderators cannot send email alerts from spoke boards" : selectedTask.fields.assignee ? "Send alert email to assignee" : "Assign task to a team member to trigger alerts"}
                      >
                        <FaEnvelope size={12} />
                        <span>Send Email Alert</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SUBTASKS CHECKLIST PANEL */}
              {modalTab === "subtasks" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "13.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
                    {selectedTask.fields.issueType === "Epic" ? "👑 Epic Child Tasks" : "☑️ Child Checklist Items"}
                  </h3>

                  {/* Add subtask inline form */}
                  {currentPersona !== "moderator" && (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      handleCreateSubtask(selectedTask.key, subtaskInputSummary, subtaskAssigneeId, selectedTask.fields.issueType);
                    }} style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={selectedTask.fields.issueType === "Epic" ? "Add child task summary... (e.g. Implement API route)" : "Add subtask summary... (e.g. Write unit tests)"}
                        value={subtaskInputSummary}
                        onChange={(e) => setSubtaskInputSummary(e.target.value)}
                        style={{ flex: "2 1 200px", padding: "10px 14px", fontSize: "13px" }}
                      />
                      
                      <select
                        className="form-select"
                        value={subtaskAssigneeId}
                        onChange={(e) => setSubtaskAssigneeId(e.target.value)}
                        style={{ flex: "1 1 150px", padding: "10px 14px", fontSize: "13px", height: "auto" }}
                      >
                        <option value="">👤 Assignee...</option>
                        {activeAssignees.map(member => (
                          <option key={member.accountId} value={member.accountId}>
                            {member.name}
                          </option>
                        ))}
                      </select>

                      <button type="submit" className="btn-primary" style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                        Add Task
                      </button>
                    </form>
                  )}

                  {/* Subtasks checklist */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto", marginTop: "4px" }}>
                    {currentTaskChildren && currentTaskChildren.length > 0 ? (
                      currentTaskChildren.map(sub => (
                        <div
                          key={sub.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.01)",
                            border: "1px solid var(--border-glass)",
                            borderRadius: "8px",
                            fontSize: "13px",
                            gap: "12px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: "11px", color: "var(--primary)", fontFamily: "var(--mono)", fontWeight: "700", background: "rgba(45, 212, 191, 0.05)", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                              {sub.key}
                            </span>
                            <span style={{ color: "var(--text-main)", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sub.summary}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                            {/* Subtask Assignee Avatar */}
                            {sub.assignee ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }} title={`Assigned to ${sub.assignee.displayName}`}>
                                <img
                                  src={sub.assignee.avatarUrl || "https://i.pravatar.cc/150"}
                                  alt={sub.assignee.displayName}
                                  style={{ width: "20px", height: "20px", borderRadius: "50%", border: "1px solid var(--border-glass)" }}
                                />
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                  {sub.assignee.displayName.split(" ")[0]}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: "11.5px", color: "var(--text-dim)", fontStyle: "italic" }}>
                                Unassigned
                              </span>
                            )}
                            <Badge status={sub.statusName} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--text-muted)", fontSize: "13px", fontStyle: "italic", textAlign: "center", padding: "40px" }}>
                        {selectedTask.fields.issueType === "Epic" 
                          ? "No child tasks configured under this Epic."
                          : "No child subtasks configured for this ticket."}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: WORK LOGGING & ESTIMATION PANEL */}
              {modalTab === "worklog" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ fontSize: "13.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
                      ⏱️ Log Spent Hours
                    </h3>
                    {selectedTask.fields.timetracking && (
                      <span style={{ fontSize: "12px", color: "var(--primary)", fontWeight: "700" }}>
                        Logged: {selectedTask.fields.timetracking.timeSpent || "0h"}
                      </span>
                    )}
                  </div>

                  {/* Add work log entry form */}
                  {currentPersona !== "moderator" && (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      handleLogWorkSpent(selectedTask.key, worklogTimeSpent, worklogComment);
                    }} className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "12px", border: "1px solid rgba(255,255,255,0.03)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                        <div>
                          <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Time Spent *</label>
                          <input
                            type="text"
                            required
                            className="form-input"
                            placeholder="e.g. 1h 30m, 45m"
                            value={worklogTimeSpent}
                            onChange={(e) => setWorklogTimeSpent(e.target.value)}
                            style={{ padding: "8px 12px", fontSize: "13px" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", display: "block", marginBottom: "4px", textTransform: "uppercase" }}>Work log comment</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Brief comment on what you worked on..."
                            value={worklogComment}
                            onChange={(e) => setWorklogComment(e.target.value)}
                            style={{ padding: "8px 12px", fontSize: "13px" }}
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn-primary" style={{ padding: "8px 14px", alignSelf: "flex-end", fontSize: "12px" }}>
                        Submit Worklog
                      </button>
                    </form>
                  )}

                  {/* Logs history list */}
                  <div style={{ marginTop: "4px" }}>
                    <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.2px" }}>Logged Entries Feed</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                      {isHistoryLoading ? (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>Fetching worklogs...</span>
                      ) : worklogHistory.length > 0 ? (
                        worklogHistory.map(log => (
                          <div
                            key={log.id}
                            style={{
                              padding: "10px 12px",
                              background: "rgba(255,255,255,0.01)",
                              border: "1px solid var(--border-glass)",
                              borderRadius: "8px",
                              fontSize: "12.5px"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span style={{ fontWeight: "700", color: "var(--primary)" }}>⏱️ {log.timeSpent} spent</span>
                              <span style={{ color: "var(--text-dim)", fontSize: "10.5px" }}>{new Date(log.created).toLocaleDateString()}</span>
                            </div>
                            <p style={{ color: "var(--text-main)", fontStyle: "italic", margin: "0 0 4px 0", fontSize: "12px" }}>
                              "{log.comment?.body || log.comment || "No comment note added."}"
                            </p>
                            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                              Developer: {log.author?.displayName}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "var(--text-muted)", fontSize: "12.5px", fontStyle: "italic", textAlign: "center", padding: "10px" }}>
                          No hours logged on this ticket yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: LINKS & TAGS ORGANIZER PANEL */}
              {modalTab === "links" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  
                  {/* Labels Organizer */}
                  <div>
                    <h3 style={{ fontSize: "13.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>
                      🏷️ Labels & Custom Tags
                    </h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                      {selectedTask.fields.labels && selectedTask.fields.labels.length > 0 ? (
                        selectedTask.fields.labels.map(lbl => (
                          <span
                            key={lbl}
                            style={{
                              fontSize: "10.5px",
                              fontWeight: "700",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              background: "rgba(34, 211, 238, 0.08)",
                              color: "var(--secondary)",
                              border: "1px solid rgba(34, 211, 238, 0.15)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px"
                            }}
                          >
                            <span>{lbl}</span>
                            {currentPersona !== "moderator" && (
                              <FaTimes
                                size={10}
                                style={{ cursor: "pointer", color: "var(--accent)" }}
                                onClick={() => {
                                  const updated = selectedTask.fields.labels.filter(l => l !== lbl);
                                  handleUpdateLabels(selectedTask.key, updated);
                                }}
                              />
                            )}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>No labels associated.</span>
                      )}
                    </div>
                    
                    {currentPersona !== "moderator" && (
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (labelInputString.trim()) {
                          const existing = selectedTask.fields.labels || [];
                          if (!existing.includes(labelInputString.trim())) {
                            handleUpdateLabels(selectedTask.key, [...existing, labelInputString.trim()]);
                          }
                          setLabelInputString("");
                        }
                      }} style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Add tag string... (e.g. backend)"
                          value={labelInputString}
                          onChange={(e) => setLabelInputString(e.target.value)}
                          style={{ padding: "8px 12px", fontSize: "12px" }}
                        />
                        <button type="submit" className="btn-primary" style={{ padding: "8px 14px", fontSize: "12px" }}>
                          Add tag
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Issue dependency linking */}
                  <div>
                    <h3 style={{ fontSize: "13.5px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: "8px" }}>
                      🔗 Issue Dependency Relations
                    </h3>

                    {currentPersona !== "moderator" && (
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        handleLinkIssues(selectedTask.key, linkTargetKey, linkRelationType);
                      }} className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "10px", border: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
                          <div>
                            <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>RELATION</label>
                            <select
                              className="form-select"
                              value={linkRelationType}
                              onChange={(e) => setLinkRelationType(e.target.value)}
                              style={{ height: "34px", padding: "4px 8px", fontSize: "12px" }}
                            >
                              <option value="blocks">Blocks</option>
                              <option value="is blocked by">Is Blocked By</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>TARGET BOARD ISSUE</label>
                            <select
                              className="form-select"
                              value={linkTargetKey}
                              onChange={(e) => setLinkTargetKey(e.target.value)}
                              style={{ height: "34px", padding: "4px 8px", fontSize: "12px" }}
                            >
                              <option value="">Select ticket...</option>
                              {tasks.filter(t => t.key !== selectedTask.key).map(t => (
                                <option key={t.key} value={t.key}>{t.key} - {t.fields.summary.substring(0, 30)}...</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <button type="submit" className="btn-primary" style={{ padding: "6px 12px", alignSelf: "flex-end", fontSize: "11px" }}>
                          Execute Link
                        </button>
                      </form>
                    )}

                    {/* Linked dependencies history */}
                    <div style={{ marginTop: "12px" }}>
                      <h4 style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Linked Issues</h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "150px", overflowY: "auto" }}>
                        {selectedTask.fields.issuelinks && selectedTask.fields.issuelinks.length > 0 ? (
                          selectedTask.fields.issuelinks.map(lnk => (
                            <div
                              key={lnk.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                background: "rgba(255,255,255,0.01)",
                                border: "1px solid var(--border-glass)",
                                borderRadius: "6px",
                                fontSize: "12px"
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                <span style={{ fontWeight: "700", color: "var(--accent)" }}>{lnk.direction}</span>
                                <span style={{ fontFamily: "var(--mono)", color: "var(--primary)", fontWeight: "600", background: "rgba(45, 212, 191, 0.05)", padding: "2px 6px", borderRadius: "4px" }}>
                                  {lnk.key}
                                </span>
                                <span style={{ color: "var(--text-muted)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                  {lnk.summary}
                                </span>
                              </div>
                              <Badge status={lnk.statusName} />
                            </div>
                          ))
                        ) : (
                          <div style={{ color: "var(--text-muted)", fontSize: "12px", fontStyle: "italic" }}>
                            No linked dependencies defined on this ticket.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-glass)", paddingTop: "14px", marginTop: "14px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Created: {new Date(selectedTask.fields.created).toLocaleDateString()}
              </span>
              <button
                onClick={() => {
                  setSelectedTask(null);
                  setModalTab("overview");
                }}
                className="btn-primary"
                style={{ padding: "8px 18px" }}
              >
                Done Editing
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 📧 MODAL 3: INTERACTIVE EMAIL ALERT COMPOSER */}
      {isEmailOpen && (
        <div style={modalBackdropStyle}>
          <div className="glass-panel" style={{
            width: "550px",
            padding: "30px",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
            position: "relative",
            overflow: "hidden",
            animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            
            {/* Outgoing animation overlay */}
            {isSendingEmail && (
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(7, 9, 14, 0.95)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                gap: "24px"
              }}>
                <div style={{ position: "relative", width: "120px", height: "100px" }}>
                  {/* Envelope Base */}
                  <div style={{
                    width: "80px",
                    height: "50px",
                    border: "2.5px solid var(--primary)",
                    borderRadius: "4px",
                    position: "absolute",
                    bottom: "10px",
                    left: "20px",
                    background: "rgba(99, 102, 241, 0.1)",
                    animation: "envelopeSlide 2.2s infinite ease-in-out"
                  }}>
                    {/* Flap */}
                    <div style={{
                      width: "0",
                      height: "0",
                      borderLeft: "37px solid transparent",
                      borderRight: "37px solid transparent",
                      borderTop: "24px solid var(--primary)",
                      position: "absolute",
                      top: 0,
                      left: "1.5px"
                    }}></div>
                  </div>

                  {/* Letter sliding in */}
                  <div style={{
                    width: "60px",
                    height: "40px",
                    background: "white",
                    borderRadius: "2px",
                    position: "absolute",
                    left: "30px",
                    top: "10px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    animation: "paperInsert 2.2s infinite ease-in-out"
                  }}>
                    <div style={{ width: "40px", height: "3px", background: "#cbd5e1", margin: "8px auto 0" }}></div>
                    <div style={{ width: "40px", height: "3px", background: "#cbd5e1", margin: "4px auto 0" }}></div>
                    <div style={{ width: "30px", height: "3px", background: "#e2e8f0", margin: "4px auto 0" }}></div>
                  </div>
                </div>

                <div style={{ textAlign: "center" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "700" }}>
                    {emailAnimationState === "sending" ? "Relaying via Secure SMTP Gateway..." : "Assembling envelope payload..."}
                  </h3>
                  <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "6px" }}>
                    Relaying request to active Express server...
                  </p>
                </div>
              </div>
            )}

            {/* Email Header info */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "800", display: "flex", alignItems: "center", gap: "10px" }}>
                <FaEnvelope color="var(--accent)" />
                <span>Send Deadline Warning Email</span>
              </h2>
              <button
                onClick={() => setIsEmailOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <FaTimes size={18} />
              </button>
            </div>

            <form onSubmit={handleSendReminderEmail} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <label style={modalLabelStyle}>To (Assignee Email)</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <label style={modalLabelStyle}>Subject Header</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div>
                <label style={modalLabelStyle}>Formatted Message Template</label>
                <textarea
                  required
                  className="form-input"
                  style={{ minHeight: "180px", fontSize: "13px", lineHeight: "1.6", fontFamily: "monospace" }}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setIsEmailOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--secondary))" }}
                >
                  <FaPaperPlane size={12} />
                  <span>Dispatch Email</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* 🚀 MODAL 4: AUTOMATED B2B PROJECT ASSIGNMENT & PROVISIONING */}
      {isAssignModalOpen && selectedAssignProject && (
        <div style={modalBackdropStyle}>
          <div className="glass-panel" style={{
            width: "550px",
            padding: "30px",
            border: "1.5px solid rgba(255,255,255,0.08)",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
            position: "relative",
            overflow: "hidden",
            animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            
            {/* Automatic Provisioning Animation Overlay */}
            {isProvisioning && (
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(3, 7, 18, 0.96)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                gap: "24px"
              }}>
                <div style={{
                  width: "60px",
                  height: "60px",
                  border: "4px solid rgba(45, 212, 191, 0.1)",
                  borderTopColor: "var(--primary)",
                  borderRadius: "50%",
                }} className="pulse-glow"></div>
                <div style={{ textAlign: "center" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Automating Campus Provisioning...
                  </h3>
                  <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "8px", maxWidth: "340px", lineHeight: "1.6" }}>
                    Calling Live Atlassian Jira Cloud REST APIs, generating standard workstreams, and provisioning Epics & Child Tasks...
                  </p>
                </div>
              </div>
            )}

            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <h2 style={{ fontSize: "19px", fontWeight: "800", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🤝 Allocate Sponsor Project</span>
                </h2>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Assigning <strong>{selectedAssignProject.title}</strong> by <strong>{selectedAssignProject.company}</strong>
                </span>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <FaTimes size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignProject} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              
              {/* Target Campus Selector */}
              <div>
                <label style={modalLabelStyle}>Target Institution Campus *</label>
                <select
                  className="form-select"
                  required
                  value={assignTargetCampus}
                  onChange={(e) => setAssignTargetCampus(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", height: "42px", fontSize: "14px" }}
                >
                  <option value="3">🏢 KLE Spoke (Live Jira - Key: AK)</option>
                  <option value="101">🏢 COEP Spoke (Live Jira - Key: AK)</option>
                  <option value="102">🏢 MMCOEP Spoke (Live Jira - Key: AK)</option>
                  <option value="103">🏢 RIT Spoke (Live Jira - Key: AK)</option>
                </select>
                <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px", lineHeight: "1.4" }}>
                  All Spoke campuses are 100% active and connected directly to their backing Agile boards in your Atlassian Jira Cloud instance.
                </p>
              </div>

              {/* Target Due Date Picker */}
              <div>
                <label style={modalLabelStyle}>Project Target Due Date *</label>
                <input
                  type="date"
                  className="form-input"
                  required
                  value={assignDueDate}
                  onChange={(e) => setAssignDueDate(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", height: "42px", fontSize: "14px", colorScheme: theme === "dark" ? "dark" : "light" }}
                />
                <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px", lineHeight: "1.4" }}>
                  This date represents the final FIP delivery deadline. The system will automatically compute and provision intermediate milestones for Phase 1 (30% of duration), Phase 2 (60%), and Phase 3 (100%).
                </p>
              </div>

              {/* Standard FIP Workstreams Preview */}
              <div className="glass-panel" style={{ padding: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "10px" }}>
                <h4 style={{ fontSize: "11.5px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
                  ⚙️ Standard Auto-Provisioned Workstreams
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12.5px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)" }}>
                    <span style={{ color: "var(--primary)", fontWeight: "bold" }}>1.</span>
                    <span>Phase 1: Lab Infrastructure Setup & Hardware Procurement</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)" }}>
                    <span style={{ color: "var(--primary)", fontWeight: "bold" }}>2.</span>
                    <span>Phase 2: Faculty Upskilling & Student Cohort Selection</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)" }}>
                    <span style={{ color: "var(--primary)", fontWeight: "bold" }}>3.</span>
                    <span>Phase 3: Development, Industry Mentorship & Evaluation</span>
                  </div>
                </div>
              </div>

              {/* Dialog Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "10px", borderTop: "1px solid var(--border-glass)", paddingTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: "8px 18px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{
                    padding: "8px 20px",
                    background: "var(--accent)",
                    borderColor: "transparent",
                    boxShadow: "0 4px 12px rgba(239, 68, 68, 0.2)"
                  }}
                >
                  Automate Provisioning ➔
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}

// 📌 SIDEBAR NAV ITEM HELPER
function SidebarNavItem({ active, icon, label, collapsed, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "14px",
        borderRadius: "12px",
        cursor: "pointer",
        background: active ? "rgba(99, 102, 241, 0.12)" : "transparent",
        color: active ? "var(--text-main)" : "var(--text-muted)",
        border: active ? "1px solid rgba(99, 102, 241, 0.2)" : "1px solid transparent",
        transition: "var(--transition-smooth)",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
          e.currentTarget.style.color = "var(--text-main)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }
      }}
    >
      <span style={{ display: "flex", alignItems: "center", color: active ? "var(--primary)" : "inherit" }}>
        {icon}
      </span>
      {!collapsed && (
        <span style={{ fontSize: "14px", fontWeight: active ? "700" : "500", letterSpacing: "0.2px" }}>
          {label}
        </span>
      )}
    </div>
  );
}

// 📌 DASHBOARD METRIC CARD
function DashboardCard({ title, value, subtitle, themeColor, pulse, glow, progress, alert }) {
  return (
    <div
      className="glass-panel"
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        position: "relative",
        overflow: "hidden",
        borderTop: glow ? "2.5px solid var(--primary)" : alert ? "2.5px solid var(--accent)" : "1px solid var(--border-glass)",
        animation: alert ? "pulseWarning 1.5s infinite" : "none"
      }}
    >
      {/* Absolute Glow Background */}
      {glow && (
        <div style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "100px",
          height: "100px",
          borderRadius: "50%",
          background: "var(--primary)",
          filter: "blur(40px)",
          opacity: 0.15,
          pointerEvents: "none"
        }}></div>
      )}

      {alert && (
        <div style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "100px",
          height: "100px",
          borderRadius: "50%",
          background: "var(--accent)",
          filter: "blur(40px)",
          opacity: 0.15,
          pointerEvents: "none"
        }}></div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: "600", letterSpacing: "0.2px" }}>
          {title}
        </span>
        {pulse && (
          <span style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: alert ? "var(--accent)" : "var(--primary)",
            display: "inline-block"
          }} className="pulse-glow"></span>
        )}
      </div>

      <span style={{
        fontSize: "32px",
        fontWeight: "800",
        color: themeColor || "var(--text-main)",
        letterSpacing: "-1px",
        lineHeight: "1.2"
      }}>
        {value}
      </span>

      {progress !== undefined ? (
        <div style={{ width: "100%", marginTop: "4px" }}>
          <div style={{ height: "6px", width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: "3px" }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, var(--primary), var(--secondary))",
              borderRadius: "3px",
              transition: "width 0.5s ease-out"
            }}></div>
          </div>
        </div>
      ) : (
        <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

// 📌 COLUMNS HEADER FOR KANBAN
function ColumnHeader({ title, count, color, bgColor, pulse }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: "10px",
      borderBottom: "1px solid rgba(255,255,255,0.06)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {pulse && (
          <span style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "var(--primary)",
            display: "inline-block"
          }} className="pulse-glow"></span>
        )}
        <span style={{ fontWeight: "700", fontSize: "15px", letterSpacing: "0.2px" }}>{title}</span>
      </div>

      <span style={{
        background: bgColor || "rgba(255,255,255,0.04)",
        color: color || "var(--text-muted)",
        fontSize: "12px",
        fontWeight: "700",
        padding: "3px 8px",
        borderRadius: "20px"
      }}>
        {count}
      </span>
    </div>
  );
}

// 📌 DRAGGABLE TASK CARD (KANBAN BOARD)
function DraggableCard({ task, index, onClick }) {
  const deadline = getDeadlineInfo(task.fields.dueDate, task.fields.status?.name);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`glass-panel ${snapshot.isDragging ? "kanban-card-dragging" : ""} ${task.fields.flagged ? "kanban-card-blocked" : ""}`}
          style={{
            padding: "16px",
            cursor: "grab",
            background: snapshot.isDragging ? "rgba(4, 15, 20, 0.95)" : "var(--bg-card)",
            borderColor: snapshot.isDragging ? "var(--primary)" : "var(--border-glass)",
            boxShadow: snapshot.isDragging ? "0 20px 30px rgba(0,0,0,0.6)" : "var(--shadow-premium)",
            ...provided.draggableProps.style
          }}
        >
          {/* Card Header: Key and Deadline Badge */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: "11px",
                fontWeight: "700",
                color: "var(--primary)",
                background: "rgba(45, 212, 191, 0.08)",
                padding: "2px 6px",
                borderRadius: "4px"
              }}>
                {task.key}
              </span>
              {task.fields.issueType && (
                <span style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  backgroundColor:
                    task.fields.issueType === "Epic" ? "rgba(168, 85, 247, 0.12)" :
                    task.fields.issueType === "Bug" ? "rgba(239, 68, 68, 0.12)" :
                    task.fields.issueType === "Story" ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)",
                  color:
                    task.fields.issueType === "Epic" ? "#c084fc" :
                    task.fields.issueType === "Bug" ? "#f87171" :
                    task.fields.issueType === "Story" ? "#34d399" : "#60a5fa",
                  border: "1px solid",
                  borderColor:
                    task.fields.issueType === "Epic" ? "rgba(168, 85, 247, 0.25)" :
                    task.fields.issueType === "Bug" ? "rgba(239, 68, 68, 0.25)" :
                    task.fields.issueType === "Story" ? "rgba(16, 185, 129, 0.25)" : "rgba(59, 130, 246, 0.25)"
                }}>
                  {task.fields.issueType === "Epic" ? "👑 Epic" :
                   task.fields.issueType === "Bug" ? "🐛 Bug" :
                   task.fields.issueType === "Story" ? "📖 Story" : "📋 Task"}
                </span>
              )}
              {task.fields.flagged && (
                <span className="pulse-glow" style={{
                  fontSize: "9px",
                  fontWeight: "800",
                  color: "var(--accent)",
                  background: "rgba(251, 146, 60, 0.15)",
                  border: "1px solid var(--accent)",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  letterSpacing: "0.2px"
                }}>
                  🚨 BLOCKED
                </span>
              )}
            </div>

            {deadline && (
              <span className={deadline.type === "overdue" ? "overdue-badge-blink" : ""} style={{
                fontSize: "10px",
                fontWeight: "700",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor:
                  deadline.type === "overdue" ? "var(--priority-high-bg)" :
                  deadline.type === "soon" ? "var(--priority-medium-bg)" : "rgba(255, 255, 255, 0.04)",
                color:
                  deadline.type === "overdue" ? "var(--priority-high-text)" :
                  deadline.type === "soon" ? "var(--priority-medium-text)" : "var(--text-muted)",
                border: "1px solid",
                borderColor:
                  deadline.type === "overdue" ? "var(--priority-high-border)" :
                  deadline.type === "soon" ? "var(--priority-medium-border)" : "var(--border-glass)",
              }}>
                {deadline.text}
              </span>
            )}
          </div>

          {/* Card Title/Summary */}
          <p style={{
            fontSize: "13.5px",
            fontWeight: "600",
            lineHeight: "1.4",
            color: "var(--text-main)",
            marginBottom: "12px",
            display: "-webkit-box",
            WebkitLineClamp: "2",
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}>
            {task.fields.summary}
          </p>

          {/* Time Tracking Estimation progress meter */}
          {task.fields.timetracking && task.fields.timetracking.originalEstimateSeconds > 0 && (
            <div style={{ marginBottom: "12px", background: "rgba(255, 255, 255, 0.01)", padding: "6px 8px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                <span>Spent: {task.fields.timetracking.timeSpent || "0h"}</span>
                <span>Est: {task.fields.timetracking.originalEstimate}</span>
              </div>
              <div style={{ height: "4px", width: "100%", background: "rgba(255, 255, 255, 0.04)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round((task.fields.timetracking.timeSpentSeconds / task.fields.timetracking.originalEstimateSeconds) * 100))}%`,
                  background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                  borderRadius: "2px"
                }}></div>
              </div>
            </div>
          )}

          {/* Card Footer: Assignee & Checklist trackers */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: "12px",
            borderTop: "1px solid rgba(255, 255, 255, 0.03)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <Badge priority={task.fields.priority?.name} />
              
              {task.fields.subtasks && task.fields.subtasks.length > 0 && (
                <span style={{
                  fontSize: "10.5px",
                  fontWeight: "700",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }} title="Subtask checklist completion">
                  ☑️ {task.fields.subtasks.filter(s => s.statusName === "Done").length}/{task.fields.subtasks.length}
                </span>
              )}
            </div>

            {task.fields.assignee ? (
              <img
                src={task.fields.assignee.avatarUrl}
                alt={task.fields.assignee.displayName}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(255,255,255,0.1)"
                }}
                title={`Assigned to ${task.fields.assignee.displayName}`}
              />
            ) : (
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  border: "1px dashed var(--text-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-dim)",
                  fontSize: "10px"
                }}
                title="Unassigned"
              >
                ?
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

// 📌 STATUS AND PRIORITY BADGES
function Badge({ status, priority }) {
  if (status) {
    const isDone = status === "Done";
    const isProgress = status === "In Progress";
    
    return (
      <span style={{
        fontSize: "11px",
        fontWeight: "700",
        padding: "3px 8px",
        borderRadius: "20px",
        backgroundColor:
          isDone ? "var(--status-done-bg)" :
          isProgress ? "var(--status-progress-bg)" : "var(--status-backlog-bg)",
        color:
          isDone ? "var(--status-done-text)" :
          isProgress ? "var(--status-progress-text)" : "var(--status-backlog-text)",
        border: "1px solid",
        borderColor:
          isDone ? "var(--status-done-border)" :
          isProgress ? "var(--status-progress-border)" : "var(--status-backlog-border)",
      }}>
        {status}
      </span>
    );
  }

  if (priority) {
    const isHigh = priority === "High";
    const isMedium = priority === "Medium";
    
    return (
      <span style={{
        fontSize: "10px",
        fontWeight: "700",
        padding: "2px 6px",
        borderRadius: "4px",
        backgroundColor:
          isHigh ? "var(--priority-high-bg)" :
          isMedium ? "var(--priority-medium-bg)" : "var(--priority-low-bg)",
        color:
          isHigh ? "var(--priority-high-text)" :
          isMedium ? "var(--priority-medium-text)" : "var(--priority-low-text)",
        border: "1px solid",
        borderColor:
          isHigh ? "var(--priority-high-border)" :
          isMedium ? "var(--priority-medium-border)" : "var(--priority-low-border)",
      }}>
        {priority}
      </span>
    );
  }

  return null;
}

// 📌 EMPTY STATE VIEW
function EmptyStateMessage({ text, showIcon }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px",
      textAlign: "center",
      height: "100%",
      gap: "12px"
    }}>
      {showIcon && <FaRegLightbulb size={36} color="var(--text-dim)" />}
      <p style={{ color: "var(--text-muted)", fontSize: "14px", maxWidth: "320px", lineHeight: "1.5" }}>
        {text}
      </p>
    </div>
  );
}

// Inline constant styles
const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(3, 7, 18, 0.7)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const modalLabelStyle = {
  display: "block",
  fontSize: "12px",
  fontWeight: "700",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  color: "var(--text-muted)",
  marginBottom: "8px"
};

// ==========================================
// APNILEAP EXECUTIVE HUB COMPONENTS
// ==========================================

function HubDashboardView({ metrics, loading, onRefresh, moderatorProjects }) {
  if (loading || !metrics) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "400px", gap: "16px" }}>
        <div style={{
          width: "48px",
          height: "48px",
          border: "4px solid rgba(45, 212, 191, 0.1)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
        }} className="pulse-glow"></div>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Aggregating cross-college portfolio metrics...</p>
      </div>
    );
  }

  const totalIssues = metrics.spokes.reduce((sum, s) => sum + s.total, 0);
  const totalDone = metrics.spokes.reduce((sum, s) => sum + s.done, 0);
  const globalCompletionRate = totalIssues > 0 ? Math.round((totalDone / totalIssues) * 100) : 0;
  const totalBlockers = metrics.blockers.length;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
      
      {/* Portfolio Summary KPI Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "20px"
      }}>
        <DashboardCard
          title="Global Scoped Tasks"
          value={totalIssues}
          subtitle="Across all active spokes"
          glow={true}
        />
        <DashboardCard
          title="Consolidated Completion"
          value={`${globalCompletionRate}%`}
          subtitle="Portfolio progress rate"
          progress={globalCompletionRate}
        />
        <DashboardCard
          title="Active Escalations"
          value={totalBlockers}
          subtitle="Critical cross-college blockers"
          themeColor="var(--priority-high-text)"
          pulse={totalBlockers > 0}
          alert={totalBlockers > 0}
        />
        <DashboardCard
          title="Active Spokes"
          value="4 / 4"
          subtitle="KLE, COEP, MMCOEP, RIT"
          themeColor="var(--primary)"
        />
      </div>

      {/* College Comparison & Active Blockers Row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
        gap: "24px"
      }}>
        {/* Spokes Progress Bar Chart */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "360px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: "700", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
            📊 College Spoke Progress
          </h3>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.spokes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-glass)", borderRadius: "8px", color: "var(--text-main)", fontSize: 12 }}
                  cursor={{ fill: "rgba(255,255,255,0.02)" }}
                />
                <Bar dataKey="completionRate" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Completion Rate">
                  {metrics.spokes.map((entry, index) => {
                    const colors = ["#2dd4bf", "#fb923c", "#22d3ee", "#a855f7"];
                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Blocker Feed Panel */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", height: "360px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: "700", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--priority-high-text)", display: "flex", alignItems: "center", gap: "8px" }}>
            <FaExclamationTriangle className="pulse-glow" style={{ borderRadius: "50%" }} />
            <span>⚠️ Critical Blockers & Escalations</span>
          </h3>
          
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", paddingRight: "4px" }}>
            {metrics.blockers && metrics.blockers.length > 0 ? (
              metrics.blockers.map(blocker => (
                <div
                  key={blocker.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "rgba(239, 68, 68, 0.03)",
                    border: "1px solid rgba(239, 68, 68, 0.15)",
                    borderRadius: "10px",
                    fontSize: "13px",
                    gap: "10px"
                  }}
                  className="pulse-glow"
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", fontWeight: "800", color: "#f87171", background: "rgba(239, 68, 68, 0.1)", padding: "1px 6px", borderRadius: "4px" }}>
                        {blocker.key}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-dim)", fontWeight: "700", textTransform: "uppercase" }}>
                        {blocker.spokeName}
                      </span>
                    </div>
                    <span style={{ color: "var(--text-main)", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {blocker.summary}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", shrink: 0 }}>
                    {blocker.assignee ? (
                      <img
                        src={blocker.assignee.avatarUrl}
                        alt={blocker.assignee.displayName}
                        style={{ width: "24px", height: "24px", borderRadius: "50%", border: "1.5px solid var(--border-glass)" }}
                        title={`Assigned to ${blocker.assignee.displayName}`}
                      />
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", fontStyle: "italic" }}>Unassigned</span>
                    )}
                    <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                      {blocker.priority}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px" }}>
                <span>✨ No cross-college blockers active. Excellent execution!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 15 Standard Workstreams Progress Matrix */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
          👑 15 Standard Workstreams Matrix
        </h3>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--border-glass)" }}>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "40%" }}>Workstream / Standard Epic</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" }}>KLE Spoke (Live)</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" }}>COEP Spoke</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" }}>MMCOEP Spoke</th>
                <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" }}>RIT Spoke</th>
              </tr>
            </thead>
            <tbody>
              {metrics.workstreams.map((ws, idx) => (
                <tr
                  key={ws.name}
                  style={{
                    borderBottom: "1px solid var(--border-glass)",
                    background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                    transition: "var(--transition-smooth)"
                  }}
                  className="table-row-hover"
                >
                  <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main)" }}>
                    <span style={{ marginRight: "10px", color: "var(--primary)" }}>{idx + 1}.</span>
                    {ws.name}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <ProgressBadge pct={ws.KLE} />
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <ProgressBadge pct={ws.COEP} />
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <ProgressBadge pct={ws.MMCOEP} />
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "center" }}>
                    <ProgressBadge pct={ws.RIT} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 💼 Active Corporate Partnerships Tracker */}
      <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-glass)", paddingBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>💼</span>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "850", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
              Corporate Partnerships & Campus Deployments
            </h3>
          </div>
          <span style={{ fontSize: "11px", fontWeight: "750", background: "var(--primary-glow)", color: "var(--primary)", border: "1px solid var(--border-glow)", padding: "4px 10px", borderRadius: "6px", textTransform: "uppercase" }}>
            Multi-Tenant Portfolio Tracking
          </span>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "24px"
        }}>
          {metrics.b2bProjects && metrics.b2bProjects.length > 0 ? (
            metrics.b2bProjects.map(proj => {
              const activeAllocations = proj.allocations ? proj.allocations.filter(a => a.status === "Active" || a.status === "Proposed") : [];
              return (
                <div key={proj.id} className="table-row-hover" style={{
                  background: "rgba(255, 255, 255, 0.01)",
                  border: "1px solid var(--border-glass)",
                  borderRadius: "14px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  transition: "var(--transition-smooth)"
                }}>
                  {/* Card Header: Brand, Title, Budget */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    {proj.logoUrl && (
                      <img
                        src={proj.logoUrl}
                        alt={proj.company}
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "8px",
                          objectFit: "contain",
                          background: "white",
                          padding: "2px",
                          border: "1px solid var(--border-glass)"
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {proj.title}
                      </h4>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px", fontSize: "11px", color: "var(--text-dim)" }}>
                        <span>Sponsor: <strong style={{ color: "var(--text-muted)" }}>{proj.company}</strong></span>
                        <span>•</span>
                        <span>Budget: <strong style={{ color: "var(--text-muted)" }}>{proj.budget}</strong></span>
                        <span>•</span>
                        <span>Duration: <strong style={{ color: "var(--text-muted)" }}>{proj.duration}</strong></span>
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                    {proj.description}
                  </p>

                  {/* College Spaces Tracking Grid */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border-glass)", paddingTop: "14px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Institutional Deployments ({activeAllocations.length})
                    </span>

                    {activeAllocations.length > 0 ? (
                      activeAllocations.map(alloc => {
                        // Calculate days left relative to May 26, 2026
                        const today = new Date("2026-05-26");
                        const due = new Date(alloc.proposedDueDate);
                        const diffTime = due.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        let daysText = "";
                        let daysClassColor = "var(--primary)";
                        let daysBgColor = "var(--primary-glow)";

                        if (diffDays < 0) {
                          daysText = `${Math.abs(diffDays)}d overdue`;
                          daysClassColor = "#ef4444";
                          daysBgColor = "rgba(239, 68, 68, 0.1)";
                        } else if (diffDays === 0) {
                          daysText = "Due Today!";
                          daysClassColor = "var(--accent)";
                          daysBgColor = "rgba(251, 146, 60, 0.15)";
                        } else if (diffDays <= 7) {
                          daysText = `${diffDays}d left`;
                          daysClassColor = "var(--accent)";
                          daysBgColor = "rgba(251, 146, 60, 0.12)";
                        } else {
                          daysText = `${diffDays} days left`;
                          daysClassColor = "var(--primary)";
                          daysBgColor = "var(--primary-glow)";
                        }

                        const isProposed = alloc.status === "Proposed";

                        return (
                          <div key={alloc.targetCampusId} style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            padding: "10px 12px",
                            background: "rgba(255, 255, 255, 0.005)",
                            border: "1px solid var(--border-glass)",
                            borderRadius: "8px"
                          }}>
                            {/* Spoke Header */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                              <span style={{ fontWeight: "700", color: "var(--text-main)" }}>
                                🏫 {alloc.assignedTo}
                              </span>
                              <span style={{
                                fontSize: "9px",
                                fontWeight: "900",
                                background: isProposed ? "rgba(251, 146, 60, 0.08)" : "rgba(45, 212, 191, 0.08)",
                                border: isProposed ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid rgba(45, 212, 191, 0.2)",
                                color: isProposed ? "var(--accent)" : "#2dd4bf",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                textTransform: "uppercase"
                              }}>{alloc.status}</span>
                            </div>

                            {/* Spoke Timeline, Epic, and Progress */}
                            {!isProposed ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-dim)" }}>
                                  <span>Jira Epic: <strong style={{ color: "var(--text-main)", fontFamily: "var(--mono)" }}>{alloc.assignedKey || "Epic Provisioned"}</strong></span>
                                  <span style={{
                                    fontWeight: "800",
                                    color: daysClassColor,
                                    background: daysBgColor,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "10px"
                                  }}>{daysText}</span>
                                </div>
                                {/* Milestone progress bar */}
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "2px" }}>
                                  <div style={{ flex: 1, height: "6px", background: "rgba(255, 255, 255, 0.03)", borderRadius: "3px", overflow: "hidden", border: "1px solid var(--border-glass)" }}>
                                    <div style={{
                                      width: `${alloc.progressPercent || 0}%`,
                                      height: "100%",
                                      background: "linear-gradient(90deg, var(--primary), var(--secondary))",
                                      borderRadius: "3px",
                                      boxShadow: "0 0 8px var(--primary)",
                                      transition: "width 0.5s cubic-bezier(0.1, 0.8, 0.1, 1)"
                                    }}></div>
                                  </div>
                                  <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--primary)", fontFamily: "var(--mono)", minWidth: "32px", textAlign: "right" }}>
                                    {alloc.progressPercent || 0}%
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "var(--text-dim)", padding: "2px 0" }}>
                                <span>Awaiting Coordinator Decision</span>
                                <span>Deadline: <strong>{alloc.proposedDueDate}</strong></span>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-dim)", fontStyle: "italic", padding: "4px 0" }}>
                        No campus spaces assigned yet.
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "120px", color: "var(--text-muted)", fontStyle: "italic", fontSize: "13px" }}>
              <span>💼 No corporate projects active in the portfolio yet.</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function ProgressBadge({ pct }) {
  let bg = "rgba(45, 212, 191, 0.08)";
  let border = "rgba(45, 212, 191, 0.2)";
  let text = "#2dd4bf";

  if (pct < 40) {
    bg = "rgba(239, 68, 68, 0.08)";
    border = "rgba(239, 68, 68, 0.2)";
    text = "#ef4444";
  } else if (pct < 75) {
    bg = "rgba(251, 146, 60, 0.08)";
    border = "rgba(251, 146, 60, 0.2)";
    text = "#fb923c";
  }

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4px 10px",
      borderRadius: "6px",
      background: bg,
      border: `1px solid ${border}`,
      color: text,
      fontWeight: "700",
      fontSize: "11.5px",
      minWidth: "55px",
      fontFamily: "var(--mono)"
    }}>
      {pct}%
    </div>
  );
}

// ==========================================
// B2B MODERATOR PORTAL COMPONENTS
// ==========================================

function ModeratorDashboardView({ projects, loading, onRefresh, onAssignClick }) {
  const [activeTab, setActiveTab] = useState("proposals"); // "proposals" or "deadlines"
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResults, setAuditResults] = useState(null);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "400px", gap: "16px" }}>
        <div style={{
          width: "48px",
          height: "48px",
          border: "4px solid rgba(251, 146, 60, 0.1)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
        }} className="pulse-glow"></div>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Synchronizing project ingestion portal...</p>
      </div>
    );
  }

  const totalProjects = projects.length;
  const assignedProjects = projects.filter(p => (p.allocations && p.allocations.length > 0) || p.status === "Proposed" || p.status === "Active" || p.status.includes("BREACHED")).length;
  const pendingProjects = totalProjects - assignedProjects;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
      
      {/* Portfolio Intake KPIs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "20px"
      }}>
        <DashboardCard
          title="Total Proposals"
          value={totalProjects}
          subtitle="Direct company submissions"
          glow={true}
        />
        <DashboardCard
          title="Active Allocations"
          value={assignedProjects}
          subtitle="Provisioned to campus workspaces"
          themeColor="var(--status-done-text)"
        />
        <DashboardCard
          title="Pending Moderator Review"
          value={pendingProjects}
          subtitle="Awaiting campus assignment"
          themeColor={pendingProjects > 0 ? "var(--priority-medium-text)" : "var(--text-dim)"}
          pulse={pendingProjects > 0}
        />
        <DashboardCard
          title="Avg Project Value"
          value="$26,666"
          subtitle="FIP external funding"
          themeColor="var(--primary)"
        />
      </div>

      {/* Premium Tab Switcher */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--border-glass)", paddingBottom: "16px" }}>
        <button
          onClick={() => setActiveTab("proposals")}
          style={{
            background: activeTab === "proposals" ? "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))" : "transparent",
            border: "1px solid " + (activeTab === "proposals" ? "var(--primary)" : "var(--border-glass)"),
            color: activeTab === "proposals" ? "var(--text-main)" : "var(--text-muted)",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span>🛠️ Ingested proposals</span>
        </button>
        <button
          onClick={() => setActiveTab("deadlines")}
          style={{
            background: activeTab === "deadlines" ? "linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(249, 115, 22, 0.08))" : "transparent",
            border: "1px solid " + (activeTab === "deadlines" ? "#ef4444" : "var(--border-glass)"),
            color: activeTab === "deadlines" ? "var(--text-main)" : "var(--text-muted)",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12.5px",
            fontWeight: "700",
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span>🚨 Deadlines & Alerts Console</span>
        </button>
      </div>

      {activeTab === "proposals" ? (
        /* Projects Intake Glass Board */
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>🛠️ Project Intake Board</h3>
              <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "4px" }}>Review budget scope, and instantly automate provisioning to campus Jira spaces.</p>
            </div>
            <button onClick={onRefresh} className="btn-secondary" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
              <FaSyncAlt size={12} />
              <span style={{ fontSize: "12px" }}>Refresh Intake</span>
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--border-glass)" }}>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "150px" }}>Company / Partner</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700" }}>Project Details</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "110px", textAlign: "center" }}>Funding</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "110px", textAlign: "center" }}>Duration</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "150px", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", width: "160px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((proj, idx) => {
                  const isAssigned = proj.status !== "Pending Assignment";
                  return (
                    <tr
                      key={proj.id}
                      style={{
                        borderBottom: "1px solid var(--border-glass)",
                        background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                        transition: "var(--transition-smooth)"
                      }}
                      className="table-row-hover"
                    >
                      {/* Company Column */}
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {proj.logoUrl && (
                            <img
                              src={proj.logoUrl}
                              alt={proj.company}
                              style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "contain", border: "1.5px solid var(--border-glass)", background: "white", padding: "2px" }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{proj.company}</span>
                        </div>
                      </td>

                      {/* Details Column */}
                      <td style={{ padding: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontWeight: "700", color: "var(--primary)", fontSize: "14px" }}>{proj.title}</span>
                          <p style={{ color: "var(--text-muted)", fontSize: "12px", lineHeight: "1.5", margin: 0, maxWidth: "450px" }}>{proj.description}</p>
                        </div>
                      </td>

                      {/* Budget Column */}
                      <td style={{ padding: "16px", textAlign: "center", fontWeight: "700", color: "var(--primary)", fontFamily: "var(--mono)" }}>
                        {proj.budget}
                      </td>

                      {/* Duration Column */}
                      <td style={{ padding: "16px", textAlign: "center", color: "var(--text-main)", fontWeight: "500" }}>
                        {proj.duration}
                      </td>

                      {/* Status Column */}
                      <td style={{ padding: "16px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: proj.status.includes("BREACHED")
                            ? "rgba(239, 68, 68, 0.08)"
                            : proj.status === "Active"
                            ? "rgba(16, 185, 129, 0.08)"
                            : proj.status === "Proposed"
                            ? "rgba(99, 102, 241, 0.08)"
                            : "rgba(251, 146, 60, 0.08)",
                          border: proj.status.includes("BREACHED")
                            ? "1px solid rgba(239, 68, 68, 0.2)"
                            : proj.status === "Active"
                            ? "1px solid rgba(16, 185, 129, 0.2)"
                            : proj.status === "Proposed"
                            ? "1px solid rgba(99, 102, 241, 0.2)"
                            : "1px solid rgba(251, 146, 60, 0.2)",
                          color: proj.status.includes("BREACHED")
                            ? "#ef4444"
                            : proj.status === "Active"
                            ? "#34d399"
                            : proj.status === "Proposed"
                            ? "#818cf8"
                            : "#fb923c",
                          textTransform: "uppercase"
                        }}>
                          {proj.status.includes("BREACHED")
                            ? "🚨 Breached"
                            : proj.status === "Active"
                            ? "✅ Active"
                            : proj.status === "Proposed"
                            ? "⏳ Proposed"
                            : "⏳ Pending Review"}
                        </span>
                      </td>

                      {/* Action Column */}
                      <td style={{ padding: "16px", textAlign: "center" }}>
                        {isAssigned ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: "700", textTransform: "uppercase" }}>{proj.assignedTo}</span>
                            <span style={{
                              fontFamily: "var(--mono)",
                              fontSize: "11px",
                              fontWeight: "800",
                              color: proj.assignedKey ? "var(--primary)" : "#818cf8",
                              background: proj.assignedKey ? "rgba(99, 102, 241, 0.1)" : "rgba(99, 102, 241, 0.05)",
                              padding: "2px 6px",
                              borderRadius: "4px"
                            }}>
                              {proj.assignedKey || "Awaiting Acceptance"}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => onAssignClick(proj)}
                            className="btn-primary"
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              borderRadius: "8px",
                              background: "var(--accent)",
                              borderColor: "transparent",
                              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.15)"
                            }}
                          >
                            Assign Project
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Deadlines & Alerts Console */
        <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
          {/* Auditor Trigger Control Card */}
          <div className="glass-panel" style={{
            padding: "24px",
            background: "linear-gradient(135deg, rgba(31, 41, 55, 0.4), rgba(17, 24, 39, 0.6))",
            border: "1.5px solid rgba(239, 68, 68, 0.15)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ maxWidth: "550px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: "800", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#ef4444" }}>🚨</span>
                  <span>Automated Deadline Auditor Scanner</span>
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "6px", lineHeight: "1.5" }}>
                  Run a real-time audit across all active campus spoke spaces. The scanner checks the child deliverables progress, identifies breaches, marks project states, and prepares urgent warning email alerts for campus coordinators.
                </p>
              </div>
              <button
                onClick={async () => {
                  setAuditLoading(true);
                  try {
                    const res = await axios.post("http://localhost:5000/moderator/alerts/check");
                    setAuditResults(res.data);
                    onRefresh(); // reload projects to update their statuses
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setAuditLoading(false);
                  }
                }}
                disabled={auditLoading}
                className="btn-primary"
                style={{
                  background: "linear-gradient(135deg, #ef4444, #f97316)",
                  borderColor: "transparent",
                  color: "white",
                  padding: "10px 24px",
                  borderRadius: "10px",
                  fontWeight: "700",
                  fontSize: "13px",
                  boxShadow: "0 4px 15px rgba(239, 68, 68, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer"
                }}
              >
                <FaSyncAlt size={12} className={auditLoading ? "pulse-glow" : ""} />
                <span>{auditLoading ? "Auditing Ecosystem..." : "Execute Auto-Auditor Scanner"}</span>
              </button>
            </div>

            {/* Audit Output terminal panel */}
            {auditResults && (
              <div className="fade-in" style={{ marginTop: "20px" }}>
                <div style={{
                  background: "#07090e",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "12px",
                  padding: "16px 20px",
                  fontFamily: "var(--mono)",
                  fontSize: "12px",
                  color: "#34d399",
                  maxHeight: "220px",
                  overflowY: "auto",
                  lineHeight: "1.6"
                }}>
                  <div style={{ color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "6px", marginBottom: "10px", display: "flex", justifyContent: "space-between" }}>
                    <span>🖥️ AUDITOR CLI TERMINAL</span>
                    <span>SUCCESS</span>
                  </div>
                  <div>[baseline local time: 2026-05-27] Initiating full FIP portfolio audit...</div>
                  <div>Scanning campus spaces KLE (live), COEP (mock), MMCOEP (mock), RIT (mock)...</div>
                  <div style={{ color: "white" }}>&gt;&gt; {auditResults.message}</div>
                  {auditResults.alerts && auditResults.alerts.length > 0 ? (
                    auditResults.alerts.map((al, idx) => (
                      <div key={idx} style={{ marginTop: "8px" }}>
                        <span style={{ color: "#ef4444", fontWeight: "bold" }}>[BREACH DETECTED]</span> Project "{al.title}" assigned to {al.assignedTo} has breached deadline {al.dueDate} by {al.daysOverdue} days!
                        <div style={{ color: "#e0a82e", paddingLeft: "15px" }}>- Deliverables Completion: {al.completionRate}%</div>
                        <div style={{ color: "#8ab4f8", paddingLeft: "15px" }}>- Auto-dispatched prep SMTP warning alert to: coordinator@{al.assignedTo.split(" ")[0].toLowerCase()}.edu</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#10b981", fontWeight: "bold", marginTop: "8px" }}>[OK] No overdue FIP deadline breaches detected. All campus workspaces on track!</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active Allocations Matrix */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)", marginBottom: "16px" }}>
              Active Project Allocations Matrix
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--border-glass)" }}>
                    <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700" }}>Project Details</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "left" }}>Campus Deployments, Keys, Deadlines & Progress Metrics</th>
                    <th style={{ padding: "12px 16px", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.filter(p => (p.allocations && p.allocations.length > 0) || p.status === "Proposed" || p.status === "Active" || p.status.includes("BREACHED")).map((proj, idx) => {
                    const activeAllocations = proj.allocations || [];
                    return (
                      <tr
                        key={proj.id}
                        style={{
                          borderBottom: "1px solid var(--border-glass)",
                          background: idx % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent"
                        }}
                      >
                        {/* Project Details */}
                        <td style={{ padding: "16px", verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            {proj.logoUrl && (
                              <img
                                src={proj.logoUrl}
                                alt={proj.company}
                                style={{ width: "24px", height: "24px", borderRadius: "4px", objectFit: "contain", background: "white", padding: "1px" }}
                              />
                            )}
                            <div>
                              <div style={{ fontWeight: "750", color: "var(--text-main)", fontSize: "13.5px" }}>{proj.title}</div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Sponsor: <strong>{proj.company}</strong> | Budget: <strong>{proj.budget}</strong></span>
                            </div>
                          </div>
                        </td>

                        {/* Multi-spoke Institution Allocations */}
                        <td colSpan={4} style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {activeAllocations.length > 0 ? (
                              activeAllocations.map(alloc => {
                                const isProposed = alloc.status === "Proposed";
                                // Calculate days left relative to May 26, 2026
                                const today = new Date("2026-05-26");
                                const due = new Date(alloc.proposedDueDate);
                                const diffTime = due.getTime() - today.getTime();
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                const isBreached = diffDays < 0;

                                return (
                                  <div key={alloc.targetCampusId} style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.5fr 1fr 1.2fr 1fr 1fr",
                                    alignItems: "center",
                                    gap: "12px",
                                    background: "rgba(255, 255, 255, 0.005)",
                                    border: "1px solid var(--border-glass)",
                                    borderRadius: "8px",
                                    padding: "6px 12px"
                                  }}>
                                    {/* College space name */}
                                    <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "12px" }}>
                                      🏫 {alloc.assignedTo}
                                    </div>

                                    {/* JIRA Epic Key */}
                                    <div style={{ fontFamily: "var(--mono)", fontSize: "11.5px", color: isProposed ? "var(--text-dim)" : "var(--primary)", fontWeight: "bold" }}>
                                      {alloc.assignedKey || "Awaiting Decision"}
                                    </div>

                                    {/* Target deadline */}
                                    <div style={{ fontSize: "11.5px", color: isBreached ? "#f87171" : "var(--text-muted)", fontWeight: "700" }}>
                                      ⏰ {alloc.proposedDueDate}
                                    </div>

                                    {/* Risk/Alloc Status */}
                                    <div>
                                      <span style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        fontSize: "9.5px",
                                        fontWeight: "800",
                                        background: isBreached 
                                          ? "rgba(239, 68, 68, 0.08)" 
                                          : (isProposed ? "rgba(251, 146, 60, 0.08)" : "rgba(45, 212, 191, 0.08)"),
                                        border: isBreached 
                                          ? "1px solid rgba(239, 68, 68, 0.2)" 
                                          : (isProposed ? "1px solid rgba(251, 146, 60, 0.2)" : "1px solid rgba(45, 212, 191, 0.2)"),
                                        color: isBreached 
                                          ? "#ef4444" 
                                          : (isProposed ? "var(--accent)" : "#2dd4bf"),
                                        textTransform: "uppercase"
                                      }}>
                                        {isBreached ? "🚨 BREACHED" : (isProposed ? "⏳ PROPOSED" : "⏳ ACTIVE")}
                                      </span>
                                    </div>

                                    {/* Actions & Alerts */}
                                    <div style={{ textAlign: "right" }}>
                                      <button
                                        onClick={async () => {
                                          try {
                                            await axios.post("http://localhost:5000/moderator/alerts/check");
                                            alert(`Deadline warning notification dispatched successfully to ${alloc.assignedTo} Coordinator!`);
                                          } catch (err) {
                                            console.error(err);
                                          }
                                        }}
                                        className="btn-secondary"
                                        style={{
                                          padding: "4px 8px",
                                          fontSize: "10.5px",
                                          borderRadius: "5px",
                                          color: isBreached ? "#f87171" : "var(--text-muted)",
                                          borderColor: isBreached ? "rgba(239, 68, 68, 0.3)" : "var(--border-glass)",
                                          cursor: "pointer"
                                        }}
                                      >
                                        Alert Spoke ✉️
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <span style={{ fontSize: "12px", color: "var(--text-dim)", fontStyle: "italic", padding: "4px 0" }}>
                                No campus space deployments assigned. Click '+ Allocate Spoke' to begin.
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assign actions column */}
                        <td style={{ padding: "16px", verticalAlign: "middle", textAlign: "center" }}>
                          <button
                            onClick={() => onAssignClick(proj)}
                            className="btn-primary"
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              borderRadius: "8px",
                              background: "var(--accent)",
                              borderColor: "transparent",
                              boxShadow: "0 4px 12px rgba(239, 68, 68, 0.15)",
                              cursor: "pointer"
                            }}
                          >
                            + Allocate Spoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {projects.filter(p => (p.allocations && p.allocations.length > 0) || p.status === "Proposed" || p.status === "Active" || p.status.includes("BREACHED")).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-dim)" }}>
                        No active campus allocations found. Go to Ingested Proposals to allocate projects.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==========================================
// COLLABORATIVE Sync Meetings PORTAL VIEW
// ==========================================

function MeetingsPortalView({ meetings, loading, onRefresh, spokes, triggerToast, moderatorProjects = [] }) {
  const getSpokeProjectStatus = (spokeName) => {
    const activeProjs = moderatorProjects.filter(p => p.assignedTo === spokeName && (p.status === "Active" || p.status.startsWith("Assigned") || p.status.includes("BREACHED")));
    const proposedProjs = moderatorProjects.filter(p => p.assignedTo === spokeName && p.status === "Proposed");
    
    if (activeProjs.length > 0) {
      return `🔥 Active: ${activeProjs.map(p => p.company).join(", ")}`;
    }
    if (proposedProjs.length > 0) {
      return `⏳ Proposed: ${proposedProjs.map(p => p.company).join(", ")}`;
    }
    return `💤 Awaiting Projects`;
  };
  const [newTitle, setNewTitle] = useState("");
  const [newCampusId, setNewCampusId] = useState("3");
  const [newDate, setNewDate] = useState("2026-05-27");
  const [newTime, setNewTime] = useState("14:30");
  const [newLink, setNewLink] = useState("");
  const [newAgenda, setNewAgenda] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [remindLoading, setRemindLoading] = useState(null); // id of meeting loading reminder

  const isConflicted = (meet) => {
    return meetings.some(m => m.id !== meet.id && m.campusId === meet.campusId && m.date === meet.date && m.time === meet.time);
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      triggerToast("Please enter a meeting title.", "warning");
      return;
    }

    const overlap = meetings.some(m => m.campusId === newCampusId && m.date === newDate && m.time === newTime);
    if (overlap) {
      triggerToast(`⚠️ Schedule Conflict: There is already a sync scheduled for this campus today at ${newTime}!`, "warning");
    }

    setIsScheduling(true);
    try {
      const res = await axios.post("http://localhost:5000/meetings", {
        title: newTitle,
        campusId: newCampusId,
        date: newDate,
        time: newTime,
        link: newLink,
        agenda: newAgenda
      });

      if (res.data && res.data.success) {
        triggerToast("FIP campus sync meeting scheduled successfully!");
        setNewTitle("");
        setNewLink("");
        setNewAgenda("");
        onRefresh();
      }
    } catch (err) {
      console.error(err);
      triggerToast("Failed to schedule sync meeting.", "error");
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSendReminder = async (meetId) => {
    setRemindLoading(meetId);
    try {
      const res = await axios.post(`http://localhost:5000/meetings/${meetId}/remind`);
      if (res.data && res.data.success) {
        triggerToast(`Reminder dispatched! Notified ${res.data.notifiedEmails.length} coordinators with ${res.data.overdueCount} overdue items and ${res.data.blockerCount} blockers.`);
      }
    } catch (err) {
      console.error(err);
      triggerToast("Failed to dispatch meeting warning reminder.", "error");
    } finally {
      setRemindLoading(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "400px", gap: "16px" }}>
        <div style={{
          width: "48px",
          height: "48px",
          border: "4px solid rgba(99, 102, 241, 0.1)",
          borderTopColor: "var(--primary)",
          borderRadius: "50%",
        }} className="pulse-glow"></div>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Retrieving scheduled syncs...</p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "30px", alignItems: "start" }}>
      
      {/* LEFT COLUMN: Meetings Timeline */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)" }}>📅 Scheduled FIP Syncs</h3>
            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "4px" }}>Active sync schedules and prep reminder trigger panels.</p>
          </div>
          <button onClick={onRefresh} className="btn-secondary" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FaSyncAlt size={12} />
            <span style={{ fontSize: "12px" }}>Refresh Syncs</span>
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {meetings.map((meet) => {
            const spokeName = spokes.find(s => s.id === meet.campusId)?.name || "Unknown Spoke";
            const isReminderActive = remindLoading === meet.id;
            
            return (
              <div key={meet.id} className="glass-panel table-row-hover" style={{
                padding: "20px",
                border: "1px solid var(--border-glass)",
                background: "var(--bg-card)",
                display: "flex",
                flexDirection: "column",
                gap: "14px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: "800",
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "var(--primary)",
                      padding: "3px 8px",
                      borderRadius: "6px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}>
                      🏢 {spokeName}
                    </span>
                    <h4 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)", marginTop: "8px", marginBottom: "0" }}>
                      {meet.title}
                    </h4>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                      {isConflicted(meet) && (
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "800",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          color: "#ef4444"
                        }} className="pulse-glow" title="Another meeting is scheduled for this campus at the same time!">
                          ⚠️ Conflict
                        </span>
                      )}
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--primary)" }}>⏰ {meet.time}</div>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{meet.date}</span>
                  </div>
                </div>

                <div style={{ fontSize: "12.5px", color: "var(--text-muted)", lineHeight: "1.5" }}>
                  <strong>Agenda:</strong> {meet.agenda}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "14px", marginTop: "4px" }}>
                  <a
                    href={meet.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "12px", color: "var(--primary)", textDecoration: "none", fontWeight: "700" }}
                  >
                    🔗 Join Sync Call (Teams/Zoom)
                  </a>
                  
                  <button
                    onClick={() => handleSendReminder(meet.id)}
                    disabled={isReminderActive}
                    className="btn-primary"
                    style={{
                      padding: "6px 14px",
                      fontSize: "11.5px",
                      borderRadius: "6px",
                      background: "linear-gradient(135deg, var(--accent), var(--secondary))",
                      border: "none",
                      boxShadow: "0 4px 12px rgba(249, 115, 22, 0.15)",
                      cursor: "pointer"
                    }}
                  >
                    {isReminderActive ? "Relaying alerts..." : "📢 Dispatch Prep Reminder"}
                  </button>
                </div>
              </div>
            );
          })}
          {meetings.length === 0 && (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
              No meetings scheduled. Use the form to schedule a campus sync.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Schedule Form */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
          ➕ Schedule FIP Campus Sync
        </h3>
        <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Establish sync channels for review of sprint deliverables.
        </p>

        <form onSubmit={handleScheduleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Meeting Title *
            </label>
            <input
              type="text"
              required
              className="form-input"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. KLE Bi-weekly Sprint Sync"
              style={{ width: "100%", padding: "10px 12px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Target Institution Campus *
            </label>
            <select
              className="form-select"
              required
              value={newCampusId}
              onChange={(e) => setNewCampusId(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: "13px" }}
            >
              {spokes.map(s => {
                const status = getSpokeProjectStatus(s.name);
                return (
                  <option key={s.id} value={s.id}>
                    🏢 {s.name} ({s.key}) — [{status}]
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                Date *
              </label>
              <input
                type="date"
                required
                className="form-input"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: "13px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                Time *
              </label>
              <input
                type="time"
                required
                className="form-input"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", fontSize: "13px" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Zoom / Teams Video Link
            </label>
            <input
              type="url"
              className="form-input"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://teams.microsoft.com/l/meetup-join/..."
              style={{ width: "100%", padding: "10px 12px", fontSize: "13px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              Sync Agenda *
            </label>
            <textarea
              required
              rows={3}
              className="form-input"
              value={newAgenda}
              onChange={(e) => setNewAgenda(e.target.value)}
              placeholder="e.g. Sprint blocker review, VLSI laboratory setup progression, and Phase 1 milestone evaluation."
              style={{ width: "100%", padding: "10px 12px", fontSize: "13px", resize: "none" }}
            />
          </div>

          <button
            type="submit"
            disabled={isScheduling}
            className="btn-primary"
            style={{
              padding: "12px",
              marginTop: "8px",
              fontWeight: "700",
              fontSize: "13px",
              background: "linear-gradient(135deg, var(--primary), var(--secondary))",
              boxShadow: "0 4px 15px rgba(99, 102, 241, 0.2)",
              cursor: "pointer"
            }}
          >
            {isScheduling ? "Creating sync..." : "Schedule Sync Meeting 🚀"}
          </button>
        </form>
      </div>

    </div>
  );
}

export default App;