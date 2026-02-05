"use client";

import { useState, useEffect } from "react";

interface StepStatus {
  status: "pending" | "in_progress" | "complete" | "error" | "skipped";
  message: string;
  data?: {
    epicKey?: string;
    epicUrl?: string;
    storyKeys?: string[];
    storyUrls?: string[];
    confluenceUrl?: string;
  };
}

interface CreatedStory {
  key: string;
  url: string;
  title: string;
}

interface GenerationResult {
  success: boolean;
  jiraEpicKey?: string;
  jiraEpicUrl?: string;
  jiraStoryKeys?: string[];
  jiraStoryUrls?: string[];
  confluenceUrl?: string;
  aiAnalysis?: {
    storiesGenerated: number;
    requirementsGenerated: number;
    fieldsIdentified: number;
  };
  error?: string;
}

interface SavedCredentials {
  figmaToken: string;
  atlassianEmail: string;
  atlassianToken: string;
  jiraProject: string;
  confluenceSpace: string;
  confluenceParentPage: string;
  // Last used figma URL (without node-id for reuse)
  lastFigmaBaseUrl?: string;
}

type GenerationMode = "both" | "jira_only" | "fsd_only";

// Simple encryption/decryption using Base64 + character shift
const ENCRYPTION_KEY = "FigmaToFSD2024";

function encrypt(text: string): string {
  if (!text) return "";
  const shifted = text
    .split("")
    .map((char, i) => String.fromCharCode(char.charCodeAt(0) + (i % 10) + 1))
    .join("");
  return btoa(ENCRYPTION_KEY + shifted);
}

function decrypt(encoded: string): string {
  if (!encoded) return "";
  try {
    const decoded = atob(encoded);
    if (!decoded.startsWith(ENCRYPTION_KEY)) return "";
    const shifted = decoded.slice(ENCRYPTION_KEY.length);
    return shifted
      .split("")
      .map((char, i) => String.fromCharCode(char.charCodeAt(0) - (i % 10) - 1))
      .join("");
  } catch {
    return "";
  }
}

function getSteps(mode: GenerationMode): StepStatus[] {
  const baseSteps: StepStatus[] = [
    { status: "pending", message: "Fetch Figma data" },
    { status: "pending", message: "Export component screenshot" },
    { status: "pending", message: "Deep AI Analysis (Sitecore structure)" },
    { status: "pending", message: "Generate description" },
  ];

  if (mode === "both") {
    return [
      ...baseSteps,
      { status: "pending", message: "Create Parent Ticket" },
      { status: "pending", message: "Create FED/BED/QA Sub-tasks" },
      { status: "pending", message: "Create Confluence FSD" },
    ];
  } else if (mode === "jira_only") {
    return [
      ...baseSteps,
      { status: "pending", message: "Create Parent Ticket" },
      { status: "pending", message: "Create FED/BED/QA Sub-tasks" },
    ];
  } else {
    return [
      ...baseSteps,
      { status: "pending", message: "Create Confluence FSD" },
    ];
  }
}

