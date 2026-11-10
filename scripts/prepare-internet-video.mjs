import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'examples/how-internet-works');
const storyboard = JSON.parse(await fs.readFile(path.join(directory,'storyboard.json'),'utf8'));
const audioDirectory = path.join(directory,'assets/audio');
await fs.mkdir(audioDirectory,{recursive:true});

const timestamp = value => value.replace(',','.').split(':').reduce((total,part)=>total*60+Number(part),0);
function captions(vtt) {
  const result=[];
  const pattern=/(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})\r?\n([^\r\n]+(?:\r?\n(?!\r?\n|\d+\r?\n)[^\r\n]+)*)/g;
  for(const match of vtt.matchAll(pattern)) {
    const start=timestamp(match[1]), end=timestamp(match[2]);
    const words=match[3].replace(/<[^>]*>/g,'').trim().split(/\s+/);
    const chunks=[];
    for(const word of words) {
      const last=chunks.at(-1);
      if(!last || (last+' '+word).length>62) chunks.push(word); else chunks[chunks.length-1]+=' '+word;
    }
    const total=chunks.reduce((sum,text)=>sum+text.length,0);
    let cursor=start;
    for(const text of chunks) {const next=cursor+(end-start)*text.length/total;result.push({start:cursor,end:next,text});cursor=next;}
  }
  if(!result.length) throw new Error('TTS returned no usable caption timestamps');
  return result;
}

const scenes=[];
for(const scene of storyboard.scenes) {
  if(!scene.id || !scene.narration || !Array.isArray(scene.title)) throw new Error('Incomplete scene');
  const hash=crypto.createHash('sha256').update(`${storyboard.voice}|-2%|${scene.narration}`).digest('hex').slice(0,16);
  const audio=path.join(audioDirectory,`${scene.id}-${hash}.mp3`);
  const vtt=audio.replace(/\.mp3$/,'.vtt');
  try {await fs.access(audio);await fs.access(vtt);} catch {
    const textFile=path.join(audioDirectory,`${scene.id}.txt`);
    await fs.writeFile(textFile,scene.narration);
    console.log(`Narrating ${scene.id}...`);
    await execute('edge-tts',['--voice',storyboard.voice,'--rate=-2%','--file',textFile,'--write-media',audio,'--write-subtitles',vtt],{timeout:120000});
  }
  const {stdout}=await execute('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio]);
  const audioSeconds=Number(stdout.trim());
  if(!Number.isFinite(audioSeconds)||audioSeconds<=0)throw new Error(`Invalid audio for ${scene.id}`);
  const durationFrames=Math.ceil((audioSeconds+0.65)*storyboard.fps);
  const cueList=captions(await fs.readFile(vtt,'utf8')).map(cue=>({...cue,start:cue.start+0.15,end:cue.end+0.15}));
  scenes.push({...scene,audioFile:path.relative(directory,audio),audioSeconds,durationFrames,captions:cueList});
  console.log(`${scene.id}: ${audioSeconds.toFixed(2)}s voice / ${durationFrames} frames`);
}
const project={...storyboard,scenes,durationFrames:scenes.reduce((sum,scene)=>sum+scene.durationFrames,0)};
await fs.writeFile(path.join(directory,'project.json'),JSON.stringify(project,null,2)+'\n');
console.log(`Prepared ${(project.durationFrames/storyboard.fps).toFixed(2)} seconds with real narration.`);
