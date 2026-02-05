import OpenAI from "openai";
import { ExtractedComponent, ExtractedElement } from "./figma";
import { StoryDefinition } from "./jira";
import { FSDData, FieldRequirement } from "./confluence";

// OpenAI client using API key from environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIGeneratedContent {
  description: string;
  stories: StoryDefinition[];
  endUserRequirements: string[];
  contentAuthorRequirements: string[];
  designNotes: string[];
  fieldRequirements: FieldRequirement[];
}

// Limit data to avoid token limits
const MAX_ELEMENTS = 100;
const MAX_DEPTH = 5;

function formatComponentForDeepAI(component: ExtractedComponent): string {
  const lines: string[] = [];
  lines.push(`Component: ${component.name}`);
  lines.push(`Type: ${component.type}`);
  lines.push(`Dimensions: ${component.dimensions.width}x${component.dimensions.height}px`);
  lines.push("");

  // Collect detailed element information
  const elementTypes: Record<string, number> = {};
  const textElements: { name: string; text: string; parent: string }[] = [];
  const imageElements: { name: string; dimensions?: string; parent: string }[] = [];
  const linkElements: { name: string; children: string[]; parent: string }[] = [];
  const logoElements: { name: string; parent: string }[] = [];
  const iconElements: { name: string; parent: string }[] = [];
  const groupElements: { name: string; childCount: number; children: string[] }[] = [];
  let elementCount = 0;

  function analyzeElements(el: ExtractedElement, depth: number = 0, parentName: string = "root"): void {
    if (elementCount >= MAX_ELEMENTS || depth > MAX_DEPTH) return;
    elementCount++;

    const nameLower = el.name.toLowerCase();
    elementTypes[el.type] = (elementTypes[el.type] || 0) + 1;

    // Collect text content with context
    if (el.text && textElements.length < 20) {
      textElements.push({
        name: el.name,
        text: el.text.substring(0, 100),
        parent: parentName
      });
    }

    // Identify images
    if (el.type === "RECTANGLE" || el.type === "IMAGE" || nameLower.includes("image") || nameLower.includes("img") || nameLower.includes("photo") || nameLower.includes("banner")) {
      if (imageElements.length < 15) {
        imageElements.push({
          name: el.name,
          dimensions: el.dimensions ? `${el.dimensions.width}x${el.dimensions.height}` : undefined,
          parent: parentName
        });
      }
    }

    // Identify logos
    if (nameLower.includes("logo")) {
      logoElements.push({ name: el.name, parent: parentName });
    }

    // Identify icons
    if (nameLower.includes("icon") || nameLower.includes("ico")) {
      iconElements.push({ name: el.name, parent: parentName });
    }

    // Identify links/buttons with their children
    if (nameLower.includes("link") || nameLower.includes("button") || nameLower.includes("cta") || nameLower.includes("nav")) {
      if (linkElements.length < 15) {
        const childNames = el.children ? el.children.slice(0, 5).map(c => c.name) : [];
        linkElements.push({
          name: el.name,
          children: childNames,
          parent: parentName
        });
      }
    }

    // Identify repeatable groups (lists, grids, navigation items)
    if ((nameLower.includes("item") || nameLower.includes("card") || nameLower.includes("column") || nameLower.includes("row") || nameLower.includes("list")) && el.children && el.children.length > 0) {
      if (groupElements.length < 10) {
        groupElements.push({
          name: el.name,
          childCount: el.children.length,
          children: el.children.slice(0, 5).map(c => c.name)
        });
      }
    }

    if (el.children) {
      el.children.forEach((child) => analyzeElements(child, depth + 1, el.name));
    }
  }

  component.children.forEach((child) => analyzeElements(child));

  // Build comprehensive summary
  lines.push("=== ELEMENT ANALYSIS ===");
  lines.push(`Total elements analyzed: ${elementCount}`);
  lines.push(`Element types: ${Object.entries(elementTypes).map(([t, c]) => `${t}(${c})`).join(", ")}`);

  if (textElements.length > 0) {
    lines.push("");
    lines.push("=== TEXT CONTENT (with context) ===");
    textElements.forEach((t) => lines.push(`- "${t.text}" [${t.name}] in ${t.parent}`));
  }

  if (logoElements.length > 0) {
    lines.push("");
    lines.push("=== LOGO ELEMENTS ===");
    logoElements.forEach((l) => lines.push(`- ${l.name} in ${l.parent}`));
  }

  if (imageElements.length > 0) {
    lines.push("");
    lines.push("=== IMAGE ELEMENTS ===");
    imageElements.forEach((i) => lines.push(`- ${i.name} ${i.dimensions ? `(${i.dimensions})` : ""} in ${i.parent}`));
  }

  if (iconElements.length > 0) {
    lines.push("");
    lines.push("=== ICON ELEMENTS ===");
    iconElements.forEach((i) => lines.push(`- ${i.name} in ${i.parent}`));
  }

  if (linkElements.length > 0) {
    lines.push("");
    lines.push("=== LINK/NAVIGATION ELEMENTS (with children) ===");
    linkElements.forEach((l) => {
      lines.push(`- ${l.name} in ${l.parent}`);
      if (l.children.length > 0) {
        lines.push(`  Children: ${l.children.join(", ")}`);
      }
    });
  }

  if (groupElements.length > 0) {
    lines.push("");
    lines.push("=== REPEATABLE GROUPS/LISTS ===");
    groupElements.forEach((g) => {
      lines.push(`- ${g.name} (${g.childCount} items)`);
      lines.push(`  Sample children: ${g.children.join(", ")}`);
    });
  }

  // Full hierarchical structure (deeper)
  lines.push("");
  lines.push("=== FULL COMPONENT HIERARCHY ===");

  function formatHierarchy(el: ExtractedElement, depth: number = 0): void {
    if (depth > 3) return;
    const prefix = "  ".repeat(depth);
    let line = `${prefix}- ${el.name} (${el.type})`;
    if (el.dimensions) {
      line += ` [${el.dimensions.width}x${el.dimensions.height}]`;
    }
    if (el.text) {
      line += ` text: "${el.text.substring(0, 30)}..."`;
    }
    lines.push(line);

    if (el.children && depth < 3) {
      el.children.slice(0, 10).forEach((child) => formatHierarchy(child, depth + 1));
      if (el.children.length > 10) {
        lines.push(`${prefix}  ... and ${el.children.length - 10} more`);
      }
    }
  }

  component.children.slice(0, 15).forEach((child) => formatHierarchy(child));
  if (component.children.length > 15) {
    lines.push(`... and ${component.children.length - 15} more top-level elements`);
  }

  return lines.join("\n");
}

