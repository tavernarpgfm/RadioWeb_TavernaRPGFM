// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/champions.ts
// -----------------------------------------------
// Histórico mensal de campeões (Salão dos Arautos).
// `list` é pública e somente leitura; a coroação
// (`recordMonth` / `recordPreviousMonth`) é interna e
// idempotente — nunca coroa o mesmo mês duas vezes.
// =================================================

import { ConvexError, v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { yearMonthSaoPaulo } from "./share";

/** Quantas posições são coroadas por mês. */
const CHAMPION_SLOTS = 3;

/** Limites do histórico público. */
const DEFAULT_HISTORY_LIMIT = 12;
const MAX_HISTORY_LIMIT = 36;

/** Teto de linhas varridas por consulta. */
const SCAN_LIMIT = 1000;

/* ------------------------------------------------------------------ */
/* Leitura pública                                                     */
/* ------------------------------------------------------------------ */

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(args.limit)))
        : DEFAULT_HISTORY_LIMIT;

    const rows = await ctx.db
      .query("champions")
      .withIndex("by_year_month_position")
      .order("desc")
      .take(SCAN_LIMIT);

    // Agrupa por mês (year/month) preservando a ordem decrescente.
    const months: Array<{
      year: number;
      month: number;
      entries: Array<{
        position: number;
        nickname: string;
        xp: number;
      }>;
    }> = [];
    const indexByMonth = new Map<string, number>();

    for (const row of rows) {
      const key = `${row.year}-${row.month}`;
      let position = indexByMonth.get(key);
      if (position === undefined) {
        if (months.length >= limit) break;
        position = months.length;
        indexByMonth.set(key, position);
        months.push({ year: row.year, month: row.month, entries: [] });
      }
      months[position].entries.push({
        position: row.position,
        nickname: row.nickname,
        xp: row.xp,
      });
    }

    for (const month of months) {
      month.entries.sort((a, b) => a.position - b.position);
    }

    return { months };
  },
});

/* ------------------------------------------------------------------ */
/* Coroação (interna)                                                  */
/* ------------------------------------------------------------------ */

async function crownMonth(
  ctx: MutationCtx,
  year: number,
  month: number,
  slots: number
) {
  const because = await ctx.db
    .query("champions")
    .withIndex("by_year_month", (q) =>
      q.eq("year", year).eq("month", month)
    )
    .take(1);

  if (because.length > 0) {
    return { created: false, reason: "already-recorded", year, month };
  }

  const top = await ctx.db
    .query("monthlyScores")
    .withIndex("by_year_month_xp", (q) =>
      q.eq("year", year).eq("month", month)
    )
    .order("desc")
    .take(slots);

  const scored = top.filter((row) => row.xp > 0);
  if (scored.length === 0) {
    return { created: false, reason: "no-scores", year, month };
  }

  const now = Date.now();
  for (let i = 0; i < scored.length; i++) {
    await ctx.db.insert("champions", {
      year,
      month,
      identifier: scored[i].identifier,
      nickname: scored[i].nickname,
      xp: scored[i].xp,
      position: i + 1,
      createdAt: now,
    });
  }

  return { created: true, year, month, crowned: scored.length };
}

/**
 * Coroa um mês específico (uso interno / reprocessamento manual).
 * Idempotente: se o mês já possui campeões, não faz nada.
 */
export const recordMonth = internalMutation({
  args: {
    year: v.number(),
    month: v.number(),
    slots: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.year) || args.year < 2020 || args.year > 2100) {
      throw new ConvexError("Ano inválido para coroação.");
    }
    if (!Number.isInteger(args.month) || args.month < 1 || args.month > 12) {
      throw new ConvexError("Mês inválido para coroação.");
    }
    const slots =
      typeof args.slots === "number" && Number.isFinite(args.slots)
        ? Math.min(10, Math.max(1, Math.floor(args.slots)))
        : CHAMPION_SLOTS;

    return await crownMonth(ctx, args.year, args.month, slots);
  },
});

/**
 * Executado pelo cron no dia 1º: fecha o mês anterior no fuso
 * America/Sao_Paulo (não em UTC).
 */
export const recordPreviousMonth = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const { year, month } = yearMonthSaoPaulo(now);

    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    return await crownMonth(ctx, previousYear, previousMonth, CHAMPION_SLOTS);
  },
});
