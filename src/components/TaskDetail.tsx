"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type { ApiTask, ApiProjectMember, TaskStatus, ApiComment } from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  members: ApiProjectMember[];
  onClose: () => void;
};

export function TaskDetail({ task, projectId, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? "");
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 1. Determine the current user's role to strictly control the UI
  const currentUser = getStoredUser();
  const currentUserRole = members.find((m) => m.user.id === currentUser?.id)?.role;
  const canComment = currentUserRole === "admin" || currentUserRole === "member";

  // --- Task Mutations (Existing) ---
  const updateTask = useMutation({
    mutationFn: (input: Partial<ApiTask>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "delete failed"),
  });

  // --- NEW: Comments Data Fetching & Post Mutation ---
  const { data: commentsData, isLoading: isLoadingComments } = useQuery({
    queryKey: ["tasks", task.id, "comments"],
    queryFn: () => apiFetch<{ comments: ApiComment[] }>(`/api/tasks/${task.id}/comments`),
  });

  const addComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setNewComment("");
      // Refetch the thread immediately so the new comment appears
      queryClient.invalidateQueries({ queryKey: ["tasks", task.id, "comments"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to post comment"),
  });

  function onSave() {
    setError(null);
    updateTask.mutate({ title, description, status, assigneeId: assigneeId || null });
  }

  function onPostComment() {
    if (!newComment.trim()) return;
    addComment.mutate(newComment);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50 py-10" onClick={onClose}>
      <div className="w-full max-w-xl bg-surface border border-border rounded-lg p-6 max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">edit task</h2>
          <button onClick={onClose} className="text-muted hover:text-white">✕</button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canComment} // Bonus UX: lock inputs for viewers
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canComment}
            rows={4}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={!canComment}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!canComment}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* --- NEW: Comments Section --- */}
        <div className="mt-6 border-t border-border pt-4 mb-6">
          <h3 className="text-sm font-medium mb-3">Activity & Comments</h3>
          
          <div className="space-y-3 mb-4">
            {isLoadingComments && <p className="text-xs text-muted">Loading comments...</p>}
            
            {commentsData?.comments.length === 0 && !isLoadingComments && (
              <p className="text-xs text-muted italic">No comments yet.</p>
            )}
            
            {/* 2. Render comments chronologically */}
            {commentsData?.comments.map((c) => (
              <div key={c.id} className="bg-bg border border-border rounded-md p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-white">{c.author.name}</span>
                  <span className="text-[10px] text-muted">
                    {new Date(c.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
                    })}
                  </span>
                </div>
                {/* Append-only display */}
                <p className="text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>

          {/* 3. Role-based Input Enforcement */}
          {canComment ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment to the audit trail..."
                rows={2}
                className="block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <button
                onClick={onPostComment}
                disabled={!newComment.trim() || addComment.isPending}
                className="self-end text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {addComment.isPending ? "Posting..." : "Post Comment"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted italic bg-bg p-2 rounded-md border border-border text-center">
              Viewers have read-only access and cannot post comments.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-400 mb-3" role="alert">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border mt-4">
          {canComment ? (
            <button
              onClick={() => deleteTask.mutate()}
              disabled={deleteTask.isPending}
              className="text-sm text-red-400 hover:text-red-300 transition-colors"
            >
              delete task
            </button>
          ) : <div /> /* Empty div to push buttons to the right if delete is hidden */}
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted transition-colors"
            >
              {canComment ? "cancel" : "close"}
            </button>
            {canComment && (
              <button
                onClick={onSave}
                disabled={updateTask.isPending}
                className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {updateTask.isPending ? "saving…" : "save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}