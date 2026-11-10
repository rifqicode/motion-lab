import React from 'react';
import {AbsoluteFill, Audio, Sequence, useCurrentFrame} from 'remotion';
import type {InternetProject, InternetScene} from './types.js';

const c = {paper:'#f5f1e8', white:'#fffdf7', ink:'#173d38', muted:'#52665e', teal:'#27796f', pale:'#e0eae1', line:'#bac9bd', orange:'#c85d32', lightOrange:'#f7dfcb'};
type Point = [number,number];
const clamp = (value:number) => Math.max(0,Math.min(1,value));
const ease = (start:number,end:number,time:number) => {const p=clamp((time-start)/(end-start));return p*p*(3-2*p);};
const lerp = (a:number,b:number,t:number) => a+(b-a)*t;
const curve = (points:Point[]) => `M${points[0].join(',')} C${points[1].join(',')} ${points[2].join(',')} ${points[3].join(',')}`;
const pointOnCurve = (points:Point[],t:number):Point => [0,1].map(axis=>(1-t)**3*points[0][axis]+3*(1-t)**2*t*points[1][axis]+3*(1-t)*t*t*points[2][axis]+t**3*points[3][axis]) as Point;

function Text({x,y,children,size=32,fill=c.ink,weight=500,anchor='middle'}:{x:number;y:number;children:React.ReactNode;size?:number;fill?:string;weight?:number;anchor?:'middle'|'start'|'end'}) {
  return <text x={x} y={y} fontSize={size} fill={fill} fontWeight={weight} textAnchor={anchor}>{children}</text>;
}

