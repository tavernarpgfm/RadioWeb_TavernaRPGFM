/* ================================================= */
/* TAVERNA RPG FM — Ranking dos Arautos              */
/* assets/js/ranking.js                              */
/*                                                   */
/* Script clássico (sem módulos, sem CDN, sem        */
/* bundler). Conversa com o backend Convex           */
/* EXCLUSIVAMENTE por fetch() em:                    */
/*   POST {CONVEX_URL}/api/query                     */
/*   POST {CONVEX_URL}/api/mutation                  */
/*                                                   */
/* IDENTIDADE: apelido + senha escolhidos pelo       */
/* aventureiro. A senha NUNCA é enviada nem          */
/* armazenada: o navegador deriva dela (PBKDF2       */
/* SHA-256, 100k iterações) um código de 64 hex,     */
/* que é a chave do arauto no ranking.               */
/*                                                   */
/* COMPARTILHAMENTO: só existe XP depois de uma      */
/* ação real de compartilhar (WhatsApp, Telegram,    */
/* X, Facebook, folha nativa do sistema — que inclui */
/* Discord, Instagram, Messenger — ou copiar link).  */
/* E só 1 XP por arauto por dia: quem repete recebe   */
/* “já recebido” e o servidor nem soma.              */
/*                                                   */
/* Segurança do frontend:                            */
/*   • o XP nunca é enviado pelo navegador — quem    */
/*     decide é o backend;                           */
/*   • apelidos são sempre renderizados com          */
/*     textContent (nunca innerHTML);                */
/*   • nada de senha ou chave é gravado no storage.  */
/* ================================================= */

