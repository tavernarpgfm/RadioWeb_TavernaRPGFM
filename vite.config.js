// =================================================
// VITE — CONFIGURAÇÃO MÍNIMA (apenas ferramenta de build)
// -----------------------------------------------
// O site é 100% estático. Este arquivo existe somente para:
//   1. base: './'  → gera caminhos RELATIVOS no dist/,
//      compatível com GitHub Pages em subdiretório
//      (https://tavernarpgfm.github.io/RadioWeb_TavernaRPGFM/).
//   2. Copiar os scripts clássicos de assets/js/
//      (script.js, qrcode.js, qr.js) para dist/assets/js/,
//      pois ficam fora do bundle e são referenciados
//      diretamente pelo index.html publicado.
// =================================================

import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

const CLASSIC_SCRIPTS = ['script.js', 'qrcode.js', 'qr.js'];

export default defineConfig({
    base: './',
    plugins: [
        {
            name: 'copy-classic-scripts',
            writeBundle() {
                CLASSIC_SCRIPTS.forEach(function (file) {
                    const src = resolve(root, 'assets/js', file);
                    const dest = resolve(root, 'dist/assets/js', file);
                    mkdirSync(dirname(dest), { recursive: true });
                    copyFileSync(src, dest);
                });
            }
        }
    ]
});
