import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(here,'../library/vue-primevue');
await mkdir(out,{recursive:true});
await build({absWorkingDir:here,entryPoints:['src/index.js'],outfile:path.join(out,'research-maps-ui.js'),bundle:true,minify:true,format:'iife',globalName:'ResearchMapsUI',target:['es2020'],legalComments:'eof',define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'}});
const licenses=[];
for(const name of ['vue','@vue/shared','@vue/reactivity','@vue/runtime-core','@vue/runtime-dom','primevue','@primevue/core','@primevue/icons','@primeuix/themes','@primeuix/styled','@primeuix/utils','@primeuix/styles']){
 const dir=path.join(here,'node_modules',name);let pkg;
 try{pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));}catch{continue;}
 let license='';for(const filename of ['LICENSE','LICENSE.md','LICENSE.txt']){try{license=await readFile(path.join(dir,filename),'utf8');break;}catch{}}
 if(!license)throw Error('Missing license: '+name);
 licenses.push(`${name} ${pkg.version}\n${license}`);
}
await writeFile(path.join(out,'LICENSES.txt'),licenses.join('\n\n--------------------\n\n'));
await writeFile(path.join(out,'upstream.json'),JSON.stringify({vue:'3.5.44',primevue:'4.5.5',theme:'@primeuix/themes 2.0.3',license:'MIT',source_files:'ui/src/',build:'cd ui && npm ci --ignore-scripts && npm run build',offline:true},null,2)+'\n');
console.log('Built local Vue + PrimeVue UI assets and licenses.');