function Link({points,progress=1,dashed=false,color=c.line,width=5}:{points:Point[];progress?:number;dashed?:boolean;color?:string;width?:number}) {
  return <path d={curve(points)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray={dashed ? '0.016 0.018' : 1} strokeDashoffset={dashed ? 0 : 1-clamp(progress)} opacity={progress<=0?0:1} />;
}

function Packet({points,progress,label,scale=1}:{points:Point[];progress:number;label?:string;scale?:number}) {
  if(progress<0||progress>1)return null;
  const [x,y]=pointOnCurve(points,progress);
  return <g transform={`translate(${x},${y}) scale(${scale})`}>
    <rect x={-25} y={-22} width={50} height={44} rx={9} fill={c.orange} stroke={c.white} strokeWidth={4} />
    {label && <Text x={0} y={8} size={24} fill={c.white} weight={700}>{label}</Text>}
  </g>;
}

function Device({x,y,scale=1,label='Perangkatmu',active=false}:{x:number;y:number;scale?:number;label?:string;active?:boolean}) {
  return <g transform={`translate(${x},${y}) scale(${scale})`}>
    <rect x={-105} y={-75} width={210} height={145} rx={14} fill={c.white} stroke={active?c.teal:c.ink} strokeWidth={5} />
    <path d="M-105,-41 H105" stroke={c.line} strokeWidth={3} />
    <circle cx={-85} cy={-58} r={4} fill={c.orange} /><circle cx={-69} cy={-58} r={4} fill={c.line} />
    <rect x={-77} y={-20} width={85} height={15} rx={4} fill={active?c.teal:c.line} />
    <path d="M-77,17 H72 M-77,37 H40" stroke={c.line} strokeWidth={8} strokeLinecap="round" />
    <path d="M-124,80 H124 L108,94 H-108 Z" fill={c.ink} />
    <Text x={0} y={143} size={34/scale}>{label}</Text>
  </g>;
}

function Router({x,y,scale=1,label='Router',active=false}:{x:number;y:number;scale?:number;label?:string;active?:boolean}) {
  return <g transform={`translate(${x},${y}) scale(${scale})`}>
    <path d="M-59,-18 L-74,-78 M59,-18 L74,-78" stroke={c.ink} strokeWidth={8} strokeLinecap="round" />
    <rect x={-95} y={-20} width={190} height={66} rx={16} fill={c.white} stroke={active?c.teal:c.ink} strokeWidth={5} />
    {[0,1,2].map(i=><circle key={i} cx={-59+i*23} cy={14} r={5} fill={i===0?c.orange:c.teal} />)}
    <path d="M28,13 H64" stroke={c.line} strokeWidth={6} strokeLinecap="round" />
    <Text x={0} y={96} size={34/scale}>{label}</Text>
  </g>;
}

function Server({x,y,scale=1,label='Server',active=false}:{x:number;y:number;scale?:number;label?:string;active?:boolean}) {
  return <g transform={`translate(${x},${y}) scale(${scale})`}>
    {[-64,0,64].map((offset,index)=><g key={offset}>
      <rect x={-85} y={offset-25} width={170} height={50} rx={10} fill={active?c.pale:c.white} stroke={active?c.teal:c.ink} strokeWidth={4} />
      <circle cx={-58} cy={offset} r={5} fill={index===1?c.orange:c.teal} />
      <path d={`M-27,${offset} H55`} stroke={c.line} strokeWidth={6} strokeLinecap="round" />
    </g>)}
    <Text x={0} y={142} size={34/scale}>{label}</Text>
  </g>;
}

function Network({x,y,label='Jaringan ISP',scale=1}:{x:number;y:number;label?:string;scale?:number}) {
  return <g transform={`translate(${x},${y}) scale(${scale})`}>
    <circle r={78} fill={c.pale} stroke={c.teal} strokeWidth={4} />
    <ellipse rx={34} ry={78} fill="none" stroke={c.teal} strokeWidth={3} />
    <path d="M-77,0 H77 M-63,-42 H63 M-63,42 H63" stroke={c.teal} strokeWidth={3} fill="none" />
    <Text x={0} y={129} size={34/scale}>{label}</Text>
  </g>;
}

function BrowserWindow({x,y,width,height,typed='example.com',built=0}:{x:number;y:number;width:number;height:number;typed?:string;built?:number}) {
  return <g transform={`translate(${x},${y})`}>
    <rect width={width} height={height} rx={25} fill={c.white} stroke={c.ink} strokeWidth={5} />
    <path d={`M0,82 H${width}`} stroke={c.line} strokeWidth={3} />
    <circle cx={32} cy={40} r={6} fill={c.orange} />
    <rect x={58} y={20} width={width-150} height={42} rx={10} fill={c.paper} />
    <Text x={83} y={50} size={25} anchor="start" fill={c.muted}>{typed}</Text>
    <Text x={width-49} y={52} size={34}>↵</Text>
    {built>0 && <g opacity={clamp(built)}>
      <rect x={38} y={122} width={width-76} height={Math.max(90,height-180)} rx={14} fill={built>1?c.pale:c.paper} />
      <Text x={70} y={190} size={Math.min(46,width*.065)} weight={700} anchor="start">Halo, internet.</Text>
      <path d={`M70,232 H${width-82} M70,264 H${width-160}`} stroke={c.line} strokeWidth={12} strokeLinecap="round" />
      {height>400 && built>1 && <>
        <rect x={70} y={310} width={205} height={62} rx={10} fill={c.teal} />
        <Text x={172} y={350} size={26} fill={c.white} weight={600}>{built>2?'Siap dipakai':'Halaman contoh'}</Text>
        {built>2 && <path d="M302,339 l12,12 24,-29" fill="none" stroke={c.teal} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />}
      </>}
    </g>}
  </g>;
}

function Hook({time}:{time:number}) {
  const entered=ease(2.1,2.65,time);
  const url='example.com'.slice(0,Math.floor(ease(0.2,1.65,time)*11));
  const x=lerp(960,883,ease(1.7,2.2,time)),y=lerp(1120,725,ease(1.7,2.2,time));
  return <>
    <BrowserWindow x={135} y={660} width={810} height={510} typed={url+(time<1.7?'│':'')} built={entered} />
    <g transform={`translate(${x},${y})`} opacity={1-ease(2.8,3.15,time)}><path d="M0,0 0,68 20,48 37,81 51,74 33,42 61,40 Z" fill={c.orange} stroke={c.white} strokeWidth={4} /></g>
    <Link points={[[540,1170],[540,1220],[540,1250],[540,1310]]} progress={ease(2.8,3.4,time)} color={c.teal} />
    {time>=3.0 && <Packet points={[[540,1170],[540,1220],[540,1250],[540,1310]]} progress={ease(3.0,4.3,time)} scale={1.15} />}
    <Text x={540} y={1390} size={31} fill={c.muted}>{time<2.65?'Satu alamat. Satu tombol.':'Di balik layar, perjalanan dimulai.'}</Text>
  </>;
}

function DNS({time}:{time:number}) {
  const request:Point[]=[[348,820],[460,660],[565,660],[682,820]];
  const response:Point[]=[[682,930],[560,1065],[470,1065],[348,930]];
  return <>
    <Link points={request} progress={ease(.25,1,time)} color={c.teal} />
    <Link points={response} progress={ease(2.0,2.8,time)} color={c.teal} />
    <Packet points={request} progress={(time-.7)/1.45} />
    <Packet points={response} progress={(time-2.4)/1.45} />
    <Device x={230} y={875} label="Browser" active />
    <g transform="translate(690,720)">
      <rect width={278} height={285} rx={22} fill={c.white} stroke={c.ink} strokeWidth={4} />
      <Text x={139} y={70} size={50} weight={700}>DNS</Text>
      {[117,162,207].map((y,i)=><g key={y}><circle cx={43} cy={y} r={7} fill={i===0?c.orange:c.line} /><path d={`M67,${y} H236`} stroke={c.line} strokeWidth={10} strokeLinecap="round" /></g>)}
    </g>
    <Text x={520} y={692} size={29} fill={c.orange}>example.com?</Text>
    <Text x={520} y={1110} size={29} fill={c.teal} weight={650}>Alamat IP server</Text>
    <g opacity={ease(3.5,4.1,time)}>
      <rect x={135} y={1215} width={810} height={126} rx={16} fill={c.pale} />
      <Text x={175} y={1263} size={29} weight={650} anchor="start">Sudah tersimpan di cache?</Text>
      <Text x={175} y={1304} size={27} anchor="start" fill={c.muted}>Hasil sebelumnya bisa dipakai lagi.</Text>
    </g>
  </>;
}

const route:Point[]=[[210,685],[520,800],[840,970],[570,1150],[265,1300]];
function routePoint(progress:number):Point {
  const p=clamp(progress)*(route.length-1), index=Math.min(route.length-2,Math.floor(p));
  return [lerp(route[index][0],route[index+1][0],p-index),lerp(route[index][1],route[index+1][1],p-index)];
}

function Routing({time,duration}:{time:number;duration:number}) {
  const progress=clamp((time-.8)/(duration-2.2));
  const dot=routePoint(progress);
  return <>
    <path d="M210,685 Q140,915 240,1030 L570,1150 M520,800 L850,1210 L265,1300 M840,970 L850,1210" stroke={c.line} strokeWidth={3} fill="none" opacity={.5} />
    {[0,1,2,3].map(i=><path key={i} d={`M${route[i].join(',')} L${route[i+1].join(',')}`} stroke={progress*4>i?c.teal:c.line} strokeWidth={6} strokeLinecap="round" fill="none" />)}
    <Device x={210} y={685} scale={.75} />
    <Router x={520} y={800} scale={.8} label="Router rumah" active={progress>.2} />
    <Network x={840} y={970} scale={.9} />
    <Router x={570} y={1150} scale={.7} label="Router lain" active={progress>.7} />
    <Server x={265} y={1300} scale={.72} active={progress>.94} />
    <circle cx={240} cy={1030} r={18} fill={c.paper} stroke={c.line} strokeWidth={4} /><circle cx={850} cy={1210} r={18} fill={c.paper} stroke={c.line} strokeWidth={4} />
    {time>.8&&progress<.99&&<rect x={dot[0]-23} y={dot[1]-20} width={46} height={40} rx={8} fill={c.orange} stroke={c.white} strokeWidth={4} />}
  </>;
}

function HTTPS({time}:{time:number}) {
  const points:Point[]=[[380,895],[470,895],[600,895],[695,895]];
  return <>
    <rect x={370} y={839} width={335} height={112} rx={56} fill={c.pale} opacity={ease(.4,1.1,time)} />
    <Link points={points} progress={ease(.3,1.0,time)} color={c.teal} width={6} />
    <Device x={235} y={900} scale={1.03} label="Browser" active />
    <Server x={830} y={900} scale={1.03} active label="Server" />
    <g transform="translate(540,740)" opacity={ease(.8,1.4,time)}>
      <path d="M-29,0 V-33 A29,29 0 0 1 29,-33 V0" fill="none" stroke={c.teal} strokeWidth={9} />
      <rect x={-44} y={-1} width={88} height={70} rx={14} fill={c.teal} />
      <circle cy={27} r={7} fill={c.white} /><path d="M0,30 V44" stroke={c.white} strokeWidth={5} />
    </g>
    {[0,1,2].map(index=><Packet key={index} points={points} progress={(time-2.0-index*1.2)/1.45} />)}
    <Text x={540} y={1165} size={39} weight={650}>Koneksi terenkripsi</Text>
    <Text x={540} y={1220} size={29} fill={c.muted}>Lalu permintaan halaman dikirim.</Text>
  </>;
}

function Packets({time,duration}:{time:number;duration:number}) {
  const points:Point[]=[[245,830],[1010,800],[110,1090],[700,1195]];
  return <>
    <Link points={points} progress={ease(.3,1,time)} color={c.teal} />
    <Server x={245} y={705} active />
    <BrowserWindow x={490} y={1180} width={440} height={224} typed="Menerima data…" />
    <Text x={700} y={1450} size={28}>Perangkatmu</Text>
    {Array.from({length:6},(_,index)=>{
      const p=(time-.65-index*.25)/Math.max(1.8,duration-3);
      return p<=1 ? <Packet key={index} points={points} progress={p} label={String(index+1)} scale={.9} /> : <g key={index} transform={`translate(${550+(index%3)*122},${1305+Math.floor(index/3)*49})`}><rect x={-28} y={-18} width={100} height={36} rx={6} fill={c.lightOrange} /><Text x={22} y={7} size={23} fill={c.orange} weight={650}>{index+1}</Text></g>;
    })}
    <Text x={800} y={980} size={29} fill={c.muted}>Paket data</Text>
    {time>duration-1 && <Text x={700} y={1138} size={29} fill={c.teal}>Disusun kembali.</Text>}
  </>;
}

function BuildBrowser({time}:{time:number}) {
  const built=time<1.5?ease(.4,1,time):time<3?2:3;
  return <>
    {['HTML','CSS','JavaScript'].map((label,index)=>{
      const x=220+index*320;
      const points:Point[]=[[x,710],[x,760],[540,770],[540,830]];
      return <g key={label} opacity={ease(index*.25,index*.25+.5,time)}>
        <Link points={points} color={c.teal} progress={ease(.5+index*.45,1+index*.45,time)} />
        <rect x={x-130} y={620} width={260} height={90} rx={14} fill={index===1?c.pale:c.white} stroke={c.line} strokeWidth={3} />
        <Text x={x} y={678} size={34} weight={650}>{label}</Text>
        <Packet points={points} progress={(time-.7-index*.75)/1.1} scale={.75} />
      </g>;
    })}
    <BrowserWindow x={135} y={830} width={810} height={555} typed="Halaman contoh" built={built} />
  </>;
}

function Recap({time,duration}:{time:number;duration:number}) {
  const outbound:Point[][]=[[[250,800],[250,900],[330,920],[330,1040]],[[330,1040],[470,1040],[600,1000],[760,1000]],[[760,1000],[790,1080],[785,1150],[785,1240]]];
  const inbound:Point[]=[[785,1240],[650,1430],[120,1300],[250,800]];
  return <>
    {outbound.map((points,index)=><Link key={index} points={points} color={c.teal} progress={ease(.2+index*.3,.7+index*.3,time)} />)}
    <Link points={inbound} color={c.teal} progress={ease(1.1,2,time)} />
    <path d="M350,680 H710" stroke={c.line} strokeWidth={4} strokeDasharray="9 10" />
    <Device x={250} y={720} active={time>duration*.7} label="Browser" />
    <g transform="translate(820,680)"><rect x={-100} y={-62} width={200} height={124} rx={18} fill={c.white} stroke={c.ink} strokeWidth={4} /><Text x={0} y={14} size={44} weight={650}>DNS</Text></g>
    <Router x={330} y={1060} label="Router" scale={.85} />
    <Network x={760} y={1000} label="Jaringan internet" scale={.85} />
    <Server x={785} y={1280} scale={.78} active />
    {outbound.map((points,index)=><Packet key={index} points={points} progress={(time-.5-index*.9)/.9} />)}
    {[0,1,2].map(index=><Packet key={index} points={inbound} progress={(time-3-index*.3)/2.5} scale={.8} />)}
    <Text x={300} y={1370} size={31} fill={c.muted}>Wi-Fi adalah salah</Text>
    <Text x={300} y={1415} size={31} fill={c.muted}>satu jalan masuknya.</Text>
  </>;
}

function Chapter({scene,index,total,fps}:{scene:InternetScene;index:number;total:number;fps:number}) {
  const frame=useCurrentFrame(),time=frame/fps,duration=scene.durationFrames/fps;
  const reveal=ease(0,.35,time);
  const cue=scene.captions.find(item=>time>=item.start&&time<item.end);
  const Diagram=scene.id==='hook'?<Hook time={time}/>:scene.id==='dns'?<DNS time={time}/>:scene.id==='route'?<Routing time={time} duration={duration}/>:scene.id==='https'?<HTTPS time={time}/>:scene.id==='packets'?<Packets time={time} duration={duration}/>:scene.id==='browser'?<BuildBrowser time={time}/>:<Recap time={time} duration={duration}/>;
  return <AbsoluteFill style={{backgroundColor:c.paper,color:c.ink,fontFamily:'Ubuntu Sans, Arial, sans-serif'}}>
    <svg width="1080" height="1920" viewBox="0 0 1080 1920" style={{fontFamily:'Ubuntu Sans, Arial, sans-serif'}}>
      <rect width={1080} height={1920} fill={c.paper}/>
      <rect x={88} y={105} width={27} height={25} rx={5} fill={c.orange}/>
      <Text x={135} y={128} size={30} weight={600} anchor="start">Cara internet bekerja</Text>
      <Text x={992} y={128} size={29} anchor="end" fill={c.muted}>{index+1} / {total}</Text>
      <path d="M88,170 H992" stroke={c.line} strokeWidth={2}/>
      <g opacity={reveal} transform={`translate(0,${(1-reveal)*18})`}>
        <Text x={88} y={236} size={29} fill={c.teal} weight={650} anchor="start">{scene.chapter}</Text>
        {scene.title.map((line,i)=><text key={line} x={85} y={335+i*89} fontSize={76} fontWeight={750} letterSpacing={-2} fill={c.ink}>{line}</text>)}
        <Text x={89} y={495} size={32} fill={c.muted} anchor="start">{scene.summary}</Text>
        {Diagram}
      </g>
      <path d="M88,1780 H992" stroke={c.line} strokeWidth={3}/>
      <path d={`M88,1780 H${88+904*clamp((index+time/duration)/total)}`} stroke={c.teal} strokeWidth={5} strokeLinecap="round"/>
      <Text x={88} y={1835} size={24} fill={c.muted} anchor="start">Ilustrasi alur disederhanakan</Text>
    </svg>
    {cue && <div style={{position:'absolute',left:100,right:100,top:1490,minHeight:140,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',fontSize:43,lineHeight:1.35,fontWeight:600,color:c.ink}}>{cue.text}</div>}
  </AbsoluteFill>;
}

export function InternetVideo({project}:{project:InternetProject}) {
  let offset=0;
  return <AbsoluteFill style={{backgroundColor:c.paper}}>{project.scenes.map((scene,index)=>{
    const start=offset;offset+=scene.durationFrames;
    return <Sequence key={scene.id} from={start} durationInFrames={scene.durationFrames}>
      {scene.audioFile && <Sequence from={Math.round(project.fps*.15)}><Audio src={scene.audioFile} /></Sequence>}
      <Chapter scene={scene} index={index} total={project.scenes.length} fps={project.fps}/>
    </Sequence>;
  })}</AbsoluteFill>;
}
