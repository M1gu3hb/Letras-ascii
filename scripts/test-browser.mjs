import {spawnSync} from 'node:child_process';
import './fixtures.mjs';
const suites=process.argv.slice(2);
const suiteTimeout=process.env.PLAYWRIGHT_BROWSER==='webkit'?180000:0;
for(const name of suites.length?suites:['smoke','store','reliability','reaudit','mobile-capture','layout-bounds','ux','phone-layout','mark-flow','words','ascii-ui','ascii-export','theater','adjust','reading','audit-boundaries','seo-ux']){
 console.log(`\n>>> ${name}`);
 const result=spawnSync(process.execPath,[`test/${name}.mjs`],{stdio:'inherit',env:process.env,timeout:suiteTimeout,killSignal:'SIGKILL'});
 if(result.error){
  const message=`${name}: ${result.error.code==='ETIMEDOUT'?'the browser suite exceeded 180 seconds':result.error.message}`;
  console.error(process.env.GITHUB_ACTIONS?'::error::'+message.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'):message);
 }
 if(result.status!==0)process.exit(result.status||1);
}
