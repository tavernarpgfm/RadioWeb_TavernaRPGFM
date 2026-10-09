// =================================================
// TAVERNA RPG FM — Ranking dos Arautos
// convex/share.ts
// -----------------------------------------------
// Mutation principal `registerShare` + utilitários de
// data (America/Sao_Paulo) e validação usados pelos
// demais módulos do backend.
//
// Regras:
//   • 1 XP por identificador por dia;
//   • um apelido pertence a um único arauto (apelido único);
//   • o XP NUNCA vem do cliente (não existe argumento de XP);
//   • deduplicação garantida no backend pelo índice
//     by_identifier_dayKey (mutations do Convex são
//     transacionais/serializáveis, então ler-e-inserir
//     na mesma transação impede XP duplicado);
//   • dayKey sempre calculado no servidor.
// =================================================

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

/* ------------------------------------------------------------------ */
/* Fuso horário America/Sao_Paulo                                      */
/* ------------------------------------------------------------------ */

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

/**
 * Decompõe um timestamp UTC na data civil de America/Sao_Paulo.
 * Usa Intl com timeZone explícito (nunca UTC "puro").
 */
function saoPauloParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));

  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    if (!found || found.value === "") {
      throw new ConvexError(
        "Não foi possível calcular a data em America/Sao_Paulo."
      );
    }
    return Number(found.value);
  };

  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Chave do dia (YYYY-MM-DD) em America/Sao_Paulo. */
export function dayKeySaoPaulo(timestamp: number): string {
  const { year, month, day } = saoPauloParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

/** Ano e mês (1-12) em America/Sao_Paulo. */
export function yearMonthSaoPaulo(timestamp: number): {
  year: number;
  month: number;
} {
  const { year, month } = saoPauloParts(timestamp);
  return { year, month };
}

/* ------------------------------------------------------------------ */
/* Validação                                                          */
/* ------------------------------------------------------------------ */

// UUID v4 gerado no navegador, ou qualquer token alfanumérico simples.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const NICKNAME_MIN = 3;
const NICKNAME_MAX = 20;

// Controle C0/C1, DEL, zero-width e controles de direção (bidi).
const NICKNAME_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064]/;
const NICKNAME_HTML = /[<>]/;

/**
 * Valida e normaliza o identificador anônimo.
 * Rejeita qualquer coisa fora do padrão esperado.
 */
export function normalizeIdentifier(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ConvexError("Identificador inválido.");
  }
  const identifier = raw.trim();
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new ConvexError(
      "Identificador inválido: use de 8 a 64 caracteres [A-Za-z0-9_-]."
    );
  }
  return identifier;
}

/**
 * Valida e normaliza o apelido público.
 * - 3 a 20 caracteres (contando code points, não bytes);
 * - sem caracteres de controle / bidi / zero-width;
 * - sem "<" ou ">" (tentativa de HTML);
 * - espaços internos colapsados.
 * O texto é armazenado como texto puro; o frontend deve
 * exibi-lo sempre com textContent (nunca innerHTML).
 */
export function normalizeNickname(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ConvexError("Apelido inválido.");
  }

  const nickname = raw.trim().replace(/\s+/g, " ");
  const length = Array.from(nickname).length;

  if (length < NICKNAME_MIN || length > NICKNAME_MAX) {
    throw new ConvexError(
      `O apelido deve ter entre ${NICKNAME_MIN} e ${NICKNAME_MAX} caracteres.`
    );
  }
  if (NICKNAME_FORBIDDEN.test(nickname)) {
    throw new ConvexError("O apelido contém caracteres não permitidos.");
  }
  if (NICKNAME_HTML.test(nickname)) {
    throw new ConvexError("O apelido não pode conter < ou >.");
  }

  return nickname;
}

/**
 * Chave única de apelido: NFKC + minúsculas (pt-BR) + espaços colapsados.
 * Serve para impedir que dois arautos diferentes usem o mesmo apelido
 * (inclusive variando maiúsculas/minúsculas ou espaços).
 * Nunca é enviada ao frontend.
 */
