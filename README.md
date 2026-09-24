# OSM AI Coach Pro v4 — Cloud / Video First

Aplicativo estático/PWA, sem backend e sem acesso direto à conta do OSM.

## Como funciona
- A chave Gemini é informada uma vez e fica somente no armazenamento local do navegador.
- Vídeos e imagens são processados no próprio navegador; o app extrai quadros e envia somente os quadros selecionados ao Gemini.
- Os dados dos 4 slots, histórico, mercado e competições ficam no armazenamento local do navegador.
- Nenhum login do OSM é solicitado.

## Publicação
Sirva esta pasta em qualquer hospedagem estática HTTPS (ChatGPT Site, Netlify, Cloudflare Pages, GitHub Pages etc.). HTTPS é recomendado para PWA e notificações.

## Principais módulos
- Hoje: prioridade + 4 slots
- Analisar: vídeo/imagens -> extração estruturada -> tática
- Mercado: plano de evolução, vendas e perfil de compra
- Histórico: partidas + competições finalizadas
- Finalizar competição
- Backup/importação
- Alertas locais e exportação de evento .ics com alarme 20 min antes

## Observação sobre notificações
Sem backend de push, um site/PWA não consegue garantir execução em segundo plano quando o navegador/Android encerra totalmente o processo. O app gera arquivos ICS com VALARM para o calendário do aparelho como alternativa confiável.
