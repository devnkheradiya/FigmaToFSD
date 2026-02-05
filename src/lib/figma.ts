export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  children?: FigmaNode[];
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  strokes?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  characters?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
  };
}

export interface FigmaFileResponse {
  name: string;
  document: FigmaNode;
  components: Record<string, { key: string; name: string; description: string }>;
}

export interface FigmaImageResponse {
  images: Record<string, string>;
}

export interface ExtractedComponent {
  name: string;
  type: string;
  dimensions: { width: number; height: number };
  children: ExtractedElement[];
  imageUrl?: string;
  nodeId?: string; // Store the node ID for image export
}

export interface ExtractedElement {
  name: string;
  type: string;
  dimensions?: { width: number; height: number };
  text?: string;
  fontInfo?: {
    family: string;
    size: number;
    weight: number;
  };
  colors?: string[];
  children?: ExtractedElement[];
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a) : ""}`;
}

function extractColors(node: FigmaNode): string[] {
  const colors: string[] = [];
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.color) {
        colors.push(rgbaToHex(fill.color.r, fill.color.g, fill.color.b, fill.color.a));
      }
    }
  }
  if (node.strokes) {
    for (const stroke of node.strokes) {
      if (stroke.type === "SOLID" && stroke.color) {
        colors.push(rgbaToHex(stroke.color.r, stroke.color.g, stroke.color.b, stroke.color.a));
      }
    }
  }
  return colors;
}

function extractElement(node: FigmaNode): ExtractedElement {
  const element: ExtractedElement = {
    name: node.name,
    type: node.type,
  };

  if (node.absoluteBoundingBox) {
    element.dimensions = {
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height),
    };
  }

  if (node.characters) {
    element.text = node.characters;
  }

  if (node.style) {
    element.fontInfo = {
      family: node.style.fontFamily || "Unknown",
      size: node.style.fontSize || 0,
      weight: node.style.fontWeight || 400,
    };
  }

  const colors = extractColors(node);
  if (colors.length > 0) {
    element.colors = colors;
  }

  if (node.children && node.children.length > 0) {
    element.children = node.children.map(extractElement);
  }

  return element;
}

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");

  // Handle different Figma URL formats
  // /file/{key}/... or /design/{key}/...
  let fileKey = "";
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === "file" || pathParts[i] === "design") {
      fileKey = pathParts[i + 1];
      break;
    }
  }

  const nodeId = urlObj.searchParams.get("node-id")?.replace(/-/g, ":") || undefined;

  return { fileKey, nodeId };
}

export async function getFigmaFile(
  token: string,
  fileKey: string,
  nodeId?: string
): Promise<FigmaFileResponse> {
  const url = nodeId
    ? `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
    : `https://api.figma.com/v1/files/${fileKey}`;

  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Figma API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // If we fetched a specific node, restructure the response
  if (nodeId && data.nodes) {
    const nodeData = data.nodes[nodeId];
    if (nodeData) {
      return {
        name: data.name,
        document: nodeData.document,
        components: nodeData.components || {},
      };
    }
  }

  return data;
}

