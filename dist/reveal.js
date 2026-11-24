// The inspection scene is built exclusively from measured matches and their triangulated coordinates.
globalThis.Reveal = (() => {
  const stages = [
    ['cloud','Point cloud','Drag to orbit. Pick a reconstructed corner to see the two pixels that located it.'],
    ['detect','Feature detection','Small boxes mark strong corners measured in the first image. A corner changes brightness in two directions.'],
    ['match','Feature matching','Each line joins the same tracked patch in the two frames. Click an endpoint to inspect the pair.'],
    ['motion','Camera movement','A and B mark the two exposure positions. The simulated path is calibrated. Uploaded footage shows the relative motion estimated from the image pair.'],
    ['rays','Triangulation','Pick a point. Each line follows a measured pixel from its camera into space. Image noise can make the two rays narrowly miss.'],
    ['project','Reprojection','A cyan cross is the measured pixel. An amber ring is the 3D estimate projected into the second frame. Their separation is the reprojection error.'],
    ['effect','Compositing','Project the placed effect through the current camera to keep it anchored to the scene. Use Create to place an effect.']
  ];
  const cyan='#50e4eb', amber='#ffb56d', ink='#10181e', muted='#8aa4af';
  let controls, notify=()=>{}, stage='cloud', selected=null, lastData, current, hits=[], yaw=-.38, pitch=.19;
  const cornerCache=new WeakMap();
  let inspectorKey='';
  const fmt=(n,d=1)=>Number.isFinite(n)?n.toFixed(d):'—';
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const point=p=>[p.x,p.y,p.z];
  const norm=v=>Math.hypot(...v);

  function init(el,onChange){
    controls=el; notify=onChange;
    el.innerHTML=`<label for="rv-stage">Reconstruction layer</label><select id="rv-stage">${stages.map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')}</select>
      <p id="rv-help"></p><section id="rv-inspector" aria-label="Point observations"><strong>Point inspector</strong><p id="rv-measure"></p><canvas id="rv-pair" width="480" height="170" style="display:block;width:100%;height:auto;border-radius:5px" aria-label="Image patches around the selected pixel in each frame"></canvas><button type="button" id="rv-next">Next corner</button></section>
      <details style="margin-top:14px"><summary>Try the geometry</summary><p>Two level cameras view one point midway between them. Change their spacing or the point’s distance.</p>
      <label for="rv-base">Camera spacing <output id="rv-bv"></output></label><input id="rv-base" type="range" min="0" max="8" step=".1" value="2">
      <label for="rv-z">Object distance <output id="rv-zv"></output></label><input id="rv-z" type="range" min="2" max="24" step=".5" value="8">
      <canvas id="rv-geometry" width="480" height="220" style="width:100%;height:auto;display:block" aria-label="Top down view of the two cameras and the sightlines to the point"></canvas><p id="rv-angle"></p></details>`;
    const q=id=>el.querySelector('#'+id);
    q('rv-stage').onchange=e=>{stage=e.target.value;updateStage();notify();};
    q('rv-next').onclick=()=>{const pts=current?.data.points||[];if(!pts.length)return;selected=pts[(pts.indexOf(selected)+1)%pts.length];notify();};
    q('rv-base').oninput=q('rv-z').oninput=geometry;
    updateStage();geometry();
  }
  function geometry(){
    const q=id=>controls.querySelector('#'+id), base=+q('rv-base').value,z=+q('rv-z').value;
    q('rv-bv').textContent=fmt(base)+' m'; q('rv-zv').textContent=fmt(z)+' m';
    const angle=2*Math.atan2(base/2,z)*180/Math.PI;
    q('rv-angle').textContent=fmt(angle)+'° between rays. '+(!base?'The cameras coincide. Distance is unconstrained.':angle<8?'Nearly parallel rays make depth sensitive to small pixel errors.':'Wider ray separation makes depth easier to resolve.');
    const c=q('rv-geometry').getContext('2d'),scale=Math.min(180/z,350/Math.max(base,1));
    c.fillStyle=ink;c.fillRect(0,0,480,220);
    const middle=[240,198-z*scale], a=[240-base*scale/2,198], b=[240+base*scale/2,198];
    segment(c,a,b,muted);segment(c,a,middle,cyan,2);segment(c,b,middle,amber,2);
    disk(c,a,4,cyan);disk(c,b,4,amber);disk(c,middle,5,'#fff');
  }
  function updateStage(){
    if(!controls)return;
    controls.querySelector('#rv-stage').value=stage;
    controls.querySelector('#rv-help').textContent=stages.find(x=>x[0]===stage)[2];
  }
  function reset(){stage='cloud';selected=null;lastData=null;inspectorKey='';yaw=-.38;pitch=.19;updateStage();}
  function segment(c,a,b,color,width=1){
    if(!a||!b)return;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();
  }
  function disk(c,p,r,color){if(!p)return;c.fillStyle=color;c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);c.fill();}
  function crosshair(c,x,y,color,size=6){segment(c,[x-size,y],[x+size,y],color,1.6);segment(c,[x,y-size],[x,y+size],color,1.6);}
  function text(c,s,x,y,color=muted,size=15){c.fillStyle=color;c.font='500 '+size+'px ui-monospace, monospace';c.fillText(s,x,y);}
  function tag(c,s,x,y){c.font='600 17px monospace';c.fillStyle='#10181eef';c.fillRect(x-5,y-17,c.measureText(s).width+11,22);text(c,s,x,y,cyan,17);}

  // Convert world-space synthetic cameras into the reference camera's axes.
  function relative(eye,a){
    const dx=eye.x-a.x,dz=eye.z-a.z,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
    return [dx*c-dz*s,eye.y-a.y,dx*s+dz*c];
  }
  function cameras(a) {
    if(a.cameraA && a.cameraB) {
      const v=a.cameraB.yaw-a.cameraA.yaw;
      return {end:relative(a.cameraB,a.cameraA),dir:[Math.sin(v),0,Math.cos(v)]};
    }
    const pose=a.data.pose;if(!pose)return null;
    const {R,t}=pose;
    const col=i=>R.map(r=>r[i]);
    return {end:[-dot(col(0),t),dot(col(1),t),-dot(col(2),t)],dir:[R[2][0],-R[2][1],R[2][2]]};
  }
  function inCameraB(p,a) {
    if(a.cameraA&&a.cameraB) {
      const delta=a.cameraA.yaw-a.cameraB.yaw,c=Math.cos(delta),s=Math.sin(delta);
      const origin=relative(a.cameraA,a.cameraB);
      return [c*p.x+s*p.z+origin[0],p.y+origin[1],-s*p.x+c*p.z+origin[2]];
    }
    const pose=a.data.pose;
    if(!pose)return null;
    const b=pose.R.map((r,k)=>dot(r,[p.x,-p.y,p.z])+pose.t[k]);
    return [b[0],-b[1],b[2]];
  }
  function measuredRay(p,a,cam) {
    const cy=a.mode==='orbit'||a.mode==='turn'?139.2:120;
    const b=[(p.u2-200)/420,(cy-p.v2)/420,1];
    let direction;
    if(a.cameraA&&a.cameraB) {
      const d=a.cameraB.yaw-a.cameraA.yaw,c=Math.cos(d),s=Math.sin(d);
      direction=[c*b[0]+s,b[1],-s*b[0]+c];
    } else if(a.data.pose) {
      const {R}=a.data.pose;
      const rev=R[0].map((_,i)=>R[0][i]*b[0]-R[1][i]*b[1]+R[2][i]);
      direction=[rev[0],-rev[1],rev[2]];
    } else return null;
    const delta=point(p).map((x,i)=>x-cam.end[i]);
    const dist=dot(delta,direction)/dot(direction,direction);
    return cam.end.map((x,i)=>x+dist*direction[i]);
  }
  function reproj(p,a){
    const b=inCameraB(p,a);if(!b || b[2]<=0)return null;
    const cy=a.mode==='orbit'||a.mode==='turn'?139.2:120;
    return [200+420*b[0]/b[2],cy-420*b[1]/b[2]];
  }
  function spatial(c,a,w,h){
    const pts=a.data.points,depths=pts.map(p=>p.z).sort((x,y)=>x-y),scale=depths[Math.floor(depths.length*.5)]||15;
    const cam=cameras(a),path=a.path&&a.cameraA?a.path.map(p=>relative(p,a.cameraA)):null;
    const whole=stage==='motion'&&path?.length;
    const extent=whole?Math.max(scale,...path.map(norm)):scale;
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    function projection([x,y,z]){
      x/=extent;y/=extent;z=(z-(whole?scale:scale*.77))/extent;
      const sx=x*cy+z*sy,forward=-x*sy+z*cy,alt=y*cp-forward*sp;
      const d=2.7+y*sp+forward*cp;
      if(d<=.05)return null;return [w*.5+sx*w*1.5/d,h*.55-alt*w*1.5/d];
    }
    const line=(a,b,color,width)=>segment(c,projection(a),projection(b),color,width);
    for(let i=-10;i<=10;i++){line([i*extent/8,-.21*scale,0],[i*extent/8,-.21*scale,2*extent],'#23353e');line([-extent*1.25,-.21*scale,(i+10)*extent/10],[extent*1.25,-.21*scale,(i+10)*extent/10],'#23353e');}
    if(stage==='motion'&&path?.length)for(let i=1;i<path.length;i++)line(path[i-1],path[i],'#507681',1.8);
    const pa=projection([0,0,0]),pb=cam?projection(cam.end):null;
    if(stage==='rays'||stage==='motion') {
      segment(c,pa,pb,'#b2c4c9',2);
      if(pa){disk(c,pa,5,cyan);text(c,'A',pa[0]-18,pa[1]-6,cyan);}
      if(pb){disk(c,pb,5,amber);text(c,'B',pb[0]+7,pb[1]+15,amber);}
      if(stage==='motion'&&cam){
        line([0,0,0],[0,0,.12*scale],cyan,3);
        line(cam.end,cam.end.map((x,i)=>x+.12*scale*cam.dir[i]),amber,3);
      }
    }
    for(const p of pts){
      const xy=projection(point(p));if(!xy||xy[0]<0||xy[0]>w||xy[1]<0||xy[1]>h)continue;
      disk(c,xy,2.6,p.z<scale*.88?amber:p.z>scale*1.15?'#7eacc2':cyan);
      hits.push({xy,p});
    }
    if(selected&&pts.includes(selected)){
      const xy=projection(point(selected));
      if(stage==='rays'&&cam){line([0,0,0],point(selected),cyan,2.3);const endpoint=measuredRay(selected,a,cam);if(endpoint)line(cam.end,endpoint,amber,2.3);}
      if(xy)crosshair(c,...xy,'#fff',8);
    }
    if(!pts.length){
      const msg=a.mode==='turn'?'Pure rotation gives one camera center. Depth stays unknown.':'Move the camera to obtain a pair with measurable depth.';
      text(c,msg,w*.08,h*.42,'#d0e2e5',Math.min(19,w/48));
    }
  }
  function corners(frame) {
    if(cornerCache.has(frame))return cornerCache.get(frame);
    const sample=document.createElement('canvas');sample.width=400;sample.height=240;
    const c=sample.getContext('2d');c.drawImage(frame,0,0,400,240);
    const rgb=c.getImageData(0,0,400,240).data,lum=new Float32Array(400*240);
    for(let i=0;i<lum.length;i++)lum[i]=.299*rgb[i*4]+.587*rgb[i*4+1]+.114*rgb[i*4+2];
    const pts=[];
    for(let top=5;top<225;top+=12)for(let left=5;left<385;left+=12){
      let best=900,corner;
      for(let y=top;y<top+12;y+=2)for(let x=left;x<left+12;x+=2){
        let xx=0,yy=0,xy=0;
        for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){
          const k=(y+j)*400+x+i,gx=lum[k+1]-lum[k-1],gy=lum[k+400]-lum[k-400];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;
        }
        const score=(xx+yy-Math.hypot(xx-yy,2*xy))/2;
        if(score>best){best=score;corner=[x,y];}
      }
      if(corner)pts.push(corner);
    }
    cornerCache.set(frame,pts);return pts;
  }
  function images(c,a,w,h){
    if(stage==='effect'){if(a.composite)a.composite();else c.drawImage(a.frameB,0,0,w,h);return;}
    if(stage==='match'){
      const top=h*.25,ih=w*.3;
      c.drawImage(a.frameA,0,top,w*.5,ih);c.drawImage(a.frameB,w*.5,top,w*.5,ih);
      tag(c,'A · FRAME '+a.indexA,12,top-11);tag(c,'B · FRAME '+a.indexB,w*.5+12,top-11);
      const tracks=a.data.tracks||a.data.points;
      for(const p of tracks){
        const left=[p.u*w/800,top+p.v*ih/240],right=[w*.5+p.u2*w/800,top+p.v2*ih/240];
        const active=p===selected;
        segment(c,left,right,active?amber:'rgba(73,225,239,.15)',active?2:1);
        disk(c,left,active?5:2,cyan);disk(c,right,active?5:2,amber);hits.push({xy:left,p},{xy:right,p});
      }
      return;
    }
    const detection=stage==='detect';
    c.drawImage(detection?a.frameA:a.frameB,0,0,w,h);
    if(detection) {
      c.lineWidth=1.4;c.strokeStyle=cyan;
      for(const [x,y] of corners(a.frameA))c.strokeRect(w*x/400-3,h*y/240-3,6,6);
      tag(c,'A · FRAME '+a.indexA,12,h-17);return;
    }
    for(const p of a.data.points){
      const b=reproj(p,a);if(!b)continue;
      const xy=[p.u2*w/400,p.v2*h/240];
      c.strokeStyle=amber;c.lineWidth=1.6;c.beginPath();c.arc(b[0]*w/400,b[1]*h/240,4.5,0,2*Math.PI);c.stroke();
      crosshair(c,...xy,cyan,3);hits.push({xy,p});
    }
    tag(c,'B · FRAME '+a.indexB,12,h-17);
  }
  function inspector(a){
    if(!controls)return;
    const p=selected, valid=p&&Number.isFinite(p.z), measure=controls.querySelector('#rv-measure'),pic=controls.querySelector('#rv-pair');
    const key=[a.mode,a.indexA,a.indexB,p?.u,p?.v,p?.u2,p?.v2,p?.z].join(',');
    if(key===inspectorKey)return;inspectorKey=key;
    controls.querySelector('#rv-next').disabled=!a.data.points.length;
    pic.hidden=!p;pic.style.display=p?'block':'none';
    if(!p){measure.textContent='A second viewpoint with reliable matches is needed to inspect a 3D point.';return;}
    const repro=valid?reproj(p,a):null;
    const distance=valid?'XYZ ('+[p.x,p.y,p.z].map(x=>fmt(x,2)).join(', ')+') '+(a.mode==='upload'?'baselines':'scene units'):'Depth unknown';
    measure.textContent=distance+(repro?' · reprojection error '+fmt(Math.hypot(repro[0]-p.u2,repro[1]-p.v2),2)+' px':'');
    const c=pic.getContext('2d');c.fillStyle=ink;c.fillRect(0,0,480,170);
    for(const [i,frame,u,v,n] of [[0,a.frameA,p.u,p.v,a.indexA],[1,a.frameB,p.u2,p.v2,a.indexB]]){
      const x=i*240,sourceW=64,sourceH=32;
      const ox=Math.max(0,Math.min(400-sourceW,u-sourceW/2)),oy=Math.max(0,Math.min(240-sourceH,v-sourceH/2));
      c.drawImage(frame,ox*frame.width/400,oy*frame.height/240,sourceW*frame.width/400,sourceH*frame.height/240,x+2,24,236,118);
      crosshair(c,x+2+(u-ox)*236/sourceW,24+(v-oy)*118/sourceH,i?amber:cyan,10);
      text(c,(i?'B':'A')+' · FRAME '+n,x+5,18,i?amber:cyan,15);
      text(c,'('+fmt(u)+', '+fmt(v)+') px',x+5,161,'#c7d8df',15);
    }
  }
  function draw(c,a){
    current=a;const pts=a.data.points;hits=[];
    if(lastData!==a.data){
      // Match identity is defined within each pair. Pick a new central point when the pair changes.
      selected=a.initialPoint||pts.reduce((best,p)=>!best||Math.hypot(p.u2-200,p.v2-120)<Math.hypot(best.u2-200,best.v2-120)?p:best,null);
      lastData=a.data;inspectorKey='';
    }
    const w=c.canvas.width,h=c.canvas.height;
    c.save();c.fillStyle=ink;c.fillRect(0,0,w,h);
    if(['cloud','rays','motion'].includes(stage))spatial(c,a,w,h);else images(c,a,w,h);
    c.restore();inspector(a);
  }
  function pick(x,y){
    let best=null,dist=17;
    for(const hit of hits){const d=Math.hypot(hit.xy[0]-x,hit.xy[1]-y);if(d<dist){dist=d;best=hit.p;}}
    if(best){selected=best;notify();}return !!best;
  }
  function orbit(dx,dy){
    if(!['cloud','motion','rays'].includes(stage))return;
    yaw+=dx*.009;pitch=Math.max(-1.3,Math.min(1.3,pitch+dy*.008));notify();
  }
  return {init,draw,pick,orbit,reset};
})();