export async function generateContentWithAI(
  component: ExtractedComponent,
  figmaUrl: string
): Promise<AIGeneratedContent> {
  const componentDescription = formatComponentForDeepAI(component);

  const prompt = `You are a senior Sitecore architect creating FSD documentation. Analyze this Figma component DEEPLY.

COMPONENT DATA:
${componentDescription}

FIGMA URL: ${figmaUrl}

=== CRITICAL ANALYSIS RULES ===

1. FIELD TYPE SELECTION (Think carefully!):
   - Title/Heading (short, one line) = "Single-Line Text"
   - Label/Button text (short) = "Single-Line Text"
   - Short description (1-2 sentences) = "Multi-Line Text"
   - Long description/paragraph/content = "Rich Text"
   - Link (text + URL together) = "General Link" (ONE field, NOT separate text+url)
   - Image/Photo/Banner = "Image"
   - Logo = "Image" (with separate "General Link" only if clickable)
   - List of items/links = "Multilist" pointing to child template
   - Dropdown selection = "Droptree"

2. NESTED STRUCTURE THINKING:
   Example for Footer:
   - Footer Template has: Logo (Image), Logo Link (General Link), Footer Columns (Multilist → Footer Column)
   - Footer Column Template has: Column Title (Single-Line Text), Column Links (Multilist → Footer Link)
   - Footer Link Template has: Link (General Link) - this ONE field has both text and URL

   Example for Header:
   - Header Template has: Logo (Image), Navigation Items (Multilist → Nav Item)
   - Nav Item Template has: Link (General Link), Has Dropdown (Checkbox), Dropdown Items (Multilist → Nav Item)

3. REQUIREMENTS GENERATION:
   - Generate 6-10 end user requirements, each mentioning SPECIFIC elements from the design
   - Generate 6-10 content author requirements, each about SPECIFIC editable fields
   - NO generic statements like "I can view the component" - be SPECIFIC

=== GENERATE THIS JSON ===
{
  "description": "2-3 detailed sentences about this specific component based on elements analyzed",

  "stories": [
    {"title": "As a user, I can [specific action with specific element]", "acceptanceCriteria": ["Specific AC 1", "Specific AC 2", "Specific AC 3", "Specific AC 4"]}
  ],

  "endUserRequirements": [
    "I can see the [specific element name] displaying [what it shows]",
    "I can click on [specific link/button name] to navigate to [destination]",
    "I can view [specific section] with [number] items/columns",
    "I can interact with [element] which [behavior]",
    "I can see [element] change on hover/focus",
    "I can access [element] using keyboard navigation",
    "I can view translated content for [element] based on site language",
    "I can see [element] adapt responsively on mobile/tablet"
  ],

  "contentAuthorRequirements": [
    "I can update the [specific field] text content",
    "I can upload/change the [specific image/logo] image",
    "I can add/remove/reorder [specific list items]",
    "I can edit the link URL and text for [specific link]",
    "I can enable/disable [specific feature] using checkbox",
    "I can select [option] from dropdown for [field]",
    "I can preview changes before publishing",
    "I can manage [number] [items] in [section]"
  ],

  "designNotes": [
    "[Component] spans full width on desktop",
    "On tablet, [specific behavior]",
    "On mobile, [elements] stack vertically",
    "[Specific spacing/alignment notes]",
    "[Hover states for interactive elements]"
  ],

  "fieldRequirements": [
    {
      "element": "Logo",
      "fieldType": "Image",
      "required": true,
      "dataSource": "Content Managed",
      "display": "Top left aligned",
      "notes": "Recommended size: 150x50px"
    },
    {
      "element": "Logo Link",
      "fieldType": "General Link",
      "required": false,
      "dataSource": "Content Managed",
      "display": "Wraps logo image",
      "notes": "Links to homepage"
    },
    {
      "element": "Column Title",
      "fieldType": "Single-Line Text",
      "required": true,
      "dataSource": "Content Managed",
      "display": "Bold heading above links",
      "notes": "Max 50 characters"
    },
    {
      "element": "Column Links",
      "fieldType": "Multilist",
      "required": true,
      "dataSource": "Child Link Items",
      "display": "Vertical list under title",
      "notes": "Each link item has General Link field"
    }
  ]
}

=== IMPORTANT ===
- DO NOT include "sitecoreStructure" in output - only the fields above
- Analyze EVERY element in the component data - don't miss any
- Think about parent-child relationships (component → sections → items)
- For repeating items, use Multilist pointing to child items
- General Link = ONE field for both link text AND URL
- Generate MANY requirements (6-10 each), all specific to actual elements

Return ONLY valid JSON.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  try {
    const parsed = JSON.parse(content);
    return {
      description: parsed.description || `${component.name} component`,
      stories: parsed.stories || [],
      endUserRequirements: parsed.endUserRequirements || [],
      contentAuthorRequirements: parsed.contentAuthorRequirements || [],
      designNotes: parsed.designNotes || [],
      fieldRequirements: parsed.fieldRequirements || [],
      // sitecoreStructure removed - not needed in FSD
    };
  } catch (parseError) {
    console.error("Failed to parse OpenAI response:", content);
    throw new Error("Failed to parse AI response. Please try again.");
  }
}

export async function generateEpicDescription(
  componentName: string,
  component: ExtractedComponent,
  figmaUrl: string
): Promise<string> {
  // Use a brief summary for the epic description
  const summary = `Component: ${componentName}
Type: ${component.type}
Dimensions: ${component.dimensions.width}x${component.dimensions.height}px
Child elements: ${component.children.length}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Write a brief Jira Epic description (2-3 paragraphs) for implementing this UI component:

${summary}

Figma: ${figmaUrl}

Cover: what it is, key functionality, main elements to implement. Keep it concise and professional.`,
      },
    ],
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return `Implementation of ${componentName} component. Figma: ${figmaUrl}`;
  }

  return content;
}

export function convertToFSDData(
  aiContent: AIGeneratedContent,
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
    description: aiContent.description,
    functionalRequirements: aiContent.endUserRequirements,
    contentAuthorRequirements: aiContent.contentAuthorRequirements,
    designNotes: aiContent.designNotes,
    fieldRequirements: aiContent.fieldRequirements,
  };
}
