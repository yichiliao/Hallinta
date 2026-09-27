import { exportFilename, exportMeetingHtml } from "@/lib/export";
import { deniedResponse, requireProject } from "@/lib/auth/guard";
import { getStore } from "@/lib/store";

/** GET → downloadable HTML of a single meeting note, for releasing it on its own. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; meetingId: string }> },
) {
  const { projectId, meetingId } = await params;
  try {
    await requireProject(projectId, "view");
    const store = getStore();
    const [project, content] = await Promise.all([
      store.getProject(projectId),
      store.readMeeting(projectId, meetingId),
    ]);
    const today = new Date().toLocaleDateString("en-CA");
    const html = exportMeetingHtml(project, { date: meetingId.slice(0, 10), content }, today);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(projectId, "meeting", meetingId)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return deniedResponse(error);
  }
}
