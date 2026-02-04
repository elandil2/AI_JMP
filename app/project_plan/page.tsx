import fs from "fs";
import path from "path";

export const dynamic = "force-static";

const loadPlan = () => {
  try {
    const planPath = path.join(process.cwd(), "project_plan.md");
    return fs.readFileSync(planPath, "utf-8");
  } catch {
    return "project_plan.md could not be loaded. Please check the repository.";
  }
};

export default function ProjectPlanPage() {
  const content = loadPlan();

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow border border-slate-200 p-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-4">Project Plan</h1>
        <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">
          {content}
        </pre>
      </div>
    </main>
  );
}
