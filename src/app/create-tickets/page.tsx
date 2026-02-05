"use client";

import { useState } from "react";

interface SubtaskResult {
  key: string;
  url: string;
  summary: string;
}

interface TicketResult {
  parent: {
    key: string;
    url: string;
    summary: string;
  };
  subtasks: {
    fed?: SubtaskResult;
    bed?: SubtaskResult;
    qa?: SubtaskResult;
  };
  completedTasks: string[];
  failedTasks: string[];
}

export default function CreateTickets() {
  const [atlassianEmail, setAtlassianEmail] = useState("");
  const [atlassianToken, setAtlassianToken] = useState("");
  const [jiraProject, setJiraProject] = useState("");
  const [componentName, setComponentName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TicketResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/create-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atlassianEmail,
          atlassianToken,
          jiraProject,
          componentName,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to create tickets");
      }

      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-black">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Jira Ticket Creator</h1>
            <p className="text-xs text-gray-500">Create Parent + FED/BED/QA Sub-tasks</p>
          </div>
          <a href="/" className="text-sm text-gray-600 hover:text-black border border-gray-300 px-3 py-1">
            Back to Main
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h2 className="text-3xl font-bold mb-3">Create Component Tickets</h2>
          <p className="text-gray-600">
            Creates a parent Story with three sub-tasks: FED (Frontend), BED (Backend), and QA.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Atlassian Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">
              Atlassian Configuration
            </h3>
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
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    id="atlassianToken"
                    value={atlassianToken}
                    onChange={(e) => setAtlassianToken(e.target.value)}
                    placeholder="ATATT3x..."
                    className="w-full px-4 py-3 border border-black focus:outline-none focus:ring-2 focus:ring-black pr-16"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-black"
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Jira Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-gray-200 pb-2">
              Jira Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  required
                />
              </div>
              <div>
                <label htmlFor="componentName" className="block text-sm font-medium mb-2">
                  Component Name (Parent Ticket)
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
          </div>

          {/* What will be created */}
          <div className="bg-gray-50 p-4 border border-gray-200">
            <h4 className="font-medium mb-2">Tickets to be created:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li><strong>Parent:</strong> {componentName || "[Component Name]"} (Story)</li>
              <li className="ml-4">Sub-task: {componentName || "[Component]"} - FED (Frontend)</li>
              <li className="ml-4">Sub-task: {componentName || "[Component]"} - BED (Backend)</li>
              <li className="ml-4">Sub-task: {componentName || "[Component]"} - QA</li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-black text-white py-4 px-6 font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-lg"
          >
            {isLoading ? "Creating Tickets..." : "Create Tickets"}
          </button>
        </form>

        {/* Error Section */}
        {error && (
          <div className="mt-8 p-6 border border-red-500 bg-red-50">
            <h3 className="text-lg font-semibold text-red-700">Error</h3>
            <p className="text-red-600 mt-2">{error}</p>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="mt-8 p-6 border border-green-600 bg-green-50">
            <h3 className="text-lg font-semibold text-green-800 mb-4">Tickets Created</h3>

            {/* Completed Tasks */}
            {result.completedTasks.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-green-800 mb-2">Completed Tasks:</h4>
                <div className="space-y-3">
                  {/* Parent */}
                  {result.parent.key && (
                    <div className="p-3 bg-white border border-green-200">
                      <p className="text-sm font-medium text-green-800">Parent (Story)</p>
                      <a
                        href={result.parent.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline font-bold text-lg"
                      >
                        {result.parent.key}
                      </a>
                      <span className="ml-2 text-gray-600">{result.parent.summary}</span>
                    </div>
                  )}

                  {/* FED */}
                  {result.subtasks.fed && (
                    <div className="p-3 bg-white border border-green-200 ml-4">
                      <p className="text-sm font-medium text-green-800">FED (Frontend)</p>
                      <a
                        href={result.subtasks.fed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline font-bold"
                      >
                        {result.subtasks.fed.key}
                      </a>
                      <span className="ml-2 text-gray-600">{result.subtasks.fed.summary}</span>
                    </div>
                  )}

                  {/* BED */}
                  {result.subtasks.bed && (
                    <div className="p-3 bg-white border border-green-200 ml-4">
                      <p className="text-sm font-medium text-green-800">BED (Backend)</p>
                      <a
                        href={result.subtasks.bed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline font-bold"
                      >
                        {result.subtasks.bed.key}
                      </a>
                      <span className="ml-2 text-gray-600">{result.subtasks.bed.summary}</span>
                    </div>
                  )}

                  {/* QA */}
                  {result.subtasks.qa && (
                    <div className="p-3 bg-white border border-green-200 ml-4">
                      <p className="text-sm font-medium text-green-800">QA</p>
                      <a
                        href={result.subtasks.qa.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline font-bold"
                      >
                        {result.subtasks.qa.key}
                      </a>
                      <span className="ml-2 text-gray-600">{result.subtasks.qa.summary}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Failed Tasks */}
            {result.failedTasks.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200">
                <h4 className="font-medium text-red-800 mb-2">Failed Tasks:</h4>
                <ul className="text-sm text-red-600 space-y-1">
                  {result.failedTasks.map((task, idx) => (
                    <li key={idx}>{task}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* All Ticket Numbers */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200">
              <h4 className="font-medium text-blue-800 mb-2">All Ticket Numbers:</h4>
              <p className="font-mono text-blue-900">
                {[
                  result.parent.key,
                  result.subtasks.fed?.key,
                  result.subtasks.bed?.key,
                  result.subtasks.qa?.key,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
