import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getProjectMembership, unauthorized, forbidden, badRequest, notFound } from "@/lib/auth";

const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(2000),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return notFound("Task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  if (!membership) return forbidden("You do not have access to this project.");

  // Fetch chronologically (oldest first)
  const comments = await prisma.comment.findMany({
    where: { taskId: params.id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return notFound("Task not found");

  const membership = await getProjectMembership(user.id, task.projectId);
  
  // Enforce roles: Admin/Member can post, Viewers cannot.
  if (!membership || membership.role === "viewer") {
    return forbidden("Viewers cannot post comments.");
  }

  const body = await req.json().catch(() => null);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", parsed.error.flatten());

  const comment = await prisma.comment.create({
    data: {
      taskId: params.id,
      authorId: user.id,
      body: parsed.data.body,
    },
    include: { author: { select: { id: true, name: true } } }
  });

  return NextResponse.json({ comment }, { status: 201 });
}