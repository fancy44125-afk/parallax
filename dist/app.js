'use strict';
const $ = id => document.getElementById(id);
const screenCanvas = $('screen'), ctx = screenCanvas.getContext('2d');
const W = 400, H = 240, focal = 420;
const frames = new Map(), results = new Map();
let clip, cloud = false, timer, selected, anchorPoint, drag, yaw = -.24, pitch = .12;
function index() { return Number($('position').value); }
function travel(i) { return i / 30 * .85; }
function getFrame(i) {
  if (clip) return clip.frames[i];
  if (!frames.has(i)) {
    const frame = document.createElement('canvas');
    frame.width = 960; frame.height = 576;
    Scene.draw(frame, travel(i), $('motion').value === 'turn');
    frames.set(i, frame);
  }
  return frames.get(i);
}
function pixels(i) {
  const sample = document.createElement('canvas');
  sample.width = W; sample.height = H;
  const c = sample.getContext('2d'); c.drawImage(getFrame(i),0,0,W,H);
  return c.getImageData(0,0,W,H);
}
let first;
function solve(i) {
  if (!results.has(i)) {
    first ||= pixels(0);
    const empty = {points:[], matches:0};
    const data = !i || $('motion').value === 'turn' ? empty :
      clip ? Pose.solve(first,pixels(i),focal) : Vision.solve(first,pixels(i),travel(i),focal);
    results.set(i,data);
  }
  return results.get(i);
}
function marker(x,y) {
  ctx.save();ctx.translate(x,y);ctx.strokeStyle='#faffdb';ctx.fillStyle='#4d6c30';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-33);ctx.stroke();
  ctx.fillRect(0,-48,84,22);ctx.strokeRect(0,-48,84,22);ctx.fillStyle='white';ctx.font='bold 13px monospace';ctx.fillText('ANCHOR',12,-32);ctx.restore();
}
function closest(points,u,v,key1='u',key2='v') {
  return points.reduce((a,b)=>!a || Math.hypot(b[key1]-u,b[key2]-v)<Math.hypot(a[key1]-u,a[key2]-v)?b:a,null);
}
function cameraView(i,points) {
  ctx.drawImage(getFrame(i),0,0,960,576);
  ctx.save();ctx.scale(2.4,2.4);
  if ($('tracks').checked) for(const p of points){
    ctx.lineWidth=.65;ctx.strokeStyle='rgba(223,255,135,.76)';ctx.beginPath();ctx.moveTo(p.u,p.v);ctx.lineTo(p.u2,p.v2);ctx.stroke();
    ctx.strokeStyle='#35432b';ctx.lineWidth=1.6;ctx.strokeRect(p.u2-1.25,p.v2-1.25,2.5,2.5);
    ctx.strokeStyle='#cefb75';ctx.lineWidth=.8;ctx.strokeRect(p.u2-1.25,p.v2-1.25,2.5,2.5);
  }
  ctx.restore();
  if ($('anchor').checked && anchorPoint){
    if(!clip) marker((anchorPoint.u-focal*travel(i)/anchorPoint.z)*2.4,anchorPoint.v*2.4);
    else {
      // Re-identify the same reference corner in every independently solved pair.
      const p=closest(points,anchorPoint.u,anchorPoint.v);
      if(!i) marker(anchorPoint.u*2.4,anchorPoint.v*2.4);
      else if(p && Math.hypot(p.u-anchorPoint.u,p.v-anchorPoint.v)<2){
        const {R,t}=solve(i).pose;
        const a=[p.x,-p.y,p.z];
        const b=R.map((row,k)=>row.reduce((sum,v,j)=>sum+v*a[j],t[k]));
        if(b[2]>0)marker(2.4*(W/2+focal*b[0]/b[2]),2.4*(H/2+focal*b[1]/b[2]));
      }
    }
  }
}
function cloudView(points) {
  ctx.fillStyle='#1e2b26';ctx.fillRect(0,0,960,576);
  const depths=points.map(p=>p.z).sort((a,b)=>a-b);
  const scale=depths[Math.floor(depths.length*.5)] || 12;
  function project(x,y,z){
    x/=scale; y/=scale; z=z/scale-1;
    const side=x*Math.cos(yaw)+z*Math.sin(yaw), away=-x*Math.sin(yaw)+z*Math.cos(yaw);
    const up=y*Math.cos(pitch)-away*Math.sin(pitch), d=2.4+y*Math.sin(pitch)+away*Math.cos(pitch);
    return d>.05?[480+side*1650/d,288-up*1650/d]:null;
  }
  ctx.strokeStyle='#39483c';ctx.lineWidth=1;
  function line(a,b){if(!a||!b)return;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
  for(let n=-8;n<=8;n++){line(project(n*scale/8,-scale*.24,0),project(n*scale/8,-scale*.24,scale*2));line(project(-scale,-scale*.24,(n+8)*scale/8),project(scale,-scale*.24,(n+8)*scale/8));}
  for(const p of [...points].sort((a,b)=>b.z-a.z)){
    const xy=project(p.x,p.y,p.z);if(!xy)continue;
    ctx.fillStyle=p.z<scale*.88?'#f4b27b':p.z>scale*1.15?'#8fb6a4':'#d3f38a';ctx.fillRect(xy[0]-2.5,xy[1]-2.5,5,5);
  }
  if(!points.length){ctx.fillStyle='#e6efd9';ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText('No triangulated points at this position',480,280);ctx.textAlign='left';}
}
function render(){
  const i=index(), {points}=solve(i);
  if(cloud)cloudView(points);else cameraView(i,points);
  $('positionVal').textContent=Math.round(i/30*100)+'%';
  $('count').textContent=points.length;
  $('shift').textContent=(points.reduce((a,p)=>a+Math.hypot(p.u-p.u2,p.v-p.v2),0)/(points.length||1)).toFixed(1);
  $('legendText').textContent=cloud?'Drag to orbit · warm points are nearer':$('tracks').checked?'Tracked corner':'Camera image';
  $('sceneTag').textContent=cloud?'RECONSTRUCTED SPACE':clip?clip.name.toUpperCase():'DESERT OBSERVATORY';
  let title='Try it',tip='Move the camera, then switch to Point cloud to see which corners reveal their depth.';
  if($('motion').value==='turn'){title='One viewpoint, many directions';tip='The image moves, but every ray starts at the same spot. Rotation alone gives no triangulation baseline.';}
  else if(!i){title='One frame gives a direction';tip='Move the camera to get a second ray through each corner. Where the rays meet gives its depth.';}
  else if(!points.length){title='Too little reliable depth';tip='Try a different frame or clip. The solver needs textured corners, a still scene and camera translation.';}
  else if(selected){const p=closest(points,selected.u,selected.v);if(p && Math.hypot(p.u-selected.u,p.v-selected.v)<2){title='Selected corner';tip='Image shift '+Math.hypot(p.u-p.u2,p.v-p.v2).toFixed(1)+' px · estimated depth '+p.z.toFixed(1)+(clip?' camera baselines.':' scene units.');}}
  else if(cloud){title='A sparse reconstruction';tip='Drag the cloud to look from the side. Each dot comes from a matched pair of image patches.';}
  else if($('anchor').checked){title='Marker anchored';tip='Click another tracked corner to place the marker there, then move the camera.';}
  $('tipTitle').textContent=title;$('tip').textContent=tip;
}
function stop(){clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-label','Play camera movement');}
function reset(){stop();frames.clear();results.clear();first=null;selected=null;anchorPoint=null;$('anchor').checked=false;render();}
function view(state){cloud=state;$('cameraTab').setAttribute('aria-pressed',!cloud);$('cloudTab').setAttribute('aria-pressed',cloud);render();}
$('cameraTab').onclick=()=>view(false);$('cloudTab').onclick=()=>view(true);
$('position').oninput=()=>{stop();render();};$('motion').onchange=reset;$('tracks').onchange=render;
$('play').onclick=()=>{if(timer)return stop();if(index()===30)$('position').value=0;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause camera movement');timer=setInterval(()=>{$('position').value=index()+1;render();if(index()===30)stop();},105);};
$('anchor').onchange=()=>{if($('anchor').checked){anchorPoint=closest(solve(index()).points,200,120);if(!anchorPoint)$('anchor').checked=false;}selected=null;render();};
screenCanvas.onpointerdown=e=>{if(cloud){drag=[e.clientX,e.clientY];screenCanvas.setPointerCapture(e.pointerId);return;}
 const rect=screenCanvas.getBoundingClientRect(),ratio=Math.min(rect.width/W,rect.height/H);
 const u=(e.clientX-rect.left-(rect.width-W*ratio)/2)/ratio,v=(e.clientY-rect.top-(rect.height-H*ratio)/2)/ratio;
 selected=closest(solve(index()).points,u,v,'u2','v2');if($('anchor').checked)anchorPoint=selected;render();};
screenCanvas.onpointermove=e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.009;pitch=Math.max(-1.4,Math.min(1.4,pitch+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];render();};
screenCanvas.onpointerup=screenCanvas.onpointercancel=()=>drag=null;
screenCanvas.onkeydown=e=>{if(!cloud||!e.key.startsWith('Arrow'))return;e.preventDefault();yaw+=e.key==='ArrowLeft'?-.1:e.key==='ArrowRight'?.1:0;pitch+=e.key==='ArrowDown'?-.1:e.key==='ArrowUp'?.1:0;render();};
$('source').onchange=()=>{if($('source').value==='upload'){$('source').selectedIndex=clip?2:0;$('file').click();return;}if($('source').selectedIndex===0){clip?.dispose();clip=null;if($('source').options[2])$('source').remove(2);$('motion').disabled=false;$('motion').options[0].textContent='Sideways slide';$('sourceHint').hidden=true;reset();}};
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;stop();$('source').disabled=true;$('sourceHint').hidden=false;$('sourceHint').textContent='Reading video frames…';
 try{const loaded=await VideoSource.open(file);clip?.dispose();clip=loaded;if($('source').options[2])$('source').remove(2);$('source').add(new Option(file.name,'current'));$('source').value='current';$('motion').value='slide';$('motion').options[0].textContent='Estimated from video';$('motion').disabled=true;$('sourceHint').textContent='First '+clip.duration.toFixed(1)+' s · depth in camera baselines';reset();}
 catch(e){$('sourceHint').textContent=e.message;}finally{$('source').disabled=false;$('file').value='';}};
render();
