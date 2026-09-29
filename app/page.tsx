import { InterviewApp } from "@/components/interview/InterviewApp";

type Props = {
  searchParams: Promise<{ candidateId?: string; jobId?: string }>;
};

export default async function Page({ searchParams }: Props) {
  const { candidateId, jobId } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <InterviewApp candidateId={candidateId ?? ""} jobId={jobId ?? ""} />
    </div>
  );
}
