"use client";

import { threadsApi, modelsApi, usersApi, type Thread } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const queryKeys = {
  threads: {
    all: ["threads"] as const,
    list: () => ["threads", "list"] as const,
    detail: (id: string) => ["threads", id] as const,
  },
  models: {
    all: ["models"] as const,
  },
  tokenUsage: {
    all: ["tokenUsage"] as const,
    byDays: (days: number) => ["tokenUsage", days] as const,
    byThread: (threadId: string) => ["tokenUsage", "thread", threadId] as const,
    hourly: (date?: string) => ["tokenUsage", "hourly", date ?? "today"] as const,
  },
};

export function useThreads() {
  return useQuery({
    queryKey: queryKeys.threads.list(),
    queryFn: () => threadsApi.list(),
  });
}

export function useCreateThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { message?: string; model?: string }) => threadsApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.list() }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => threadsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.list() }),
  });
}

export function useRenameThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => threadsApi.rename(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.threads.list() }),
  });
}

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models.all,
    queryFn: () => modelsApi.list(),
  });
}

export function useTokenUsage(days: number = 30) {
  return useQuery({
    queryKey: queryKeys.tokenUsage.byDays(days),
    queryFn: () => usersApi.tokenUsage(days),
    staleTime: 1000 * 60 * 2, // 2 min — token usage updates infrequently
  });
}

export function useTokenUsageThreads(limit: number = 50) {
  return useQuery({
    queryKey: ["tokenUsage", "threads", limit] as const,
    queryFn: () => usersApi.tokenUsageThreads(limit),
    staleTime: 1000 * 60 * 2,
  });
}

export function useTokenUsageRecords(limit: number = 50, offset: number = 0, threadId?: string) {
  return useQuery({
    queryKey: ["tokenUsage", "records", limit, offset, threadId] as const,
    queryFn: () => usersApi.tokenUsageRecords(limit, offset, threadId),
    staleTime: 1000 * 60 * 2,
  });
}

export function useTokenUsageHourly(date?: string) {
  return useQuery({
    queryKey: queryKeys.tokenUsage.hourly(date),
    queryFn: () => usersApi.tokenUsageHourly(date),
    staleTime: 1000 * 60 * 1, // 1 min — hourly data updates during active use
  });
}

export function useTokenUsage7dHourly() {
  return useQuery({
    queryKey: ["tokenUsage", "7d-hourly"] as const,
    queryFn: () => usersApi.tokenUsage7dHourly(),
    staleTime: 1000 * 60 * 2,
  });
}
