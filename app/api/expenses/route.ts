import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type CreateExpenseBody = {
  amount?: number;
  category?: string;
  description?: string;
  date?: string;
  idempotencyKey?: string;
};

type ValidatedExpenseBody = {
  amount: number;
  category: string;
  description: string;
  date: Date;
  idempotencyKey: string;
};

type ValidationError = {
  error: string;
};

function parseAndValidateBody(body: CreateExpenseBody): ValidatedExpenseBody | ValidationError {
  const amount = body.amount;
  const category = body.category?.trim();
  const description = body.description?.trim();
  const idempotencyKey = body.idempotencyKey?.trim();
  const parsedDate = body.date ? new Date(body.date) : null;

  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    return { error: "amount must be a positive integer in cents/paise" };
  }

  if (!category) {
    return { error: "category is required" };
  }

  if (!description) {
    return { error: "description is required" };
  }

  if (!idempotencyKey) {
    return { error: "idempotencyKey is required" };
  }

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return { error: "date must be a valid ISO date" };
  }

  return {
    amount,
    category,
    description,
    idempotencyKey,
    date: parsedDate,
  };
}

export async function POST(request: NextRequest) {
  let body: CreateExpenseBody;

  try {
    body = (await request.json()) as CreateExpenseBody;
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  const validated = parseAndValidateBody(body);

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const existing = await prisma.expense.findUnique({
      where: { idempotencyKey: validated.idempotencyKey },
    });

    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    try {
      const created = await prisma.expense.create({
        data: {
          amount: validated.amount,
          category: validated.category,
          description: validated.description,
          date: validated.date,
          idempotencyKey: validated.idempotencyKey,
        },
      });

      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const record = await prisma.expense.findUnique({
          where: { idempotencyKey: validated.idempotencyKey },
        });

        if (record) {
          return NextResponse.json(record, { status: 200 });
        }
      }

      return NextResponse.json({ error: "failed to create expense" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "database unavailable" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const sort = searchParams.get("sort");

    const expenses = await prisma.expense.findMany({
      where: category ? { category } : undefined,
      orderBy: sort === "date_desc" ? { date: "desc" } : { createdAt: "desc" },
    });

    return NextResponse.json(expenses);
  } catch {
    return NextResponse.json({ error: "failed to load expenses" }, { status: 500 });
  }
}
