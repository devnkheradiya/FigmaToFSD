import { NextRequest, NextResponse } from "next/server";
import { createComponentWithSubtasks, ComponentTicketResult } from "@/lib/jira";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      atlassianEmail,
      atlassianToken,
      jiraProject,
      componentName,
      descriptions,
    } = body;

    // Validate required fields
    if (!atlassianEmail || !atlassianToken || !jiraProject || !componentName) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: atlassianEmail, atlassianToken, jiraProject, componentName",
        },
        { status: 400 }
      );
    }

    const auth = {
      email: atlassianEmail,
      token: atlassianToken,
    };

    const result: ComponentTicketResult = await createComponentWithSubtasks(
      auth,
      jiraProject,
      componentName,
      descriptions || {}
    );

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}
