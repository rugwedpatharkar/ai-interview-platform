import { Alert, Badge, Spinner, buttonVariants, cn } from "@ip/ui";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import type { ChangeEvent } from "react";

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface Props {
  resumeUploaded: boolean;
  parsed: boolean;
  parsing: boolean; // resumeUploaded && !parsed && !stalled
  parseStalled: boolean;
  uploading: boolean;
  filename?: string; // optional — falls back to "Your résumé"
  onFile: (e: ChangeEvent<HTMLInputElement>) => void; // the page's existing onFile, verbatim
}

/** Resume → AI-parse status banner. Reflects the page's existing resume state; the
 * file input reuses the page's existing onFile handler (MIME/size validation lives there). */
export function ParsedBanner({
  resumeUploaded,
  parsed,
  parsing,
  parseStalled,
  uploading,
  filename,
  onFile,
}: Props) {
  const label = filename || "Your résumé";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <FileText className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {resumeUploaded ? label : "Upload your résumé"}
            </span>
            <span className="text-xs text-muted-foreground">
              {resumeUploaded
                ? "We extract your experience, education & skills with AI."
                : "PDF or Word — we'll fill in the rest."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {parsed && (
            <Badge tone="success" variant="subtle">
              <CheckCircle2 className="mr-1 size-3" aria-hidden />
              Parsed
            </Badge>
          )}
          {(parsing || uploading) && (
            <Badge tone="info" variant="subtle">
              <Spinner /> {uploading ? "Uploading" : "Parsing"}
            </Badge>
          )}
          <input
            id="resume-file"
            type="file"
            aria-label="Upload résumé"
            accept={RESUME_ACCEPT}
            onChange={onFile}
            disabled={uploading}
            className="sr-only"
          />
          <label
            htmlFor="resume-file"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "cursor-pointer",
              uploading && "pointer-events-none opacity-50",
            )}
          >
            <Upload className="size-4" aria-hidden />
            {resumeUploaded ? "Replace" : "Choose file"}
          </label>
        </div>
      </div>
      {parseStalled && (
        <Alert tone="warning">
          Extraction is taking longer than expected. Keep filling in your details below,
          or re-upload to try again.
        </Alert>
      )}
    </div>
  );
}
