import { exportFilename, exportProjectHtml } from "@/lib/export";
import { deniedResponse, requireProject } from "@/lib/auth/guard";
import { getStore } from "@/lib/store";

/** GET → downloadable HTML snapshot of the project (everything except meeting notes). */
export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    await requireProject(projectId, "view");
    const project = await getStore().getProject(projectId);
    const today = new Date().toLocaleDateString("en-CA");
    return new Response(exportProjectHtml(project, today), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(projectId, today)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return deniedResponse(error);
  }
}
