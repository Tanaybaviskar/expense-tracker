"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ExpenseForm from "@/app/components/ExpenseForm";

type Expense = {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  createdAt: string;
  idempotencyKey: string;
};

const CATEGORIES = ["all", "Food", "Transport", "Utilities", "Entertainment", "Other"];

function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(cents / 100);
}

export default function HomePage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("date_desc");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fetchExpenses = useCallback(async () => {
    const params = new URLSearchParams();

    if (categoryFilter !== "all") {
      params.set("category", categoryFilter);
    }

    if (sortOrder === "date_desc") {
      params.set("sort", "date_desc");
    }

    const query = params.toString();
    const response = await fetch(`/api/expenses${query ? `?${query}` : ""}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ error: "Failed to load expenses" }))) as {
        error?: string;
      };
      throw new Error(payload.error ?? "Failed to load expenses");
    }

    return (await response.json()) as Expense[];
  }, [categoryFilter, sortOrder]);

  const refreshExpenses = useCallback(async () => {
    const data = await fetchExpenses();
    setExpenses(data);
  }, [fetchExpenses]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await fetchExpenses();
        if (!cancelled) {
          setExpenses(data);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : "Failed to load expenses";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchExpenses]);

  const totalVisibleAmount = useMemo(() => {
    return expenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">Expense Tracker</h1>
          <p className="mt-1 text-sm text-slate-600">Track expenses with idempotent and resilient requests.</p>
        </header>

        <ExpenseForm onSuccess={refreshExpenses} />

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Filter by category</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category === "all" ? "All" : category}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Sort</span>
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="date_desc">Date (newest first)</option>
              </select>
            </label>
          </div>

          <p className="mt-4 text-lg font-semibold">Total: {formatCurrencyFromCents(totalVisibleAmount)}</p>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading expenses...</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Description</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {!isLoading && expenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-500">
                      No expenses found.
                    </td>
                  </tr>
                ) : null}

                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="px-3 py-2 text-sm text-slate-700">{new Date(expense.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{expense.category}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{expense.description}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-slate-800">
                      {formatCurrencyFromCents(expense.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
