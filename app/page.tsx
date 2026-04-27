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

function formatINRFromCents(cents: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(cents / 100);
}

function formatDateForInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("date_desc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>(formatDateForInput(new Date()));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchExpenses = useCallback(async () => {
    const params = new URLSearchParams();

    if (categoryFilter !== "all") {
      params.set("category", categoryFilter);
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
  }, [categoryFilter]);

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await fetchExpenses();
      setExpenses(data);
      setLastUpdatedAt(new Date());
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to load expenses";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [fetchExpenses]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError("");

      try {
        const data = await fetchExpenses();

        if (!cancelled) {
          setExpenses(data);
          setLastUpdatedAt(new Date());
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

    void run();

    return () => {
      cancelled = true;
    };
  }, [fetchExpenses]);

  const visibleExpenses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const fromMs = fromDate ? new Date(fromDate).getTime() : Number.NEGATIVE_INFINITY;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

    const filtered = expenses.filter((expense) => {
      const expenseMs = new Date(expense.date).getTime();
      const textMatches =
        normalizedQuery.length === 0 ||
        expense.description.toLowerCase().includes(normalizedQuery) ||
        expense.category.toLowerCase().includes(normalizedQuery);

      return textMatches && expenseMs >= fromMs && expenseMs <= toMs;
    });

    return [...filtered].sort((a, b) => {
      if (sortOrder === "amount_desc") {
        return b.amount - a.amount;
      }

      if (sortOrder === "amount_asc") {
        return a.amount - b.amount;
      }

      if (sortOrder === "date_asc") {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [expenses, fromDate, searchQuery, sortOrder, toDate]);

  const total = useMemo(() => {
    return visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  }, [visibleExpenses]);

  const monthToDateTotal = useMemo(() => {
    const now = new Date();

    return visibleExpenses.reduce((sum, expense) => {
      const expenseDate = new Date(expense.date);
      const sameMonth =
        expenseDate.getFullYear() === now.getFullYear() && expenseDate.getMonth() === now.getMonth();

      return sameMonth ? sum + expense.amount : sum;
    }, 0);
  }, [visibleExpenses]);

  const average = useMemo(() => {
    if (visibleExpenses.length === 0) {
      return 0;
    }

    return Math.round(total / visibleExpenses.length);
  }, [total, visibleExpenses.length]);

  const topCategory = useMemo(() => {
    if (visibleExpenses.length === 0) {
      return "-";
    }

    const totals = new Map<string, number>();
    for (const expense of visibleExpenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }

    let currentTop = "-";
    let currentValue = 0;
    for (const [category, amount] of totals.entries()) {
      if (amount > currentValue) {
        currentTop = category;
        currentValue = amount;
      }
    }

    return currentTop;
  }, [visibleExpenses]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of visibleExpenses) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
    }

    const maxAmount = Math.max(...Array.from(totals.values()), 0);

    return Array.from(totals.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        width: maxAmount === 0 ? 0 : Math.round((amount / maxAmount) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [visibleExpenses]);

  const exportCsv = useCallback(() => {
    const rows = [
      ["Date", "Category", "Description", "Amount (INR)"],
      ...visibleExpenses.map((expense) => [
        new Date(expense.date).toISOString(),
        expense.category,
        expense.description.replace(/"/g, '""'),
        (expense.amount / 100).toFixed(2),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((field) => `"${String(field)}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${formatDateForInput(new Date())}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [visibleExpenses]);

  const quickFilters = ["all", "Food", "Transport", "Utilities", "Entertainment", "Other"];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#ffe8cc,_transparent_35%),linear-gradient(180deg,_#f8fafc,_#eef2ff)] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-orange-100 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
              <p className="mt-1 text-sm text-slate-600">
                A simple dashboard for tracking spend without surprises at deploy time.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadExpenses}
                disabled={isLoading}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={visibleExpenses.length === 0}
                className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {lastUpdatedAt ? `Last updated ${lastUpdatedAt.toLocaleTimeString("en-IN")}` : "Not loaded yet"}
          </p>
        </header>

        <ExpenseForm onSuccess={loadExpenses} />

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visible Total</p>
            <p className="mt-2 text-xl font-bold">{formatINRFromCents(total)}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Month To Date</p>
            <p className="mt-2 text-xl font-bold">{formatINRFromCents(monthToDateTotal)}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average Expense</p>
            <p className="mt-2 text-xl font-bold">{formatINRFromCents(average)}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Category</p>
            <p className="mt-2 text-xl font-bold">{topCategory}</p>
          </article>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {quickFilters.map((item) => {
                const active = categoryFilter === item;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategoryFilter(item)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      active
                        ? "border-orange-500 bg-orange-100 text-orange-700"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item === "all" ? "All" : item}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm lg:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by category or description"
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">From date</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">To date</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>

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
                  <option value="date_asc">Date (oldest first)</option>
                  <option value="amount_desc">Amount (high to low)</option>
                  <option value="amount_asc">Amount (low to high)</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFromDate("");
                    setToDate(formatDateForInput(new Date()));
                    setSortOrder("date_desc");
                    setCategoryFilter("all");
                  }}
                  className="h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {categoryBreakdown.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Category Breakdown</p>
                <div className="space-y-2">
                  {categoryBreakdown.map((item) => (
                    <div key={item.category} className="grid grid-cols-[120px,1fr,90px] items-center gap-3">
                      <span className="text-sm text-slate-700">{item.category}</span>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className="h-2 rounded-full bg-orange-500" style={{ width: `${item.width}%` }} />
                      </div>
                      <span className="text-right text-sm font-medium text-slate-700">{formatINRFromCents(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

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
                {!isLoading && visibleExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-sm text-slate-500">
                      No expenses found.
                    </td>
                  </tr>
                ) : null}

                {visibleExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="px-3 py-2 text-sm text-slate-700">{new Date(expense.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{expense.category}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{expense.description}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-slate-800">
                      {formatINRFromCents(expense.amount)}
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
