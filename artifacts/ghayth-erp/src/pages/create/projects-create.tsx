import { useLocation } from "wouter";
import { CreatePageLayout } from "@workspace/ui-core";
import { ProjectCreateForm } from "@/pages/create/project-create-form";

export default function ProjectsCreate() {
  const [, setLocation] = useLocation();
  return (
    <CreatePageLayout title="مشروع جديد" backPath="/projects">
      <ProjectCreateForm
        onCreated={() => setLocation("/projects")}
        onCancel={() => setLocation("/projects")}
      />
    </CreatePageLayout>
  );
}
