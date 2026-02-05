const ATLASSIAN_BASE_URL = "https://horizontal.atlassian.net";

interface ConfluenceAuth {
  email: string;
  token: string;
}

interface CreatePageResponse {
  id: string;
  title: string;
  _links: {
    webui: string;
    base: string;
  };
}

function getAuthHeader(auth: ConfluenceAuth): string {
  return `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString("base64")}`;
}

export interface SitecoreField {
  fieldName: string;
  fieldType: string;
  required: boolean;
  source?: string;
  helpText?: string;
  defaultValue?: string;
}

export interface SitecoreComponentStructure {
  templateName: string;
  templatePath: string;
  baseTemplates: string[];
  fields: SitecoreField[];
  childComponents?: {
    name: string;
    fields: SitecoreField[];
    isRepeatable: boolean;
    minItems?: number;
    maxItems?: number;
  }[];
  renderingParameters?: SitecoreField[];
}

export interface FSDData {
  componentName: string;
  figmaUrl: string;
  jiraEpicUrl: string;
  jiraStoryUrls: string[];
  description: string;
  functionalRequirements: string[];
  contentAuthorRequirements: string[];
  designNotes: string[];
  fieldRequirements: FieldRequirement[];
  imageUrls?: {
    desktop?: string;
    tablet?: string;
    mobile?: string;
  };
}

export interface FieldRequirement {
  element: string;
  fieldType: string;
  required: boolean;
  dataSource: string;
  display: string;
  notes: string;
}

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractJiraKey(url: string): string {
  if (!url) return "";
  const match = url.match(/browse\/([A-Z]+-\d+)/);
  return match ? match[1] : url;
}

function generateFSDContent(data: FSDData): string {
  const jiraKey = extractJiraKey(data.jiraEpicUrl);

  // Header section - Document Status, Tech Review, Jira, Figma
  const headerSection = `<table data-layout="default">
<tbody>
<tr>
<td><p><strong>Document Status</strong></p></td>
<td><p><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">DRAFT</ac:parameter><ac:parameter ac:name="colour">Blue</ac:parameter></ac:structured-macro></p></td>
</tr>
<tr>
<td><p><strong>Tech Review</strong></p></td>
<td><p><ac:structured-macro ac:name="status" ac:schema-version="1"><ac:parameter ac:name="title">PENDING</ac:parameter><ac:parameter ac:name="colour">Yellow</ac:parameter></ac:structured-macro></p></td>
</tr>
${data.jiraEpicUrl ? `<tr>
<td><p><strong>Jira Stories</strong></p></td>
<td><p><a href="${escapeHtml(data.jiraEpicUrl)}">${escapeHtml(jiraKey)}: ${escapeHtml(data.componentName)}</a></p></td>
</tr>` : ""}
<tr>
<td><p><strong>Figma Reference</strong></p></td>
<td><p><a href="${escapeHtml(data.figmaUrl)}">Figma</a></p></td>
</tr>
</tbody>
</table>`;

  // Description and Design Notes - Two column layout
  const descriptionSection = `<table data-layout="default">
<tbody>
<tr>
<td>
<p><strong>Description:</strong></p>
<ul>
<li><p>Component is global and can be viewed on all site pages</p></li>
<li><p>${escapeHtml(data.description)}</p></li>
</ul>
</td>
<td>
<p><strong><u>Design Notes:</u></strong></p>
<ul>
${data.designNotes.map(note => `<li><p>${escapeHtml(note)}</p></li>`).join("\n")}
</ul>
</td>
</tr>
</tbody>
</table>`;

  // Functional requirements / Acceptance criteria
  const endUserReqs = data.functionalRequirements
    .map((req) => `<li><p>${escapeHtml(req)}</p></li>`)
    .join("\n");

  const contentAuthorReqs = data.contentAuthorRequirements
    .map((req) => `<li><p>${escapeHtml(req)}</p></li>`)
    .join("\n");

  const acceptanceCriteriaSection = `<h2>Functional requirements/ Acceptance criteria:</h2>
<p><strong><u>As an end user,</u></strong></p>
<ul>
${endUserReqs}
</ul>

<p><strong><u>As a content author,</u></strong></p>
<ul>
${contentAuthorReqs}
</ul>`;

  // Field Level Requirements table
  const fieldTableHeader = `<h2>Field Level Requirements:</h2>
<table data-layout="full-width">
<thead>
<tr>
<th><p>Component Distribution</p></th>
<th><p>Element</p></th>
<th><p>Field Type</p></th>
<th><p>Field Note</p></th>
<th><p>Data Source</p></th>
<th><p>Display</p></th>
<th><p>Notes</p></th>
</tr>
</thead>
<tbody>`;

  const fieldRows = data.fieldRequirements
    .map((field, index) => `<tr>
<td><p>${index === 0 ? escapeHtml(data.componentName) : ""}</p></td>
<td><p>${escapeHtml(field.element)}</p></td>
<td><p>${escapeHtml(field.fieldType)}</p></td>
<td><p>${field.required ? "Required" : "Optional"}</p></td>
<td><p>${escapeHtml(field.dataSource)}</p></td>
<td><p>${escapeHtml(field.display)}</p></td>
<td><p>${escapeHtml(field.notes)}</p></td>
</tr>`)
    .join("\n");

  const fieldTableSection = `${fieldTableHeader}
${fieldRows}
</tbody>
</table>`;

  // Design references section - AT THE END with screenshots
  const designReferencesSection = `<h2>Design references:</h2>
<table data-layout="full-width">
<thead>
<tr>
<th><p>Desktop</p></th>
<th><p>Tablet</p></th>
<th><p>Mobile</p></th>
</tr>
</thead>
<tbody>
<tr>
<td><p>EN (and most of all language versions)</p></td>
<td><p>EN (and most of all language versions)</p></td>
<td><p>EN (and most of all language versions)</p></td>
</tr>
<tr>
<td>${data.imageUrls?.desktop ? `<p><ac:image ac:height="250"><ri:url ri:value="${escapeHtml(data.imageUrls.desktop)}" /></ac:image></p>` : "<p><em>Awaiting design</em></p>"}</td>
<td>${data.imageUrls?.tablet ? `<p><ac:image ac:height="350"><ri:url ri:value="${escapeHtml(data.imageUrls.tablet)}" /></ac:image></p>` : "<p><em>Awaiting design</em></p>"}</td>
<td>${data.imageUrls?.mobile ? `<p><ac:image ac:height="400"><ri:url ri:value="${escapeHtml(data.imageUrls.mobile)}" /></ac:image></p>` : "<p><em>Awaiting design</em></p>"}</td>
</tr>
</tbody>
</table>`;

  // Combine all sections in proper order
  return `${headerSection}

${descriptionSection}

${acceptanceCriteriaSection}

${fieldTableSection}

${designReferencesSection}`;
}

