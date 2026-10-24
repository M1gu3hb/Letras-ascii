import {spawnSync} from 'node:child_process';
import './fixtures.mjs';
const suites=process.argv.slice(2);
for(const name of suites.length?suites:['smoke','store','reliability','layout-bounds','ux','phone-layout','mark-flow','words','ascii-ui','ascii-export','theater']){
 console.log(`\n>>> ${name}`);
 const result=spawnSync(process.execPath,[`test/${name}.mjs`],{stdio:'inherit',env:process.env});
 if(result.status!==0)process.exit(result.status||1);
}
