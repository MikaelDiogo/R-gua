# Régua — taste skill

O sistema visual agora é o **Régua** (`DESIGN.md`, `tokens.css`, `regua.css`). Os valores antigos desta página (paleta azul, DM Sans, "pórtico de ágora") foram substituídos.

| Controle         | App (chat, radar, buscador, funil, detalhe)                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| Design variance  | **3**: previsível, mesma grade em todas as telas, papel quente e serifa       |
| Motion intensity | **2**: só feedback (hover, foco, arrastar cartão, abrir gaveta)              |
| Visual density   | **6** em buscador e funil; **4** em chat e leitura de edital                 |

Elemento só do produto: a **régua de prazos** (`DeadlineRuler`).

## Checagens antes de entregar uma tela

```bash
node .claude/skills/design-taste-frontend/scripts/lint.mjs --app <arquivos>
node .claude/skills/design-taste-frontend/scripts/inspect.mjs --app <url> --widths 1440,768,390
```

Se a skill sugerir gradiente, vidro fora de campos e popovers, violeta, emoji ou ícone em círculo colorido, vale o `DESIGN.md` ("O que evitar").
