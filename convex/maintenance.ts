// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/maintenance.ts
// -----------------------------------------------
// Rotina INTERNA de manutenção/limpeza.
//
// `purgeArautos` remove, por lista EXPLÍCITA de identifiers,
// os registros de um arauto em todas as tabelas do ranking:
//   players → shareDays → monthlyScores → champions
//
// Segurança:
//   • é uma internalMutation — não é acessível pelo site público;
//   • exige a lista explícita de identifiers (não há wildcards);
//   • valida cada identifier com a mesma regra do registerShare;
//   • `dryRun` é TRUE por padrão: sem passar dryRun: false
//     a função apenas relata o que seria removido;
//   • nunca toca em identificadores fora da lista recebida.
// =================================================

import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { normalizeIdentifier } from "./share";

/** Teto de linhas inspecionadas por tabela/identifier. */
const SCAN_LIMIT = 1000;

/** Limite de identifiers por chamada (evita limpeza em massa acidental). */
const MAX_IDENTIFIERS = 50;

type PurgeReport = {
  identifier: string;
  players: number;
  shareDays: number;
  monthlyScores: number;
  champions: number;
  found: number;
};

async function purgeIdentifier(
  ctx: MutationCtx,
  identifier: string,
  dryRun: boolean
): Promise<PurgeReport> {
  const report: PurgeReport = {
    identifier,
    players: 0,
    shareDays: 0,
    monthlyScores: 0,
    champions: 0,
    found: 0,
  };

  const player = await ctx.db
    .query("players")
    .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
    .unique();
  if (player) {
    report.players = 1;
    if (!dryRun) await ctx.db.delete(player._id);
  }

  const days = await ctx.db
    .query("shareDays")
    .withIndex("by_identifier_dayKey", (q) => q.eq("identifier", identifier))
    .take(SCAN_LIMIT);
  report.shareDays = days.length;
  if (!dryRun) {
    for (const row of days) await ctx.db.delete(row._id);
  }

  const monthly = await ctx.db
    .query("monthlyScores")
    .withIndex("by_identifier_year_month", (q) =>
      q.eq("identifier", identifier)
    )
    .take(SCAN_LIMIT);
  report.monthlyScores = monthly.length;
  if (!dryRun) {
    for (const row of monthly) await ctx.db.delete(row._id);
  }

  // `champions` não possui índice por identifier: varredura limitada.
  // (tabela pequena — uma linha por posição coroada por mês)
  const champions = await ctx.db
    .query("champions")
    .withIndex("by_year_month_position")
    .take(SCAN_LIMIT);
  const championRows = champions.filter(
    (row) => row.identifier === identifier
  );
  report.champions = championRows.length;
  if (!dryRun) {
    for (const row of championRows) await ctx.db.delete(row._id);
  }

  report.found =
    report.players + report.shareDays + report.monthlyScores + report.champions;
  return report;
}

/**
 * Remove todos os dados de ranking dos identifiers informados.
 * Sem `dryRun: false` nada é apagado — apenas relatado.
 */
export const purgeArautos = internalMutation({
  args: {
    identifiers: v.array(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.identifiers.length === 0) {
      throw new ConvexError("Informe pelo menos um identifier.");
    }
    if (args.identifiers.length > MAX_IDENTIFIERS) {
      throw new ConvexError(
        `Máximo de ${MAX_IDENTIFIERS} identifiers por chamada.`
      );
    }

    const dryRun = args.dryRun ?? true;

    const identifiers = Array.from(
      new Set(args.identifiers.map((raw) => normalizeIdentifier(raw)))
    );

    const reports: PurgeReport[] = [];
    for (const identifier of identifiers) {
      reports.push(await purgeIdentifier(ctx, identifier, dryRun));
    }

    return {
      dryRun,
      removed: reports,
      totals: {
        players: reports.reduce((sum, r) => sum + r.players, 0),
        shareDays: reports.reduce((sum, r) => sum + r.shareDays, 0),
        monthlyScores: reports.reduce((sum, r) => sum + r.monthlyScores, 0),
        champions: reports.reduce((sum, r) => sum + r.champions, 0),
      },
    };
  },
});
