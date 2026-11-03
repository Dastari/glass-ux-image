import { spawn } from "node:child_process";
const [port,...specs]=process.argv.slice(2);
if(!port || !/^\d+$/.test(port) || +port<1024 || +port>65535) throw new Error("Usage: pnpm e2e:own <port:1024–65535> [spec…]");
const env={...process.env,GI_OWN_PORT:port,GI_OWN_OUT:`/tmp/gi-demo-${port}`};
const run=(args,cwd)=>new Promise((resolve,reject)=>{
  const child=spawn("pnpm",args,{cwd,env,stdio:"inherit"});
  child.on("error",reject);child.on("exit",(code)=>code===0?resolve():reject(new Error(`Command exited ${code}`)));
});
await run(["exec","vite","build","--outDir",env.GI_OWN_OUT,"--emptyOutDir"],"apps/demo");
await run(["exec","playwright","test",...specs],process.cwd());
