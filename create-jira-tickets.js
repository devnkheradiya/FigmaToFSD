/**
 * Jira Ticket Creator Script
 *
 * Creates a parent ticket with FED, BED, and QA sub-tasks
 *
 * Usage: node create-jira-tickets.js
 *
 * Required environment variables or edit the CONFIG below:
 * - ATLASSIAN_EMAIL
 * - ATLASSIAN_TOKEN
 * - JIRA_PROJECT
 * - COMPONENT_NAME
 */

const ATLASSIAN_BASE_URL = "https://horizontal.atlassian.net";

// ============== CONFIGURATION ==============
// Edit these values or set environment variables
const CONFIG = {
  email: process.env.ATLASSIAN_EMAIL || "YOUR_EMAIL@horizontal.digital",
  token: process.env.ATLASSIAN_TOKEN || "YOUR_API_TOKEN",
  projectKey: process.env.JIRA_PROJECT || "DPWOR",
  componentName: process.env.COMPONENT_NAME || "Footer",
};

// Custom descriptions (optional - defaults will be used if empty)
const DESCRIPTIONS = {
  parent: "", // Leave empty for default
  fed: "", // Leave empty for default frontend description
  bed: "", // Leave empty for default backend description
  qa: "", // Leave empty for default QA description
};
// ============================================

function getAuthHeader() {
  return `Basic ${Buffer.from(`${CONFIG.email}:${CONFIG.token}`).toString("base64")}`;
}

function getIssueUrl(issueKey) {
  return `${ATLASSIAN_BASE_URL}/browse/${issueKey}`;
}