export async function createConfluencePage(
  auth: ConfluenceAuth,
  spaceKey: string,
  title: string,
  content: string,
  parentId?: string
): Promise<CreatePageResponse> {
  const body: Record<string, unknown> = {
    type: "page",
    title,
    space: { key: spaceKey },
    body: {
      storage: {
        value: content,
        representation: "storage",
      },
    },
  };

  if (parentId) {
    body.ancestors = [{ id: parentId }];
  }

  const response = await fetch(`${ATLASSIAN_BASE_URL}/wiki/rest/api/content`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(auth),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Confluence API error: ${response.status} - ${error}`);
  }

  return response.json();
}

export async function createFSDPage(
  auth: ConfluenceAuth,
  spaceKey: string,
  data: FSDData,
  parentId?: string
): Promise<string> {
  const title = `FSD - ${data.componentName}`;
  const content = generateFSDContent(data);

  const page = await createConfluencePage(auth, spaceKey, title, content, parentId);

  return `${ATLASSIAN_BASE_URL}/wiki${page._links.webui}`;
}

export function generateDefaultFSDData(
  componentName: string,
  figmaUrl: string,
  jiraEpicUrl: string,
  jiraStoryUrls: string[]
): FSDData {
  return {
    componentName,
    figmaUrl,
    jiraEpicUrl,
    jiraStoryUrls,
    description: `Component to include main sections as identified in design.`,
    functionalRequirements: [
      `I can view the ${componentName} component on all site pages`,
      `I can click on interactive elements to navigate to respective pages`,
      `I can see hover effects on links as per website style guidelines`,
      `I can see translated content for region specific sites`,
      `I can navigate using keyboard for accessibility`,
    ],
    contentAuthorRequirements: [
      `I can update the logo and link on the logo`,
      `I can add/update/delete content elements`,
      `I can add/update/delete links and their URLs`,
      `I can preview changes before publishing`,
    ],
    designNotes: [
      `${componentName} to scale in full width for all site pages`,
      `Alignment of elements to follow as per design for Desktop specific to languages`,
      `Mobile Designs: Elements to stack as per design reference`,
    ],
    fieldRequirements: [
      {
        element: "Logo",
        fieldType: "Browse Media",
        required: false,
        dataSource: "Content Managed",
        display: "Aligned as per design reference",
        notes: "In CMS, authors can revise the logo image",
      },
      {
        element: "Logo Link",
        fieldType: "Link field",
        required: false,
        dataSource: "Content Managed",
        display: "",
        notes: "In CMS, authors can add a link for logo navigation",
      },
    ],
  };
}
