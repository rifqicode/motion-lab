import {Pilot, plan} from './Pilot.js';
import {RunningScene, running} from './RunningScene.js';

export const scenarios = {
  run: {
    id: 'run', label: 'Lari, tersandung & luka', title: 'Langkah kecil, batu tak terlihat.',
    description: 'Lari, tersandung, lalu lihat lecet kecil dari dekat. Kuman ditampilkan sebagai ilustrasi yang diperbesar.',
    note: 'Darah ringan, tanpa detail grafis. Penampang dan kuman bersifat skematik; narasi belum ditambahkan.',
    duration: running.durationSeconds, component: RunningScene,
    beats: [
      {time:0,title:'Mulai berlari',description:'Karakter berlari di jalur sederhana.'},
      {time:running.beats.trip,title:'Tersandung batu',description:'Langkah tertahan batu; tubuh kehilangan keseimbangan.'},
      {time:running.beats.landing,title:'Menahan jatuh',description:'Karakter merendah dan berhenti.'},
      {time:running.beats.wound,title:'Lecet di kaki',description:'Ada luka kecil dan sedikit darah di tulang kering.'},
      {time:running.beats.cutaway,title:'Lihat lebih dekat',description:'Transisi ke penampang kulit yang disederhanakan.'},
      {time:running.beats.germs,title:'Kuman mendekati luka',description:'Kuman abstrak bergerak melewati celah permukaan kulit.'},
    ],
  },
  egg: {
    id:'egg',label:'Telur & tanda tanya',title:'Telur & sebuah tanda tanya.',
    description:'Satu karakter, satu gestur kecil. Cek ekspresi dan gerakannya sebelum jadi video.',
    note:'Studi karakter dari geometri 3D. Narasi dan penjelasan lanjutan belum ditambahkan.',
    duration:plan.durationSeconds, component:Pilot,
    beats:[
      {time:0,title:'Kenalan dulu',description:'Karakter mengamati telur di atas meja.'},
      {time:plan.beats.reachStart,title:'Mulai meraih',description:'Tangan bergerak mendekat, lalu melambat.'},
      {time:plan.beats.doubtStart,title:'Muncul keraguan',description:'Alis, mata, dan kepala mengikuti ekspresi ragu.'},
      {time:plan.beats.bubbleStart,title:'Bayangkan mitosnya',description:'Thought bubble menunjukkan pikiran karakter.'},
    ],
  },
};
export type ScenarioId = keyof typeof scenarios;
export type Scenario = typeof scenarios[ScenarioId];
