"use client";

import { buttonVariants, PageHeader } from "@ip/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateShell } from "../../../components/candidate-shell";
import { MessageThreadView } from "../../../components/message-thread-view";

export default function ThreadPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return (
    <CandidateShell>
      <div className="mb-4">
        <Link href="/messages" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden />
          Messages
        </Link>
      </div>
      <PageHeader title="Conversation" />
      <MessageThreadView applicationId={applicationId} side="candidate" />
    </CandidateShell>
  );
}
