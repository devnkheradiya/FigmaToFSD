import { NextRequest } from "next/server";
import {
  parseFigmaUrl,
  getFigmaFile,
  getFigmaImages,
  extractComponentData,
  findBestNodeForScreenshot,
  findResponsiveVariants,
} from "@/lib/figma";
import { createParentTask, createSubTask, getIssueUrl } from "@/lib/jira";
import { createFSDPage } from "@/lib/confluence";
import {
  generateContentWithAI,
  generateEpicDescription,
  convertToFSDData,
} from "@/lib/claude";

type GenerationMode = "both" | "jira_only" | "fsd_only";

interface GenerateRequest {
  figmaUrl: string;
  figmaToken: string;
  atlassianEmail: string;
  atlassianToken: string;
  jiraProject: string;
  confluenceSpace: string;
  confluenceParentPage?: string;
  componentName: string;
  generationMode?: GenerationMode;
  tabletFigmaUrl?: string;
  mobileFigmaUrl?: string;
}

function createSSEMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(createSSEMessage(data)));
      };

      try {
        const body: GenerateRequest = await request.json();
        const generationMode: GenerationMode = body.generationMode || "both";

        // Validate required fields based on generation mode
        const baseRequiredFields = ["figmaUrl", "figmaToken", "atlassianEmail", "atlassianToken", "componentName"];

        let requiredFields = [...baseRequiredFields];
        if (generationMode === "both" || generationMode === "jira_only") {
          requiredFields.push("jiraProject");
        }
        if (generationMode === "both" || generationMode === "fsd_only") {
          requiredFields.push("confluenceSpace");
        }

        for (const field of requiredFields) {
          if (!body[field as keyof GenerateRequest]) {
            send({ type: "error", message: `Missing required field: ${field}` });
            controller.close();
            return;
          }
        }

        if (!process.env.OPENAI_API_KEY) {
          send({ type: "error", message: "OpenAI API key not configured" });
          controller.close();
          return;
        }

        const {
          figmaUrl,
          figmaToken,
          atlassianEmail,
          atlassianToken,
          jiraProject,
          confluenceSpace,
          confluenceParentPage,
          componentName,
          tabletFigmaUrl,
          mobileFigmaUrl,
        } = body;

        const atlassianAuth = { email: atlassianEmail, token: atlassianToken };

        // Step tracking based on generation mode
        let currentStep = 0;

        // Step 1: Parse Figma URL and fetch data
        currentStep++;
        send({ type: "step", step: currentStep, status: "in_progress", message: "Fetching Figma data..." });

        const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
        if (!fileKey) {
          send({ type: "error", message: "Invalid Figma URL - could not extract file key" });
          controller.close();
          return;
        }

        const figmaFile = await getFigmaFile(figmaToken, fileKey, nodeId);
        const componentData = extractComponentData(figmaFile.document, componentName);

        send({
          type: "step",
          step: currentStep,
          status: "complete",
          message: `Figma data fetched: ${componentData.children.length} elements found`
        });

        // Step 2: Get component screenshots (desktop, tablet, mobile)
        currentStep++;
        send({ type: "step", step: currentStep, status: "in_progress", message: `Exporting ${componentName} screenshots...` });

        const imageUrls: { desktop?: string; tablet?: string; mobile?: string } = {};
        try {
          // Find desktop node from main URL
          const desktopNodeId = componentData.nodeId || findBestNodeForScreenshot(figmaFile.document, componentName, nodeId);

          // Try to find responsive variants automatically if URLs not provided
          const autoVariants = findResponsiveVariants(figmaFile.document, componentName);

          // Collect all node IDs to fetch
          const nodeIdsToFetch: { id: string; type: "desktop" | "tablet" | "mobile" }[] = [];

          // Desktop - use provided or auto-detected
          if (desktopNodeId) {
            nodeIdsToFetch.push({ id: desktopNodeId, type: "desktop" });
          }

          // Tablet - use provided URL or auto-detect
          if (tabletFigmaUrl) {
            const { fileKey: tabletFileKey, nodeId: tabletNodeId } = parseFigmaUrl(tabletFigmaUrl);
            if (tabletFileKey && tabletNodeId) {
              // Fetch from different file/node if provided
              try {
                const tabletImages = await getFigmaImages(figmaToken, tabletFileKey, [tabletNodeId]);
                imageUrls.tablet = tabletImages.images[tabletNodeId];
              } catch (e) {
                console.error("Failed to fetch tablet image:", e);
              }
            }
          } else if (autoVariants.tablet) {
            nodeIdsToFetch.push({ id: autoVariants.tablet, type: "tablet" });
          }

          // Mobile - use provided URL or auto-detect
          if (mobileFigmaUrl) {
            const { fileKey: mobileFileKey, nodeId: mobileNodeId } = parseFigmaUrl(mobileFigmaUrl);
            if (mobileFileKey && mobileNodeId) {
              try {
                const mobileImages = await getFigmaImages(figmaToken, mobileFileKey, [mobileNodeId]);
                imageUrls.mobile = mobileImages.images[mobileNodeId];
              } catch (e) {
                console.error("Failed to fetch mobile image:", e);
              }
            }
          } else if (autoVariants.mobile) {
            nodeIdsToFetch.push({ id: autoVariants.mobile, type: "mobile" });
          }

          // Fetch all images from main file in one request
          if (nodeIdsToFetch.length > 0) {
            const ids = nodeIdsToFetch.map(n => n.id);
            const images = await getFigmaImages(figmaToken, fileKey, ids);

            for (const node of nodeIdsToFetch) {
              const url = images.images[node.id];
              if (url) {
                imageUrls[node.type] = url;
              }
            }
          }

          const screenshotCount = Object.values(imageUrls).filter(Boolean).length;
          send({
            type: "step",
            step: currentStep,
            status: "complete",
            message: `${screenshotCount} screenshot(s) exported (${Object.keys(imageUrls).filter(k => imageUrls[k as keyof typeof imageUrls]).join(", ")})`
          });
        } catch (imgError) {
          send({ type: "step", step: currentStep, status: "complete", message: "Screenshots skipped (optional)" });
        }

        // Step 3: Deep AI Analysis
        currentStep++;
        send({ type: "step", step: currentStep, status: "in_progress", message: "Deep AI Analysis (Sitecore structure)..." });

        const aiContent = await generateContentWithAI(componentData, figmaUrl);

        send({
          type: "step",
          step: currentStep,
          status: "complete",
          message: `Deep analysis complete: ${aiContent.fieldRequirements.length} fields identified`
        });

        // Step 4: Generate description
        currentStep++;
        send({ type: "step", step: currentStep, status: "in_progress", message: "Generating component description..." });

        const epicDescription = await generateEpicDescription(componentName, componentData, figmaUrl);

        send({ type: "step", step: currentStep, status: "complete", message: "Description ready" });

        // Variables for results
        let parentKey = "";
        let parentUrl = "";
        const storyUrls: string[] = [];
        const storyKeys: string[] = [];
        let confluenceUrl = "";

        // Jira ticket creation (if mode is both or jira_only)
        if (generationMode === "both" || generationMode === "jira_only") {
          // Step 5: Create Parent Jira Ticket
          currentStep++;
          send({ type: "step", step: currentStep, status: "in_progress", message: "Creating Parent Ticket..." });

          // 4-line description based on FSD
          const parentDescription = `${aiContent.description}\nFigma: ${figmaUrl}\nIncludes: FED, BED, QA sub-tasks\nRefer to FSD for detailed requirements.`;
          const parent = await createParentTask(atlassianAuth, jiraProject, componentName, parentDescription, "Story");
          parentKey = parent.key;
          parentUrl = getIssueUrl(parent.key);

          send({
            type: "step",
            step: currentStep,
            status: "complete",
            message: `Parent created: ${parent.key}`,
            data: { epicKey: parent.key, epicUrl: parentUrl }
          });

          // Step 6: Create FED/BED/QA Sub-tasks
          currentStep++;
          send({ type: "step", step: currentStep, status: "in_progress", message: "Creating FED/BED/QA Sub-tasks..." });

          // FED Sub-task - 4 lines
          const fedDescription = `Frontend implementation of ${componentName}.\n${aiContent.description}\nFigma: ${figmaUrl}\nImplement responsive UI, accessibility (WCAG 2.1), and component tests.`;

          try {
            const fed = await createSubTask(atlassianAuth, jiraProject, parent.key, `${componentName} - FED`, fedDescription);
            const fedUrl = getIssueUrl(fed.key);
            storyUrls.push(fedUrl);
            storyKeys.push(fed.key);
            send({
              type: "story_created",
              storyKey: fed.key,
              storyUrl: fedUrl,
              storyNumber: 1,
              totalStories: 3,
              title: `${componentName} - FED`
            });
          } catch (fedError) {
            send({
              type: "story_error",
              storyNumber: 1,
              title: `${componentName} - FED`,
              error: fedError instanceof Error ? fedError.message : "Failed to create FED sub-task"
            });
          }

          // BED Sub-task - 4 lines
          const bedDescription = `Backend implementation for ${componentName}.\n${aiContent.description}\nCreate Sitecore templates, fields, and data sources.\nImplement content resolver and API integration.`;

          try {
            const bed = await createSubTask(atlassianAuth, jiraProject, parent.key, `${componentName} - BED`, bedDescription);
            const bedUrl = getIssueUrl(bed.key);
            storyUrls.push(bedUrl);
            storyKeys.push(bed.key);
            send({
              type: "story_created",
              storyKey: bed.key,
              storyUrl: bedUrl,
              storyNumber: 2,
              totalStories: 3,
              title: `${componentName} - BED`
            });
          } catch (bedError) {
            send({
              type: "story_error",
              storyNumber: 2,
              title: `${componentName} - BED`,
              error: bedError instanceof Error ? bedError.message : "Failed to create BED sub-task"
            });
          }

          // QA Sub-task - 4 lines
          const qaDescription = `QA testing for ${componentName}.\n${aiContent.description}\nTest functional requirements, cross-browser, responsive, and accessibility.\nVerify against FSD acceptance criteria.`;

          try {
            const qa = await createSubTask(atlassianAuth, jiraProject, parent.key, `${componentName} - QA`, qaDescription);
            const qaUrl = getIssueUrl(qa.key);
            storyUrls.push(qaUrl);
            storyKeys.push(qa.key);
            send({
              type: "story_created",
              storyKey: qa.key,
              storyUrl: qaUrl,
              storyNumber: 3,
              totalStories: 3,
              title: `${componentName} - QA`
            });
          } catch (qaError) {
            send({
              type: "story_error",
              storyNumber: 3,
              title: `${componentName} - QA`,
              error: qaError instanceof Error ? qaError.message : "Failed to create QA sub-task"
            });
          }

          send({
            type: "step",
            step: currentStep,
            status: "complete",
            message: `${storyKeys.length} Sub-tasks created: ${storyKeys.join(", ")}`,
            data: { storyKeys, storyUrls }
          });
        }

        // Confluence FSD creation (if mode is both or fsd_only)
        if (generationMode === "both" || generationMode === "fsd_only") {
          currentStep++;
          send({ type: "step", step: currentStep, status: "in_progress", message: "Creating Confluence FSD..." });

          const fsdData = convertToFSDData(aiContent, componentName, figmaUrl, parentUrl || "", storyUrls);
          if (imageUrls.desktop || imageUrls.tablet || imageUrls.mobile) {
            fsdData.imageUrls = imageUrls;
          }

          confluenceUrl = await createFSDPage(atlassianAuth, confluenceSpace, fsdData, confluenceParentPage);

          send({
            type: "step",
            step: currentStep,
            status: "complete",
            message: "FSD created in Confluence",
            data: { confluenceUrl }
          });
        }

        // Final success
        send({
          type: "complete",
          success: true,
          jiraEpicKey: parentKey || undefined,
          jiraEpicUrl: parentUrl || undefined,
          jiraStoryKeys: storyKeys.length > 0 ? storyKeys : undefined,
          jiraStoryUrls: storyUrls.length > 0 ? storyUrls : undefined,
          confluenceUrl: confluenceUrl || undefined,
          aiAnalysis: {
            storiesGenerated: storyKeys.length,
            requirementsGenerated: aiContent.endUserRequirements.length,
            fieldsIdentified: aiContent.fieldRequirements.length,
          },
        });

        controller.close();
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "An unknown error occurred",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