document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    /* ------------------------------------------------- */
    /* Configuração                                      */
    /* ------------------------------------------------- */

    var CONVEX_URL = 'https://perfect-walrus-826.convex.cloud';
    var PAGE_SIZE = 10;
    var STORAGE_NICK = 'taverna.arauto.nickname';

    /* Site da Taverna usado nos links de compartilhamento. */
    var SITE_URL = 'https://tavernarpgfm.com.br/';

    /* Derivador de chave (PBKDF2). O sal é público e fixo:
       ele serve para separar esta aplicação, não para segredo. */
    var KDF_SALT = 'taverna-rpg-fm/ranking-dos-arautos/v1';
    var KDF_ITERACOES = 100000;
    var KDF_BITS = 256;

    var NICKNAME_MIN = 3;
    var NICKNAME_MAX = 20;
    var SENHA_MIN = 6;
    var SENHA_MAX = 64;

    var MESES = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    /* ------------------------------------------------- */
    /* Estado                                            */
    /* ------------------------------------------------- */

    var state = {
        view: 'general',
        page: { general: 1, monthly: 1 },
        pageCount: { general: 1, monthly: 1 },
        me: null,
        sessao: null,       /* { apelido, chave } depois de validar no salão */
        enviando: false
    };

    /* ------------------------------------------------- */
    /* Elementos                                         */
    /* ------------------------------------------------- */

    var el = {
        nickname: document.getElementById('nickname'),
        password: document.getElementById('password'),
        status: document.getElementById('status'),
        meCard: document.getElementById('me-card'),
        btnLogin: document.getElementById('btn-login'),
        btnClear: document.getElementById('btn-clear'),
        shareBtns: Array.prototype.slice.call(document.querySelectorAll('.au-share-btn')),
        btnApps: document.getElementById('btn-apps'),
        shareHint: document.getElementById('share-hint'),
        shareStatus: document.getElementById('share-status'),
        tabs: Array.prototype.slice.call(document.querySelectorAll('.au-tab')),
        rankPeriod: document.getElementById('rank-period'),
        rankStatus: document.getElementById('rank-status'),
        rankList: document.getElementById('rank-list'),
        pager: document.getElementById('pager'),
        pageInfo: document.getElementById('page-info'),
        prevPage: document.getElementById('prev-page'),
        nextPage: document.getElementById('next-page'),
        champions: document.getElementById('champions')
    };

    /* A seção do ranking pode não existir na página: nesse caso,
       o script simplesmente não faz nada (nunca quebra o site). */
    if (!el.nickname || !el.rankList) return;

    /* ------------------------------------------------- */
    /* Utilidades                                        */
    /* ------------------------------------------------- */

    function storageGet(key) {
        try {
            var value = window.localStorage.getItem(key);
            return value === null ? '' : value;
        } catch (error) {
            return '';
        }
    }

    function storageSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            /* storage bloqueado: seguimos sem persistir */
        }
    }

    function storageRemove(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (error) {
            /* ignora */
        }
    }

    function validarNickname(valor) {
        var texto = String(valor || '').trim().replace(/\s+/g, ' ');
        var tamanho = Array.from(texto).length;
        if (tamanho < NICKNAME_MIN || tamanho > NICKNAME_MAX) return null;
        if (/[\u0000-\u001F\u007F-\u009F<>]/.test(texto)) return null;
        return texto;
    }

    function validarSenha(valor) {
        var texto = String(valor || '');
        var tamanho = Array.from(texto).length;
        if (tamanho < SENHA_MIN || tamanho > SENHA_MAX) return null;
        if (/[\u0000-\u001F]/.test(texto)) return null;
        return texto;
    }

    /** Apelido normalizado (usado só para derivar a chave). */
    function apelidoParaChave(apelido) {
        return String(apelido).trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    }

    function bytesParaHex(buffer) {
        var bytes = new Uint8Array(buffer);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    /**
     * Deriva a chave do arauto (64 caracteres hexadecimais) a partir de
     * apelido + senha. A senha não sai do navegador.
     */
    function derivarChave(apelido, senha) {
        var subtle = window.crypto && window.crypto.subtle;
        if (!subtle || typeof window.TextEncoder !== 'function') {
            return Promise.reject(new Error(
                'Por segurança, o Ranking dos Arautos precisa de conexão HTTPS: ' +
                'a sua senha é transformada aqui no navegador e nunca é enviada.'
            ));
        }

        var encoder = new TextEncoder();
        var material = apelidoParaChave(apelido) + '\u0000' + senha;

        return subtle.importKey('raw', encoder.encode(material), 'PBKDF2', false, ['deriveBits'])
            .then(function (chave) {
                return subtle.deriveBits({
                    name: 'PBKDF2',
                    salt: encoder.encode(KDF_SALT),
                    iterations: KDF_ITERACOES,
                    hash: 'SHA-256'
                }, chave, KDF_BITS);
            })
            .then(bytesParaHex)
            .catch(function () {
                throw new Error('Não foi possível processar a sua senha neste navegador.');
            });
    }

    /**
     * Lê apelido + senha, valida e devolve { apelido, chave }.
     * Em caso de problema, lança Error com mensagem pronta para exibir.
     */
    function identidadeAtual() {
        var apelido = validarNickname(el.nickname.value);
        if (!apelido) {
            throw new Error('Escolha um apelido de ' + NICKNAME_MIN + ' a ' + NICKNAME_MAX +
                ' caracteres (sem < > nem caracteres de controle).');
        }
        var senha = validarSenha(el.password.value);
        if (!senha) {
            throw new Error('A senha precisa ter de ' + SENHA_MIN + ' a ' + SENHA_MAX +
                ' caracteres.');
        }
        return derivarChave(apelido, senha).then(function (chave) {
            return { apelido: apelido, chave: chave };
        });
    }

    function numero(valor) {
        var n = Number(valor);
        return isFinite(n) ? n : 0;
    }

    function mensagemDoErro(payload, fallback) {
        if (payload && typeof payload === 'object') {
            if (typeof payload.errorData === 'string' && payload.errorData.trim() !== '') {
                return payload.errorData.trim();
            }
            if (typeof payload.errorMessage === 'string' && payload.errorMessage.trim() !== '') {
                var texto = payload.errorMessage;
                var marca = texto.indexOf('ConvexError:');
                if (marca >= 0) texto = texto.slice(marca + 'ConvexError:'.length);
                texto = texto.replace(/\[Request ID:[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
                if (texto !== '') return texto;
            }
        }
        return fallback;
    }

    function definirStatus(elemento, mensagem, tipo) {
        if (!elemento) return;
        elemento.textContent = mensagem || '';
        elemento.className = 'au-status' + (tipo ? ' is-' + tipo : '');
    }

    /* ------------------------------------------------- */
    /* API Convex (fetch puro)                           */
    /* ------------------------------------------------- */

    function chamarConvex(endpoint, path, args) {
        return window.fetch(CONVEX_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path, args: args || {} })
        }).then(function (resposta) {
            return resposta.json().catch(function () {
                throw new Error('Resposta inválida do servidor do ranking.');
            });
        }).then(function (payload) {
            if (!payload || payload.status !== 'success') {
                throw new Error(mensagemDoErro(payload, 'Não foi possível concluir a operação.'));
            }
            return payload.value;
        });
    }

    function consultar(path, args) {
        return chamarConvex('/api/query', path, args);
    }

    function executar(path, args) {
        return chamarConvex('/api/mutation', path, args);
    }

    /* ------------------------------------------------- */
    /* Link e texto de compartilhamento                  */
    /* ------------------------------------------------- */

    /** Link da Taverna com a assinatura de quem compartilhou. */
    function linkDoArauto(apelido) {
        return SITE_URL + '?arauto=' + encodeURIComponent(apelido);
    }

    function textoDoShare(apelido) {
        return '🎧 Ouça a TAVERNA RPG FM — a trilha sonora das aventuras! ' +
            'Sou ' + apelido + ' no Ranking dos Arautos.';
    }

    /* Endereços oficiais de compartilhamento (sem SDK, sem CDN). */
    var CANAIS = {
        whatsapp: function (url, texto) {
            return 'https://api.whatsapp.com/send?text=' + encodeURIComponent(texto + ' ' + url);
        },
        telegram: function (url, texto) {
            return 'https://t.me/share/url?url=' + encodeURIComponent(url) +
                '&text=' + encodeURIComponent(texto);
        },
        x: function (url, texto) {
            return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(texto) +
                '&url=' + encodeURIComponent(url);
        },
        facebook: function (url) {
            return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
        }
    };

    var NOMES_CANAL = {
        whatsapp: 'WhatsApp',
        telegram: 'Telegram',
        x: 'X / Twitter',
        facebook: 'Facebook',
        apps: 'folha de compartilhamento do sistema',
        copiar: 'link copiado'
    };

    /* ------------------------------------------------- */
    /* Renderização do "meu arauto"                      */
    /* ------------------------------------------------- */

    function criarStat(rotulo, valor) {
        var caixa = document.createElement('div');
        caixa.className = 'au-stat';

        var label = document.createElement('span');
        label.className = 'au-stat-label';
        label.textContent = rotulo;

        var conteudo = document.createElement('span');
        conteudo.className = 'au-stat-value';
        conteudo.textContent = valor;

        caixa.appendChild(label);
        caixa.appendChild(conteudo);
        return caixa;
    }

    function renderizarMe(dados) {
        el.meCard.replaceChildren();

        if (!dados) {
            el.meCard.hidden = true;
            return;
        }

        var nome = document.createElement('p');
        nome.className = 'au-me-name';
        nome.textContent = '🏅 ' + dados.nickname;
        el.meCard.appendChild(nome);

        var grade = document.createElement('div');
        grade.className = 'au-me-grid';
        grade.appendChild(criarStat('XP total', numero(dados.totalXp)));
        grade.appendChild(criarStat('Posição geral', '#' + numero(dados.generalPosition)));
        grade.appendChild(criarStat('XP do mês', numero(dados.monthlyXp)));
        grade.appendChild(criarStat(
            'Posição mensal',
            dados.monthlyPosition === null || dados.monthlyPosition === undefined
                ? '—'
                : '#' + numero(dados.monthlyPosition)
        ));
        grade.appendChild(criarStat('Dia (SP)', String(dados.dayKey || '—')));
        grade.appendChild(criarStat('XP de hoje', dados.sharedToday ? 'recebido' : 'disponível'));

        el.meCard.appendChild(grade);
        el.meCard.hidden = false;
    }

    /* ------------------------------------------------- */
    /* Ranking geral / mensal                            */
    /* ------------------------------------------------- */

    function medalha(posicao) {
        if (posicao === 1) return '🥇';
        if (posicao === 2) return '🥈';
        if (posicao === 3) return '🥉';
        return String(posicao);
    }

    function linhaVazia(texto) {
        var item = document.createElement('li');
        item.className = 'au-row is-empty';
        item.textContent = texto;
        return item;
    }

    function linhaRanking(entrada) {
        var posicao = numero(entrada.position);
        var item = document.createElement('li');
        item.className = 'au-row' + (posicao <= 3 ? ' pos-' + posicao : '');

        var badge = document.createElement('span');
        badge.className = 'au-pos';
        badge.textContent = medalha(posicao);

        var nome = document.createElement('span');
        nome.className = 'au-name';
        nome.textContent = entrada.nickname;   /* <-- sempre textContent */

        var xp = document.createElement('span');
        xp.className = 'au-xp';
        var valorXp = numero(state.view === 'monthly' ? entrada.xp : entrada.totalXp);
        xp.textContent = valorXp + ' XP';

        /* Guardados apenas para o destaque do próprio arauto
           (aplicado depois, por aplicarDestaque()). */
        item.setAttribute('data-position', String(posicao));
        item.setAttribute('data-nickname', String(entrada.nickname));

        item.appendChild(badge);
        item.appendChild(nome);
        item.appendChild(xp);
        return item;
    }

    /**
     * Destaca (borda vermelha) a linha do próprio arauto.
     * Posição E apelido precisam coincidir — com empates, a posição
     * sozinha não identifica uma linha.
     */
    function aplicarDestaque() {
        var linhas = el.rankList.querySelectorAll('.au-row');
        var jaDestacou = false;
        for (var i = 0; i < linhas.length; i++) {
            var linha = linhas[i];
            linha.classList.remove('is-me');

            if (!state.me || jaDestacou) continue;

            var minhaPosicao = state.view === 'monthly'
                ? state.me.monthlyPosition
                : state.me.generalPosition;
            if (minhaPosicao === null || minhaPosicao === undefined) continue;

            var posicaoDaLinha = numero(linha.getAttribute('data-position'));
            var apelidoDaLinha = String(linha.getAttribute('data-nickname') || '');

            if (posicaoDaLinha === numero(minhaPosicao) &&
                apelidoDaLinha === String(state.me.nickname)) {
                /* Só a primeira linha compatível é destacada (como os apelidos
                   são únicos, isso é sempre o próprio arauto). */
                linha.classList.add('is-me');
                jaDestacou = true;
            }
        }
    }

    function atualizarPeriodo() {
        if (state.view === 'general') {
            el.rankPeriod.textContent = '🏆 Ranking geral acumulado — sem limite de XP. ' +
                'Empates dividem a mesma posição.';
            return;
        }
        if (state.view === 'monthly') {
            var ano = state.monthlyYear;
            var mes = state.monthlyMonth;
            if (typeof ano === 'number' && typeof mes === 'number') {
                el.rankPeriod.textContent = '🗓️ Ranking de ' + MESES[mes - 1] + ' de ' + ano +
                    ' (fuso America/Sao_Paulo). Empates dividem a mesma posição.';
            } else {
                el.rankPeriod.textContent = '🗓️ Ranking do mês corrente (fuso America/Sao_Paulo). ' +
                    'Empates dividem a mesma posição.';
            }
            return;
        }
        el.rankPeriod.textContent = '👑 Campeões coroados no fechamento de cada mês.';
    }

    function carregarRanking() {
        if (state.view === 'champions') {
            carregarCampeoes();
            return;
        }

        var pagina = state.page[state.view];
        var path = state.view === 'monthly' ? 'ranking:monthly' : 'ranking:general';
        var args = { page: pagina, pageSize: PAGE_SIZE };

        definirStatus(el.rankStatus, 'Carregando ranking…', null);
        el.rankList.replaceChildren();

        consultar(path, args).then(function (dados) {
            if (state.view === 'monthly') {
                state.monthlyYear = numero(dados.year);
                state.monthlyMonth = numero(dados.month);
            }

            var entradas = (dados && dados.entries) || [];
            var lista = document.createDocumentFragment();

            if (entradas.length === 0) {
                lista.appendChild(linhaVazia(
                    'Nenhum arauto registrado ainda. Compartilhe a Taverna e seja o primeiro!'
                ));
            } else {
                entradas.forEach(function (entrada) {
                    lista.appendChild(linhaRanking(entrada));
                });
            }

            el.rankList.appendChild(lista);

            state.pageCount[state.view] = Math.max(1, numero(dados.pageCount) || 1);
            atualizarPager();
            aplicarDestaque();

            if (dados && dados.truncated) {
                definirStatus(
                    el.rankStatus,
                    'Exibindo os primeiros arautos — o ranking cresceu além do limite de cálculo de posições.',
                    'warn'
                );
            } else {
                definirStatus(el.rankStatus, '', null);
            }
            atualizarPeriodo();
        }).catch(function (erro) {
            el.rankList.replaceChildren(linhaVazia('Não foi possível carregar o ranking.'));
            definirStatus(el.rankStatus, erro.message, 'error');
        });
    }

    function atualizarPager() {
        var pagina = state.page[state.view];
        var total = state.pageCount[state.view];
        el.pager.hidden = false;   /* visível na carga inicial, não só depois de trocar de aba */
        el.pageInfo.textContent = 'Página ' + pagina + ' de ' + total;
        el.prevPage.disabled = pagina <= 1;
        el.nextPage.disabled = pagina >= total;
    }

    function carregarCampeoes() {
        definirStatus(el.rankStatus, 'Carregando campeões…', null);
        el.champions.replaceChildren();

        consultar('champions:list', { limit: 12 }).then(function (dados) {
            var meses = (dados && dados.months) || [];
            if (meses.length === 0) {
                var aviso = document.createElement('p');
                aviso.className = 'au-field-hint';
                aviso.textContent = 'Nenhum campeão coroado ainda — o primeiro fechamento acontece ' +
                    'no dia 1º do próximo mês (fuso America/Sao_Paulo).';
                el.champions.appendChild(aviso);
                definirStatus(el.rankStatus, '', null);
                return;
            }

            meses.forEach(function (mes) {
                var bloco = document.createElement('div');
                bloco.className = 'au-champion-month';

                var titulo = document.createElement('p');
                titulo.className = 'au-champion-title';
                titulo.textContent = '👑 ' + MESES[numero(mes.month) - 1] + ' de ' + numero(mes.year);
                bloco.appendChild(titulo);

                var lista = document.createElement('ul');
                lista.className = 'au-champion-list';
                (mes.entries || []).forEach(function (entrada) {
                    var item = document.createElement('li');
                    item.className = 'au-champion-item';

                    var nome = document.createElement('span');
                    nome.textContent = medalha(numero(entrada.position)) + ' ' + entrada.nickname;

                    var xp = document.createElement('span');
                    xp.className = 'au-xp';
                    xp.textContent = numero(entrada.xp) + ' XP';

                    item.appendChild(nome);
                    item.appendChild(xp);
                    lista.appendChild(item);
                });
                bloco.appendChild(lista);
                el.champions.appendChild(bloco);
            });

            definirStatus(el.rankStatus, '', null);
        }).catch(function (erro) {
            definirStatus(el.rankStatus, erro.message, 'error');
        });
    }

    /* ------------------------------------------------- */
    /* Sessão (apelido + senha) e XP do dia              */
    /* ------------------------------------------------- */

    function jaPontuouHoje() {
        return !!(state.me && state.me.sharedToday);
    }

    function atualizarCompartilhamento() {
        var pronto = !!state.sessao;
        var bloqueado = pronto && jaPontuouHoje();

        el.shareBtns.forEach(function (botao) {
            botao.disabled = !pronto || bloqueado || state.enviando;
        });

        if (!pronto) {
            el.shareHint.textContent = '🔐 Entre no salão com apelido e senha para liberar o compartilhamento.';
            return;
        }
        if (bloqueado) {
            el.shareHint.textContent = '✅ Você já garantiu o XP de hoje. Volte amanhã para ' +
                'compartilhar novamente e somar mais um ponto.';
            return;
        }
        el.shareHint.textContent = '📣 Escolha um canal: abrimos o compartilhamento e o servidor ' +
            'registra o seu +1 XP do dia (1 por dia, sem repetir).';
    }

    /** Recarrega a posição do arauto no servidor. */
    function atualizarMe(chave) {
        return consultar('ranking:me', { identifier: chave }).then(function (eu) {
            state.me = eu;
            renderizarMe(eu);
            aplicarDestaque();
            atualizarCompartilhamento();
            return eu;
        });
    }

    /**
     * "Entrar no salão": valida apelido + senha.
     *   • arauto conhecido  → carrega a posição (e trava o XP do dia, se já pontuou);
     *   • apelido livre     → é um arauto novo: liberado compartilhar para estrear;
     *   • apelido em uso    → recusa: apelido pertence a outro (senha diferente).
     */
    function entrarNoSalao() {
        var identidade;
        try {
            identidade = identidadeAtual();
        } catch (erro) {
            definirStatus(el.status, erro.message, 'error');
            if (!validarNickname(el.nickname.value)) el.nickname.focus();
            else el.password.focus();
            return;
        }

        el.btnLogin.disabled = true;
        definirStatus(el.status, 'Consultando o salão dos arautos…', null);

        identidade.then(function (dados) {
            return consultar('ranking:me', { identifier: dados.chave }).then(function (eu) {
                if (eu) {
                    state.sessao = dados;
                    storageSet(STORAGE_NICK, dados.apelido);
                    return atualizarMe(dados.chave).then(function () {
                        if (jaPontuouHoje()) {
                            definirStatus(el.status,
                                '🏅 Bem-vindo de volta, ' + dados.apelido +
                                '! Você já recebeu o XP de hoje — volte amanhã para compartilhar ' +
                                'novamente.', 'warn');
                        } else {
                            definirStatus(el.status,
                                '🏅 Bem-vindo de volta, ' + dados.apelido +
                                '! Você ainda pode compartilhar hoje e ganhar +1 XP.', 'ok');
                        }
                    });
                }

                // Apelido ainda não tem registro: precisa estar livre para estrear.
                return consultar('share:nicknameStatus', { nickname: dados.apelido })
                    .then(function (info) {
                        if (info && info.available) {
                            state.sessao = dados;
                            state.me = null;
                            storageSet(STORAGE_NICK, dados.apelido);
                            renderizarMe(null);
                            aplicarDestaque();
                            atualizarCompartilhamento();
                            definirStatus(el.status,
                                '✨ Apelido livre! Você é um novo arauto: escolha um canal de ' +
                                'compartilhamento para ganhar o seu primeiro XP.', 'ok');
                        } else {
                            state.sessao = null;
                            state.me = null;
                            renderizarMe(null);
                            atualizarCompartilhamento();
                            definirStatus(el.status,
                                '⚠️ Este apelido já pertence a outro arauto. Escolha outro apelido ' +
                                'ou confira a senha (o apelido identifica você no ranking).', 'error');
                        }
                    });
            });
        }).catch(function (erro) {
            definirStatus(el.status, erro.message, 'error');
        }).then(function () {
            el.btnLogin.disabled = false;
        });
    }

    /* ------------------------------------------------- */
    /* Compartilhamento + XP                             */
    /* ------------------------------------------------- */

    /**
     * Fala com o servidor depois de uma ação REAL de compartilhamento.
     * O XP quem decide é o backend (1 por dia por arauto).
     */
    function registrarXp(identidade, canal) {
        return executar('share:registerShare', {
            identifier: identidade.chave,
            nickname: identidade.apelido
        }).then(function (resultado) {
            storageSet(STORAGE_NICK, identidade.apelido);

            var via = NOMES_CANAL[canal] ? ' via ' + NOMES_CANAL[canal] : '';

            if (resultado && resultado.awarded) {
                definirStatus(el.shareStatus,
                    '🎉 +1 XP registrado' + via + '! Você agora tem ' +
                    numero(resultado.totalXp) + ' XP. Obrigado por levar a Taverna para ' +
                    'mais aventureiros!', 'ok');
            } else {
                definirStatus(el.shareStatus,
                    'Você já recebeu o XP de hoje (' + String(resultado.dayKey || '') +
                    ' em São Paulo). Total: ' + numero(resultado.totalXp) +
                    ' XP. Volte amanhã!', 'warn');
            }

            return atualizarMe(identidade.chave).then(function () {
                state.page[state.view] = 1;
                carregarRanking();
            });
        }).catch(function (erro) {
            definirStatus(el.shareStatus, erro.message, 'error');
            /* Um apelido recusado no servidor desfaz a sessão local. */
            if (/apelido já pertence/i.test(erro.message)) {
                state.sessao = null;
                atualizarCompartilhamento();
            }
        });
    }

    /** Valida os campos e devolve a identidade, ou null (com mensagem). */
    function identidadeParaCompartilhar() {
        try {
            return identidadeAtual();
        } catch (erro) {
            definirStatus(el.shareStatus, erro.message, 'error');
            return null;
        }
    }

    function podeCompartilhar() {
        if (state.enviando) return false;
        if (!state.sessao) {
            definirStatus(el.shareStatus,
                '🔐 Entre no salão (apelido + senha) antes de compartilhar.', 'warn');
            return false;
        }
        if (jaPontuouHoje()) {
            definirStatus(el.shareStatus,
                'Você já recebeu o XP de hoje. Amanhã você pode compartilhar de novo.', 'warn');
            return false;
        }
        return true;
    }

    function bloquearBotoes() {
        state.enviando = true;
        atualizarCompartilhamento();
    }

    function liberarBotoes() {
        state.enviando = false;
        atualizarCompartilhamento();
    }

/**
     * Abre um endereço em NOVA ABA logo no clique (navegação de âncora, não
     * window.open): assim a Taverna e a rádio continuam tocando na aba atual
     * e o navegador não bloqueia nada. O XP é pedido ao servidor em seguida.
     */
    function abrirEmNovaAba(url) {
        var ligacao = document.createElement('a');
        ligacao.href = url;
        ligacao.target = '_blank';
        ligacao.rel = 'noopener';
        document.body.appendChild(ligacao);
        ligacao.click();
        document.body.removeChild(ligacao);
    }

    /**
     * Compartilhamento por endereço oficial (WhatsApp, Telegram, X, Facebook):
     * abre a janela do canal e, feito isso, pede o XP ao servidor.
     */
    function compartilharPorLink(canal) {
        if (!podeCompartilhar()) return;

        // Campos inválidos: a mensagem de erro é publicada e nada é aberto.
        var apelido = validarNickname(el.nickname.value);
        if (!apelido || !validarSenha(el.password.value)) {
            identidadeParaCompartilhar();
            return;
        }

        abrirEmNovaAba(CANAIS[canal](linkDoArauto(apelido), textoDoShare(apelido)));

        bloquearBotoes();
        definirStatus(el.shareStatus, 'Abrindo o ' + NOMES_CANAL[canal] +
            '… confirme o compartilhamento por lá.', null);

        identidadeAtual().then(function (identidade) {
            return registrarXp(identidade, canal);
        }).catch(function (erro) {
            definirStatus(el.shareStatus, erro.message, 'error');
        }).then(liberarBotoes);
    }

    /**
     * Folha de compartilhamento do sistema (no celular inclui WhatsApp,
     * Discord, Instagram, Messenger…). O XP só é pedido se você concluir.
     */
    function compartilharPeloApp() {
        if (!podeCompartilhar()) return;

        var apelido = validarNickname(el.nickname.value);
        if (!apelido) {
            identidadeParaCompartilhar();
            return;
        }

        if (typeof navigator.share !== 'function') {
            definirStatus(el.shareStatus,
                'Este navegador não tem a folha de compartilhamento. Use WhatsApp, Telegram, ' +
                'X, Facebook ou “Copiar link”.', 'warn');
            return;
        }

        bloquearBotoes();
        definirStatus(el.shareStatus, 'Abrindo as opções de compartilhamento…', null);

        navigator.share({
            title: 'Taverna RPG FM — A Trilha Sonora das Aventuras',
            text: textoDoShare(apelido),
            url: linkDoArauto(apelido)
        }).then(function () {
            return identidadeAtual().then(function (identidade) {
                return registrarXp(identidade, 'apps');
            });
        }).catch(function (erro) {
            if (erro && erro.name === 'AbortError') {
                definirStatus(el.shareStatus,
                    'Compartilhamento cancelado — nenhum XP foi registrado.', 'warn');
                return;
            }
            definirStatus(el.shareStatus, erro.message || 'Não foi possível compartilhar.', 'error');
        }).then(liberarBotoes);
    }

    /** Copiar o link (para colar no Discord, em grupos, etc.). */
    function compartilharCopiando() {
        if (!podeCompartilhar()) return;

        var apelido = validarNickname(el.nickname.value);
        if (!apelido) {
            identidadeParaCompartilhar();
            return;
        }

        var texto = textoDoShare(apelido) + ' ' + linkDoArauto(apelido);
        var copiar = (navigator.clipboard && navigator.clipboard.writeText)
            ? navigator.clipboard.writeText(texto)
            : Promise.reject(new Error('sem clipboard'));

        bloquearBotoes();
        definirStatus(el.shareStatus, 'Copiando o link da Taverna…', null);

        copiar.then(function () {
            return identidadeAtual().then(function (identidade) {
                return registrarXp(identidade, 'copiar').then(function () {
                    if (!jaPontuouHoje()) return;
                    definirStatus(el.shareStatus,
                        '🔗 Link copiado! Cole no Discord, em um grupo ou onde quiser. ' +
                        'Seu XP de hoje já está garantido.', 'ok');
                });
            });
        }).catch(function () {
            definirStatus(el.shareStatus,
                'Não foi possível copiar automaticamente. Selecione o link abaixo e copie ' +
                'manualmente:', 'warn');
            mostrarLinkManual(linkDoArauto(apelido));
        }).then(liberarBotoes);
    }

    /** Deixa o link visível e selecionável quando o clipboard é bloqueado. */
    function mostrarLinkManual(url) {
        var caixa = document.createElement('div');
        caixa.className = 'au-share-fallback';

        var campo = document.createElement('input');
        campo.type = 'text';
        campo.className = 'au-input';
        campo.readOnly = true;
        campo.value = url;
        campo.setAttribute('aria-label', 'Link da Taverna para copiar');

        caixa.appendChild(campo);
        el.shareStatus.insertAdjacentElement('afterend', caixa);
        campo.focus();
        campo.select();
    }

    function limparCampos() {
        el.nickname.value = '';
        el.password.value = '';
        storageRemove(STORAGE_NICK);
        state.me = null;
        state.sessao = null;
        renderizarMe(null);
        aplicarDestaque();
        atualizarCompartilhamento();
        definirStatus(el.status, 'Campos limpos. Informe apelido e senha para continuar.', null);
        definirStatus(el.shareStatus, '', null);
        el.nickname.focus();
    }

    /* ------------------------------------------------- */
    /* Eventos                                           */
    /* ------------------------------------------------- */

    el.tabs.forEach(function (aba) {
        aba.addEventListener('click', function () {
            var alvo = aba.getAttribute('data-view');
            if (!alvo || alvo === state.view) return;

            state.view = alvo;
            el.tabs.forEach(function (outra) {
                var ativa = outra === aba;
                outra.classList.toggle('is-active', ativa);
                outra.setAttribute('aria-selected', ativa ? 'true' : 'false');
            });

            var campeoes = state.view === 'champions';
            el.champions.hidden = !campeoes;
            el.rankList.hidden = campeoes;
            el.pager.hidden = campeoes;

            atualizarPeriodo();
            carregarRanking();
        });
    });

    el.prevPage.addEventListener('click', function () {
        if (state.page[state.view] > 1) {
            state.page[state.view] -= 1;
            carregarRanking();
        }
    });

    el.nextPage.addEventListener('click', function () {
        if (state.page[state.view] < state.pageCount[state.view]) {
            state.page[state.view] += 1;
            carregarRanking();
        }
    });

    el.shareBtns.forEach(function (botao) {
        botao.addEventListener('click', function () {
            var canal = botao.getAttribute('data-canal');
            if (canal === 'apps') compartilharPeloApp();
            else if (canal === 'copiar') compartilharCopiando();
            else if (CANAIS[canal]) compartilharPorLink(canal);
        });
    });

    el.btnLogin.addEventListener('click', entrarNoSalao);
    el.btnClear.addEventListener('click', limparCampos);

    el.nickname.addEventListener('change', function () {
        var apelido = validarNickname(el.nickname.value);
        if (apelido) storageSet(STORAGE_NICK, apelido);
        /* Trocar de apelido desfaz a sessão validada. */
        if (state.sessao && state.sessao.apelido !== apelido) {
            state.sessao = null;
            state.me = null;
            renderizarMe(null);
            atualizarCompartilhamento();
        }
    });

    el.password.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            entrarNoSalao();
        }
    });

    /* ------------------------------------------------- */
    /* Início                                            */
    /* ------------------------------------------------- */

    if (typeof navigator.share !== 'function' && el.btnApps) {
        el.btnApps.hidden = true;
    }

    el.nickname.value = storageGet(STORAGE_NICK);
    atualizarPeriodo();
    atualizarCompartilhamento();
    carregarRanking();
});
