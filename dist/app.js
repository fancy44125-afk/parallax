'use strict';
const $ = id => document.getElementById(id);
const screenCanvas = $('screen'), ctx = screenCanvas.getContext('2d');
const W = 400, H = 240, focal = 420;
const frames = new Map(), results = new Map();
let clip, mode='create', timer, selected, anchorPoint, drag;
function index() { return Number($('position').value); }
function lastIndex() { return !clip ? 180 : 30; }
function travel(i) { return i / lastIndex() * .85; }
function cameraAt(i) { return Scene.camera(travel(i)); }
function reference(i) { return !clip ? Math.max(0, i - 2) : 0; }
function getFrame(i) {
  if (clip) return clip.frames[i];
  if (!frames.has(i)) {
    const frame = document.createElement('canvas');
    frame.width = 960; frame.height = 576;
    Scene.draw(frame, travel(i));
    frame.visibility=Scene.visibility(W,H);
    if(frames.size>=4) frames.delete(frames.keys().next().value);
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
    let data = {points:[], tracks:[], matches:0};
    if (i && !clip) {
      const j=reference(i);
      data=Pose.solveCalibrated(pixels(j),pixels(i),focal,cameraAt(j),cameraAt(i));
    } else if(i) {
      first ||= pixels(0);
      data=Pose.solve(first,pixels(i),focal);
    }
    results.set(i,data);
  }
  return results.get(i);
}
function closest(points,u,v,key1='u',key2='v') {
  return points.reduce((a,b)=>!a || Math.hypot(b[key1]-u,b[key2]-v)<Math.hypot(a[key1]-u,a[key2]-v)?b:a,null);
}
function worldFromOrbit(point,i) {
  const eye=cameraAt(reference(i)), c=Math.cos(eye.yaw),s=Math.sin(eye.yaw);
  return {x:eye.x+c*point.x+s*point.z,y:eye.y+point.y,z:eye.z-s*point.x+c*point.z};
}
function setAnchor(p) {
  anchorPoint=null;
  if(!p)return;
  const i=index();
  anchorPoint={...p,world:worldFromOrbit(p,i),heading:cameraAt(i).yaw,frame:i,observations:new Map([[i,[p.u2,p.v2]]]),unit:p.z*.063};
}
function placeAt(u,v) {
  const i=index(), p=closest(solve(i).points,u,v,'u2','v2');
  const near=p && Math.hypot(p.u2-u,p.v2-v)<=14;
  if(clip && (FX.tracking==='2d' || !near)){
    const fallback=FX.tracking==='3d';
    anchorPoint={frame:i,u2:u,v2:v,observations:new Map([[i,[u,v]]]),flatOnly:true,fallback};
    if(fallback){
      $('fxTracking').value='2d';
      $('fxTracking').onchange();
    }
  }else setAnchor(p);
  $('anchor').checked=!!anchorPoint;
  render();
}
// On uploads, always identify the same patch rather than chaining matches
// between arbitrary scrub positions. Cache misses as well as observations.
function uploadPixel(i,anchor) {
  const measured=frame=>{
    if(!anchor.observations.has(frame)){
      const original=[anchor.u2,anchor.v2];
      anchor.observations.set(frame,Pose.trackPoint(pixels(anchor.frame),pixels(frame),original));
    }
    return anchor.observations.get(frame);
  };
  let p=measured(i);
  if(!p && i>0 && i<lastIndex()){
    // Bridge a single missing sample only between two nearby verified matches.
    const a=measured(i-1),b=measured(i+1);
    if(a && b && Math.hypot(b[0]-a[0],b[1]-a[1])<=12)
      p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  }
  return p && p.map(v=>v*2.4);
}
function effectAdapter(i,points) {
  if(!anchorPoint)return null;
  const anchor=anchorPoint, eye=cameraAt(i),time=clip?clip.duration*i/30:i*.105;
  const flat=FX.tracking==='2d',scale=focal*.063*2.4;
  if(clip && flat){
    const track=uploadPixel(i,anchor);
    return track ? {track,scale,time} : null;
  }
  if(clip && anchor.flatOnly)return null;
  const screen=(x,y,z,center)=>z>.02?[(W*.5+focal*x/z)*2.4,(center-focal*y/z)*2.4,z]:null;
  let project;
  if(clip){
    // Upload solves have unit baseline per pair. Use the same reference corner
    // to express the fixed object in the current pair's reconstructed scale.
    const p=closest(points,anchor.u,anchor.v),pose=solve(i).pose;
    if(!pose||!p||Math.hypot(p.u-anchor.u,p.v-anchor.v)>1.5)return null;
    const unit=p.z*.063;
    project=(x,y,z)=>{
      const a=[p.x+x*unit,-p.y-y*unit,p.z+z*unit];
      const b=pose.R.map((r,k)=>r.reduce((sum,v,j)=>sum+v*a[j],pose.t[k]));
      return screen(b[0],-b[1],b[2],H/2);
    };

  }else{
    const c=Math.cos(eye.yaw),s=Math.sin(eye.yaw),ah=anchor.heading;
    project=(x,y,z)=>{
      const dx=anchor.world.x-eye.x+anchor.unit*(x*Math.cos(ah)+z*Math.sin(ah));
      const dz=anchor.world.z-eye.z+anchor.unit*(-x*Math.sin(ah)+z*Math.cos(ah));
      return screen(dx*c-dz*s,anchor.world.y-eye.y+y*anchor.unit,dx*s+dz*c,H*.58);
    };
    const origin=project(0,0,0);
    if(!origin)return null;
    const u=origin[0]/2.4,v=origin[1]/2.4;
    if(u<0||u>=W||v<0||v>=H)return null;
    const seen=getFrame(i).visibility[Math.floor(v)*W+Math.floor(u)];
    if(seen+Math.max(.55,.06*seen)<origin[2])return null;
    // Both demonstrations use the same visible reconstructed corner. The
    // point tracker gets just its screen coordinates, never the 3D transform.
    if(flat)return {track:origin.slice(0,2),scale,time};

  }
  return {project,scale,time};
}
function cameraView(i,points,tracks) {
  ctx.drawImage(getFrame(i),0,0,960,576);
  ctx.save();ctx.scale(2.4,2.4);
  if ($('tracks').checked) for(const p of tracks){
    ctx.lineWidth=.65;ctx.strokeStyle='rgba(223,255,135,.76)';ctx.beginPath();ctx.moveTo(p.u,p.v);ctx.lineTo(p.u2,p.v2);ctx.stroke();
    ctx.strokeStyle='#35432b';ctx.lineWidth=1.6;ctx.strokeRect(p.u2-1.25,p.v2-1.25,2.5,2.5);
    ctx.strokeStyle='#cefb75';ctx.lineWidth=.8;ctx.strokeRect(p.u2-1.25,p.v2-1.25,2.5,2.5);
  }
  ctx.restore();
  if ($('anchor').checked && anchorPoint) {
    const adapter=effectAdapter(i,points);
    if(adapter)FX.draw(ctx,adapter);
  }
}
function render(){
  const i=index(),data=solve(i),points=data.points,tracks=data.tracks||points;
  const composite=()=>cameraView(i,points,tracks);
  if(mode==='reveal'){
    const j=reference(i);
    Reveal.draw(ctx,{data,frameA:getFrame(j),frameB:getFrame(i),indexA:j,indexB:i,initialPoint:anchorPoint?.frame===i?closest(points,anchorPoint.u,anchorPoint.v):null,
      mode:clip?'upload':'orbit',cameraA:clip?null:cameraAt(j),cameraB:clip?null:cameraAt(i),
      path:clip?null:Array.from({length:61},(_,k)=>cameraAt(k*lastIndex()/60)),composite});
  }else composite();
  $('positionVal').textContent=!clip ? (i*2)+'°' : Math.round(i/30*100)+'%';
  $('position').setAttribute('aria-valuetext',$('positionVal').textContent);
  $('anchor').disabled=!clip && !anchorPoint && !points.length;
  $('count').textContent=points.length;
  $('shift').textContent=(tracks.reduce((a,p)=>a+Math.hypot(p.u-p.u2,p.v-p.v2),0)/(tracks.length||1)).toFixed(1);
  $('legendText').textContent=mode==='reveal'?'Reconstruction layers':$('tracks').checked?tracks.length+' tracked corners':'Click a corner to place an effect';
  $('sceneTag').textContent=mode==='reveal'?'RECONSTRUCTION':clip?clip.name.toUpperCase():'DESERT OBSERVATORY';
  let title='Create',tip='Click a window corner to place a portal. Play the orbit, then choose Break the Frame to inspect the 3D point that holds the effect in place.';
  if(mode==='reveal'){title='Two frames, one point';tip='The footage stores only pixels. A corner seen from two camera positions gives two lines of sight. Select Triangulation to see how they locate it in space.';}
  else if(clip){
    $('panelHelp').textContent='Click a distinctive corner in your footage to place the selected effect.';
    tip='Click a corner in the footage. A nearby reconstructed point supports 3D placement. Other spots use 2D point tracking.';
    if(anchorPoint && $('anchor').checked){
      const visible=effectAdapter(i,points);
      title=visible?'Effect placed':'Tracking unavailable here';
      if(FX.tracking==='2d'){
        tip=visible?(anchorPoint.fallback?'Placed in 2D because this spot has no reconstructed depth. Play the clip to follow it.':'Play the clip to see the effect follow the selected spot.'):'The tracker lost this spot. Click a sharper corner or return to the placement frame.';
      }else tip=visible?'Play the clip to see the effect from the moving camera.':'Turn on Feature tracks and click a reconstructed corner here, or choose 2D point tracking.';
    }
  }
  else if(!points.length){title='Depth unavailable';tip='Choose another moment with textured surfaces visible from two different camera positions.';}
  else if(anchorPoint&&$('anchor').checked){title='Effect placed';tip='Play the shot or scrub the timeline. Compare 2D point tracking with 3D camera tracking to see how perspective changes your object.';}
  $('tipTitle').textContent=title;$('tip').textContent=tip;
}
function stop(){clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-label','Play camera movement');}
function reset(){
  stop();frames.clear();results.clear();first=null;selected=null;anchorPoint=null;$('anchor').checked=false;
  $('position').max=lastIndex();
  $('position').value=clip?15:2;
  if($('positionLabel'))$('positionLabel').textContent=clip?'Video position':'Camera angle';
  if(!clip && mode==='create')$('panelHelp').textContent='Click a window corner to place your object. Play the orbit to see it stay attached.';
  render();
}
function switchMode(next){
  stop();mode=next;
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));
  const reveal=mode==='reveal';
  $('fxControls').hidden=reveal;$('revealControls').hidden=!reveal;
  $('panelTitle').textContent=reveal?'Behind the effect':'Create an effect';
  $('panelHelp').textContent=reveal?'Inspect the camera solve, one measured corner at a time.':'Click a window corner to place your object. Play the orbit to see it stay attached.';
  $('viewTitle').textContent=reveal?'Reconstruction monitor':'Footage monitor';
  $('cloudTab').textContent=reveal?'Back to footage':'Break the Frame';
  if(reveal)Reveal.reset();
  render();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
