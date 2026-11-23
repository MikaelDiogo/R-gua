# Régua — Pacote de especificações

Pacote de specs em markdown para construir a plataforma de gestão de licitações com IA (nome do produto: **Régua**), tendo o LicitaHub como referência funcional.

**Comece por [`../CLAUDE.md`](../CLAUDE.md)**, o arquivo de contexto do projeto (regras que não se negociam, comandos e ordem de trabalho). Os documentos aqui aprofundam cada tema.

## Histórico

Na Etapa 0 os arquivos foram renomeados para bater com o título interno (no pacote original os nomes e os números estavam trocados). O `02-arquitetura.md` não veio no pacote e foi reescrito a partir dos demais; o `CONTEXT.md` virou o `CLAUDE.md` da raiz.

## Ordem de leitura sugerida

`../CLAUDE.md` → `01` → `02` → `04` → `05` → `06` → `16` → `07` → `08` → resto.

## Índice

| Doc | Tema |
|---|---|
| 01 | Produto, personas, requisitos, entitlements, usabilidade |
| 02 | Arquitetura, módulos, portas e adaptadores |
| 03 | Stack, comparação de alternativas, ADRs, matriz de versões |
| 04 | Servidor autoritativo |
| 05 | Ingestão de dados (PNCP) |
| 06 | Busca híbrida e RAG |
| 07 | Modelo de dados (PostgreSQL) e RLS |
| 08 | API HTTP e SSE |
| 09 | Funcionalidades de IA |
| 10 | Segurança, tenancy, LGPD |
| 11 | Observabilidade, SLOs, performance |
| 12 | Infraestrutura e deploy |
| 13 | Roadmap por fases |
| 14 | Design handoff · `design/` tem o `DESIGN.md` do Régua |
| 15 | Riscos, premissas e perguntas abertas |
| 16 | Provedores de IA plugáveis |
| 99 | Fontes |

## O que é fato e o que é estimativa

- Fatos sobre o LicitaHub vêm da página pública do produto (consultada em 2026-11-03).
- Fatos sobre o PNCP vêm dos manuais oficiais e de medições de terceiros (datadas no texto).
- Números de volume, custo e latência marcados como **estimativa** precisam ser medidos na Fase 0 antes de virarem compromisso.

## Publicar de graça

`deploy-gratuito.md`: Neon + Render + Vercel + GitHub Actions. Versão para leigos: `manual/14-colocar-no-ar-gratis.md`.
