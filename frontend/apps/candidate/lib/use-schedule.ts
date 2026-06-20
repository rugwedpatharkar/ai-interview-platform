"use client";

import { Code, errorMessage, isCode } from "@ip/shared";
import { toast } from "@ip/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAuth } from "./auth";
import {
  candidateListQueryKey,
  schedulingClient,
  scheduleQueryKey,
} from "./scheduling";

/** Candidate-side scheduling state for one application: polls the schedule and exposes
 * choose/cancel. A lost double-booking race (`ALREADY_EXISTS`) surfaces a friendly toast +
 * refetch rather than a hard error — the booking stays the first pick. */
export function useSchedule(applicationId: string) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const sched = useMemo(() => schedulingClient(api), [api]);

  const q = useQuery({
    queryKey: scheduleQueryKey(applicationId),
    enabled: Boolean(applicationId),
    retry: false,
    queryFn: () => sched.getSchedule(applicationId),
    // Poll so a recruiter-proposed/rescheduled set appears without a manual refresh; pause on
    // a hidden tab so a backgrounded page doesn't poll forever. Stop once the booking is
    // terminal (booked) — there's nothing left to wait for.
    refetchInterval: (query) => (query.state.data?.status === "booked" ? false : 15_000),
    refetchIntervalInBackground: false,
  });

  const choose = useMutation({
    mutationFn: (startAtUtcIso: string) => sched.chooseSlot(applicationId, startAtUtcIso),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scheduleQueryKey(applicationId) });
      qc.invalidateQueries({ queryKey: candidateListQueryKey() });
    },
    onError: (err) => {
      if (isCode(err, Code.AlreadyExists)) {
        toast.error("That time was just taken — here are the current options");
        void q.refetch();
      } else {
        toast.error(errorMessage(err));
      }
    },
  });

  const cancel = useMutation({
    mutationFn: () => sched.cancel(applicationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleQueryKey(applicationId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  return {
    schedule: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    choose: choose.mutate,
    choosing: choose.isPending,
    cancel: cancel.mutate,
    cancelling: cancel.isPending,
    getIcs: (id: string) => sched.getIcs(id),
  };
}
