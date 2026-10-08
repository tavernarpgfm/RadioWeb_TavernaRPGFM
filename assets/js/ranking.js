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
/* armazenada: o navegador deriva dela (PBKDF2        */
/* SHA-256, 100k iterações) um código de 64 hex,      */
/* que é a chave do arauto no ranking.               */
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
        me: null
    };

    /* ------------------------------------------------- */
    /* Elementos                                         */
    /* ------------------------------------------------- */

    var el = {
        nickname: document.getElementById('nickname'),
        password: document.getElementById('password'),
        status: document.getElementById('status'),
        meCard: document.getElementById('me-card'),
        btnShare: document.getElementById('btn-share'),
        btnMe: document.getElementById('btn-me'),
        btnClear: document.getElementById('btn-clear'),
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
                'Por segurança, o Ranking dos Arautos precisa de uma conexão HTTPS: ' +
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
     * Lê apelido + senha, valida e devolve a chave derivada.
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

        // Guardados apenas para o destaque do próprio arauto
        // (aplicado depois, por aplicarDestaque()).
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
                // Só a primeira linha compatível é destacada (dois arautos
                // com o mesmo apelido e o mesmo XP são indistinguíveis aqui).
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
                    'Nenhum arauto registrado ainda. Seja o primeiro a iniciar um compartilhamento!'
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
    /* Ações                                             */
    /* ------------------------------------------------- */

    function consultarPosicao() {
        var identidade;
        try {
            identidade = identidadeAtual();
        } catch (erro) {
            definirStatus(el.status, erro.message, 'error');
            return Promise.resolve(null);
        }

        definirStatus(el.status, 'Procurando o seu arauto no salão de honra…', null);

        return identidade.then(function (dados) {
            return consultar('ranking:me', { identifier: dados.chave }).then(function (resultado) {
                state.me = resultado;
                renderizarMe(resultado);
                aplicarDestaque();

                if (resultado) {
                    storageSet(STORAGE_NICK, dados.apelido);
                    definirStatus(el.status, 'Arauto encontrado no salão de honra.', 'ok');
                } else {
                    definirStatus(el.status,
                        'Ainda não há registro para este apelido e senha — registre um ' +
                        'compartilhamento para entrar no ranking.', 'warn');
                }
                return resultado;
            });
        }).catch(function (erro) {
            definirStatus(el.status, erro.message, 'error');
            return null;
        });
    }

    function registrarCompartilhamento() {
        var identidade;
        try {
            identidade = identidadeAtual();
        } catch (erro) {
            definirStatus(el.status, erro.message, 'error');
            if (!validarNickname(el.nickname.value)) el.nickname.focus();
            else el.password.focus();
            return;
        }

        el.btnShare.disabled = true;
        definirStatus(el.status, 'Registrando o compartilhamento de hoje…', null);

        identidade.then(function (dados) {
            return executar('share:registerShare', {
                identifier: dados.chave,
                nickname: dados.apelido
            }).then(function (resultado) {
                storageSet(STORAGE_NICK, dados.apelido);

                if (resultado && resultado.awarded) {
                    definirStatus(
                        el.status,
                        '🎉 +1 XP! Você agora tem ' + numero(resultado.totalXp) + ' XP. ' +
                        'Obrigado por levar a Taverna para mais aventureiros!',
                        'ok'
                    );
                } else {
                    definirStatus(
                        el.status,
                        'Você já recebeu o XP de hoje (' + String(resultado.dayKey || '') +
                        ' em São Paulo). Total: ' + numero(resultado.totalXp) +
                        ' XP. Volte amanhã!',
                        'warn'
                    );
                }

                // Atualiza o painel do arauto com os dados do servidor.
                return consultar('ranking:me', { identifier: dados.chave }).then(function (eu) {
                    state.me = eu;
                    renderizarMe(eu);
                    aplicarDestaque();
                });
            });
        }).then(function () {
            state.page[state.view] = 1;
            carregarRanking();
        }).catch(function (erro) {
            definirStatus(el.status, erro.message, 'error');
        }).then(function () {
            el.btnShare.disabled = false;
        });
    }

    function limparCampos() {
        el.nickname.value = '';
        el.password.value = '';
        storageRemove(STORAGE_NICK);
        state.me = null;
        renderizarMe(null);
        definirStatus(el.status, 'Campos limpos. Informe apelido e senha para continuar.', null);
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

    el.btnShare.addEventListener('click', registrarCompartilhamento);
    el.btnMe.addEventListener('click', consultarPosicao);
    el.btnClear.addEventListener('click', limparCampos);

    el.nickname.addEventListener('change', function () {
        var apelido = validarNickname(el.nickname.value);
        if (apelido) storageSet(STORAGE_NICK, apelido);
    });

    el.password.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            registrarCompartilhamento();
        }
    });

    /* ------------------------------------------------- */
    /* Início                                            */
    /* ------------------------------------------------- */

    el.nickname.value = storageGet(STORAGE_NICK);
    atualizarPeriodo();
    carregarRanking();
});
