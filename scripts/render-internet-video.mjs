import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'apps/cli/package.json'));
const {bundle}=require('@remotion/bundler');
const {renderMedia,renderStill,selectComposition,openBrowser}=require('@remotion/renderer');
const directory=path.join(root,'examples/how-internet-works');
const source=JSON.parse(await fs.readFile(path.join(directory,'project.json'),'utf8'));
const scenes=await Promise.all(source.scenes.map(async scene=>({...scene,audioFile:`data:audio/mpeg;base64,${(await fs.readFile(path.join(directory,scene.audioFile))).toString('base64')}`})));
const project={...source,scenes};
const outputDirectory=path.join(root,'out/internet-review');
await fs.mkdir(outputDirectory,{recursive:true});
const started=Date.now();
console.log('Bundling directed internet explainer...');
const serveUrl=await bundle({entryPoint:path.join(root,'packages/renderer/src/internet/Root.tsx'),webpackOverride:config=>({...config,resolve:{...config.resolve,extensionAlias:{'.js':['.ts','.tsx','.js'],...config.resolve?.extensionAlias}}})});
const chromiumOptions={gl:null,enableMultiProcessOnLinux:true};
console.log('Opening browser for SVG rendering...');
const browser=await openBrowser('chrome',{chromiumOptions});
try {
const composition=await selectComposition({serveUrl,id:'InternetExplainer',inputProps:{project},chromiumOptions,puppeteerInstance:browser,timeoutInMilliseconds:60000});
let offset=0;
for(const scene of project.scenes) {
  const frame=offset+Math.round(scene.durationFrames*.55);
  await renderStill({serveUrl,composition,inputProps:{project},frame,output:path.join(outputDirectory,`${scene.id}.png`),imageFormat:'png',chromiumOptions,puppeteerInstance:browser,timeoutInMilliseconds:60000});
  console.log(`Preview: ${scene.id}`);
  offset+=scene.durationFrames;
}
if(process.argv.includes('--stills')){console.log('Storyboard frames ready.');} else {
const temporary=path.join(root,'out/internet-explained.raw.mp4');
const output=path.join(root,'out/internet-explained.mp4');
let previous=-1;
await renderMedia({serveUrl,composition,inputProps:{project},codec:'h264',pixelFormat:'yuv420p',crf:18,outputLocation:temporary,concurrency:1,chromiumOptions,puppeteerInstance:browser,timeoutInMilliseconds:60000,onProgress:({progress})=>{const percent=Math.floor(progress*20)*5;if(percent!==previous){console.log(`Render ${percent}%`);previous=percent;}}});
console.log('Measuring narration loudness...');
const measurement=await execute('ffmpeg',['-hide_banner','-i',temporary,'-af','loudnorm=I=-16:TP=-1:LRA=7:print_format=json','-f','null','-'],{maxBuffer:2*1024*1024});
const match=measurement.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
if(!match)throw new Error('Missing loudness measurements');
const measured=JSON.parse(match[0]);
const filter=`loudnorm=I=-16:TP=-1:LRA=7:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
const partial=path.join(root,'out/internet-explained.partial.mp4');
await execute('ffmpeg',['-v','error','-y','-i',temporary,'-c:v','copy','-af',filter,'-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',partial]);
await execute('ffmpeg',['-v','error','-i',partial,'-f','null','-']);
await fs.rename(partial,output);
const {stdout}=await execute('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output]);
const report={title:project.title,durationSeconds:project.durationFrames/project.fps,elapsedSeconds:(Date.now()-started)/1000,voice:source.voice,output,sourceFiles:['examples/how-internet-works/storyboard.json','examples/how-internet-works/project.json'],audioProcessing:{targetLUFS:-16,targetTruePeakDb:-1,input:measured},probe:JSON.parse(stdout)};
await fs.writeFile(path.join(root,'out/internet-explained.report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,durationSeconds:report.durationSeconds,elapsedSeconds:report.elapsedSeconds},null,2));
}
} finally {await browser.close({silent:true});}
