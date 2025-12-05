// script.js — Working version + new UI mapping
// Features: camera, frame, dot, vertical, horizontal, slanted, select, drag, delete, capture
// No rotation.

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

/* UI ELEMENTS */
const frameBtn = document.getElementById('frameBtn');
const frameMenu = document.getElementById('frameMenu');
const lineBtn = document.getElementById('lineBtn');
const lineMenu = document.getElementById('lineMenu');

const shutterBtn = document.getElementById('shutterBtn');
const selectBtn = document.getElementById('selectBtn');
const deleteBtn = document.getElementById('deleteBtn');

/* STATE */
let mode = 'dot';
let dots = [];
let lines = [];
let selected = null;

let isDragging = false;
let lastX = 0, lastY = 0;

let devices = [];
let currentDeviceIndex = 0;
let stream = null;

let frame = { x:0, y:0, w:0, h:0, ratio:1 };

/* CAMERA */
async function enumerateDevices(){
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d=>d.kind === 'videoinput');
  } catch(e){ devices=[]; }
}

function attachStream(s){
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream = s;
  video.srcObject = s;
}

async function startCameraPreferRear(){
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:{ ideal:'environment' } }
    });
    attachStream(s); await enumerateDevices(); return;
  } catch(e){}
  try {
    const s2 = await navigator.mediaDevices.getUserMedia({ video:true });
    attachStream(s2); await enumerateDevices(); 
  } catch(e2){}
}

/* FRAME */
function computeFrame(ratio){
  const W = canvas.width, H = canvas.height;
  const margin = 0.92;
  let boxW, boxH;

  if (W/H > ratio){
    boxH = H * margin;
    boxW = boxH * ratio;
  } else {
    boxW = W * margin;
    boxH = boxW / ratio;
  }

  const x = (W-boxW)/2;
  const y = (H-boxH)/2;
  frame = { x, y, w:boxW, h:boxH, ratio };
}

/* DRAW */
function drawMaskAndBorder(){
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0,0,canvas.width, frame.y);
  ctx.fillRect(0,frame.y+frame.h, canvas.width, canvas.height - (frame.y+frame.h));
  ctx.fillRect(0,frame.y, frame.x, frame.h);
  ctx.fillRect(frame.x+frame.w, frame.y, canvas.width - (frame.x+frame.w), frame.h);

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.strokeRect(frame.x+1.5, frame.y+1.5, frame.w-3, frame.h-3);
}

function redraw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawMaskAndBorder();

  // dots
  for (const d of dots){
    ctx.fillStyle = "#4da3ff";
    ctx.beginPath();
    ctx.arc(d.x,d.y,8,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle="#fff";
    ctx.lineWidth=2;
    ctx.stroke();
  }

  // lines
  for (let i=0;i<lines.length;i++){
    const l = lines[i];
    const sel = (i === selected);

    if (sel){
      ctx.shadowColor="cyan";
      ctx.shadowBlur=14;
      ctx.strokeStyle="cyan";
      ctx.lineWidth=4;
    } else {
      ctx.shadowBlur=0;
      ctx.strokeStyle="lime";
      ctx.lineWidth=3;
    }

    ctx.beginPath();
    if (l.orientation==='vertical'){
      ctx.moveTo(l.x,frame.y);
      ctx.lineTo(l.x,frame.y+frame.h);
    } else if (l.orientation==='horizontal'){
      ctx.moveTo(frame.x,l.y);
      ctx.lineTo(frame.x+frame.w,l.y);
    } else {
      ctx.moveTo(l.x1,l.y1);
      ctx.lineTo(l.x2,l.y2);
    }
    ctx.stroke();
  }

  ctx.shadowBlur=0;
}

/* HELPERS */
function clientToCanvas(ev){
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  return { x, y };
}

function insideFrame(x,y){
  return (x>=frame.x && x<=frame.x+frame.w &&
          y>=frame.y && y<=frame.y+frame.h);
}

function findLineAt(x,y){
  const th = 18;
  for (let i=0;i<lines.length;i++){
    const l=lines[i];
    if (l.orientation==='vertical'){
      if (Math.abs(x-l.x)<th && y>=frame.y && y<=frame.y+frame.h) return i;
    }
    if (l.orientation==='horizontal'){
      if (Math.abs(y-l.y)<th && x>=frame.x && x<=frame.x+frame.w) return i;
    }
    if (l.orientation==='slanted'){
      const d = pointToSegmentDistance(x,y,l.x1,l.y1,l.x2,l.y2);
      if (d<th) return i;
    }
  }
  return null;
}

function pointToSegmentDistance(px,py,x1,y1,x2,y2){
  const A=px-x1, B=py-y1, C=x2-x1, D=y2-y1;
  const dot = A*C + B*D;
  const len = C*C + D*D;
  let t = (len? dot/len : -1);
  t = Math.max(0,Math.min(1,t));
  const xx = x1 + C*t;
  const yy = y1 + D*t;
  return Math.hypot(px-xx,py-yy);
}

