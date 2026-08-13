/* ================================================= */
/* TAVERNA RPG FM — qr.js                            */
/*                                                  */
/* Gera o QR Code da seção "Apoie a Taverna" que   */
/* aponta para o LivePix oficial:                   */
/* https://livepix.gg/tavernarpgfm                  */
/*                                                  */
/* Script clássico (sem módulos/imports) para       */
/* funcionar também quando o site é servido         */
/* diretamente pelo GitHub Pages, sem build.        */
/* Depende do global `qrcode` definido por          */
/* assets/js/qrcode.js (biblioteca local).          */
/* ================================================= */

document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('qr-apoio');

    // Se a biblioteca ou o container não existirem,
    // mantém apenas o botão — nunca quebra a página.
    if (!container || typeof qrcode === 'undefined') return;

    var qr = qrcode(0, 'M'); // typeNumber 0 = automático, correção de erro M
    qr.addData('https://livepix.gg/tavernarpgfm');
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
});
