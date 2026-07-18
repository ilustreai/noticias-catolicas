# Extração do Evangelho — CNBB Liturgia Diária

## Fonte Correta

`https://liturgiadiaria.edicoescnbb.com.br`

(NÃO `https://www.cnbb.org.br/liturgia-diaria/` — essa página só tem um iframe.)

## Procedimento

1. Acessar `https://liturgiadiaria.edicoescnbb.com.br`
2. Selecionar a data no calendário
3. Localizar seção cujo título visível é exatamente **EVANGELHO**
4. Extrair o **primeiro parágrafo** imediatamente abaixo de EVANGELHO
5. Validar que o próximo bloco textual relevante contém `Proclamação do Evangelho de Jesus Cristo segundo`

## Regra de Extração (DOM)

1. Localizar texto/título `EVANGELHO`
2. Encontrar o primeiro elemento `<p>` seguinte
3. Extrair seu texto
4. Validar que o próximo bloco relevante contém `Proclamação do Evangelho de Jesus Cristo segundo...`

## O que NÃO extrair

- Versículo da **Aclamação ao Evangelho** (aparece antes de EVANGELHO)
- Texto completo da proclamação (aparece depois)
- Primeira leitura, salmo ou segunda leitura

## Exemplo (18/07/2026)

- Título: `EVANGELHO`
- Frase: *"E ordenou-lhes que não dissessem quem ele era, para se cumprir o que foi dito."*
- Próxima linha: `Proclamação do Evangelho de Jesus Cristo segundo Mateus 12,14-21`
