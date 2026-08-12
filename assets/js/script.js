/* ================================================= */
/* TAVERNA RPG FM — script.js                        */
/*                                                  */
/* A lógica do player Caster FM foi preservada:     */
/* btnPlayer · playerContainer · playerInitialized  */
/* initCasterPlayer() · window.casterEmbed.init()   */
/* btnHero · scrollIntoView()                       */
/* ================================================= */

document.addEventListener('DOMContentLoaded', function () {

    /* ================================================= */
    /* 1. RÁDIO — LÓGICA CASTER FM (preservada)          */
    /* ================================================= */

    const btnPlayer = document.getElementById('btn-ouvir-player');
    const playerContainer = document.getElementById('player-container');
    let playerInitialized = false;

    const radioSection = document.querySelector('.radio');

    function initCasterPlayer() {
        if (playerInitialized) return;

        const embedDiv = playerContainer.querySelector('.cstrEmbed');

        if (embedDiv && typeof window.casterEmbed !== 'undefined') {
            window.casterEmbed.init();
        } else {
            // Fallback
            const script = document.createElement('script');
            script.src = "https://cdn.cloud.caster.fm/widgets/embed.js";
            document.body.appendChild(script);
        }

        playerInitialized = true;
    }

    function openPlayer() {
        playerContainer.classList.add('show');
        btnPlayer.innerHTML = '🔴 OUVINDO...';
        if (radioSection) radioSection.classList.add('playing');
        setTimeout(function () {
            initCasterPlayer();
        }, 150);
    }

    function closePlayer() {
        playerContainer.classList.remove('show');
        btnPlayer.innerHTML = '▶️ OUVIR AO VIVO';
        if (radioSection) radioSection.classList.remove('playing');
    }

    btnPlayer.addEventListener('click', function () {
        if (playerContainer.classList.contains('show')) {
            closePlayer();
        } else {
            openPlayer();
        }
    });

    // Botão do Hero
    const btnHero = document.getElementById('ouvir');
    if (btnHero) {
        btnHero.addEventListener('click', function () {
            document.querySelector('.radio').scrollIntoView({ behavior: 'smooth' });

            setTimeout(function () {
                openPlayer();
            }, 900);
        });
    }

    /* ================================================= */
    /* 2. NAVEGAÇÃO                                      */
    /* ================================================= */

    const nav = document.getElementById('nav');
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');

    function setMenu(open) {
        navLinks.classList.toggle('open', open);
        navToggle.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', String(open));
        navToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', function () {
            setMenu(!navLinks.classList.contains('open'));
        });

        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                setMenu(false);
            });
        });
    }

    function onNavScroll() {
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 24);
    }
    window.addEventListener('scroll', onNavScroll, { passive: true });
    onNavScroll();

    /* ================================================= */
    /* 3. GUILDA — DADOS (fácil de adicionar parceiros)  */
    /* ================================================= */

    const guildas = [
        {
            nome: "Querência Imóveis",
            tipo: "Guilda Oficial",
            descricao: "Parceiro Oficial da Taverna RPG FM. Um aliado que fortalece a jornada dos aventureiros.",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSfR5ggNMMff-V4VPoj1ZhI9a-PFJEegHOaP0HWy6WbXl3absg/viewform",
            icone: "⚔️",
            mapa: { x: 716, y: 336 }
        }
    ];

    // Cartas de guilda
    const guildCards = document.getElementById('guild-cards');
    if (guildCards) {
        guildas.forEach(function (g) {
            const card = document.createElement('article');
            card.className = 'guild-card';
            card.innerHTML =
                '<span class="guild-card-seal" aria-hidden="true"><span>✦</span></span>' +
                '<span class="guild-card-level">🛡️ ' + g.tipo.toUpperCase() + '</span>' +
                '<p class="guild-card-crest" aria-hidden="true">' + g.icone + '</p>' +
                '<h3 class="guild-card-name">' + g.nome + '</h3>' +
                '<p class="guild-card-desc">' + g.descricao + '</p>' +
                '<a class="btn-card" href="' + g.url + '" target="_blank" rel="noopener">🏰 VISITAR GUILDA</a>';
            guildCards.appendChild(card);
        });
    }

    /* ================================================= */
    /* 4. MAPA — MARCADORES + TOOLTIP                    */
    /* ================================================= */

    const mapSvg = document.getElementById('map-svg');
    const mapWrap = document.getElementById('map-wrap');
    const mapTooltip = document.getElementById('map-tooltip');
    const isSmallScreen = window.matchMedia('(max-width: 640px)');

    if (mapSvg && mapWrap && mapTooltip) {
        const NS = "http://www.w3.org/2000/svg";

        // Injeta um marcador de guilda no SVG
        guildas.forEach(function (g, index) {
            const x = g.mapa.x;
            const y = g.mapa.y;

            const group = document.createElementNS(NS, 'g');
            group.setAttribute('class', 'map-guild');
            group.setAttribute('tabindex', '0');
            group.setAttribute('role', 'button');
            group.setAttribute('aria-label', 'Guilda ' + g.nome);
            group.setAttribute('data-index', String(index));

            const pulse = document.createElementNS(NS, 'circle');
            pulse.setAttribute('class', 'map-guild-pulse');
            pulse.setAttribute('cx', x);
            pulse.setAttribute('cy', y);
            pulse.setAttribute('r', '22');

            const shield = document.createElementNS(NS, 'path');
            shield.setAttribute('class', 'map-guild-shield');
            shield.setAttribute('d',
                'M' + x + ' ' + (y - 24) +
                ' C' + (x + 11) + ' ' + (y - 20) + ' ' + (x + 13) + ' ' + (y - 14) + ' ' + (x + 13) + ' ' + (y - 7) +
                ' C' + (x + 13) + ' ' + (y + 6) + ' ' + (x + 5) + ' ' + (y + 11) + ' ' + x + ' ' + (y + 14) +
                ' C' + (x - 5) + ' ' + (y + 11) + ' ' + (x - 13) + ' ' + (y + 6) + ' ' + (x - 13) + ' ' + (y - 7) +
                ' C' + (x - 13) + ' ' + (y - 14) + ' ' + (x - 11) + ' ' + (y - 20) + ' ' + x + ' ' + (y - 24) + ' Z'
            );

            const label = document.createElementNS(NS, 'text');
            label.setAttribute('class', 'map-guild-label');
            label.setAttribute('x', x);
            label.setAttribute('y', y + 34);
            label.setAttribute('text-anchor', 'middle');
            label.textContent = 'GUILDA DA ' + g.nome.split(' ')[0].toUpperCase();

            group.appendChild(pulse);
            group.appendChild(shield);
            group.appendChild(label);
            mapSvg.appendChild(group);
        });

        // Tooltip
        let tooltipAnchor = null;

        function showTooltip(marker) {
            const g = guildas[parseInt(marker.getAttribute('data-index'), 10)];
            if (!g) return;

            mapTooltip.innerHTML =
                '<span class="tip-type">🛡️ ' + g.tipo.toUpperCase() + '</span>' +
                '<strong>' + g.nome + '</strong>' +
                '<p>' + g.descricao + '</p>' +
                '<a href="' + g.url + '" target="_blank" rel="noopener">🏰 VISITAR GUILDA</a>';

            if (isSmallScreen.matches) {
                mapTooltip.classList.add('mobile');
                mapTooltip.style.left = '';
                mapTooltip.style.top = '';
            } else {
                mapTooltip.classList.remove('mobile');
                mapTooltip.style.left = (g.mapa.x / 1000 * 100) + '%';
                mapTooltip.style.top = (g.mapa.y / 620 * 100) + '%';
            }

            mapTooltip.classList.add('show');
            tooltipAnchor = marker;
        }

        function hideTooltip() {
            mapTooltip.classList.remove('show');
            tooltipAnchor = null;
        }

        mapSvg.querySelectorAll('.map-guild').forEach(function (marker) {
            marker.addEventListener('mouseenter', function () { showTooltip(marker); });
            marker.addEventListener('mouseleave', function () { hideTooltip(); });
            marker.addEventListener('focus', function () { showTooltip(marker); });
            marker.addEventListener('blur', function () { hideTooltip(); });
            marker.addEventListener('click', function (e) {
                e.stopPropagation();
                if (tooltipAnchor === marker) {
                    hideTooltip();
                } else {
                    showTooltip(marker);
                }
            });
        });

        document.addEventListener('click', function (e) {
            if (tooltipAnchor && !mapTooltip.contains(e.target)) {
                hideTooltip();
            }
        });
    }

    /* ================================================= */
    /* 5. AMBIENTAÇÃO — BRASAS (canvas leve)             */
    /* ================================================= */

    const embersCanvas = document.getElementById('embers');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (embersCanvas && !reduceMotion.matches && embersCanvas.getContext) {
        const ctx = embersCanvas.getContext('2d');
        let w, h, rafId = null;
        let particles = [];
        let tabVisible = true;

        const DPR = Math.min(window.devicePixelRatio || 1, 2);

        function resize() {
            w = embersCanvas.width = window.innerWidth * DPR;
            h = embersCanvas.height = window.innerHeight * DPR;
            embersCanvas.style.width = window.innerWidth + 'px';
            embersCanvas.style.height = window.innerHeight + 'px';
        }

        function spawn(anywhere) {
            const p = {
                x: Math.random() * w,
                y: anywhere ? Math.random() * h : h + Math.random() * h * 0.35,
                r: (Math.random() * 1.3 + 0.6) * DPR,
                vy: -(Math.random() * 0.32 + 0.12) * DPR,
                vx: (Math.random() - 0.5) * 0.16 * DPR,
                phase: Math.random() * Math.PI * 2,
                flick: Math.random() * 0.04 + 0.02
            };
            return p;
        }

        const count = Math.min(44, Math.floor(window.innerWidth / 30));

        function frame(t) {
            rafId = requestAnimationFrame(frame);
            ctx.clearRect(0, 0, w, h);

            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.y += p.vy;
                p.x += p.vx + Math.sin(t * 0.0008 + p.phase) * 0.14;
                p.phase += p.flick;

                if (p.y < -16 || p.x < -16 || p.x > w + 16) {
                    particles[i] = spawn(false);
                    continue;
                }

                const alpha = (0.22 + (Math.sin(p.phase) + 1) * 0.14) * 0.6;
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
                g.addColorStop(0, 'rgba(255, 195, 115, ' + alpha + ')');
                g.addColorStop(0.5, 'rgba(232, 120, 60, ' + alpha * 0.55 + ')');
                g.addColorStop(1, 'rgba(232, 120, 60, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        function start() {
            if (rafId === null && tabVisible) {
                rafId = requestAnimationFrame(frame);
            }
        }

        function stop() {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }

        resize();
        for (let i = 0; i < count; i++) {
            particles.push(spawn(true));
        }
        start();

        window.addEventListener('resize', resize, { passive: true });

        document.addEventListener('visibilitychange', function () {
            tabVisible = !document.hidden;
            if (tabVisible) start(); else stop();
        });
    }

    /* ================================================= */
    /* 6. PARALLAX SUTIL NO HERO                         */
    /* ================================================= */

    const heroBg = document.querySelector('.hero-bg');

    if (heroBg && !reduceMotion.matches) {
        let ticking = false;

        function updateParallax() {
            const y = window.scrollY;
            if (y < window.innerHeight * 1.25) {
                heroBg.style.transform = 'translate3d(0, ' + (y * 0.22) + 'px, 0) scale(1.08)';
            }
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) {
                window.requestAnimationFrame(updateParallax);
                ticking = true;
            }
        }, { passive: true });

        updateParallax();
    }

    /* ================================================= */
    /* 7. REVEAL ON SCROLL                               */
    /* ================================================= */

    const revealEls = document.querySelectorAll('.reveal');

    if (reduceMotion.matches) {
        revealEls.forEach(function (el) { el.classList.add('in-view'); });
    } else if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        revealEls.forEach(function (el) { io.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('in-view'); });
    }

});