export default function Home() {
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [atlassianEmail, setAtlassianEmail] = useState("");
  const [atlassianToken, setAtlassianToken] = useState("");
  const [jiraProject, setJiraProject] = useState("");
  const [confluenceSpace, setConfluenceSpace] = useState("");
  const [confluenceParentPage, setConfluenceParentPage] = useState("");
  const [componentName, setComponentName] = useState("");
  const [tabletFigmaUrl, setTabletFigmaUrl] = useState("");
  const [mobileFigmaUrl, setMobileFigmaUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("both");
  const [steps, setSteps] = useState<StepStatus[]>(getSteps("both"));
  const [createdStories, setCreatedStories] = useState<CreatedStory[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [showTokens, setShowTokens] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isOpenAIConfigured, setIsOpenAIConfigured] = useState(true);

  // Check if OpenAI API key is configured
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setIsOpenAIConfigured(data.openaiConfigured);
      })
      .catch(() => {
        setIsOpenAIConfigured(false);
      });
  }, []);

  // Load saved credentials on mount
  useEffect(() => {
    const saved = localStorage.getItem("figma_fsd_credentials");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, string>;
        const credentials: SavedCredentials = {
          figmaToken: decrypt(parsed.figmaToken || ""),
          atlassianEmail: decrypt(parsed.atlassianEmail || ""),
          atlassianToken: decrypt(parsed.atlassianToken || ""),
          jiraProject: decrypt(parsed.jiraProject || ""),
          confluenceSpace: decrypt(parsed.confluenceSpace || ""),
          confluenceParentPage: decrypt(parsed.confluenceParentPage || ""),
          lastFigmaBaseUrl: decrypt(parsed.lastFigmaUrl || ""),
        };

        if (credentials.atlassianEmail) {
          setFigmaToken(credentials.figmaToken);
          setAtlassianEmail(credentials.atlassianEmail);
          setAtlassianToken(credentials.atlassianToken);
          setJiraProject(credentials.jiraProject);
          setConfluenceSpace(credentials.confluenceSpace);
          setConfluenceParentPage(credentials.confluenceParentPage);
          if (credentials.lastFigmaBaseUrl) {
            setFigmaUrl(credentials.lastFigmaBaseUrl);
          }
          setHasSavedCredentials(true);
        }
      } catch (e) {
        console.error("Failed to load saved credentials:", e);
      }
    }
  }, []);

  // Update steps when generation mode changes
  useEffect(() => {
    setSteps(getSteps(generationMode));
  }, [generationMode]);

  const saveCredentials = () => {
    const credentials = {
      figmaToken: encrypt(figmaToken),
      atlassianEmail: encrypt(atlassianEmail),
      atlassianToken: encrypt(atlassianToken),
      jiraProject: encrypt(jiraProject),
      confluenceSpace: encrypt(confluenceSpace),
      confluenceParentPage: encrypt(confluenceParentPage),
      lastFigmaUrl: encrypt(figmaUrl),
    };
    localStorage.setItem("figma_fsd_credentials", JSON.stringify(credentials));
    setHasSavedCredentials(true);
    setSaveMessage("Saved!");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  const clearCredentials = () => {
    localStorage.removeItem("figma_fsd_credentials");
    setHasSavedCredentials(false);
    setSaveMessage("Credentials cleared!");
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    setError(null);
    setSteps(getSteps(generationMode));
    setCreatedStories([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUrl,
          figmaToken,
          atlassianEmail,
          atlassianToken,
          jiraProject,
          confluenceSpace,
          confluenceParentPage,
          componentName,
          generationMode,
          tabletFigmaUrl,
          mobileFigmaUrl,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEMessage(data);
            } catch (parseError) {
              console.error("Failed to parse SSE message:", line);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSEMessage = (data: Record<string, unknown>) => {
    switch (data.type) {
      case "step":
        setSteps((prev) => {
          const newSteps = [...prev];
          const stepIndex = (data.step as number) - 1;
          if (stepIndex >= 0 && stepIndex < newSteps.length) {
            newSteps[stepIndex] = {
              status: data.status as StepStatus["status"],
              message: data.message as string,
              data: data.data as StepStatus["data"],
            };
          }
          return newSteps;
        });
        break;

      case "story_created":
        setCreatedStories((prev) => [
          ...prev,
          {
            key: data.storyKey as string,
            url: data.storyUrl as string,
            title: data.title as string,
          },
        ]);
        break;

      case "complete":
        setResult({
          success: true,
          jiraEpicKey: data.jiraEpicKey as string,
          jiraEpicUrl: data.jiraEpicUrl as string,
          jiraStoryKeys: data.jiraStoryKeys as string[],
          jiraStoryUrls: data.jiraStoryUrls as string[],
          confluenceUrl: data.confluenceUrl as string,
          aiAnalysis: data.aiAnalysis as GenerationResult["aiAnalysis"],
        });
        break;

      case "error":
        setError(data.message as string);
        break;
    }
  };

  const getStepIcon = (status: StepStatus["status"], index: number) => {
    switch (status) {
      case "complete":
        return "✓";
      case "in_progress":
        return "...";
      case "error":
        return "✗";
      case "skipped":
        return "—";
      default:
        return index + 1;
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Generating...";
    switch (generationMode) {
      case "jira_only":
        return "Generate Jira Tickets Only";
      case "fsd_only":
        return "Generate FSD Only";
      default:
        return "Generate Tickets & FSD";
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Figma to FSD</h1>
            <p className="text-xs text-gray-500">Powered by OpenAI GPT-4o</p>
          </div>
          <div className="flex gap-2 items-center">
            {saveMessage && (
              <span className="text-xs text-green-600">{saveMessage}</span>
            )}
            <button
              type="button"
              onClick={saveCredentials}
              className="text-sm text-gray-600 hover:text-black border border-gray-300 px-3 py-1"
            >
              Save All
            </button>
            {hasSavedCredentials && (
              <button
                type="button"
                onClick={clearCredentials}
                className="text-sm text-gray-600 hover:text-black border border-gray-300 px-3 py-1"
              >
                Clear Saved
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowTokens(!showTokens)}
              className="text-sm text-gray-600 hover:text-black border border-gray-300 px-3 py-1"
            >
              {showTokens ? "Hide" : "Show"} Tokens
            </button>
          </div>
        </div>
      </header>

      {/* API Key Missing Banner */}
      {!isOpenAIConfigured && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-amber-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-amber-800">
              <strong>OpenAI API key is missing.</strong> Add{" "}
              <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">
                OPENAI_API_KEY=your-key
              </code>{" "}
              to your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env</code> file and restart the server.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold mb-3">Design to Documentation</h2>
          <p className="text-gray-600">
            AI-powered generation of Jira tickets (Parent + FED/BED/QA sub-tasks) and FSD document in Confluence from your Figma designs.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Figma Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">
              Figma Configuration
            </h3>
            <div>
              <label htmlFor="figmaUrl" className="block text-sm font-medium mb-2">
                Figma URL
              </label>
              <input
                type="url"
                id="figmaUrl"
                value={figmaUrl}
                onChange={(e) => setFigmaUrl(e.target.value)}
                placeholder="https://www.figma.com/design/..."
                className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Include the node-id parameter for specific component (only that component&apos;s screenshot will be used)
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="figmaToken" className="block text-sm font-medium mb-2">
                  Figma Personal Access Token
                </label>
                <input
                  type={showTokens ? "text" : "password"}
                  id="figmaToken"
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                  placeholder="figd_..."
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                  required
                />
              </div>
              <div>
                <label htmlFor="componentName" className="block text-sm font-medium mb-2">
                  Component Name
                </label>
                <input
                  type="text"
                  id="componentName"
                  value={componentName}
                  onChange={(e) => setComponentName(e.target.value)}
                  placeholder="e.g., Footer, Header, Card"
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tabletFigmaUrl" className="block text-sm font-medium mb-2">
                  Tablet Design URL <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  id="tabletFigmaUrl"
                  value={tabletFigmaUrl}
                  onChange={(e) => setTabletFigmaUrl(e.target.value)}
                  placeholder="Figma URL for tablet design (auto-detect if empty)"
                  className="w-full px-4 py-3 border border-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label htmlFor="mobileFigmaUrl" className="block text-sm font-medium mb-2">
                  Mobile Design URL <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  id="mobileFigmaUrl"
                  value={mobileFigmaUrl}
                  onChange={(e) => setMobileFigmaUrl(e.target.value)}
                  placeholder="Figma URL for mobile design (auto-detect if empty)"
                  className="w-full px-4 py-3 border border-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Leave tablet/mobile URLs empty to auto-detect variants from the main design
            </p>
          </div>

          {/* Atlassian Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">Atlassian Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="atlassianEmail" className="block text-sm font-medium mb-2">
                  Atlassian Email
                </label>
                <input
                  type="email"
                  id="atlassianEmail"
                  value={atlassianEmail}
                  onChange={(e) => setAtlassianEmail(e.target.value)}
                  placeholder="your.email@company.com"
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                  required
                />
              </div>
              <div>
                <label htmlFor="atlassianToken" className="block text-sm font-medium mb-2">
                  Atlassian API Token
                </label>
                <input
                  type={showTokens ? "text" : "password"}
                  id="atlassianToken"
                  value={atlassianToken}
                  onChange={(e) => setAtlassianToken(e.target.value)}
                  placeholder="ATATT3x..."
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                  required
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Generate API token at: id.atlassian.com → Security → API tokens
            </p>
          </div>

          {/* Jira & Confluence Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">
              Jira & Confluence Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="jiraProject" className="block text-sm font-medium mb-2">
                  Jira Project Key
                </label>
                <input
                  type="text"
                  id="jiraProject"
                  value={jiraProject}
                  onChange={(e) => setJiraProject(e.target.value.toUpperCase())}
                  placeholder="e.g., DPWOR"
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black uppercase"
                  required={generationMode !== "fsd_only"}
                />
              </div>
              <div>
                <label htmlFor="confluenceSpace" className="block text-sm font-medium mb-2">
                  Confluence Space Key
                </label>
                <input
                  type="text"
                  id="confluenceSpace"
                  value={confluenceSpace}
                  onChange={(e) => setConfluenceSpace(e.target.value.toUpperCase())}
                  placeholder="e.g., TEAM"
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black uppercase"
                  required={generationMode !== "jira_only"}
                />
              </div>
              <div>
                <label htmlFor="confluenceParentPage" className="block text-sm font-medium mb-2">
                  Parent Page ID
                </label>
                <input
                  type="text"
                  id="confluenceParentPage"
                  value={confluenceParentPage}
                  onChange={(e) => setConfluenceParentPage(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </div>

          {/* Generation Mode Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">
              What to Generate
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label
                className={`flex items-center gap-3 p-4 border-2 cursor-pointer transition-all ${
                  generationMode === "both"
                    ? "border-black bg-gray-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="radio"
                  name="generationMode"
                  value="both"
                  checked={generationMode === "both"}
                  onChange={(e) => setGenerationMode(e.target.value as GenerationMode)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Both</p>
                  <p className="text-xs text-gray-500">Jira tickets + FSD</p>
                </div>
              </label>
              <label
                className={`flex items-center gap-3 p-4 border-2 cursor-pointer transition-all ${
                  generationMode === "jira_only"
                    ? "border-black bg-gray-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="radio"
                  name="generationMode"
                  value="jira_only"
                  checked={generationMode === "jira_only"}
                  onChange={(e) => setGenerationMode(e.target.value as GenerationMode)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Jira Only</p>
                  <p className="text-xs text-gray-500">Parent + FED/BED/QA</p>
                </div>
              </label>
              <label
                className={`flex items-center gap-3 p-4 border-2 cursor-pointer transition-all ${
                  generationMode === "fsd_only"
                    ? "border-black bg-gray-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input
                  type="radio"
                  name="generationMode"
                  value="fsd_only"
                  checked={generationMode === "fsd_only"}
                  onChange={(e) => setGenerationMode(e.target.value as GenerationMode)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">FSD Only</p>
                  <p className="text-xs text-gray-500">Confluence document</p>
                </div>
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 px-6 font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-lg"
          >
            {getButtonText()}
          </button>
        </form>

        {/* Progress Section */}
        {isLoading && (
          <div className="mt-8 p-6 border border-black bg-gray-50">
            <h3 className="text-lg font-semibold mb-4">Progress</h3>
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={idx}>
                  <div
                    className={`flex items-center gap-3 ${
                      step.status === "complete"
                        ? "text-green-700"
                        : step.status === "in_progress"
                        ? "text-black font-medium"
                        : step.status === "error"
                        ? "text-red-600"
                        : step.status === "skipped"
                        ? "text-gray-400"
                        : "text-gray-400"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 flex items-center justify-center border text-xs ${
                        step.status === "complete"
                          ? "border-green-700 bg-green-700 text-white"
                          : step.status === "in_progress"
                          ? "border-black"
                          : step.status === "error"
                          ? "border-red-600 bg-red-600 text-white"
                          : step.status === "skipped"
                          ? "border-gray-300 bg-gray-300 text-white"
                          : "border-gray-400"
                      }`}
                    >
                      {getStepIcon(step.status, idx)}
                    </span>
                    <span className="flex-1">{step.message}</span>
                    {step.status === "in_progress" && (
                      <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    )}
                  </div>

                  {/* Show Epic URL when created */}
                  {step.data?.epicKey && (
                    <div className="ml-9 mt-1 text-sm">
                      <a
                        href={step.data.epicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        {step.data.epicKey}
                      </a>
                    </div>
                  )}

                  {/* Show Confluence URL when created */}
                  {step.data?.confluenceUrl && (
                    <div className="ml-9 mt-1 text-sm">
                      <a
                        href={step.data.confluenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline break-all"
                      >
                        {step.data.confluenceUrl}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Show sub-tasks as they are created */}
            {createdStories.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-300">
                <h4 className="text-sm font-semibold mb-2">Sub-tasks Created:</h4>
                <ul className="space-y-1 text-sm">
                  {createdStories.map((story, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="text-green-600">✓</span>
                      <a
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline font-medium"
                      >
                        {story.key}
                      </a>
                      <span className="text-gray-500 truncate">{story.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Error Section */}
        {error && !isLoading && (
          <div className="mt-8 p-6 border border-red-500 bg-red-50">
            <h3 className="text-lg font-semibold text-red-700">Error</h3>
            <p className="text-red-600 mt-2">{error}</p>
          </div>
        )}

        {/* Result Section */}
        {result && result.success && !isLoading && (
          <div className="mt-8 p-6 border border-green-600 bg-green-50">
            <h3 className="text-lg font-semibold text-green-800 mb-4">Generation Complete</h3>

            {result.aiAnalysis && (
              <div className="grid grid-cols-3 gap-4 py-4 border-y border-green-200 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-800">{result.aiAnalysis.storiesGenerated}</div>
                  <div className="text-xs text-green-600">Sub-tasks Created</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-800">{result.aiAnalysis.requirementsGenerated}</div>
                  <div className="text-xs text-green-600">Requirements</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-800">{result.aiAnalysis.fieldsIdentified}</div>
                  <div className="text-xs text-green-600">Fields Identified</div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {result.jiraEpicKey && (
                <div className="p-3 bg-white border border-green-200">
                  <p className="text-sm font-medium text-green-800">Parent Ticket</p>
                  <a
                    href={result.jiraEpicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline font-bold text-lg"
                  >
                    {result.jiraEpicKey}
                  </a>
                </div>
              )}

              {result.jiraStoryKeys && result.jiraStoryKeys.length > 0 && (
                <div className="p-3 bg-white border border-green-200">
                  <p className="text-sm font-medium text-green-800 mb-2">Sub-tasks: FED / BED / QA ({result.jiraStoryKeys.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {result.jiraStoryKeys.map((key, idx) => (
                      <a
                        key={idx}
                        href={result.jiraStoryUrls?.[idx]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-sm font-medium hover:bg-blue-200"
                      >
                        {key}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {result.confluenceUrl && (
                <div className="p-3 bg-white border border-green-200">
                  <p className="text-sm font-medium text-green-800">Confluence FSD</p>
                  <a
                    href={result.confluenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline break-all"
                  >
                    {result.confluenceUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-lg font-semibold mb-4">How it works</h3>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start">
              <span className="mr-3 font-mono bg-black text-white w-6 h-6 flex items-center justify-center text-xs">1</span>
              <span><strong>Figma Analysis:</strong> Extracts specific component structure with deep analysis of elements, links, children, and design tokens</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-mono bg-black text-white w-6 h-6 flex items-center justify-center text-xs">2</span>
              <span><strong>AI Processing:</strong> Deep analysis for Sitecore-ready structure - identifies link fields, image fields, logo fields, nested components, and data sources</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-mono bg-black text-white w-6 h-6 flex items-center justify-center text-xs">3</span>
              <span><strong>Jira Creation:</strong> Creates a Parent ticket with FED, BED, and QA sub-tasks</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 font-mono bg-black text-white w-6 h-6 flex items-center justify-center text-xs">4</span>
              <span><strong>FSD Generation:</strong> Creates comprehensive FSD with component screenshot, Sitecore field mapping, and nested structure</span>
            </li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-sm text-gray-500">Figma to FSD Portal — Powered by OpenAI</p>
        </div>
      </footer>
    </div>
  );
}
