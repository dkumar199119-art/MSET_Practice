import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getStudentFeedbackForm } from "@/lib/services/feedback";
import { AppError } from "@/lib/errors";
import { Alert, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/primitives";
import { FeedbackForm } from "./form";

export default async function FeedbackPage({ params }: { params: Promise<{ offeringId: string }> }) {
  const { offeringId } = await params;
  const user = await requireUser();
  const f = await getStudentFeedbackForm(user, offeringId).catch((e) => { if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound(); throw e; });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="Course feedback" title={f.template.title} description="Rate how well the course helped you achieve each outcome. Your responses are anonymous." />
      <Card>
        <CardHeader title={`1 = Strongly disagree · ${f.template.scale_max} = Strongly agree`} />
        <CardBody>
          {f.submitted ? <Alert tone="green" title="Feedback submitted">Thank you. Feedback can be submitted only once.</Alert>
            : f.template.status !== "OPEN" ? <Alert tone="amber">Feedback is not open for this course.</Alert>
            : <FeedbackForm offeringId={offeringId} templateId={f.template.id} scaleMax={f.template.scale_max} questions={f.questions} />}
        </CardBody>
      </Card>
    </div>
  );
}
