// =================================================
// VITE — CONFIGURAÇÃO MÍNIMA (apenas ferramenta de build)
// -----------------------------------------------
// O site é 100% estático. Este arquivo existe somente para:
//   1. base: './'  → gera caminhos RELATIVOS no dist/,
//      compatível com GitHub Pages em subdiretório
//      (https://tavernarpgfm.github.io/RadioWeb_TavernaRPGFM/).
//   2. Copiar assets/js/script.js (script clássico, fora do
//      bundle) para dist/assets/js/script.js, para que o site
//      publicado mantenha o JavaScript do player.
// =================================================

import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    base: './',
    plugins: [
        {
            name: 'copy-classic-script',
            writeBundle() {
                const src = resolve(root, 'assets/js/script.js');
                const dest = resolve(root, 'dist/assets/js/script.js');
                mkdirSync(dirname(dest), { recursive: true });
                copyFileSync(src, dest);
            }
        }
    ]
});
