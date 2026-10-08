// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/ranking.ts
// -----------------------------------------------
// Consultas públicas de classificação:
//   • general   → ranking geral acumulado
//   • monthly   → ranking do mês (America/Sao_Paulo)
//   • me        → XP total, XP mensal, posição e dia atual
//
// Privacidade: as respostas públicas NÃO devolvem o
// `identifier` (ele é a credencial anônima do visitante —
// quem o conhece poderia pontuar no lugar da pessoa).
// =================================================

import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import {
  dayKeySaoPaulo,
  normalizeIdentifier,
  yearMonthSaoPaulo,
} from "./share";

/**
 * Limite de documentos varridos para calcular posições exatas.
 * O ranking é de uma rádio comunitária; este teto mantém a consulta
 * barata e é reportado como `truncated` quando atingido.
 */
const RANK_SCAN_LIMIT = 1000;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function clampPageSize(size: number | undefined): number {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(size)));
}

function clampPage(page: number | undefined): number {
  if (typeof page !== "number" || !Number.isFinite(page)) return 1;
  return Math.max(1, Math.floor(page));
}

/* ------------------------------------------------------------------ */
/* Ranking geral (acumulado, sem limite de XP)                         */
/* ------------------------------------------------------------------ */

export const general = query({
  args: {
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = clampPage(args.page);
    const pageSize = clampPageSize(args.pageSize);

    const rows = await ctx.db
      .query("players")
      .withIndex("by_totalXp")
      .order("desc")
      .take(RANK_SCAN_LIMIT);

    // Posição = nº de arautos com XP estritamente maior + 1
    // (empates compartilham a mesma posição, igual à query `me`).
    const ranked: Array<{ position: number; nickname: string; totalXp: number }> =
      [];
    let currentPosition = 0;
    let previousXp: number | null = null;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (previousXp === null || row.totalXp !== previousXp) {
        currentPosition = index + 1;
        previousXp = row.totalXp;
      }
      ranked.push({
        position: currentPosition,
        nickname: row.nickname,
        totalXp: row.totalXp,
      });
    }

    const start = (page - 1) * pageSize;
    const slice = ranked.slice(start, start + pageSize);

    return {
      entries: slice,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
      considered: rows.length,
      truncated: rows.length === RANK_SCAN_LIMIT,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Ranking mensal                                                      */
/* ------------------------------------------------------------------ */

export const monthly = query({
  args: {
    year: v.optional(v.number()),
    month: v.optional(v.number()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const current = yearMonthSaoPaulo(now);

    const year =
      typeof args.year === "number" && Number.isInteger(args.year)
        ? args.year
        : current.year;
    const month =
      typeof args.month === "number" &&
      Number.isInteger(args.month) &&
      args.month >= 1 &&
      args.month <= 12
        ? args.month
        : current.month;

    if (year < 2020 || year > 2100) {
      throw new ConvexError("Ano fora do intervalo suportado.");
    }

    const page = clampPage(args.page);
    const pageSize = clampPageSize(args.pageSize);

    const rows = await ctx.db
      .query("monthlyScores")
      .withIndex("by_year_month_xp", (q) =>
        q.eq("year", year).eq("month", month)
      )
      .order("desc")
      .take(RANK_SCAN_LIMIT);

    const scored = rows.filter((row) => row.xp > 0);

    // Mesma regra de empate usada em `general` e em `me`.
    const ranked: Array<{ position: number; nickname: string; xp: number }> =
      [];
    let currentPosition = 0;
    let previousXp: number | null = null;
    for (let index = 0; index < scored.length; index++) {
      const row = scored[index];
      if (previousXp === null || row.xp !== previousXp) {
        currentPosition = index + 1;
        previousXp = row.xp;
      }
      ranked.push({
        position: currentPosition,
        nickname: row.nickname,
        xp: row.xp,
      });
    }

    const start = (page - 1) * pageSize;
    const slice = ranked.slice(start, start + pageSize);

    return {
      entries: slice,
      year,
      month,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(scored.length / pageSize)),
      considered: scored.length,
      truncated: rows.length === RANK_SCAN_LIMIT,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Posição do arauto atual                                             */
/* ------------------------------------------------------------------ */

export const me = query({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    const identifier = normalizeIdentifier(args.identifier);

    const player = await ctx.db
      .query("players")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();

    if (!player) return null;

    const now = Date.now();
    const { year, month } = yearMonthSaoPaulo(now);
    const dayKey = dayKeySaoPaulo(now);

    const monthlyRow = await ctx.db
      .query("monthlyScores")
      .withIndex("by_identifier_year_month", (q) =>
        q.eq("identifier", identifier).eq("year", year).eq("month", month)
      )
      .unique();

    const monthlyXp = monthlyRow?.xp ?? 0;

    const above = await ctx.db
      .query("players")
      .withIndex("by_totalXp", (q) => q.gt("totalXp", player.totalXp))
      .take(RANK_SCAN_LIMIT);
    const generalPosition = above.length + 1;

    let monthlyPosition: number | null = null;
    if (monthlyXp > 0) {
      const aboveMonthly = await ctx.db
        .query("monthlyScores")
        .withIndex("by_year_month_xp", (q) =>
          q.eq("year", year).eq("month", month).gt("xp", monthlyXp)
        )
        .take(RANK_SCAN_LIMIT);
      monthlyPosition = aboveMonthly.length + 1;
    }

    const todayRow = await ctx.db
      .query("shareDays")
      .withIndex("by_identifier_dayKey", (q) =>
        q.eq("identifier", identifier).eq("dayKey", dayKey)
      )
      .unique();

    return {
      nickname: player.nickname,
      totalXp: player.totalXp,
      generalPosition,
      monthlyXp,
      monthlyPosition,
      year,
      month,
      dayKey,
      sharedToday: todayRow !== null && todayRow.awarded,
      sharedTodayAt: todayRow?.createdAt ?? null,
    };
  },
});