export async function getFigmaImages(
  token: string,
  fileKey: string,
  nodeIds: string[],
  format: "png" | "svg" | "jpg" = "png",
  scale: number = 2
): Promise<FigmaImageResponse> {
  const ids = nodeIds.join(",");
  const url = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`;

  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Figma Images API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Find a specific component by name within a node tree
export function findComponentByName(node: FigmaNode, componentName: string): FigmaNode | null {
  const nameLower = componentName.toLowerCase().trim();
  const nodeName = node.name.toLowerCase().trim();

  // Exact match or starts with the component name (e.g., "Footer" matches "Footer", "Footer Desktop")
  if (nodeName === nameLower || nodeName.startsWith(nameLower + " ") || nodeName.startsWith(nameLower + "/")) {
    // Check if this is a renderable node (FRAME, COMPONENT, INSTANCE, GROUP)
    if (["FRAME", "COMPONENT", "INSTANCE", "GROUP", "COMPONENT_SET"].includes(node.type)) {
      return node;
    }
  }

  // Search children
  if (node.children) {
    for (const child of node.children) {
      const found = findComponentByName(child, componentName);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

// Find the best node for screenshot - looks for exact component match first
export function findBestNodeForScreenshot(
  document: FigmaNode,
  componentName: string,
  originalNodeId?: string
): string | null {
  // First, try to find an exact component match within the document
  const exactMatch = findComponentByName(document, componentName);
  if (exactMatch && exactMatch.id) {
    return exactMatch.id;
  }

  // If the document itself is the component we want (name matches)
  if (document.name.toLowerCase().includes(componentName.toLowerCase())) {
    // If it's a COMPONENT_SET or has many children with similar names, look for the main one
    if (document.type === "COMPONENT_SET" && document.children && document.children.length > 0) {
      // Find the default or first instance
      const defaultChild = document.children.find(
        (c) => c.name.toLowerCase() === componentName.toLowerCase() ||
               c.name.toLowerCase().includes("default") ||
               c.name.toLowerCase().includes("desktop")
      );
      if (defaultChild) {
        return defaultChild.id;
      }
      // Return first child if no default found
      return document.children[0].id;
    }
    return document.id;
  }

  // Return original nodeId as fallback
  return originalNodeId || document.id;
}

export function extractComponentData(
  node: FigmaNode,
  componentName: string
): ExtractedComponent {
  // Try to find the exact component within the node
  const exactComponent = findComponentByName(node, componentName);
  const targetNode = exactComponent || node;

  return {
    name: componentName || targetNode.name,
    type: targetNode.type,
    dimensions: {
      width: Math.round(targetNode.absoluteBoundingBox?.width || 0),
      height: Math.round(targetNode.absoluteBoundingBox?.height || 0),
    },
    children: targetNode.children?.map(extractElement) || [],
    nodeId: targetNode.id, // Store for image export
  };
}

export function flattenElements(elements: ExtractedElement[]): ExtractedElement[] {
  const flat: ExtractedElement[] = [];

  function traverse(el: ExtractedElement) {
    flat.push(el);
    if (el.children) {
      el.children.forEach(traverse);
    }
  }

  elements.forEach(traverse);
  return flat;
}

// Find responsive variants (tablet, mobile) of a component
export interface ResponsiveVariants {
  desktop?: string; // node ID
  tablet?: string;
  mobile?: string;
}

export function findResponsiveVariants(
  document: FigmaNode,
  componentName: string
): ResponsiveVariants {
  const variants: ResponsiveVariants = {};
  const nameLower = componentName.toLowerCase();

  // Keywords for each breakpoint
  const desktopKeywords = ["desktop", "lg", "large", "web", "default"];
  const tabletKeywords = ["tablet", "ipad", "md", "medium"];
  const mobileKeywords = ["mobile", "phone", "sm", "small", "ios", "android"];

  function searchNode(node: FigmaNode): void {
    const nodeName = node.name.toLowerCase();

    // Check if this node is related to our component
    if (nodeName.includes(nameLower) || nameLower.includes(nodeName.split(" ")[0])) {
      // Check for desktop
      if (!variants.desktop) {
        for (const keyword of desktopKeywords) {
          if (nodeName.includes(keyword)) {
            variants.desktop = node.id;
            break;
          }
        }
      }

      // Check for tablet
      if (!variants.tablet) {
        for (const keyword of tabletKeywords) {
          if (nodeName.includes(keyword)) {
            variants.tablet = node.id;
            break;
          }
        }
      }

      // Check for mobile
      if (!variants.mobile) {
        for (const keyword of mobileKeywords) {
          if (nodeName.includes(keyword)) {
            variants.mobile = node.id;
            break;
          }
        }
      }
    }

    // Search children
    if (node.children) {
      for (const child of node.children) {
        searchNode(child);
      }
    }
  }

  // Handle COMPONENT_SET which typically contains variants
  if (document.type === "COMPONENT_SET" && document.children) {
    for (const child of document.children) {
      const childName = child.name.toLowerCase();

      // Check desktop
      if (!variants.desktop) {
        if (desktopKeywords.some(k => childName.includes(k)) ||
            (!tabletKeywords.some(k => childName.includes(k)) && !mobileKeywords.some(k => childName.includes(k)))) {
          variants.desktop = child.id;
        }
      }

      // Check tablet
      if (!variants.tablet && tabletKeywords.some(k => childName.includes(k))) {
        variants.tablet = child.id;
      }

      // Check mobile
      if (!variants.mobile && mobileKeywords.some(k => childName.includes(k))) {
        variants.mobile = child.id;
      }
    }
  } else {
    searchNode(document);
  }

  // If no desktop variant found but we have the main component, use it
  if (!variants.desktop && document.id) {
    variants.desktop = document.id;
  }

  return variants;
}
