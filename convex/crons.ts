// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/crons.ts
// -----------------------------------------------
// Agendamento do fechamento mensal (Salão dos Arautos).
//
// NOTA DE NOME: o Convex identifica o módulo de cron pelo
// nome `convex/crons.ts` (o runtime o trata como módulo
// isolado e o procura pelo caminho "crons"). Por isso o
// arquivo foi criado como `crons.ts` em vez de `cron.ts` —
// com outro nome o agendamento não seria reconhecido.
//
// Horário: 00:05 de America/Sao_Paulo = 03:05 UTC
// (Convex agenda em UTC; a conversão é feita aqui).
// A rotina interna fecha o mês ANTERIOR no fuso de
// São Paulo, nunca "o mês UTC corrente".
// =================================================

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "coroar arautos do mes anterior (America/Sao_Paulo)",
  "5 3 1 * *",
  internal.champions.recordPreviousMonth,
  {}
);

export default crons;