$('cloudTab').onclick=()=>switchMode(mode==='reveal'?'create':'reveal');
$('fullscreen').onclick=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewer').requestFullscreen();}
  catch{$('viewer').classList.toggle('expanded');}
};
$('position').oninput=()=>{stop();render();};$('tracks').onchange=render;
$('play').onclick=()=>{if(timer)return stop();if(index()===lastIndex())$('position').value=0;$('play').textContent='Ⅱ';$('play').setAttribute('aria-label','Pause camera movement');timer=setInterval(()=>{$('position').value=index()+1;render();if(index()===lastIndex())stop();},105);};
$('anchor').onchange=()=>{if($('anchor').checked && !anchorPoint)placeAt(W/2,H/2);else render();};
function canvasPixel(e){
  const r=screenCanvas.getBoundingClientRect(),scale=Math.min(r.width/960,r.height/576);
  return [(e.clientX-r.left-(r.width-960*scale)/2)/scale,(e.clientY-r.top-(r.height-576*scale)/2)/scale];
}
screenCanvas.onpointerdown=e=>{
  stop();
  if(mode==='reveal'){drag={x:e.clientX,y:e.clientY,travel:0};screenCanvas.setPointerCapture(e.pointerId);return;}
  const [x,y]=canvasPixel(e);
  placeAt(x/2.4,y/2.4);
};
screenCanvas.onpointermove=e=>{
  if(!drag)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  drag.travel+=Math.hypot(dx,dy);drag.x=e.clientX;drag.y=e.clientY;
  if(drag.travel>3)Reveal.orbit(dx,dy);
};
screenCanvas.onpointerup=e=>{if(drag&&drag.travel<=3)Reveal.pick(...canvasPixel(e));drag=null;};
screenCanvas.onpointercancel=()=>drag=null;
screenCanvas.onkeydown=e=>{
  if(mode==='create'&&e.key==='Enter'){placeAt(W/2,H/2);return;}
  if(mode!=='reveal'||!e.key.startsWith('Arrow'))return;
  e.preventDefault();Reveal.orbit(e.key==='ArrowLeft'?-12:e.key==='ArrowRight'?12:0,e.key==='ArrowDown'?12:e.key==='ArrowUp'?-12:0);
};
$('source').onchange=()=>{if($('source').value==='upload'){$('source').selectedIndex=clip?2:0;$('file').click();return;}if($('source').selectedIndex===0){clip?.dispose();clip=null;if($('source').options[2])$('source').remove(2);$('sourceHint').hidden=true;reset();}};
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;stop();$('source').disabled=true;$('sourceHint').hidden=false;$('sourceHint').textContent='Reading video frames…';
 try{const loaded=await VideoSource.open(file);clip?.dispose();clip=loaded;if($('source').options[2])$('source').remove(2);$('source').add(new Option(file.name,'current'));$('source').value='current';$('sourceHint').textContent='First '+clip.duration.toFixed(1)+' s · depth in camera baselines';reset();}
 catch(e){$('sourceHint').textContent=e.message;}finally{$('source').disabled=false;$('file').value='';}};
FX.init($('fxControls'),render);
Reveal.init($('revealControls'),render);
reset();
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)$('play').click();
