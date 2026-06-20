"use client";

import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ErrorState,
  Field,
  Input,
  LoadingState,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EMAIL_CATEGORIES,
  type DigestCadence,
  type NotificationPrefs,
  type SettingsClient,
} from "../../app/settings/types";

const DIGESTS: DigestCadence[] = ["off", "daily", "weekly"];
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];
const DEFAULT_QUIET = { start: "22:00", end: "07:00", tz: "UTC" };

/** Notification preferences with optimistic save + invalidate reconcile (the /account
 *  consent-mutation pattern). In-app notifications are always on — only email, SMS, digest,
 *  and quiet hours are configurable. */
export function NotificationsTab({ client }: { client: SettingsClient }) {
  const qc = useQueryClient();
  const key = client.prefsQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.getPrefs() });
  const save = useMutation({
    mutationFn: (nextPrefs: NotificationPrefs) => client.setPrefs(nextPrefs),
    onMutate: async (nextPrefs) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key);
      qc.setQueryData(key, nextPrefs);
      return { prev };
    },
    onError: (e, _n, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(e));
    },
    onSuccess: () => {
      toast.success("Preferences saved");
      qc.invalidateQueries({ queryKey: key });
    },
  });

  if (q.isLoading) return <LoadingState label="Loading preferences…" />;
  if (q.isError)
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;

  const p = q.data!;
  const patch = (d: Partial<NotificationPrefs>) => save.mutate({ ...p, ...d });
  const quiet = p.quietHours ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info">
        In-app notifications are always on. Email, SMS, and digest cadence are configurable here.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Email & SMS</CardTitle>
          <CardDescription>Choose what we email or text you about.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {EMAIL_CATEGORIES.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center justify-between gap-3"
            >
              <span className="text-sm text-foreground">
                Email me about {c.label.toLowerCase()}
              </span>
              <Checkbox
                checked={p.emailCategories[c.key] ?? true}
                onCheckedChange={(v) =>
                  patch({
                    emailCategories: { ...p.emailCategories, [c.key]: Boolean(v) },
                  })
                }
              />
            </label>
          ))}
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm text-foreground">
              Text me for critical security alerts
            </span>
            <Checkbox
              checked={p.smsCritical}
              onCheckedChange={(v) => patch({ smsCritical: Boolean(v) })}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Digest</CardTitle>
          <CardDescription>
            Bundle non-urgent updates into a single summary instead of individual emails.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Email digest">
            <RadioGroup
              value={p.digest}
              onValueChange={(d) => patch({ digest: d as DigestCadence })}
              className="flex gap-4"
            >
              {DIGESTS.map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-2 text-sm capitalize">
                  <RadioGroupItem value={d} />
                  {d}
                </label>
              ))}
            </RadioGroup>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quiet hours</CardTitle>
          <CardDescription>
            Pause non-critical notifications during a daily window.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm text-foreground">Enable quiet hours</span>
            <Checkbox
              checked={Boolean(quiet)}
              onCheckedChange={(v) =>
                patch({ quietHours: v ? DEFAULT_QUIET : undefined })
              }
            />
          </label>
          {quiet && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start" htmlFor="quiet-start">
                <Input
                  id="quiet-start"
                  type="time"
                  value={quiet.start}
                  onChange={(e) => patch({ quietHours: { ...quiet, start: e.target.value } })}
                />
              </Field>
              <Field label="End" htmlFor="quiet-end">
                <Input
                  id="quiet-end"
                  type="time"
                  value={quiet.end}
                  onChange={(e) => patch({ quietHours: { ...quiet, end: e.target.value } })}
                />
              </Field>
              <Field label="Time zone" htmlFor="quiet-tz">
                <Select
                  value={quiet.tz}
                  onValueChange={(tz) => patch({ quietHours: { ...quiet, tz } })}
                >
                  <SelectTrigger id="quiet-tz">
                    <SelectValue placeholder="Time zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
