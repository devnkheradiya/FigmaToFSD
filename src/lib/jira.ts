const ATLASSIAN_BASE_URL = "https://horizontal.atlassian.net";

interface JiraAuth {
  email: string;
  token: string;
}

interface CreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

function getAuthHeader(auth: JiraAuth): string {
  return `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString("base64")}`;
}

// Cache for user account IDs to avoid repeated API calls
const accountIdCache: Map<string, string> = new Map();

// Get current user's account ID for assignment (with caching)
async function getCurrentUserAccountId(auth: JiraAuth): Promise<string | null> {
  // Check cache first
  const cacheKey = auth.email;
  if (accountIdCache.has(cacheKey)) {
    return accountIdCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(`${ATLASSIAN_BASE_URL}/rest/api/3/myself`, {
      headers: {
        Authorization: getAuthHeader(auth),
        Accept: "application/json",
      },
    });
    if (response.ok) {
      const data = await response.json();
      // Cache the result
      accountIdCache.set(cacheKey, data.accountId);
      return data.accountId;
    }
  } catch (e) {
    console.error("Failed to get current user:", e);
  }
  return null;
}

export async function createJiraIssue(
  auth: JiraAuth,
  projectKey: string,
  issueType: string,
  summary: string,
  description: string,
  epicKey?: string
): Promise<CreateIssueResponse> {
  // Get current user's account ID for auto-assignment
  const accountId = await getCurrentUserAccountId(auth);

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
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
    issuetype: { name: issueType },
  };

  // Auto-assign to reporter (current user)
  if (accountId) {
    fields.assignee = { accountId };
  }

  // Link story to epic if provided
  if (epicKey && issueType === "Story") {
    fields.parent = { key: epicKey };
  }

  const response = await fetch(`${ATLASSIAN_BASE_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(auth),
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

export async function createEpic(
  auth: JiraAuth,
  projectKey: string,
  componentName: string,
  description: string
): Promise<CreateIssueResponse> {
  const summary = `[Component] ${componentName}`;
  return createJiraIssue(auth, projectKey, "Epic", summary, description);
}

export interface StoryDefinition {
  title: string;
  acceptanceCriteria: string[];
}

export async function createStory(
  auth: JiraAuth,
  projectKey: string,
  epicKey: string,
  story: StoryDefinition
): Promise<CreateIssueResponse> {
  const acText = story.acceptanceCriteria
    .map((ac, i) => `${i + 1}. ${ac}`)
    .join("\n");

  const description = `${story.title}\n\nAcceptance Criteria:\n${acText}`;

  return createJiraIssue(auth, projectKey, "Story", story.title, description, epicKey);
}

export function getIssueUrl(issueKey: string): string {
  return `${ATLASSIAN_BASE_URL}/browse/${issueKey}`;
}

// Create a parent task (Story or Task)
export async function createParentTask(
  auth: JiraAuth,
  projectKey: string,
  summary: string,
  description: string,
  issueType: string = "Story"
): Promise<CreateIssueResponse> {
  return createJiraIssue(auth, projectKey, issueType, summary, description);
}

// Create a sub-task under a parent issue
export async function createSubTask(
  auth: JiraAuth,
  projectKey: string,
  parentKey: string,
  summary: string,
  description: string
): Promise<CreateIssueResponse> {
  // Get current user's account ID for auto-assignment
  const accountId = await getCurrentUserAccountId(auth);

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
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

  // Auto-assign to reporter (current user)
  if (accountId) {
    fields.assignee = { accountId };
  }

  const response = await fetch(`${ATLASSIAN_BASE_URL}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(auth),
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

// Interface for creating component tickets with FED/BED/QA sub-tasks
export interface ComponentTicketResult {
  parent: {
    key: string;
    url: string;
    summary: string;
  };
  subtasks: {
    fed?: { key: string; url: string; summary: string };
    bed?: { key: string; url: string; summary: string };
    qa?: { key: string; url: string; summary: string };
  };
  completedTasks: string[];
  failedTasks: string[];
}

// Create component tickets with FED, BED, QA sub-tasks
export async function createComponentWithSubtasks(
  auth: JiraAuth,
  projectKey: string,
  componentName: string,
  descriptions: {
    parent?: string;
    fed?: string;
    bed?: string;
    qa?: string;
  }
): Promise<ComponentTicketResult> {
  const result: ComponentTicketResult = {
    parent: { key: "", url: "", summary: "" },
    subtasks: {},
    completedTasks: [],
    failedTasks: [],
  };

  // Default descriptions
  const defaultDescriptions = {
    parent: `Implementation of ${componentName} component including frontend, backend, and QA tasks.`,
    fed: `Frontend Development Tasks for ${componentName}:\n\n- Implement UI components based on design specifications\n- Ensure responsive design across all breakpoints\n- Implement accessibility standards (WCAG 2.1)\n- Write unit tests for components\n- Integrate with backend APIs\n- Handle loading states and error handling\n- Implement proper state management`,
    bed: `Backend Development Tasks for ${componentName}:\n\n- Design and implement API endpoints\n- Create database schema/models if needed\n- Implement business logic and validations\n- Write API documentation\n- Implement error handling and logging\n- Write unit and integration tests\n- Ensure security best practices`,
    qa: `QA Tasks for ${componentName}:\n\n- Create test cases based on acceptance criteria\n- Perform functional testing\n- Perform cross-browser testing\n- Perform responsive/mobile testing\n- Perform accessibility testing\n- Report and track bugs\n- Verify bug fixes\n- Sign off on feature completion`,
  };

  // Create parent task
  try {
    const parentResponse = await createParentTask(
      auth,
      projectKey,
      componentName,
      descriptions.parent || defaultDescriptions.parent,
      "Story"
    );
    result.parent = {
      key: parentResponse.key,
      url: getIssueUrl(parentResponse.key),
      summary: componentName,
    };
    result.completedTasks.push(`Parent: ${parentResponse.key} - ${componentName}`);
  } catch (error) {
    result.failedTasks.push(`Parent: ${componentName} - ${error instanceof Error ? error.message : "Unknown error"}`);
    return result; // Cannot create sub-tasks without parent
  }

  // Create FED sub-task
  try {
    const fedResponse = await createSubTask(
      auth,
      projectKey,
      result.parent.key,
      `${componentName} - FED`,
      descriptions.fed || defaultDescriptions.fed
    );
    result.subtasks.fed = {
      key: fedResponse.key,
      url: getIssueUrl(fedResponse.key),
      summary: `${componentName} - FED`,
    };
    result.completedTasks.push(`FED: ${fedResponse.key} - ${componentName} - FED`);
  } catch (error) {
    result.failedTasks.push(`FED: ${componentName} - FED - ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  // Create BED sub-task
  try {
    const bedResponse = await createSubTask(
      auth,
      projectKey,
      result.parent.key,
      `${componentName} - BED`,
      descriptions.bed || defaultDescriptions.bed
    );
    result.subtasks.bed = {
      key: bedResponse.key,
      url: getIssueUrl(bedResponse.key),
      summary: `${componentName} - BED`,
    };
    result.completedTasks.push(`BED: ${bedResponse.key} - ${componentName} - BED`);
  } catch (error) {
    result.failedTasks.push(`BED: ${componentName} - BED - ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  // Create QA sub-task
  try {
    const qaResponse = await createSubTask(
      auth,
      projectKey,
      result.parent.key,
      `${componentName} - QA`,
      descriptions.qa || defaultDescriptions.qa
    );
    result.subtasks.qa = {
      key: qaResponse.key,
      url: getIssueUrl(qaResponse.key),
      summary: `${componentName} - QA`,
    };
    result.completedTasks.push(`QA: ${qaResponse.key} - ${componentName} - QA`);
  } catch (error) {
    result.failedTasks.push(`QA: ${componentName} - QA - ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  return result;
}
