/* ================================================= */
/* TAVERNA RPG FM — qr.js                            */
/*                                                  */
/* Gera o QR Code da seção "Apoie a Taverna" que   */
/* aponta para o LivePix oficial:                   */
/* https://livepix.gg/tavernarpgfm                  */
/* ================================================= */

import qrcode from 'qrcode-generator';

const LIVE_PIX_URL = 'https://livepix.gg/tavernarpgfm';
const container = document.getElementById('qr-apoio');

if (container) {
    const qr = qrcode(0, 'M'); // typeNumber 0 = automático, correção de erro M
    qr.addData(LIVE_PIX_URL);
    qr.make();
    container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