async function createIssue(fields) {
  const response = await fetch(`${ATLASSIAN_BASE_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jira API error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function createParentTask(summary, description) {
  const fields = {
    project: { key: CONFIG.projectKey },
    summary,
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: description }],
        },
      ],
    },
    issuetype: { name: "Story" },
  };
  return createIssue(fields);
}

async function createSubTask(parentKey, summary, description) {
  const fields = {
    project: { key: CONFIG.projectKey },
    summary,
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: description }],
        },
      ],
    },
    issuetype: { name: "Sub-task" },
    parent: { key: parentKey },
  };
  return createIssue(fields);
}

function getDefaultDescriptions(componentName) {
  return {
    parent: `Implementation of ${componentName} component including frontend, backend, and QA tasks.`,
    fed: `Frontend Development Tasks for ${componentName}:

- Implement UI components based on design specifications
- Ensure responsive design across all breakpoints
- Implement accessibility standards (WCAG 2.1)
- Write unit tests for components
- Integrate with backend APIs
- Handle loading states and error handling
- Implement proper state management`,
    bed: `Backend Development Tasks for ${componentName}:

- Design and implement API endpoints
- Create database schema/models if needed
- Implement business logic and validations
- Write API documentation
- Implement error handling and logging
- Write unit and integration tests
- Ensure security best practices`,
    qa: `QA Tasks for ${componentName}:

- Create test cases based on acceptance criteria
- Perform functional testing
- Perform cross-browser testing
- Perform responsive/mobile testing
- Perform accessibility testing
- Report and track bugs
- Verify bug fixes
- Sign off on feature completion`,
  };
}

async function main() {
  console.log("\n========================================");
  console.log("   JIRA TICKET CREATOR");
  console.log("========================================\n");
  console.log(`Component: ${CONFIG.componentName}`);
  console.log(`Project: ${CONFIG.projectKey}`);
  console.log(`Atlassian: ${ATLASSIAN_BASE_URL}`);
  console.log("\n----------------------------------------\n");

  const defaults = getDefaultDescriptions(CONFIG.componentName);
  const completedTasks = [];
  const failedTasks = [];
  let parentKey = null;

  // Create Parent Task
  console.log("Creating Parent Task...");
  try {
    const parentDesc = DESCRIPTIONS.parent || defaults.parent;
    const parentResponse = await createParentTask(CONFIG.componentName, parentDesc);
    parentKey = parentResponse.key;
    const parentUrl = getIssueUrl(parentKey);
    completedTasks.push({
      type: "Parent",
      key: parentKey,
      summary: CONFIG.componentName,
      url: parentUrl,
    });
    console.log(`✓ Parent: ${parentKey} - ${parentUrl}`);
  } catch (error) {
    failedTasks.push({
      type: "Parent",
      summary: CONFIG.componentName,
      error: error.message,
    });
    console.log(`✗ Parent FAILED: ${error.message}`);
    console.log("\nCannot create sub-tasks without parent. Exiting.\n");
    printSummary(completedTasks, failedTasks);
    return;
  }

  // Create FED Sub-task
  console.log("Creating FED Sub-task...");
  try {
    const fedDesc = DESCRIPTIONS.fed || defaults.fed;
    const fedResponse = await createSubTask(parentKey, `${CONFIG.componentName} - FED`, fedDesc);
    const fedUrl = getIssueUrl(fedResponse.key);
    completedTasks.push({
      type: "FED",
      key: fedResponse.key,
      summary: `${CONFIG.componentName} - FED`,
      url: fedUrl,
    });
    console.log(`✓ FED: ${fedResponse.key} - ${fedUrl}`);
  } catch (error) {
    failedTasks.push({
      type: "FED",
      summary: `${CONFIG.componentName} - FED`,
      error: error.message,
    });
    console.log(`✗ FED FAILED: ${error.message}`);
  }

  // Create BED Sub-task
  console.log("Creating BED Sub-task...");
  try {
    const bedDesc = DESCRIPTIONS.bed || defaults.bed;
    const bedResponse = await createSubTask(parentKey, `${CONFIG.componentName} - BED`, bedDesc);
    const bedUrl = getIssueUrl(bedResponse.key);
    completedTasks.push({
      type: "BED",
      key: bedResponse.key,
      summary: `${CONFIG.componentName} - BED`,
      url: bedUrl,
    });
    console.log(`✓ BED: ${bedResponse.key} - ${bedUrl}`);
  } catch (error) {
    failedTasks.push({
      type: "BED",
      summary: `${CONFIG.componentName} - BED`,
      error: error.message,
    });
    console.log(`✗ BED FAILED: ${error.message}`);
  }

  // Create QA Sub-task
  console.log("Creating QA Sub-task...");
  try {
    const qaDesc = DESCRIPTIONS.qa || defaults.qa;
    const qaResponse = await createSubTask(parentKey, `${CONFIG.componentName} - QA`, qaDesc);
    const qaUrl = getIssueUrl(qaResponse.key);
    completedTasks.push({
      type: "QA",
      key: qaResponse.key,
      summary: `${CONFIG.componentName} - QA`,
      url: qaUrl,
    });
    console.log(`✓ QA: ${qaResponse.key} - ${qaUrl}`);
  } catch (error) {
    failedTasks.push({
      type: "QA",
      summary: `${CONFIG.componentName} - QA`,
      error: error.message,
    });
    console.log(`✗ QA FAILED: ${error.message}`);
  }

  printSummary(completedTasks, failedTasks);
}

function printSummary(completedTasks, failedTasks) {
  console.log("\n========================================");
  console.log("   SUMMARY");
  console.log("========================================\n");

  if (completedTasks.length > 0) {
    console.log("COMPLETED TASKS:");
    console.log("----------------");
    completedTasks.forEach((task) => {
      console.log(`  ${task.type}: ${task.key}`);
      console.log(`    Summary: ${task.summary}`);
      console.log(`    URL: ${task.url}`);
      console.log("");
    });
  }

  if (failedTasks.length > 0) {
    console.log("FAILED TASKS:");
    console.log("-------------");
    failedTasks.forEach((task) => {
      console.log(`  ${task.type}: ${task.summary}`);
      console.log(`    Error: ${task.error}`);
      console.log("");
    });
  }

  console.log("========================================");
  console.log(`Total: ${completedTasks.length} completed, ${failedTasks.length} failed`);
  console.log("========================================\n");

  // Print all ticket numbers
  if (completedTasks.length > 0) {
    console.log("ALL TICKET NUMBERS:");
    console.log(completedTasks.map((t) => t.key).join(", "));
    console.log("\nALL TICKET URLS:");
    completedTasks.forEach((t) => console.log(t.url));
  }
}

main().catch(console.error);
