# TRK PARTS

Banco pessoal de referências técnicas e catálogos.

## Recursos

- Pesquisa por nome, referência, medida, fabricante, equivalente e observações.
- Cadastro e edição de referências.
- Até 4 fotos por peça, armazenadas localmente no navegador.
- PDF técnico vinculado diretamente a uma referência.
- Biblioteca de catálogos em PDF/imagem, com abertura, download e exclusão.
- Importação assistida de referências a partir de PDFs técnicos: o sistema lê referências em formato de código com hífen e cria rascunhos para conferência.
- Dados locais usando localStorage + IndexedDB.

## Rodar

```bash
npm install
npm run dev
```

## Observação sobre leitura automática de PDF

A função **Importar referências do PDF** carrega o PDF.js pelo CDN na primeira leitura. O restante do aplicativo, incluindo o acervo local e os anexos, continua usando o armazenamento local do navegador.

A importação é assistida: depois de ler o PDF, confira os nomes e referências antes de usar os dados.
