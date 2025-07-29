import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeamento de tipos MIME
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
};

// Criar servidor HTTP
const server = http.createServer((req, res) => {
  console.log(`Requisição: ${req.method} ${req.url}`);

  // Normalizar URL para caminho do arquivo
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './report.html';
  }

  // Determinar o tipo de conteúdo baseado na extensão
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'text/plain';

  // Ler o arquivo solicitado
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Arquivo não encontrado
        console.error(`Arquivo não encontrado: ${filePath}`);
        fs.readFile('./report.html', (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Erro interno do servidor');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        // Erro de servidor
        console.error(`Erro de servidor: ${error.code}`);
        res.writeHead(500);
        res.end(`Erro interno do servidor: ${error.code}`);
      }
      return;
    }

    // Definir cabeçalhos CORS
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
    });
    
    // Enviar o conteúdo
    res.end(content, 'utf-8');
  });
});

// Porta para o servidor
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}/`);
  console.log(`Acesse o relatório em http://localhost:${PORT}/report.html`);
});