/* INPUT */
canvas.addEventListener('pointerdown',(ev)=>{
  const {x,y} = clientToCanvas(ev);
  lastX=x; lastY=y;

  // select mode
  if (mode==='select'){
    const hit = findLineAt(x,y);
    if (hit!==null){
      selected=hit;
      deleteBtn.style.display="inline-block";
      isDragging=true;
      redraw();
    } else {
      selected=null;
      deleteBtn.style.display="none";
      redraw();
    }
    return;
  }

  // normal selection
  const hit = findLineAt(x,y);
  if (hit!==null){
    selected=hit;
    deleteBtn.style.display="inline-block";
    isDragging=true;
    redraw();
    return;
  }

  selected=null;
  deleteBtn.style.display="none";

  if (!insideFrame(x,y)) return;

  if (mode==='dot'){
    dots.push({x,y});
    redraw();
    return;
  }

  if (mode==='vertical'){
    const cx = Math.max(frame.x, Math.min(frame.x+frame.w, x));
    lines.push({orientation:'vertical', x:cx});
    selected = lines.length-1;
    deleteBtn.style.display="inline-block";
    redraw();
    return;
  }

  if (mode==='horizontal'){
    const cy = Math.max(frame.y, Math.min(frame.y+frame.h, y));
    lines.push({orientation:'horizontal', y:cy});
    selected=lines.length-1;
    deleteBtn.style.display="inline-block";
    redraw();
    return;
  }

  if (mode==='slant'){
    const cx = Math.max(frame.x, Math.min(frame.x+frame.w,x));
    const cy = Math.max(frame.y, Math.min(frame.y+frame.h,y));

    const len = frame.w*0.75;
    const angle = -Math.PI/4;
    const dx = Math.cos(angle)*len/2;
    const dy = Math.sin(angle)*len/2;

    lines.push({
      orientation:'slanted',
      x1:cx-dx, y1:cy-dy,
      x2:cx+dx, y2:cy+dy
    });
    selected=lines.length-1;
    deleteBtn.style.display="inline-block";
    redraw();
    return;
  }
});

canvas.addEventListener('pointermove',(ev)=>{
  if (!isDragging || selected===null) return;
  const {x,y} = clientToCanvas(ev);

  const dx = x-lastX;
  const dy = y-lastY;
  const l = lines[selected];

  if (l.orientation==='vertical'){
    l.x = Math.max(frame.x, Math.min(frame.x+frame.w, l.x + dx));
  } 
  else if (l.orientation==='horizontal'){
    l.y = Math.max(frame.y, Math.min(frame.y+frame.h, l.y + dy));
  }
  else {
    l.x1+=dx; l.y1+=dy;
    l.x2+=dx; l.y2+=dy;
  }

  lastX=x; lastY=y;
  redraw();
});

canvas.addEventListener('pointerup',()=>{ isDragging=false; });

/* UI BUTTONS */
frameBtn.onclick = ()=>{
  frameMenu.classList.toggle('hidden');
  lineMenu.classList.add('hidden');
};

document.querySelectorAll('.frameOption').forEach(btn=>{
  btn.onclick = ()=>{
    const r = btn.dataset.r.includes("/") ? eval(btn.dataset.r) : parseFloat(btn.dataset.r);
    computeFrame(r);
    frameMenu.classList.add('hidden');
    redraw();
  };
});

lineBtn.onclick = ()=>{
  lineMenu.classList.toggle('hidden');
  frameMenu.classList.add('hidden');
};

document.querySelectorAll('.lineOption').forEach(btn=>{
  btn.onclick = ()=>{
    mode = btn.dataset.mode;
    lineMenu.classList.add('hidden');
  };
});

selectBtn.onclick = ()=>{ mode='select'; };

deleteBtn.onclick = ()=>{
  if (selected!==null){
    lines.splice(selected,1);
    selected=null;
    deleteBtn.style.display="none";
    redraw();
  }
};

shutterBtn.onclick = captureImage;

/* CAPTURE */
function captureImage(){
  const tmp=document.createElement('canvas');
  tmp.width=canvas.width; tmp.height=canvas.height;
  const tctx=tmp.getContext('2d');

  tctx.drawImage(video,0,0,tmp.width,tmp.height);

  // mask
  tctx.fillStyle='rgba(0,0,0,0.45)';
  tctx.fillRect(0,0,tmp.width, frame.y);
  tctx.fillRect(0,frame.y+frame.h, tmp.width, tmp.height-(frame.y+frame.h));
  tctx.fillRect(0,frame.y,frame.x,frame.h);
  tctx.fillRect(frame.x+frame.w,frame.y,tmp.width-(frame.x+frame.w),frame.h);

  // frame border
  tctx.strokeStyle='white'; tctx.lineWidth=3;
  tctx.strokeRect(frame.x+1.5,frame.y+1.5,frame.w-3,frame.h-3);

  // dots
  for (const d of dots){
    tctx.fillStyle="#4da3ff";
    tctx.beginPath(); tctx.arc(d.x,d.y,8,0,Math.PI*2); tctx.fill();
    tctx.strokeStyle="#fff"; tctx.lineWidth=2; tctx.stroke();
  }

  // lines
  for (const l of lines){
    tctx.strokeStyle="lime"; tctx.lineWidth=4;
    tctx.beginPath();
    if (l.orientation==='vertical'){
      tctx.moveTo(l.x,frame.y); tctx.lineTo(l.x,frame.y+frame.h);
    } else if (l.orientation==='horizontal'){
      tctx.moveTo(frame.x,l.y); tctx.lineTo(frame.x+frame.w,l.y);
    } else {
      tctx.moveTo(l.x1,l.y1); tctx.lineTo(l.x2,l.y2);
    }
    tctx.stroke();
  }

  const url=tmp.toDataURL("image/png");
  const win=window.open();
  win.document.write(`<img src="${url}" style="width:100%">`);
}

/* INIT */
function resize(){
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  computeFrame(frame.ratio);
  redraw();
}
window.addEventListener('resize', resize);

(async function init(){
  await startCameraPreferRear();
  await enumerateDevices();
  computeFrame(1);
  resize();
  function loop(){ redraw(); requestAnimationFrame(loop); }
  loop();
})();
