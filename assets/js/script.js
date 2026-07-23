document.addEventListener('DOMContentLoaded', function() {

    const btnPlayer = document.getElementById('btn-ouvir-player');
    const playerContainer = document.getElementById('player-container');
    let playerInitialized = false;

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

    btnPlayer.addEventListener('click', function() {
        if (playerContainer.classList.contains('show')) {
            playerContainer.classList.remove('show');
            btnPlayer.innerHTML = '▶️ OUVIR AO VIVO';
        } else {
            playerContainer.classList.add('show');
            btnPlayer.innerHTML = '🔴 OUVINDO...';
            
            setTimeout(() => {
                initCasterPlayer();
            }, 150);
        }
    });

    // Botão do Hero
    const btnHero = document.getElementById('ouvir');
    if (btnHero) {
        btnHero.addEventListener('click', function() {
            document.querySelector('.radio').scrollIntoView({ behavior: 'smooth' });
            
            setTimeout(() => {
                playerContainer.classList.add('show');
                btnPlayer.innerHTML = '🔴 OUVINDO...';
                initCasterPlayer();
            }, 900);
        });
    }
});