export function nicknameKeyOf(nickname: string): string {
  return nickname
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

/* ------------------------------------------------------------------ */
/* Consulta de apoio (somente leitura)                                 */
/* ------------------------------------------------------------------ */

/**
 * Informa a chave do dia / ano-mês em America/Sao_Paulo para um
 * timestamp UTC informado. É somente leitura e existe para inspeção
 * e para testar a fronteira de dia — não concede XP nem grava nada.
 */
export const dayKeyAt = query({
  args: { timestamp: v.number() },
  handler: async (_ctx, args) => {
    if (!Number.isFinite(args.timestamp)) {
      throw new ConvexError("Timestamp inválido.");
    }
    const { year, month } = yearMonthSaoPaulo(args.timestamp);
    return {
      dayKey: dayKeySaoPaulo(args.timestamp),
      year,
      month,
      timeZone: SAO_PAULO_TIME_ZONE,
    };
  },
});

/* ------------------------------------------------------------------ */
/* Mutation principal                                                  */
/* ------------------------------------------------------------------ */

/**
 * Registra o INÍCIO de uma ação de compartilhamento.
 *
 * Devolve `awarded: true` e `xpGained: 1` no primeiro registro válido
 * do identificador no dia; nos demais, `awarded: false` e `xpGained: 0`,
 * mantendo o XP intacto.
 *
 * Observação de produto: o XP comprova que a ação foi iniciada no site,
 * não que a publicação externa foi concluída.
 */
/**
 * Diz apenas se um apelido está livre (nenhum dado pessoal, nenhuma
 * credencial). Existe para o frontend orientar quem está chegando agora:
 * “apelido livre” = novo arauto; “em uso” = outra senha/pessoa.
 */
export const nicknameStatus = query({
  args: { nickname: v.string() },
  handler: async (ctx, args) => {
    const nickname = normalizeNickname(args.nickname);
    const nicknameKey = nicknameKeyOf(nickname);
    const taken = await ctx.db
      .query("players")
      .withIndex("by_nicknameKey", (q) => q.eq("nicknameKey", nicknameKey))
      .unique();
    return { nickname, available: taken === null };
  },
});

export const registerShare = mutation({
  args: {
    identifier: v.string(),
    nickname: v.string(),
  },
  handler: async (ctx, args) => {
    const identifier = normalizeIdentifier(args.identifier);
    const nickname = normalizeNickname(args.nickname);
    const nicknameKey = nicknameKeyOf(nickname);

    const now = Date.now();
    const dayKey = dayKeySaoPaulo(now);
    const { year, month } = yearMonthSaoPaulo(now);

    const player = await ctx.db
      .query("players")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();

    // APELIDO ÚNICO: se a chave do apelido já pertence a outro
    // identificador, esta pessoa está tentando usar o apelido de alguém.
    // (Mutations do Convex são transacionais: a leitura acima ainda vale.)
    const nicknameOwner = await ctx.db
      .query("players")
      .withIndex("by_nicknameKey", (q) => q.eq("nicknameKey", nicknameKey))
      .unique();

    if (nicknameOwner && nicknameOwner.identifier !== identifier) {
      throw new ConvexError(
        "Este apelido já pertence a outro arauto. Escolha outro apelido — ou informe a senha correta desse apelido."
      );
    }

    const alreadyAwarded = await ctx.db
      .query("shareDays")
      .withIndex("by_identifier_dayKey", (q) =>
        q.eq("identifier", identifier).eq("dayKey", dayKey)
      )
      .unique();

    // Já pontuou hoje: não concede XP, apenas sincroniza o apelido.
    // 1 XP por arauto por dia — o servidor recusa qualquer XP extra,
    // não importa quantas vezes o botão seja clicado.
    if (alreadyAwarded) {
      let nicknameNow = player?.nickname ?? nickname;
      if (player && player.nickname !== nickname) {
        await ctx.db.patch(player._id, { nickname, nicknameKey, updatedAt: now });
        nicknameNow = nickname;
      }
      return {
        awarded: false,
        xpGained: 0,
        totalXp: player?.totalXp ?? 0,
        nickname: nicknameNow,
        dayKey,
      };
    }

    // Concede 1 XP (valor fixo no servidor — nunca recebido do cliente).
    let totalXp: number;
    if (player) {
      totalXp = player.totalXp + 1;
      await ctx.db.patch(player._id, {
        nickname,
        nicknameKey,
        totalXp,
        updatedAt: now,
      });
    } else {
      totalXp = 1;
      await ctx.db.insert("players", {
        identifier,
        nickname,
        nicknameKey,
        totalXp,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("shareDays", {
      identifier,
      dayKey,
      awarded: true,
      createdAt: now,
    });

    const monthly = await ctx.db
      .query("monthlyScores")
      .withIndex("by_identifier_year_month", (q) =>
        q.eq("identifier", identifier).eq("year", year).eq("month", month)
      )
      .unique();

    if (monthly) {
      await ctx.db.patch(monthly._id, {
        xp: monthly.xp + 1,
        nickname,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("monthlyScores", {
        identifier,
        year,
        month,
        xp: 1,
        nickname,
        updatedAt: now,
      });
    }

    return {
      awarded: true,
      xpGained: 1,
      totalXp,
      nickname,
      dayKey,
    };
  },
});
