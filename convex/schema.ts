// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/schema.ts
// -----------------------------------------------
// Estrutura de dados do ranking. Isolada do site
// estático: nenhuma tabela aqui afeta a rádio, o
// player, o GitHub Pages ou qualquer dado existente.
// =================================================

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Um "arauto" (jogador) por identificador anônimo.
   * O identificador é gerado no navegador e é a única
   * credencial do visitante: por isso nunca é devolvido
   * pelas queries públicas de ranking.
   */
  players: defineTable({
    identifier: v.string(),
    nickname: v.string(),
    totalXp: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_identifier", ["identifier"])
    .index("by_totalXp", ["totalXp"]),

  /**
   * Deduplicação diária: no máximo uma linha concedida
   * (awarded = true) por identificador e dia.
   * dayKey é calculado no servidor em America/Sao_Paulo.
   */
  shareDays: defineTable({
    identifier: v.string(),
    dayKey: v.string(),
    awarded: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_identifier_dayKey", ["identifier", "dayKey"])
    .index("by_dayKey", ["dayKey"]),

  /**
   * Pontuação mensal (acumulada), separada do total geral.
   * year/month seguem America/Sao_Paulo.
   */
  monthlyScores: defineTable({
    identifier: v.string(),
    year: v.number(),
    month: v.number(),
    xp: v.number(),
    nickname: v.string(),
    updatedAt: v.number(),
  })
    .index("by_year_month_xp", ["year", "month", "xp"])
    .index("by_identifier_year_month", ["identifier", "year", "month"]),

  /**
   * Histórico de campeões por mês encerrado.
   */
  champions: defineTable({
    year: v.number(),
    month: v.number(),
    identifier: v.string(),
    nickname: v.string(),
    xp: v.number(),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_year_month_position", ["year", "month", "position"])
    .index("by_year_month", ["year", "month"]),
});
