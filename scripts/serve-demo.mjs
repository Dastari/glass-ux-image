import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root=resolve(process.env.GI_OWN_OUT);
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png"};
createServer(async(req,res)=>{
  const path=resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  if(!path.startsWith(root+"/")&&path!==root){res.writeHead(403).end();return;}
  try {const file=path===root?root+"/index.html":path;const data=await readFile(file);res.setHeader("Content-Type",types[extname(file)]??"application/octet-stream");res.end(data);}
  catch {res.writeHead(404).end();}
}).listen(Number(process.env.GI_OWN_PORT),"127.0.0.1");
