import {spawn} from 'node:child_process';
const port=4195,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'inherit'});
process.env.UI_BASE_URL=base;
try{
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base)).ok;}catch{}if(ready)break;if(server.exitCode!==null)throw Error('Preview smoke server exited');await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Preview smoke server not ready');
 await import('./print.browser.mjs');
}finally{server.kill('SIGTERM');}
