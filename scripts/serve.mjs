import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize,resolve} from 'node:path';
const root=resolve('public'),port=+(process.env.PORT||3000),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local'),route=u.pathname;let rel=(route==='/'||route==='/arcade/sylvaria-sequoia')?'index.html':route.slice(1);if(route==='/game-runtimes/sylvaria-sequoia')rel='game-runtimes/sylvaria-sequoia/index.html';const file=normalize(join(root,rel));if(!file.startsWith(root))throw 0;await stat(file);res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(file))}catch{res.statusCode=404;res.end('not found')}}).listen(port,'127.0.0.1',()=>console.log(`Sylvaria: Sequoia on http://127.0.0.1:${port}`));
