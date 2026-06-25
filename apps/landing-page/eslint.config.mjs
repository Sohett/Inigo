import eslintPluginAstro from "eslint-plugin-astro";

import rootConfig from "../../eslint.config.mjs";

// Reprend la config racine (TS strict, no-explicit-any…) et ajoute le support
// des fichiers .astro. Le plugin n'est installé que dans ce workspace, donc la
// config astro vit ici plutôt qu'à la racine.
export default [...rootConfig, ...eslintPluginAstro.configs["flat/recommended"]];
